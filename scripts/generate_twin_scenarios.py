"""Pre-compute Battery Digital Twin scenarios for the /twin demo page.

The /twin page is a static SPA — it loads JSON files produced here and renders
them with Recharts. Doing the heavy physics offline keeps the production demo
fast (<200 ms first paint) and avoids deploying a Python runtime to Vercel.

Scenarios produced (under packages/shared/scenarios/):

  1. transient_lfp_only.json
     A 10-second window of GB200-class operation at the rack level. The full
     power profile — baseline 80 kW with a ±30 % square pulse every 100 ms
     (the AI-training pattern from arXiv 2508.14318 cited in proposal §B.1) —
     is fed entirely through the LFP cell. BASELINE: what a traditional
     pure-battery BBU does. Voltage swings reflect the cell's inability to
     follow ms-scale current changes without sag.

  2. transient_hybrid.json
     Same upstream power profile, split between LIC and LFP via a first-order
     low-pass filter (τ=0.5 s, cutoff ≈0.32 Hz — proxy for the DC-DC control
     law). LIC absorbs the high-frequency residual, LFP sees a near-DC
     current. Demonstrates the proposal's split ("LIC handles 1-100 ms, LFP
     handles 30-90 s").

  3. aging_lfp.json
     3000-cycle SOH curve for the LFP pack under BBU duty (gentle float use,
     rare deep discharges). Capacity-fade model is parameterised to match
     Severson 2019 LFP mean behaviour at 1C/1C and low-DoD operation.

  4. fleet_devices.json
     1000-device synthetic fleet for the /dashboard page. Geographic
     distribution centred on Texas (40 %) and Virginia (28 %) per JLL
     YE-2025 data cited in §C.1.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pybamm
from loguru import logger

# Make the repo's packages dir importable when running directly.
_REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO / "packages" / "battery-twin"))

# Two sinks: the canonical store under packages/shared, and the Next.js
# public/ folder so the web demo can fetch the JSONs directly. Writing to
# both here removes the "forgot to cp" footgun.
OUT_DIRS = [
    _REPO / "packages" / "shared" / "scenarios",
    _REPO / "apps" / "web" / "public" / "scenarios",
]
for d in OUT_DIRS:
    d.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Rack-level constants from v2.1 proposal
# ---------------------------------------------------------------------------
RACK_POWER_KW = 120.0           # GB200 NVL72 nominal
RACK_BASELINE_KW = 80.0         # demo waveform mid-line (sub-peak, leaves ±30 % headroom)
N_BBU_PER_RACK = 8              # parallel BBUs sharing the rack load
LFP_PACK_KWH = 2.5              # per BBU (§E.1 Tier-B)
LFP_PACK_NOMINAL_V = 48.0       # 15S × 3.2 V (§v2.1 修訂 #4)
LIC_ENERGY_KJ_PER_RACK = 5.0    # 5 kJ transient need (§E.1 Tier-A)
LIC_OVERPROV_FACTOR = 69.0      # 345/5 from §Q4 答辯
TRANSIENT_AMPLITUDE = 0.30      # ±30 % swing (§B.1 (2))
TRANSIENT_PERIOD_S = 0.10       # 100 ms square wave
SPLIT_FILTER_TAU_S = 0.5        # 1st-order LPF τ → cutoff ≈ 1/(2π·τ) ≈ 0.32 Hz
TARGET_PEAK_C_RATE = 6.0        # cell C-rate at the rack's peak power (§E.1 Tier-B)

# Pack peak current (per BBU) at the demo waveform's max instantaneous power.
# Used to map pack current onto a representative cell at TARGET_PEAK_C_RATE.
I_PEAK_PACK_A = (
    RACK_BASELINE_KW * (1.0 + TRANSIENT_AMPLITUDE) * 1000.0
    / N_BBU_PER_RACK
    / LFP_PACK_NOMINAL_V
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _json_default(obj):
    """Encoder fallback that turns numpy scalars/arrays into JSON-friendly forms."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if hasattr(obj, "__float__"):
        return float(obj)
    return str(obj)


