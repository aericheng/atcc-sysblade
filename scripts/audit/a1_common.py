"""Shared helpers for the A1 frequency-domain self-audit (口試前自我稽核).

Imports the production helpers from scripts/generate_twin_scenarios.py (GTS)
read-only so that every audit number uses exactly the same split filter,
power profile and DFN cell mapping as the published demo. Nothing in GTS is
modified; importing it only re-creates its (already existing) output dirs.

No randomness is used anywhere in the A1 scripts.
"""
from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.signal import lfilter

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))

import generate_twin_scenarios as gts  # noqa: E402  (read-only import)

OUT_DIR = REPO / "data" / "processed" / "audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DT = 0.005  # s, same as GTS transient scenarios

# ---------------------------------------------------------------------------
# Constants pulled from GTS (single source of truth)
# ---------------------------------------------------------------------------
GTS_CONST = {
    "RACK_POWER_KW": gts.RACK_POWER_KW,
    "RACK_BASELINE_KW": gts.RACK_BASELINE_KW,
    "N_BBU_PER_RACK": gts.N_BBU_PER_RACK,
    "LFP_PACK_KWH": gts.LFP_PACK_KWH,
    "LFP_PACK_NOMINAL_V": gts.LFP_PACK_NOMINAL_V,
    "LIC_ENERGY_KJ_PER_RACK": gts.LIC_ENERGY_KJ_PER_RACK,
    "LIC_OVERPROV_FACTOR": gts.LIC_OVERPROV_FACTOR,
    "TRANSIENT_AMPLITUDE": gts.TRANSIENT_AMPLITUDE,
    "TRANSIENT_PERIOD_S": gts.TRANSIENT_PERIOD_S,
    "SPLIT_FILTER_TAU_S": gts.SPLIT_FILTER_TAU_S,
    "TARGET_PEAK_C_RATE": gts.TARGET_PEAK_C_RATE,
    "I_PEAK_PACK_A": gts.I_PEAK_PACK_A,
    "LIC_BANK_C_F": gts.LIC_BANK_C_F,
    "LIC_BANK_ESR_OHM": gts.LIC_BANK_ESR_OHM,
    "LIC_V_NOMINAL_V": gts.LIC_V_NOMINAL_V,
    "LIC_V_MIN_DATASHEET_V": gts.LIC_V_MIN_DATASHEET_V,
}
LIC_NOMINAL_TOTAL_KJ = gts.LIC_ENERGY_KJ_PER_RACK * gts.LIC_OVERPROV_FACTOR  # 345 kJ
# Energy the GTS RC bank (332 F) can actually deliver between the fully
# charged 51.3 V and the 38 V datasheet cutoff: ½C(V1²−V0²). Derived from GTS
# constants, ignores ESR loss and DC-DC input-voltage limits.
LIC_USABLE_KJ_51V3_TO_38V = (
    0.5 * gts.LIC_BANK_C_F
    * (gts.LIC_V_NOMINAL_V ** 2 - gts.LIC_V_MIN_DATASHEET_V ** 2) / 1000.0
)
# Same bank (2 modules × 166 F) but topped at 48.6 V instead of 51.3 V.
# 48.6 V as the module rating comes from the red-team probe / coordinator
# (rt/probe.py "Eaton x2 @rated 48.6V"); NOT independently checked against a
# datasheet in this audit (ASSUMED).
LIC_V_RATED_ASSUMED_V = 48.6
LIC_USABLE_KJ_48V6_TO_38V = (
    0.5 * gts.LIC_BANK_C_F
    * (LIC_V_RATED_ASSUMED_V ** 2 - gts.LIC_V_MIN_DATASHEET_V ** 2) / 1000.0
)
# Rack power that GTS maps onto TARGET_PEAK_C_RATE on the Prada2013 cell.
P_AT_TARGET_C_KW = gts.I_PEAK_PACK_A * gts.LFP_PACK_NOMINAL_V * gts.N_BBU_PER_RACK / 1000.0


def c_rate_dfn_mapping(p_rack_kw: float) -> float:
    """Cell C-rate under the GTS DFN mapping (104 kW rack → 6 C)."""
    return float(p_rack_kw / P_AT_TARGET_C_KW * gts.TARGET_PEAK_C_RATE)


def c_rate_pack_energy(p_rack_kw: float) -> float:
    """Pack C-rate if C is referenced to the 2.5 kWh per-BBU pack energy."""
    return float(p_rack_kw / gts.N_BBU_PER_RACK / gts.LFP_PACK_KWH)


# ---------------------------------------------------------------------------
# Filter
# ---------------------------------------------------------------------------
def ema(x: np.ndarray, dt: float, tau: float, seed: float) -> np.ndarray:
    """Vectorised twin of gts._split_with_lic's EMA (identical recursion).

    y[0] = seed;  y[i] = a·x[i] + (1−a)·y[i−1],  a = dt/(tau+dt).
    """
    a = dt / (tau + dt)
    y = np.empty_like(x, dtype=float)
    y[0] = seed
    if len(x) > 1:
        y[1:] = lfilter([a], [1.0, -(1.0 - a)], x[1:], zi=[(1.0 - a) * seed])[0]
    return y


