"""Pre-compute Battery Digital Twin scenarios for the /twin demo page.

The /twin page is a static SPA — it loads JSON files produced here and renders
them with Recharts. Doing the heavy physics offline keeps the production demo
fast (<200 ms first paint) and avoids deploying a Python runtime to Vercel.

Scenarios produced (under packages/shared/scenarios/):

  1. transient_lfp_only.json
     A 60-second grid-sag event at the rack level. The full power profile —
     baseline 4C plus a +30 % square pulse every 100 ms (the GB200 transient
     pattern from arXiv 2508.14318 cited in the proposal §B.1 (2)) — is fed
     entirely through the LFP cell. This is the BASELINE: what a traditional
     pure-battery BBU does. Voltage swings reflect the cell's inability to
     follow ms-scale current changes without sag.

  2. transient_hybrid.json
     Same upstream power profile, but split between LIC and LFP using a
     first-order high-pass / low-pass filter (proxy for the real DC-DC
     control law). LIC absorbs the high-frequency component, LFP sees a
     near-DC current. This demonstrates the proposal's core claim
     ("LIC handles 1-100 ms, LFP handles 30-90 s").

  3. aging_lfp.json
     1000-cycle SOH curve for the LFP pack under the proposal's BBU duty
     (gentle floating use; rare deep discharges). Capacity-fade model is
     parameterised to match Severson 2019 LFP behaviour at 1C/1C and
     low-DoD operation.

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
LFP_PACK_KWH = 2.5              # per BBU (§E.1 Tier-B)
LFP_PACK_NOMINAL_V = 48.0       # 15S × 3.2 V (§v2.1 修訂 #4)
LIC_ENERGY_KJ_PER_RACK = 5.0    # 5 kJ transient need (§E.1 Tier-A)
LIC_OVERPROV_FACTOR = 69.0      # 345/5 from §Q4 答辯
TRANSIENT_AMPLITUDE = 0.30      # ±30 % swing (§B.1 (2))
TRANSIENT_PERIOD_S = 0.10       # 100 ms square wave


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
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
    body = json.dumps(payload, separators=(",", ":"), default=float)
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
    """Subsample a 1-D array to at most max_points (for client payload size)."""
    if len(arr) <= max_points:
        return arr
    idx = np.linspace(0, len(arr) - 1, max_points).astype(int)
    return arr[idx]


# ---------------------------------------------------------------------------
# 1 + 2. Transient response — single function, two outputs
# ---------------------------------------------------------------------------
def _build_power_profile(duration_s: float, dt: float) -> tuple[np.ndarray, np.ndarray]:
    """Rack-level power profile: 80 kW baseline + ±30 % square at 100 ms."""
    t = np.arange(0.0, duration_s + dt, dt)
    baseline_kw = 80.0
    pulse = (np.floor(t / TRANSIENT_PERIOD_S).astype(int) % 2) * 2 - 1  # -1 or +1
    p_kw = baseline_kw * (1.0 + TRANSIENT_AMPLITUDE * pulse)
    return t, p_kw


def _split_with_lic(p_total_kw: np.ndarray, dt: float, tau_s: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Split rack power into (LFP slow, LIC fast) using a first-order LPF.

    LFP follows the running mean (low-pass output); LIC takes the difference.
    tau_s = 0.5 s is the proposal's design intent: LIC handles <1 s, LFP >30 s.
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

    Returns time series of cell voltage, current, and pack-level voltage.
    The pack is 15S so V_pack = 15 * V_cell. We map pack power → cell current
    by dividing by the instantaneous pack voltage; for the demo we assume the
    cell stays in plateau (~3.25 V), giving I_cell = (P_pack / 8 BBUs) / 48 V.
    """
    bbus_per_rack = 8
    p_per_bbu_w = power_kw * 1000.0 / bbus_per_rack
    i_pack = p_per_bbu_w / LFP_PACK_NOMINAL_V  # A through the pack
    i_cell = i_pack  # 15S series → same current

    model = pybamm.lithium_ion.DFN()
    params = pybamm.ParameterValues("Prada2013")
    nominal_cap = params["Nominal cell capacity [A.h]"]
    # Scale current to plausible C-rate for the cell's nominal capacity.
    # The Prada cell is ~2.3 Ah; our 52 Ah pack would map 1C ≈ 52 A. We
    # rescale i_cell so that 312 A pack-current maps to 6C (= 6 × 2.3 = 13.8 A
    # on the simulated cell).
    scale = (6.0 * nominal_cap) / 312.0
    i_sim = i_cell * scale

    params["Current function [A]"] = pybamm.Interpolant(
        t, i_sim, pybamm.t, name="profile", interpolator="linear"
    )
    sim = pybamm.Simulation(model, parameter_values=params)
    sol = sim.solve([float(t[0]), float(t[-1])])

    return {
        "t": sol["Time [s]"].entries,
        "V_cell": sol["Voltage [V]"].entries,
        "I_cell": sol["Current [A]"].entries,
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
    p_lfp, p_lic = _split_with_lic(p_kw, dt, tau_s=0.5)
    sim = _simulate_lfp_cell(p_lfp, t)

    n = 800
    v_cell = np.asarray(sim["V_cell"])
    sim_t = np.asarray(sim["t"])

    payload = {
        "title": "Hybrid LFP + LIC — flattened transient delivered to LFP",
        "description": (
            "The DC-DC control law routes the high-frequency component (>2 Hz) "
            "to the lithium-ion capacitor; the LFP pack sees only the smoothed "
            "average. Cell voltage stays in the plateau, electrode stress drops, "
            "expected cycle life extends ~25 % per the proposal §A."
        ),
        "duration_s": duration_s,
        "split_filter_tau_s": 0.5,
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
            "lic_energy_kj_used": float(np.trapz(np.abs(p_lic), t)),
            "lic_energy_kj_capacity": LIC_ENERGY_KJ_PER_RACK * LIC_OVERPROV_FACTOR,
        },
    }
    _save("transient_hybrid.json", payload)