def _save(name: str, payload: dict) -> list[Path]:
    """Serialize once and write to every sink, sharing one timestamp.

    Sharing a single _meta.generated_at across both copies means the SHA-256
    of the two files matches, which lets CI / pre-commit hooks easily detect
    drift.
    """
    payload["_meta"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/generate_twin_scenarios.py",
        "pybamm_version": pybamm.__version__,
        "source_proposal": "Sysblade_HyperBuffer_Proposal_v2.1.pdf",
    }
    body = json.dumps(payload, separators=(",", ":"), default=_json_default)
    paths: list[Path] = []
    for d in OUT_DIRS:
        p = d / name
        p.write_text(body, encoding="utf-8")
        paths.append(p)
    logger.success(
        f"wrote {name}  ({paths[0].stat().st_size/1024:.1f} KiB) → "
        + ", ".join(str(p.relative_to(_REPO)) for p in paths)
    )
    return paths


def _decimate(arr: np.ndarray, max_points: int) -> np.ndarray:
    """Subsample a 1-D array to at most max_points (for client payload size).

    Uses np.unique on the rounded indices so the output has no duplicate
    samples even when max_points is close to len(arr).
    """
    if len(arr) <= max_points:
        return arr
    idx = np.unique(np.round(np.linspace(0, len(arr) - 1, max_points)).astype(int))
    return arr[idx]


# ---------------------------------------------------------------------------
# 1 + 2. Transient response — single function, two outputs
# ---------------------------------------------------------------------------
def _build_power_profile(duration_s: float, dt: float) -> tuple[np.ndarray, np.ndarray]:
    """Rack-level power profile: RACK_BASELINE_KW ±30 % square wave at 100 ms."""
    t = np.arange(0.0, duration_s + dt, dt)
    pulse = (np.floor(t / TRANSIENT_PERIOD_S).astype(int) % 2) * 2 - 1  # -1 or +1
    p_kw = RACK_BASELINE_KW * (1.0 + TRANSIENT_AMPLITUDE * pulse)
    return t, p_kw


