"""A2 audit — shared helpers (paths, _meta, CJK font, DFN-derived LFP Thevenin).

A2 = 口試前自我稽核：電力電子平均模型 / 電容規格邊界 / 最壞情境。
所有 A2 輸出檔名以 a2_ 開頭，寫到 data/processed/audit/。本模組不修改任何既有腳本或 JSON。
"""
from __future__ import annotations

import json
import platform
import sys
from datetime import date
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts"))
OUT_DIR = REPO / "data" / "processed" / "audit"
OUT_DIR.mkdir(parents=True, exist_ok=True)
SCEN_DIR = REPO / "packages" / "shared" / "scenarios"

# Repo constants (copied verbatim from scripts/generate_twin_scenarios.py:63-87 and
# generate_full_rack_60s_sim.py:39-53 — imported values are re-checked in a2_worst_case.py)
RACK_PEAK_KW = 120.0
N_BBU = 8
LFP_PACK_KWH = 2.5
LFP_PACK_NOMINAL_V = 48.0
N_SERIES_LFP = 15
SPLIT_TAU_S = 0.5
PRADA_CAP_AH = 2.3
TARGET_PEAK_C = 6.0
# Repo cell->pack current mapping used by the 60 s / N-1 scenarios
# (scripts/generate_full_rack_60s_sim.py:134-138; note generate_twin_scenarios.py:91-95 maps 104 kW, not 120 kW, to 6C):
#   i_sim_cell = i_pack * SCALE,  SCALE = 6C*2.3Ah / (120 kW/8/48 V)
I_PEAK_PACK_A = RACK_PEAK_KW * 1000.0 / N_BBU / LFP_PACK_NOMINAL_V  # 312.5 A
CELL_SCALE = TARGET_PEAK_C * PRADA_CAP_AH / I_PEAK_PACK_A           # 0.04416
N_PARALLEL_EQUIV = 1.0 / CELL_SCALE                                  # 22.6 Prada cells in parallel


def meta(script: str, params: dict, assumptions: list[str], notes: list[str] | None = None) -> dict:
    import scipy
    try:
        import pybamm
        pyb = pybamm.__version__
    except Exception:  # pragma: no cover
        pyb = None
    return {
        "script": script,
        "run_command": f".venv/Scripts/python {script}",
        "date": date.today().isoformat(),
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "pybamm": pyb,
        "params": params,
        "assumptions": assumptions,
        "notes": notes or [],
    }


def _clean(o):
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.bool_):
        return bool(o)
    if isinstance(o, np.ndarray):
        return _clean(o.tolist())
    if isinstance(o, float):
        return float(round(o, 10))
    return o


def write_json(name: str, payload: dict) -> Path:
    p = OUT_DIR / name
    with open(p, "w", encoding="utf-8") as f:
        json.dump(_clean(payload), f, indent=2, ensure_ascii=False)
    print(f"[a2] -> {p}")
    return p


def setup_cjk():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.font_manager as fm
    import matplotlib.pyplot as plt
    font = "C:/Windows/Fonts/msjh.ttc"
    if not Path(font).exists():
        raise FileNotFoundError(f"CJK font missing: {font}")
    fm.fontManager.addfont(font)
    plt.rcParams["font.family"] = ["Microsoft JhengHei", "DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False
    return plt


def lpf(x: np.ndarray, dt: float, tau: float, seed: float) -> np.ndarray:
    """Same discrete EMA as repo _split_with_lic (alpha = dt/(tau+dt))."""
    a = dt / (tau + dt)
    y = np.empty_like(x, dtype=float)
    y[0] = seed
    for i in range(1, len(x)):
        y[i] = a * x[i] + (1 - a) * y[i - 1]
    return y


# ---------------------------------------------------------------------------
# DFN -> Thevenin (R0 + R1||C1) of the Prada2013 LFP cell, then pack / rack
# ---------------------------------------------------------------------------
def fit_prada_thevenin(c_rate: float = 3.0, pulse_s: float = 10.0) -> dict:
    """Fit V = V0 - I*R0 - I*R1*(1-exp(-t/tau1)) - k*q on a DFN current pulse.

    Initial state = Prada2013 default (same as every repo scenario). The OCV
    drift during the pulse is absorbed by the linear charge term k*q.
    """
    import pybamm
    from scipy.optimize import curve_fit

    pv = pybamm.ParameterValues("Prada2013")
    cap = float(pv["Nominal cell capacity [A.h]"])
    I = c_rate * cap
    t_on, ramp = 1.0, 1e-3
    tt = np.array([0.0, t_on, t_on + ramp, t_on + pulse_s, t_on + pulse_s + ramp, t_on + pulse_s + 20.0])
    ii = np.array([0.0, 0.0, I, I, 0.0, 0.0])
    pv["Current function [A]"] = pybamm.Interpolant(tt, ii, pybamm.t, interpolator="linear")
    t_eval = np.unique(np.concatenate([
        np.linspace(0, t_on, 50),
        t_on + ramp + np.geomspace(1e-4, pulse_s - 1e-3, 400),
        t_on + pulse_s + ramp + np.geomspace(1e-4, 19.9, 200),
    ]))
    sim = pybamm.Simulation(pybamm.lithium_ion.DFN(), parameter_values=pv)
    sol = sim.solve(t_eval=t_eval)
    ts = np.asarray(sol["Time [s]"].entries)
    vs = np.asarray(sol["Voltage [V]"].entries)
    v_rest = float(np.interp(t_on - 1e-3, ts, vs))
    m = (ts > t_on + ramp) & (ts <= t_on + pulse_s)
    tp = ts[m] - (t_on + ramp)
    vp = vs[m]

    def model(t, r0, r1, tau1, k):
        return v_rest - I * r0 - I * r1 * (1 - np.exp(-t / tau1)) - k * I * t

    p0 = [0.01, 0.01, 1.0, 1e-5]
    popt, _ = curve_fit(model, tp, vp, p0=p0, bounds=([0, 0, 1e-3, 0], [1, 1, 100, 1]), maxfev=20000)
    resid = vp - model(tp, *popt)
    r0, r1, tau1, k = map(float, popt)
    return {
        "c_rate": c_rate, "i_cell_a": I, "v_rest_v": v_rest,
        "r0_ohm": r0, "r1_ohm": r1, "tau1_s": tau1, "c1_f": tau1 / r1 if r1 > 0 else None,
        "ocv_slope_v_per_c": k, "fit_rmse_mv": float(1000 * np.sqrt(np.mean(resid ** 2))),
        "fit_max_abs_err_mv": float(1000 * np.max(np.abs(resid))),
        "n_points": int(m.sum()),
    }


def rack_thevenin_from_cell(cell: dict) -> dict:
    """Cell -> pack (15S x N_PARALLEL_EQUIV) -> rack (8 packs in parallel)."""
    f_pack = N_SERIES_LFP / N_PARALLEL_EQUIV
    r0_pack = cell["r0_ohm"] * f_pack
    r1_pack = cell["r1_ohm"] * f_pack
    return {
        "ocv_rack_v": cell["v_rest_v"] * N_SERIES_LFP,
        "r0_pack_ohm": r0_pack, "r1_pack_ohm": r1_pack,
        "r0_rack_ohm": r0_pack / N_BBU, "r1_rack_ohm": r1_pack / N_BBU,
        "tau1_s": cell["tau1_s"],
        "mapping": f"pack = {N_SERIES_LFP}S x {N_PARALLEL_EQUIV:.2f}P Prada cells (repo CELL_SCALE={CELL_SCALE:.5f}); rack = {N_BBU} packs in parallel",
    }