def h_continuous(f: np.ndarray, tau: float) -> np.ndarray:
    """|H(f)| of the continuous-time 1st-order LPF = LFP share of a sinusoid."""
    return 1.0 / np.sqrt(1.0 + (2.0 * np.pi * np.asarray(f) * tau) ** 2)


def h_discrete(f: np.ndarray, tau: float, dt: float = DT) -> np.ndarray:
    """|H| of the actual discrete EMA used in GTS (valid below Nyquist)."""
    a = dt / (tau + dt)
    z = np.exp(-1j * 2 * np.pi * np.asarray(f) * dt)
    return np.abs(a / (1.0 - (1.0 - a) * z))


# ---------------------------------------------------------------------------
# Waveforms (Choukse-style compute/comm cycling) — all shape params ASSUMED
# ---------------------------------------------------------------------------
def choukse_wave(t: np.ndarray, f_hz: float, p_high_kw: float, p_low_kw: float,
                 duty: float = 0.5, shape: str = "square",
                 ramp_frac: float = 0.1) -> np.ndarray:
    """Periodic compute(high)/communication(low) power waveform.

    Phase starts at the beginning of a HIGH (compute) phase.
    shape="square": instantaneous edges.
    shape="trapezoid": linear ramps of ramp_frac·T on each edge, inserted at
    the start of each phase (so the plateau durations shrink accordingly).
    """
    # Phase in [0,1). The 1e-9 guards stop floating-point jitter at exact
    # edge samples from flipping a sample's level in some periods but not
    # others (that jitter injects spurious low-frequency content).
    cyc = np.asarray(t) * f_hz
    ph = cyc - np.floor(cyc + 1e-9)
    ph = np.clip(ph, 0.0, None)
    duty = duty - 1e-9
    if shape == "square":
        return np.where(ph < duty, p_high_kw, p_low_kw).astype(float)
    if shape == "trapezoid":
        r = ramp_frac
        out = np.empty_like(ph)
        up = ph < r
        hi = (ph >= r) & (ph < duty)
        dn = (ph >= duty) & (ph < duty + r)
        lo = ph >= duty + r
        out[up] = p_low_kw + (p_high_kw - p_low_kw) * ph[up] / r
        out[hi] = p_high_kw
        out[dn] = p_high_kw - (p_high_kw - p_low_kw) * (ph[dn] - duty) / r
        out[lo] = p_low_kw
        return out
    raise ValueError(shape)


def cum_energy_kj(p_kw: np.ndarray, dt: float) -> np.ndarray:
    """Trapezoidal ∫p dt in kJ (same convention as GTS lic_net_energy_kj)."""
    seg = 0.5 * (p_kw[:-1] + p_kw[1:]) * dt
    return np.concatenate(([0.0], np.cumsum(seg)))


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def _clean(obj):
    if isinstance(obj, dict):
        return {str(k): _clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean(v) for v in obj]
    if isinstance(obj, np.ndarray):
        return [_clean(v) for v in obj.tolist()]
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        v = float(obj)
        return None if not np.isfinite(v) else v
    return obj


def results_digest(results: dict) -> str:
    body = json.dumps(_clean(results), sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def write_json(name: str, script: str, params: dict, assumptions: list[str],
               results: dict) -> Path:
    import matplotlib
    import pybamm
    import scipy

    results = _clean(results)
    payload = {
        "_meta": {
            "script": script,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "python": platform.python_version(),
            "numpy_version": np.__version__,
            "scipy_version": scipy.__version__,
            "pybamm_version": pybamm.__version__,
            "matplotlib_version": matplotlib.__version__,
            "randomness": "none (fully deterministic; no RNG used)",
            "gts_constants_used": GTS_CONST,
            "params": _clean(params),
            "assumptions_假設": assumptions,
            "results_sha256": results_digest(results),
            "rerun": f".venv/Scripts/python {script}",
        },
        "results": results,
    }
    p = OUT_DIR / name
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return p


def setup_cjk_font():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.font_manager as fm
    import matplotlib.pyplot as plt

    font = "C:/Windows/Fonts/msjh.ttc"
    if not Path(font).exists():
        raise FileNotFoundError(f"CJK font missing: {font}")
    fm.fontManager.addfont(font)
    plt.rcParams["font.family"] = ["Microsoft JhengHei", "DejaVu Sans"]
    plt.rcParams["font.weight"] = "normal"
    plt.rcParams["mathtext.fontset"] = "dejavusans"
    plt.rcParams["axes.unicode_minus"] = False
    return plt