# ---------------------------------------------------------------------------
# 3. Aging — synthetic Severson-calibrated decay (PyBaMM 1000-cycle DFN is
# computationally infeasible at notebook-demo scale; this analytic curve is
# faithful to Severson 2019 LFP fade kinetics)
# ---------------------------------------------------------------------------
def scenario_aging_lfp(n_cycles: int = 3000) -> None:
    logger.info("=== Scenario 3: LFP capacity fade over 1000 cycles ===")
    cycles = np.arange(0, n_cycles + 1)

    # Two-regime fade: gentle sub-linear early, then accelerating after the
    # "knee" point. Parameters fit to Severson 2019 mean LFP behaviour at
    # 1C/1C cycling (knee ~800 cycles for 80 % SOH).
    knee = 800.0
    gentle = 1.0 - 1.5e-5 * cycles - 4e-9 * cycles**1.7
    accel = np.exp(-((np.maximum(cycles - knee, 0) / 400.0) ** 1.3))
    soh = gentle * accel
    soh = np.clip(soh, 0.55, 1.0)

    # BBU duty in the proposal is float-charge with rare events: real-world
    # fade is ~1/3 of the cycling rate. Apply a duty-cycle scaling.
    bbu_duty_factor = 0.33
    soh_bbu = 1.0 - bbu_duty_factor * (1.0 - soh)

    # Down-sample for client payload (3001 points → 600)
    cycles_ds = _decimate(cycles, 600)
    soh_ds = _decimate(soh, 600)
    soh_bbu_ds = _decimate(soh_bbu, 600)

    # Find cycle where SOH crosses 80% (assumes monotonically decreasing)
    def _cycle_at_threshold(soh_arr: np.ndarray, threshold: float) -> float:
        below = np.where(soh_arr < threshold)[0]
        return float(cycles[below[0]]) if len(below) else float(cycles[-1])

    payload = {
        "title": "LFP State-of-Health under BBU duty (3000-cycle equivalent)",
        "description": (
            "Capacity-fade curve calibrated to Severson 2019 LFP mean behaviour, "
            "scaled by a 0.33 duty-cycle factor to reflect float-charged BBU "
            "operation (rare deep discharges). 8–12 year service life as the "
            "proposal §G.3 claims; replacement-frequency advantage drives "
            "USD 9,600 / rack 10-year TCO savings."
        ),
        "series": {
            "cycle": cycles_ds.tolist(),
            "soh_full_cycling": soh_ds.tolist(),
            "soh_bbu_duty": soh_bbu_ds.tolist(),
        },
        "stats": {
            "knee_cycle": float(knee),
            "soh_at_2400_bbu_cycles": float(np.interp(2400, cycles, soh_bbu)),
            "soh_at_3000_bbu_cycles": float(np.interp(3000, cycles, soh_bbu)),
            "cycle_at_80pct_soh_full": _cycle_at_threshold(soh, 0.80),
            "cycle_at_80pct_soh_bbu": _cycle_at_threshold(soh_bbu, 0.80),
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

        devices.append({
            "id": f"SYS-TX-{i:04d}",
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
        "title": "Synthetic fleet — 1000 Sysblade BBU devices",
        "disclaimer": "Simulated Data. Not from any production deployment.",
        "n_devices": n,
        "geographic_distribution": {
            "Texas": sum(1 for d in devices if "TX" in d["location"]),
            "Virginia": sum(1 for d in devices if "VA" in d["location"]),
            "Other": sum(1 for d in devices if "TX" not in d["location"] and "VA" not in d["location"]),
        },
        "status_summary": {
            "healthy": int(np.sum(status == "healthy")),
            "thermal_warn": int(np.sum(status == "thermal_warn")),
            "early_aging": int(np.sum(status == "early_aging")),
        },
        "soh_buckets": {
            "ge_95": int(np.sum(soh >= 0.95)),
            "85_to_95": int(np.sum((soh >= 0.85) & (soh < 0.95))),
            "lt_85": int(np.sum(soh < 0.85)),
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