def _split_with_lic(p_total_kw: np.ndarray, dt: float, tau_s: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Split rack power into (LFP slow, LIC fast) using a first-order LPF.

    LFP follows the running mean (low-pass output); LIC takes the residual.
    Cutoff is fc = 1/(2π·τ); with τ = 0.5 s that's ≈0.32 Hz, so content with
    period shorter than ~3 s lands on the LIC and slower content lands on
    the LFP — covering the proposal's >30 s graceful-shutdown role for LFP.
    """
    alpha = dt / (tau_s + dt)
    lfp = np.empty_like(p_total_kw)
    lfp[0] = p_total_kw[0]
    for i in range(1, len(p_total_kw)):
        lfp[i] = alpha * p_total_kw[i] + (1 - alpha) * lfp[i - 1]
    lic = p_total_kw - lfp
    return lfp, lic


def _simulate_lfp_cell(
    power_kw: np.ndarray,
    t: np.ndarray,
) -> dict[str, np.ndarray]:
    """Run a single LFP cell through PyBaMM DFN with the given pack-power profile.

    Returns time series on the SAME `t` grid the caller passed in (via
    `t_eval=t`), so `t[i]`, `V_cell[i]`, `I_cell[i]` are sampled at the same
    instant. We map pack power → cell current via P/V at nominal pack voltage
    (the cell stays in plateau ~3.25 V × 15S ≈ 48 V over the demo window).
    """
    p_per_bbu_w = power_kw * 1000.0 / N_BBU_PER_RACK
    i_pack = p_per_bbu_w / LFP_PACK_NOMINAL_V  # A through the pack
    i_cell = i_pack  # 15S series → same current

    model = pybamm.lithium_ion.DFN()
    params = pybamm.ParameterValues("Prada2013")
    nominal_cap = params["Nominal cell capacity [A.h]"]
    # Scale pack current onto a representative cell so that I_PEAK_PACK_A maps
    # to TARGET_PEAK_C_RATE on the (smaller) Prada cell. This keeps the
    # simulated current excursion at a physically realistic C-rate without
    # rebuilding the whole pack-level model.
    scale = (TARGET_PEAK_C_RATE * float(nominal_cap)) / I_PEAK_PACK_A
    i_sim = i_cell * scale

    params["Current function [A]"] = pybamm.Interpolant(
        t, i_sim, pybamm.t, name="profile", interpolator="linear"
    )
    sim = pybamm.Simulation(model, parameter_values=params)
    # t_eval=t forces the solver to return values at the exact input grid so
    # caller-side arrays line up by index. Without this, sol["Time [s]"]
    # follows the adaptive solver and drifts away from `t`.
    sol = sim.solve(t_eval=t)

    return {
        "t": np.asarray(sol["Time [s]"].entries),
        "V_cell": np.asarray(sol["Voltage [V]"].entries),
        "I_cell": np.asarray(sol["Current [A]"].entries),
    }


def _stable_window_pp(t: np.ndarray, v: np.ndarray, t0: float = 4.0, t1: float = 6.0) -> float:
    """Peak-to-peak voltage in a steady-state window — what the demo headlines."""
    mask = (t >= t0) & (t <= t1)
    if not mask.any():
        return float(np.ptp(v))
    return float(np.ptp(v[mask]))


def scenario_transient_lfp_only(duration_s: float = 10.0, dt: float = 0.005) -> None:
    logger.info("=== Scenario 1: LFP-only transient (baseline) ===")
    t, p_kw = _build_power_profile(duration_s, dt)
    sim = _simulate_lfp_cell(p_kw, t)

    n = 800
    v_cell = np.asarray(sim["V_cell"])
    sim_t = np.asarray(sim["t"])

    payload = {
        "title": "Pure LFP under GB200 transient — voltage sag",
        "description": (
            "Baseline scenario: a traditional all-battery BBU sees the entire "
            "±30 % power swing. The LFP cell voltage tracks every pulse, "
            "stressing the chemistry and increasing local heating."
        ),
        "duration_s": duration_s,
        "rack_power_kw": RACK_POWER_KW,
        "transient_amplitude": TRANSIENT_AMPLITUDE,
        "transient_period_s": TRANSIENT_PERIOD_S,
        "series": {
            "t": _decimate(t, n).tolist(),
            "p_total_kw": _decimate(p_kw, n).tolist(),
            "v_cell": _decimate(v_cell, n).tolist(),
            "v_pack": _decimate(v_cell * 15, n).tolist(),
            "i_cell": _decimate(np.asarray(sim["I_cell"]), n).tolist(),
        },
        "stats": {
            "v_cell_min": float(np.min(v_cell)),
            "v_cell_max": float(np.max(v_cell)),
            "v_cell_swing": float(np.max(v_cell) - np.min(v_cell)),
            "v_cell_pp_stable": _stable_window_pp(sim_t, v_cell),
            "p_lfp_std_kw": float(np.std(p_kw)),
        },
    }
    _save("transient_lfp_only.json", payload)


def scenario_transient_hybrid(duration_s: float = 10.0, dt: float = 0.005) -> None:
    logger.info("=== Scenario 2: LFP + LIC hybrid transient ===")
    t, p_kw = _build_power_profile(duration_s, dt)
    p_lfp, p_lic = _split_with_lic(p_kw, dt, tau_s=SPLIT_FILTER_TAU_S)
    sim = _simulate_lfp_cell(p_lfp, t)

    n = 800
    v_cell = np.asarray(sim["V_cell"])
    sim_t = np.asarray(sim["t"])

    # Peak instantaneous LIC state-of-charge excursion (kJ).
    # ∫ p_lic·dt is the running net energy that has flowed INTO the LIC; its
    # max magnitude is the peak amount the LIC has to hold at any instant.
    # NOT to be confused with ∫|p_lic|·dt, which is two-way throughput.
    # Use a vectorised trapezoidal cumulative integral (O(n) vs O(n²) loop).
    integrate = getattr(np, "trapezoid", np.trapz)
    dt_arr = np.diff(t)
    seg_avg = 0.5 * (p_lic[:-1] + p_lic[1:])
    lic_soc_kj = np.concatenate(([0.0], np.cumsum(seg_avg * dt_arr)))
    lic_peak_excursion_kj = float(np.max(np.abs(lic_soc_kj)))
    lic_throughput_kj = float(integrate(np.abs(p_lic), t))
    lic_capacity_kj = LIC_ENERGY_KJ_PER_RACK * LIC_OVERPROV_FACTOR

    payload = {
        "title": "Hybrid LFP + LIC — flattened transient delivered to LFP",
        "description": (
            "The DC-DC control law routes content above the LPF cutoff "
            f"(≈{1.0/(2*np.pi*SPLIT_FILTER_TAU_S):.2f} Hz, τ={SPLIT_FILTER_TAU_S} s) "
            "to the lithium-ion capacitor; the LFP pack sees only the smoothed "
            "average. Cell voltage stays in the plateau, electrode stress drops, "
            "expected cycle life extends ~25 % per the proposal §A."
        ),
        "duration_s": duration_s,
        "split_filter_tau_s": SPLIT_FILTER_TAU_S,
        "series": {
            "t": _decimate(t, n).tolist(),
            "p_total_kw": _decimate(p_kw, n).tolist(),
            "p_lfp_kw": _decimate(p_lfp, n).tolist(),
            "p_lic_kw": _decimate(p_lic, n).tolist(),
            "v_cell": _decimate(v_cell, n).tolist(),
            "v_pack": _decimate(v_cell * 15, n).tolist(),
            "i_cell": _decimate(np.asarray(sim["I_cell"]), n).tolist(),
        },
        "stats": {
            "v_cell_min": float(np.min(v_cell)),
            "v_cell_max": float(np.max(v_cell)),
            "v_cell_swing": float(np.max(v_cell) - np.min(v_cell)),
            "v_cell_pp_stable": _stable_window_pp(sim_t, v_cell),
            "p_lfp_std_kw": float(np.std(p_lfp)),
            "lic_peak_kw": float(np.max(np.abs(p_lic))),
            # Peak instantaneous storage requirement — what determines whether
            # the LIC can absorb the worst-case excursion. THIS is what should
            # be compared against capacity.
            "lic_peak_excursion_kj": lic_peak_excursion_kj,
            # Cumulative two-way energy moved through the LIC over the demo
            # window. Useful as a duty-cycle metric, not as a capacity check.
            "lic_throughput_kj": lic_throughput_kj,
            "lic_energy_kj_capacity": lic_capacity_kj,
            "lic_headroom_ratio": lic_capacity_kj / max(lic_peak_excursion_kj, 1e-6),
        },
    }
    _save("transient_hybrid.json", payload)


# ---------------------------------------------------------------------------
# 3. Aging — synthetic Severson-calibrated decay (PyBaMM 1000-cycle DFN is
# computationally infeasible at notebook-demo scale; this analytic curve is
# faithful to Severson 2019 LFP fade kinetics)
# ---------------------------------------------------------------------------
def _soh_full_cycling(cycles: np.ndarray) -> np.ndarray:
    """Severson-calibrated mean LFP fade under 1C/1C cycling.

    Two-regime model: gentle sub-linear early, then accelerating past the
    'knee' near cycle 800. The Severson 2019 mean cycle life (to 80 % SOH)
    sits near 1000-1100, with the knee where fade kinetics change being a
    couple of hundred cycles earlier. Floor at 0.30 keeps the curve sane
    under far-future extrapolation but is well below useful operation.
    """
    knee = 800.0
    gentle = 1.0 - 1.5e-5 * cycles - 4e-9 * cycles ** 1.7
    # Post-knee acceleration: exp(-Δ/1500). Calibrated so the mean curve
    # crosses 80 % SOH near cycle 1100 (matching the Severson 2019 mean) and
    # 50 % around cycle 1800. Denominator 1500 + linear exponent gives a
    # smooth fade rather than the cliff a higher exponent would produce.
    accel = np.exp(-(np.maximum(cycles - knee, 0) / 1500.0))
    return np.clip(gentle * accel, 0.30, 1.0)


def scenario_aging_lfp(n_cycles: int = 3000) -> None:
    logger.info(f"=== Scenario 3: LFP capacity fade over {n_cycles} cycles ===")
    cycles = np.arange(0, n_cycles + 1)

    soh = _soh_full_cycling(cycles)

    # BBU duty: float-charge with rare events. Per proposal §G.3 the effective
    # fade rate is ~1/3 of full cycling. Correct mapping is on EFFECTIVE
    # cycles, not on the SOH output: at calendar cycle N, the cell has
    # experienced N × duty_factor effective full-cycling cycles.
    bbu_duty_factor = 0.33
    soh_bbu = _soh_full_cycling(cycles * bbu_duty_factor)

    # Down-sample for client payload
    cycles_ds = _decimate(cycles, 600)
    soh_ds = _decimate(soh, 600)
    soh_bbu_ds = _decimate(soh_bbu, 600)

    # Threshold-crossing stats are computed on an extended grid so the BBU
    # 80 % crossing (~cycle 3360 with 0.33 duty) is captured even when the
    # plotted horizon is shorter.
    cycles_ext = np.arange(0, max(n_cycles, 6000) + 1)
    soh_ext = _soh_full_cycling(cycles_ext)
    soh_bbu_ext = _soh_full_cycling(cycles_ext * bbu_duty_factor)

    def _cycle_at_threshold(soh_arr: np.ndarray, threshold: float) -> float:
        below = np.where(soh_arr < threshold)[0]
        return float(cycles_ext[below[0]]) if len(below) else float(cycles_ext[-1])

    payload = {
        "title": f"LFP State-of-Health under BBU duty ({n_cycles}-cycle horizon)",
        "description": (
            "Capacity-fade curves calibrated to Severson 2019 LFP mean behaviour. "
            "BBU duty uses a 0.33 effective-cycle factor: at calendar cycle N the "
            "pack has accumulated N × 0.33 effective full-cycle equivalents, so "
            "an 80 % SOH calendar age maps to a much later wall-clock date than "
            "the equivalent 1C/1C bench test. Halved replacement frequency is one "
            "of several lines that together produce the §G.3 10-year TCO delta."
        ),
        "series": {
            "cycle": cycles_ds.tolist(),
            "soh_full_cycling": soh_ds.tolist(),
            "soh_bbu_duty": soh_bbu_ds.tolist(),
        },
        "stats": {
            "knee_cycle": 800.0,
            "duty_factor": bbu_duty_factor,
            "soh_at_2400_bbu_cycles": float(np.interp(2400, cycles_ext, soh_bbu_ext)),
            "soh_at_3000_bbu_cycles": float(np.interp(3000, cycles_ext, soh_bbu_ext)),
            "cycle_at_80pct_soh_full": _cycle_at_threshold(soh_ext, 0.80),
            "cycle_at_80pct_soh_bbu": _cycle_at_threshold(soh_bbu_ext, 0.80),
        },
    }
    _save("aging_lfp.json", payload)


# ---------------------------------------------------------------------------
# 4. Synthetic fleet of 1000 BBU devices for the /dashboard page
# ---------------------------------------------------------------------------
SITES = [
    # (site_label, location, weight, lat, lng)
    ("CoreWeave-Dallas-01",       "Dallas, TX",        18, 32.78, -96.80),
    ("CoreWeave-Plano-02",        "Plano, TX",         12, 33.02, -96.70),
    ("Lambda-Austin-01",          "Austin, TX",        10, 30.27, -97.74),
    ("Equinix-DA11-Dallas",       "Dallas, TX",         8, 32.93, -96.83),
    ("Digital-Realty-Ashburn-01", "Ashburn, VA",       16, 39.04, -77.49),
    ("Equinix-DC15-Ashburn",      "Ashburn, VA",       12, 39.06, -77.46),
    ("Microsoft-Quincy-WA",       "Quincy, WA",         8, 47.23, -119.85),
    ("Meta-Eagle-Mountain-UT",    "Eagle Mountain, UT", 6, 40.32, -112.01),
    ("AWS-Hilliard-OH",           "Hilliard, OH",       5, 40.03, -83.16),
    ("Google-CouncilBluffs-IA",   "Council Bluffs, IA", 5, 41.26, -95.86),
]


def _state_code(location: str) -> str:
    """Pull the 2-letter state code out of a 'City, ST' label."""
    return location.rsplit(",", 1)[-1].strip()[:2].upper()


def scenario_fleet_devices(n: int = 1000, seed: int = 7) -> None:
    logger.info(f"=== Scenario 4: synthetic {n}-device fleet ===")
    rng = np.random.default_rng(seed)

    weights = np.array([s[2] for s in SITES], dtype=float)
    weights /= weights.sum()
    site_idx = rng.choice(len(SITES), size=n, p=weights)

    # Service-age-aware SOH distribution: 60 % young (<2 y, SOH 0.95-1.00),
    # 30 % mid (2-6 y, SOH 0.85-0.95), 10 % old (6-9 y, SOH 0.75-0.88).
    age_buckets = rng.choice(3, size=n, p=[0.60, 0.30, 0.10])
    soh = np.empty(n)
    rul = np.empty(n)
    age_months = np.empty(n)
    for i, b in enumerate(age_buckets):
        if b == 0:
            soh[i] = rng.uniform(0.95, 1.00)
            age_months[i] = rng.uniform(0, 24)
            rul[i] = rng.uniform(2400, 3000)
        elif b == 1:
            soh[i] = rng.uniform(0.85, 0.95)
            age_months[i] = rng.uniform(24, 72)
            rul[i] = rng.uniform(1200, 2400)
        else:
            soh[i] = rng.uniform(0.75, 0.88)
            age_months[i] = rng.uniform(72, 108)
            rul[i] = rng.uniform(200, 1200)

    # Per-device telemetry snapshot.
    # Status is now DERIVED from SOH / RUL / temperature so it is internally
    # consistent — a device with RUL < 600 will never show "healthy".
    # Per-state running counters so device IDs encode the state they live in
    # (SYS-VA-0001 sits in Virginia, etc.) — no more SYS-TX-* in Ashburn.
    state_counters: dict[str, int] = {}
    devices = []
    for i in range(n):
        s = SITES[site_idx[i]]
        lat = s[3] + rng.normal(0, 0.02)  # tiny jitter so markers don't fully overlap
        lng = s[4] + rng.normal(0, 0.02)

        # Temperature: hotter for older / lower-SOH packs (more internal resistance).
        # Plus ~4 % of devices have an INDEPENDENT cooling fault (clogged filter,
        # rack hot-aisle problem, fan PWM fault) that bumps temps regardless of age.
        temp_penalty = max(0.0, 1.0 - soh[i]) * 26.0
        cooling_fault = rng.random() < 0.04
        cooling_bump_lfp = rng.uniform(8, 14) if cooling_fault else 0.0
        cooling_bump_lic = rng.uniform(10, 18) if cooling_fault else 0.0
        temp_lfp = rng.uniform(28, 38) + temp_penalty * 0.4 + cooling_bump_lfp
        temp_lic = rng.uniform(35, 50) + temp_penalty * 0.5 + cooling_bump_lic

        # Derive status from physically meaningful thresholds.
        # Aging takes priority over thermal because it implies the device is on
        # the replacement queue regardless of why it's running hot.
        if soh[i] < 0.85 or rul[i] < 800:
            status_i = "early_aging"
        elif temp_lfp > 45.0 or temp_lic > 60.0:
            status_i = "thermal_warn"
        else:
            status_i = "healthy"

        state = _state_code(s[1])
        seq = state_counters.get(state, 0)
        state_counters[state] = seq + 1
        devices.append({
            "id": f"SYS-{state}-{seq:04d}",
            "site": s[0],
            "location": s[1],
            "lat": round(lat, 4),
            "lng": round(lng, 4),
            "soh_lfp": round(float(soh[i]), 4),
            "soh_lic": round(float(rng.uniform(0.985, 1.0)), 4),  # LIC barely degrades
            "rul_cycles": int(rul[i]),
            "age_months": round(float(age_months[i]), 1),
            "transient_events_24h": int(rng.poisson(1100)),
            "temp_lfp_c": round(float(temp_lfp), 1),
            "temp_lic_c": round(float(temp_lic), 1),
            "status": status_i,
        })

    # Status array (for the summary stats below)
    status = np.array([d["status"] for d in devices])

    payload = {
        "title": f"Synthetic fleet — {n} Sysblade BBU devices",
        "disclaimer": "Simulated Data. Not from any production deployment.",
        "n_devices": n,
        "geographic_distribution": {
            "Texas":    sum(1 for d in devices if _state_code(d["location"]) == "TX"),
            "Virginia": sum(1 for d in devices if _state_code(d["location"]) == "VA"),
            "Other":    sum(1 for d in devices if _state_code(d["location"]) not in ("TX", "VA")),
        },
        "status_summary": {
            "healthy": int(np.sum(status == "healthy")),
            "thermal_warn": int(np.sum(status == "thermal_warn")),
            "early_aging": int(np.sum(status == "early_aging")),
        },
        # Devices that should already be on the replacement queue, defined the
        # same way the UI computes Tier-3 candidates: status == early_aging
        # (which is SOH < 0.85 OR RUL < 800 cycles). Keeping the JSON field
        # aligned with the UI logic avoids drift between Tier-1 counts, the
        # geographic markers, and the table.
        "replacement_queue_count": int(
            sum(1 for d in devices if d["status"] == "early_aging")
        ),
        "devices": devices,
    }
    _save("fleet_devices.json", payload)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    scenario_transient_lfp_only()
    scenario_transient_hybrid()
    scenario_aging_lfp()
    scenario_fleet_devices()
    logger.success("All scenarios written to packages/shared/scenarios/")
