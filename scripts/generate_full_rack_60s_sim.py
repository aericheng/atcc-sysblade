"""V3 — 整 rack 60s graceful 整合 sim,加入熱模型 + 明確 8-BBU 並聯統計.

對齊 `docs/BBU_IMPLEMENTATION_PLAN.md` v2.0 § 摘要 V3。在現有 `scenario_mains_fail`
(已含 60s ramp + 控制律 + GPU power-cap + LIC RC + DFN)的基礎上,加入:

1. **熱模型**:per-cell 等溫集總熱容 + 自然對流冷卻
   dT/dt = (I²R_int - h·A·(T - T_amb)) / C_th
   參數對齊 ANR26650 / Prada2013 typical values
2. **明確 8-BBU 並聯統計**:per-BBU 工作點 + symmetric assumption 揭露
3. **Sub-event ramp shape**:對齊 §2.1.1 三段(A peak hold 0.5s / B 線性 1.5s / C 持續 58s)
4. **輸出可被 V4 fault-injection 套用的 baseline scenario**

Output: `apps/web/public/scenarios/rack_60s_graceful.json` + thermal trace PNG

Usage:
    .venv/Scripts/python scripts/generate_full_rack_60s_sim.py
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts"))

OUT_DIRS = [
    REPO / "packages" / "shared" / "scenarios",
    REPO / "apps" / "web" / "public" / "scenarios",
]
OUT_PNG = REPO / "data" / "processed" / "rack_60s_graceful.png"

# ============================================================================
# Constants — 對齊 generate_twin_scenarios.py 與 whitepaper §2.1.1
# ============================================================================
RACK_PEAK_KW = 120.0
RACK_CONTINUOUS_KW = 30.0
N_BBU_PER_RACK = 8
LFP_PACK_KWH = 2.5
LFP_PACK_NOMINAL_V = 48.0
LIC_BANK_C_F = 332.0
LIC_BANK_ESR_OHM = 0.0025
LIC_V_NOMINAL_V = 51.3
LIC_V_MIN_UVLO_V = 38.0
SPLIT_FILTER_TAU_S = 0.5
PEAK_HOLD_S = 0.5
RAMP_S = 1.5
DURATION_S = 60.0
DT = 0.02

# Thermal model parameters (per-cell A123 ANR26650 typical) =====================
# 1.1 Ah cell, mass ~70 g, specific heat ~1000 J/kg/K → C_th ≈ 70 J/K
C_TH_CELL_J_PER_K = 70.0
# Internal resistance (DC) at 25°C, used for I²R heating
R_INT_CELL_OHM = 0.008  # 8 mΩ (Prada2013 / ANR26650 datasheet typical)
# Convective cooling: h × A in W/K (natural convection in rack airflow)
# Surface area of a 26650 cell ≈ 0.01 m²; h ≈ 10 W/m²K (forced air ~25-30)
H_TIMES_A_W_PER_K = 0.10  # natural-convection equivalent; rack has airflow
T_AMBIENT_C = 25.0
T_THERMAL_LIMIT_C = 50.0  # whitepaper §6.1 「> 50°C 軟體警告」


def _build_mains_fail_profile(duration_s: float, dt: float) -> tuple[np.ndarray, np.ndarray]:
    """Three-stage rack power profile: peak hold → linear ramp → continuous."""
    t = np.arange(0, duration_s + dt, dt)
    p_kw = np.full_like(t, RACK_CONTINUOUS_KW)
    # Stage A: peak hold
    stage_a_mask = t < PEAK_HOLD_S
    p_kw[stage_a_mask] = RACK_PEAK_KW
    # Stage B: linear ramp
    stage_b_mask = (t >= PEAK_HOLD_S) & (t < PEAK_HOLD_S + RAMP_S)
    if stage_b_mask.any():
        s = (t[stage_b_mask] - PEAK_HOLD_S) / RAMP_S
        p_kw[stage_b_mask] = RACK_PEAK_KW + s * (RACK_CONTINUOUS_KW - RACK_PEAK_KW)
    return t, p_kw


def _split_with_lic(
    p_total_kw: np.ndarray, dt: float, tau_s: float, lfp_init_kw: float
) -> tuple[np.ndarray, np.ndarray]:
    """First-order complementary filter τ=0.5 s split."""
    alpha = dt / (tau_s + dt)
    p_lfp = np.zeros_like(p_total_kw)
    p_lfp[0] = lfp_init_kw
    for i in range(1, len(p_total_kw)):
        p_lfp[i] = (1 - alpha) * p_lfp[i - 1] + alpha * p_total_kw[i]
    p_lic = p_total_kw - p_lfp
    return p_lfp, p_lic


def _simulate_lic_rc(p_lic_kw: np.ndarray, t: np.ndarray) -> dict:
    """Same as scripts/generate_twin_scenarios.py::_simulate_lic_rc."""
    i_a = p_lic_kw * 1000.0 / LIC_V_NOMINAL_V
    dt_arr = np.diff(t)
    seg = 0.5 * (i_a[:-1] + i_a[1:])
    q_c = np.concatenate(([0.0], np.cumsum(seg * dt_arr)))
    v_lic = LIC_V_NOMINAL_V - q_c / LIC_BANK_C_F - i_a * LIC_BANK_ESR_OHM
    return {
        "v_lic": v_lic,
        "i_lic_a": i_a,
        "v_min": float(v_lic.min()),
        "v_max": float(v_lic.max()),
        "v_droop_v": float(LIC_V_NOMINAL_V - v_lic.min()),
        "headroom_to_uvlo_v": float(v_lic.min() - LIC_V_MIN_UVLO_V),
    }


def _simulate_lfp_cell_pybamm(p_lfp_kw: np.ndarray, t: np.ndarray) -> dict:
    """Single representative LFP cell via PyBaMM DFN.

    With 8 BBU symmetric assumption, all cells see the same scaled current.
    Pack-level scaling:
        I_pack_per_bbu = (p_lfp_kw × 1000 / N_BBU) / V_pack_nominal
        I_cell = I_pack_per_bbu (15S series → same current)

    Returns arrays interpolated back to the caller's `t` grid so downstream
    code can use index-aligned arithmetic without size mismatch.
    """
    import pybamm

    p_per_bbu_w = p_lfp_kw * 1000.0 / N_BBU_PER_RACK
    i_cell_pack = p_per_bbu_w / LFP_PACK_NOMINAL_V  # A through a 15S string

    model = pybamm.lithium_ion.DFN()
    params = pybamm.ParameterValues("Prada2013")
    cap_ah = float(params["Nominal cell capacity [A.h]"])

    # Scale rack-level current to a representative cell C-rate
    # Rack peak per-cell I should map to 6C; nominal cell cap = 2.3 Ah
    i_peak_per_bbu = (
        RACK_PEAK_KW * 1000.0 / N_BBU_PER_RACK / LFP_PACK_NOMINAL_V
    )
    target_peak_c = 6.0
    scale = (target_peak_c * cap_ah) / i_peak_per_bbu
    i_sim = i_cell_pack * scale

    params["Current function [A]"] = pybamm.Interpolant(
        t, i_sim, pybamm.t, name="profile", interpolator="linear"
    )
    sim = pybamm.Simulation(model, parameter_values=params)
    sol = sim.solve(t_eval=t)
    t_sol = np.asarray(sol["Time [s]"].entries)
    v_sol = np.asarray(sol["Voltage [V]"].entries)
    i_sol = np.asarray(sol["Current [A]"].entries)
    # Adaptive solver may return more samples than caller's `t`; interp back
    v_on_t = np.interp(t, t_sol, v_sol)
    i_on_t = np.interp(t, t_sol, i_sol)
    return {"t": t, "V_cell": v_on_t, "I_cell": i_on_t}


def _simulate_thermal(
    i_cell: np.ndarray, t: np.ndarray, r_int: float, c_th: float, h_a: float,
    t_amb_c: float
) -> np.ndarray:
    """Forward-Euler integration of lumped cell thermal model.

    dT/dt = (I²·R_int - h·A·(T - T_amb)) / C_th

    Returns T(t) in Celsius.
    """
    n = len(t)
    T = np.zeros(n)
    T[0] = t_amb_c
    for i in range(1, n):
        dt = t[i] - t[i - 1]
        i_now = abs(i_cell[i])  # heating doesn't care about sign
        p_heat = i_now ** 2 * r_int
        p_cool = h_a * (T[i - 1] - t_amb_c)
        dT = (p_heat - p_cool) * dt / c_th
        T[i] = T[i - 1] + dT
    return T


def _decimate(arr: np.ndarray, n: int) -> np.ndarray:
    if len(arr) <= n:
        return arr
    idx = np.linspace(0, len(arr) - 1, n, dtype=int)
    return arr[idx]


def _maybe_plot(t, p_kw, p_lfp, p_lic, v_cell, v_lic, T_cell, out_png):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as exc:
        print(f"[skip-plot] {exc}")
        return

    fig, axes = plt.subplots(4, 1, figsize=(11, 11), sharex=True)

    ax = axes[0]
    ax.plot(t, p_kw, "k-", lw=2, label="rack power [kW]")
    ax.plot(t, p_lfp, "b-", lw=1.5, label="P_LFP (low-freq)")
    ax.plot(t, p_lic, "r-", lw=1.5, label="P_LIC (high-freq)")
    ax.set_ylabel("Power [kW]")
    ax.set_title("V3 — Rack 60s graceful event (8 BBU + LIC bank + thermal)")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    ax = axes[1]
    ax.plot(t, v_cell, "b-", lw=1.5, label="V_cell (LFP, representative)")
    ax.set_ylabel("LFP cell V [V]")
    ax.legend(loc="lower left", fontsize=9)
    ax.grid(alpha=0.3)

    ax = axes[2]
    ax.plot(t, v_lic, "r-", lw=1.5, label="V_LIC bank")
    ax.axhline(LIC_V_MIN_UVLO_V, color="red", ls="--", lw=1, label=f"UVLO {LIC_V_MIN_UVLO_V} V")
    ax.set_ylabel("LIC V [V]")
    ax.legend(loc="lower left", fontsize=9)
    ax.grid(alpha=0.3)

    ax = axes[3]
    ax.plot(t, T_cell, "tab:orange", lw=2, label="T_cell (lumped thermal)")
    ax.axhline(T_THERMAL_LIMIT_C, color="red", ls="--", lw=1,
               label=f"Warning {T_THERMAL_LIMIT_C} °C (whitepaper §6.1)")
    ax.axhline(T_AMBIENT_C, color="gray", ls=":", lw=1, label=f"Ambient {T_AMBIENT_C} °C")
    ax.set_xlabel("time [s]")
    ax.set_ylabel("T_cell [°C]")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    print(f"[plot] {out_png}")


def main() -> int:
    print(f"[V3] building 60s graceful profile ...")
    t, p_kw = _build_mains_fail_profile(DURATION_S, DT)
    p_lfp, p_lic = _split_with_lic(
        p_kw, DT, tau_s=SPLIT_FILTER_TAU_S, lfp_init_kw=RACK_CONTINUOUS_KW
    )

    print(f"[V3] PyBaMM DFN on representative LFP cell (1/8 symmetric) ...")
    t0 = time.time()
    sim = _simulate_lfp_cell_pybamm(p_lfp, t)
    print(f"[V3] PyBaMM done in {time.time()-t0:.2f}s")

    print(f"[V3] LIC RC bank dynamics ...")
    lic = _simulate_lic_rc(p_lic, t)

    print(f"[V3] thermal model integration ...")
    T_cell = _simulate_thermal(
        np.asarray(sim["I_cell"]), t,
        r_int=R_INT_CELL_OHM, c_th=C_TH_CELL_J_PER_K,
        h_a=H_TIMES_A_W_PER_K, t_amb_c=T_AMBIENT_C,
    )

    # Per-BBU 工作點(symmetric 8-BBU 假設)
    p_peak_per_bbu = float(p_kw.max()) / N_BBU_PER_RACK
    p_cont_per_bbu = RACK_CONTINUOUS_KW / N_BBU_PER_RACK
    peak_c_rate = p_peak_per_bbu / LFP_PACK_KWH
    cont_c_rate = p_cont_per_bbu / LFP_PACK_KWH

    # Energy
    energy_delivered_kj = float(np.trapezoid(p_kw, t)) if hasattr(np, "trapezoid") else float(np.trapz(p_kw, t))
    energy_capacity_kj = LFP_PACK_KWH * N_BBU_PER_RACK * 3600.0
    dod_pct = 100.0 * energy_delivered_kj / energy_capacity_kj

    n_dec = 800
    v_cell = np.asarray(sim["V_cell"])
    i_cell = np.asarray(sim["I_cell"])

    payload = {
        "validation_chain": "V3",
        "version": "v0.1",
        "title": "Rack-level 60-second graceful event with thermal model",
        "description": (
            f"V3 整 rack 60s graceful 整合 sim,8 BBU 並聯(symmetric assumption)+ "
            f"LIC bank 2×Eaton XLR-48-166 並聯 + 一階互補濾波器 τ={SPLIT_FILTER_TAU_S}s + "
            f"GPU power-cap 3-stage ramp(peak hold {PEAK_HOLD_S}s / linear ramp "
            f"{RAMP_S}s / continuous {DURATION_S-PEAK_HOLD_S-RAMP_S:.1f}s)+ lumped "
            f"cell thermal model。Per-BBU peak {peak_c_rate:.1f}C pulse < 2s,"
            f"continuous {cont_c_rate:.2f}C,皆在車規 LFP datasheet 允許區內。"
        ),
        "topology": {
            "n_bbu_per_rack": N_BBU_PER_RACK,
            "lfp_per_bbu_kwh": LFP_PACK_KWH,
            "rack_capacity_kwh": LFP_PACK_KWH * N_BBU_PER_RACK,
            "lic_bank_modules": 2,
            "lic_bank_topology": "parallel (Eaton XLR-48-166 × 2)",
            "control_law": f"first-order complementary filter τ={SPLIT_FILTER_TAU_S}s @ 1 kHz",
            "symmetric_assumption": "All 8 BBUs see identical scaled current; one PyBaMM cell represents all 8 in symmetric load-sharing case. N-1 asymmetric case is V4.",
        },
        "thermal_model": {
            "c_th_cell_j_per_k": C_TH_CELL_J_PER_K,
            "r_int_cell_ohm": R_INT_CELL_OHM,
            "h_times_a_w_per_k": H_TIMES_A_W_PER_K,
            "t_ambient_c": T_AMBIENT_C,
            "t_warning_c": T_THERMAL_LIMIT_C,
            "t_max_simulated_c": float(T_cell.max()),
            "t_rise_above_ambient_c": float(T_cell.max() - T_AMBIENT_C),
            "passes_thermal_limit": bool(T_cell.max() < T_THERMAL_LIMIT_C),
        },
        "stages": {
            "peak_hold_s": PEAK_HOLD_S,
            "ramp_s": RAMP_S,
            "continuous_s": DURATION_S - PEAK_HOLD_S - RAMP_S,
            "ramp_shape": "linear",
            "peak_kw": RACK_PEAK_KW,
            "continuous_kw": RACK_CONTINUOUS_KW,
        },
        "duration_s": DURATION_S,
        "dt": DT,
        "series": {
            "t": _decimate(t, n_dec).tolist(),
            "p_total_kw": _decimate(p_kw, n_dec).tolist(),
            "p_lfp_kw": _decimate(p_lfp, n_dec).tolist(),
            "p_lic_kw": _decimate(p_lic, n_dec).tolist(),
            "v_cell": _decimate(v_cell, n_dec).tolist(),
            "v_pack": _decimate(v_cell * 15, n_dec).tolist(),
            "i_cell": _decimate(i_cell, n_dec).tolist(),
            "v_lic": _decimate(lic["v_lic"], n_dec).tolist(),
            "i_lic_a": _decimate(lic["i_lic_a"], n_dec).tolist(),
            "t_cell_c": _decimate(T_cell, n_dec).tolist(),
        },
        "stats": {
            "v_cell_min": float(v_cell.min()),
            "v_cell_max": float(v_cell.max()),
            "v_cell_swing_v": float(v_cell.max() - v_cell.min()),
            "v_lic_min": lic["v_min"],
            "v_lic_droop_v": lic["v_droop_v"],
            "v_lic_headroom_to_uvlo_v": lic["headroom_to_uvlo_v"],
            "energy_delivered_kj": energy_delivered_kj,
            "energy_capacity_kj": energy_capacity_kj,
            "dod_pct": dod_pct,
            "energy_headroom_ratio": energy_capacity_kj / max(energy_delivered_kj, 1e-6),
            "p_peak_per_bbu_kw": p_peak_per_bbu,
            "p_continuous_per_bbu_kw": p_cont_per_bbu,
            "peak_c_rate_per_bbu": peak_c_rate,
            "continuous_c_rate_per_bbu": cont_c_rate,
            "t_cell_max_c": float(T_cell.max()),
            "t_cell_rise_c": float(T_cell.max() - T_AMBIENT_C),
        },
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/generate_full_rack_60s_sim.py",
            "v2_validation_chain": "V3",
        },
    }

    for d in OUT_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        out_path = d / "rack_60s_graceful.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print(f"[V3] -> {out_path}")

    _maybe_plot(t, p_kw, p_lfp, p_lic, v_cell, lic["v_lic"], T_cell, OUT_PNG)

    print("\n=== V3 Rack-level 60s graceful event ===")
    print(f"  energy delivered:   {energy_delivered_kj:.1f} kJ "
          f"= {dod_pct:.2f}% of rack capacity")
    print(f"  per-BBU peak:       {peak_c_rate:.1f} C × {PEAK_HOLD_S}s pulse")
    print(f"  per-BBU continuous: {cont_c_rate:.2f} C × "
          f"{DURATION_S-PEAK_HOLD_S-RAMP_S:.0f}s")
    print(f"  V_cell swing:       {payload['stats']['v_cell_swing_v']*1000:.0f} mV")
    print(f"  V_LIC droop:        {lic['v_droop_v']:.3f} V "
          f"(headroom {lic['headroom_to_uvlo_v']:.2f} V to UVLO)")
    print(f"  T_cell max:         {T_cell.max():.2f} °C "
          f"(rise {T_cell.max()-T_AMBIENT_C:.2f}K vs ambient "
          f"{T_AMBIENT_C}°C, limit {T_THERMAL_LIMIT_C}°C -> "
          f"{'PASS' if T_cell.max() < T_THERMAL_LIMIT_C else 'FAIL'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
