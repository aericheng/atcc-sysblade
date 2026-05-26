"""V4 — N-1 BBU failure redundancy sim.

對齊 `docs/BBU_IMPLEMENTATION_PLAN.md` v2.0 § 摘要 V4。在 V3 整 rack 60s graceful
sim 的基礎上,加入 fault injection:**t=15 s 強制 1 台 BBU offline,剩 7 台
承擔原本由 8 台分擔的 load,看是否仍能撐到 60s graceful 完成**。

這是 twin 比 hardware 強的點:**N-1 failure 在學生實驗室實機物理上幾乎不可能驗,
sim 層 trivial**(只要動 N_BBU 與 fault injection 時刻)。

Pipeline:
1. 重用 V3 的 60s graceful profile + LIC bank dynamics
2. 在 t=15s 切換 N_BBU 8 → 7,LFP 每台 BBU 承擔的 power 從 30/8=3.75 kW → 30/7=4.29 kW
3. 同步 per-cell C-rate 1.5 → 1.71 C(仍在車規 LFP 1-3C 連續允許區內)
4. 跑 PyBaMM DFN(新的 i_cell 軌跡)+ 熱模型(更高 I²R heating)
5. Pass criteria:
   - per-BBU continuous C-rate ≤ 2.5C(車規 LFP datasheet 連續安全上限)
   - V_cell swing ≤ 500 mV(2× V3 的 budget)
   - T_cell max ≤ 50°C(同 V3)
   - LIC headroom to UVLO > 0(LIC bank 不變,headroom 應仍正)

Output: `apps/web/public/scenarios/rack_n_minus_1.json` + comparison PNG

Usage:
    .venv/Scripts/python scripts/generate_n_minus_1_sim.py
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
OUT_DIRS = [
    REPO / "packages" / "shared" / "scenarios",
    REPO / "apps" / "web" / "public" / "scenarios",
]
OUT_PNG = REPO / "data" / "processed" / "rack_n_minus_1.png"

# Constants — 對齊 V3
RACK_PEAK_KW = 120.0
RACK_CONTINUOUS_KW = 30.0
N_BBU_NORMAL = 8
N_BBU_DEGRADED = 7  # after fault
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

FAULT_INJECT_T_S = 15.0  # t=15s 強制 1 台 BBU offline

# Thermal — 對齊 V3
C_TH_CELL_J_PER_K = 70.0
R_INT_CELL_OHM = 0.008
H_TIMES_A_W_PER_K = 0.10
T_AMBIENT_C = 25.0
T_THERMAL_LIMIT_C = 50.0

# Pass criteria(V4)
CONTINUOUS_C_RATE_LIMIT = 2.5    # 車規 LFP datasheet 連續安全上限
V_CELL_SWING_LIMIT_V = 0.500     # 2× V3 budget(allow degraded mode swing)


def _build_mains_fail_profile(duration_s: float, dt: float) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(0, duration_s + dt, dt)
    p_kw = np.full_like(t, RACK_CONTINUOUS_KW)
    p_kw[t < PEAK_HOLD_S] = RACK_PEAK_KW
    stage_b = (t >= PEAK_HOLD_S) & (t < PEAK_HOLD_S + RAMP_S)
    if stage_b.any():
        s = (t[stage_b] - PEAK_HOLD_S) / RAMP_S
        p_kw[stage_b] = RACK_PEAK_KW + s * (RACK_CONTINUOUS_KW - RACK_PEAK_KW)
    return t, p_kw


def _split_with_lic(p_total, dt, tau_s, lfp_init):
    alpha = dt / (tau_s + dt)
    p_lfp = np.zeros_like(p_total)
    p_lfp[0] = lfp_init
    for i in range(1, len(p_total)):
        p_lfp[i] = (1 - alpha) * p_lfp[i - 1] + alpha * p_total[i]
    return p_lfp, p_total - p_lfp


def _simulate_lic_rc(p_lic_kw, t):
    i_a = p_lic_kw * 1000.0 / LIC_V_NOMINAL_V
    dt_arr = np.diff(t)
    seg = 0.5 * (i_a[:-1] + i_a[1:])
    q_c = np.concatenate(([0.0], np.cumsum(seg * dt_arr)))
    v_lic = LIC_V_NOMINAL_V - q_c / LIC_BANK_C_F - i_a * LIC_BANK_ESR_OHM
    return {"v_lic": v_lic, "i_lic_a": i_a, "v_min": float(v_lic.min()),
            "v_droop_v": float(LIC_V_NOMINAL_V - v_lic.min()),
            "headroom_to_uvlo_v": float(v_lic.min() - LIC_V_MIN_UVLO_V)}


def _simulate_lfp_cell_pybamm_dynamic_split(
    p_lfp_kw: np.ndarray, t: np.ndarray,
    n_bbu_normal: int, n_bbu_degraded: int, fault_t_s: float
) -> dict:
    """LFP cell PyBaMM with **time-varying BBU count**.

    Before fault: rack LFP power split across `n_bbu_normal` BBUs.
    After fault: same total rack power split across `n_bbu_degraded` BBUs
    → each surviving BBU sees higher current.
    """
    import pybamm

    n_bbu_arr = np.where(t < fault_t_s, n_bbu_normal, n_bbu_degraded)
    p_per_bbu_w = p_lfp_kw * 1000.0 / n_bbu_arr
    i_cell_pack = p_per_bbu_w / LFP_PACK_NOMINAL_V

    model = pybamm.lithium_ion.DFN()
    params = pybamm.ParameterValues("Prada2013")
    cap_ah = float(params["Nominal cell capacity [A.h]"])

    # Scale: at peak (which happens during n=8 phase), aim for 6C per cell
    i_peak_per_bbu_normal = (
        RACK_PEAK_KW * 1000.0 / n_bbu_normal / LFP_PACK_NOMINAL_V
    )
    target_peak_c = 6.0
    scale = (target_peak_c * cap_ah) / i_peak_per_bbu_normal
    i_sim = i_cell_pack * scale

    params["Current function [A]"] = pybamm.Interpolant(
        t, i_sim, pybamm.t, name="profile", interpolator="linear"
    )
    sim = pybamm.Simulation(model, parameter_values=params)
    sol = sim.solve(t_eval=t)
    t_sol = np.asarray(sol["Time [s]"].entries)
    v_sol = np.asarray(sol["Voltage [V]"].entries)
    i_sol = np.asarray(sol["Current [A]"].entries)
    return {
        "t": t,
        "V_cell": np.interp(t, t_sol, v_sol),
        "I_cell": np.interp(t, t_sol, i_sol),
        "n_bbu_active": n_bbu_arr,
    }


def _simulate_thermal(i_cell, t, r_int, c_th, h_a, t_amb):
    T = np.zeros(len(t))
    T[0] = t_amb
    for i in range(1, len(t)):
        dt = t[i] - t[i - 1]
        p_heat = i_cell[i] ** 2 * r_int
        p_cool = h_a * (T[i - 1] - t_amb)
        T[i] = T[i - 1] + (p_heat - p_cool) * dt / c_th
    return T


def _decimate(arr, n):
    if len(arr) <= n:
        return arr
    return arr[np.linspace(0, len(arr) - 1, n, dtype=int)]


def _maybe_plot(t, p_kw, p_lfp, p_lic, v_cell, v_lic, T_cell,
                n_bbu_active, fault_t, out_png):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as exc:
        print(f"[skip-plot] {exc}")
        return

    fig, axes = plt.subplots(4, 1, figsize=(11, 11), sharex=True)
    fault_marker = lambda ax: ax.axvline(
        fault_t, color="red", ls="--", lw=1.5, alpha=0.6,
        label=f"Fault injection t={fault_t:.0f}s (BBU 8 -> 7)"
    )

    ax = axes[0]
    ax.plot(t, p_kw, "k-", lw=2, label="rack power [kW]")
    ax.plot(t, p_lfp, "b-", lw=1.5, label="P_LFP (low-freq)")
    ax.plot(t, p_lic, "r-", lw=1.5, label="P_LIC (high-freq)")
    fault_marker(ax)
    ax.set_ylabel("Power [kW]")
    ax.set_title("V4 — N-1 fault injection (BBU 8 -> 7 at t=15s)")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    ax = axes[1]
    p_per_bbu = p_lfp / n_bbu_active
    ax.plot(t, p_per_bbu, "g-", lw=1.5, label="P_LFP per BBU")
    fault_marker(ax)
    ax.set_ylabel("kW per BBU")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    ax = axes[2]
    ax.plot(t, v_cell, "b-", lw=1.5, label="V_cell")
    ax.plot(t, v_lic / 15, "r:", lw=1.2, label="V_lic / 15 (for scale comparison)")
    fault_marker(ax)
    ax.set_ylabel("V [V]")
    ax.legend(loc="lower left", fontsize=9)
    ax.grid(alpha=0.3)

    ax = axes[3]
    ax.plot(t, T_cell, "tab:orange", lw=2, label="T_cell")
    ax.axhline(T_THERMAL_LIMIT_C, color="red", ls="--", lw=1,
               label=f"Limit {T_THERMAL_LIMIT_C}°C")
    fault_marker(ax)
    ax.set_xlabel("time [s]")
    ax.set_ylabel("T_cell [°C]")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    print(f"[plot] {out_png}")


def main() -> int:
    print(f"[V4] building 60s graceful profile + N-1 fault at t={FAULT_INJECT_T_S}s ...")
    t, p_kw = _build_mains_fail_profile(DURATION_S, DT)
    p_lfp, p_lic = _split_with_lic(
        p_kw, DT, tau_s=SPLIT_FILTER_TAU_S, lfp_init=RACK_CONTINUOUS_KW
    )

    print(f"[V4] PyBaMM DFN with dynamic 8 -> 7 BBU split ...")
    t0 = time.time()
    sim = _simulate_lfp_cell_pybamm_dynamic_split(
        p_lfp, t, N_BBU_NORMAL, N_BBU_DEGRADED, FAULT_INJECT_T_S
    )
    print(f"[V4] PyBaMM done in {time.time()-t0:.2f}s")

    lic = _simulate_lic_rc(p_lic, t)
    T_cell = _simulate_thermal(
        np.asarray(sim["I_cell"]), t,
        r_int=R_INT_CELL_OHM, c_th=C_TH_CELL_J_PER_K,
        h_a=H_TIMES_A_W_PER_K, t_amb=T_AMBIENT_C,
    )

    # Per-BBU stats — pre vs post fault
    n_bbu_active = sim["n_bbu_active"]
    pre_fault = t < FAULT_INJECT_T_S
    post_fault = ~pre_fault

    p_per_bbu = p_lfp / n_bbu_active
    p_per_bbu_max_pre = float(np.max(p_per_bbu[pre_fault]))
    p_per_bbu_max_post = float(np.max(p_per_bbu[post_fault]))
    p_per_bbu_steady_post = float(p_per_bbu[-1])

    c_rate_continuous_post = p_per_bbu_steady_post / LFP_PACK_KWH

    v_cell = np.asarray(sim["V_cell"])
    v_swing = float(v_cell.max() - v_cell.min())

    # PASS criteria — cast to Python bool so JSON serializes cleanly
    pass_c_rate = bool(c_rate_continuous_post <= CONTINUOUS_C_RATE_LIMIT)
    pass_v_swing = bool(v_swing <= V_CELL_SWING_LIMIT_V)
    pass_thermal = bool(T_cell.max() < T_THERMAL_LIMIT_C)
    pass_lic = bool(lic["headroom_to_uvlo_v"] > 0)
    overall_pass = bool(pass_c_rate and pass_v_swing and pass_thermal and pass_lic)

    n_dec = 800
    payload = {
        "validation_chain": "V4",
        "version": "v0.1",
        "title": "Rack N-1 BBU failure redundancy (8 -> 7 BBU at t=15s)",
        "description": (
            f"V4 fault-injection sim:60 s graceful event 中 t={FAULT_INJECT_T_S}s "
            f"強制 1 台 BBU offline,剩 7 台承擔原本 8 台 share 的 load。"
            f"Fault 後 per-BBU 連續 C-rate 從 1.50C 升至 {c_rate_continuous_post:.2f}C "
            f"(車規 LFP datasheet 連續安全上限 {CONTINUOUS_C_RATE_LIMIT}C → "
            f"{'PASS' if pass_c_rate else 'FAIL'})。本場景在實機學生階段物理上幾乎不可能 "
            "驗證,但 twin 層只需動 n_bbu_arr 即可,正是 twin > hardware 的賣點。"
        ),
        "fault_injection": {
            "fault_time_s": FAULT_INJECT_T_S,
            "n_bbu_normal": N_BBU_NORMAL,
            "n_bbu_degraded": N_BBU_DEGRADED,
            "fault_mode": "one BBU offline; surviving BBUs share rack load",
        },
        "topology": {
            "lfp_per_bbu_kwh": LFP_PACK_KWH,
            "lic_bank_modules": 2,
            "control_law": f"first-order complementary filter τ={SPLIT_FILTER_TAU_S}s",
        },
        "stages": {
            "peak_hold_s": PEAK_HOLD_S,
            "ramp_s": RAMP_S,
            "continuous_s": DURATION_S - PEAK_HOLD_S - RAMP_S,
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
            "p_lfp_per_bbu_kw": _decimate(p_per_bbu, n_dec).tolist(),
            "n_bbu_active": [int(x) for x in _decimate(n_bbu_active, n_dec).tolist()],
            "v_cell": _decimate(v_cell, n_dec).tolist(),
            "v_pack": _decimate(v_cell * 15, n_dec).tolist(),
            "i_cell": _decimate(np.asarray(sim["I_cell"]), n_dec).tolist(),
            "v_lic": _decimate(lic["v_lic"], n_dec).tolist(),
            "i_lic_a": _decimate(lic["i_lic_a"], n_dec).tolist(),
            "t_cell_c": _decimate(T_cell, n_dec).tolist(),
        },
        "stats": {
            "p_per_bbu_max_pre_fault_kw": p_per_bbu_max_pre,
            "p_per_bbu_max_post_fault_kw": p_per_bbu_max_post,
            "p_per_bbu_steady_post_fault_kw": p_per_bbu_steady_post,
            "c_rate_continuous_post_fault": c_rate_continuous_post,
            "c_rate_post_increase_pct": float(
                100.0 * (c_rate_continuous_post / 1.50 - 1.0)
            ),
            "v_cell_swing_v": v_swing,
            "v_cell_min": float(v_cell.min()),
            "v_lic_droop_v": lic["v_droop_v"],
            "v_lic_headroom_to_uvlo_v": lic["headroom_to_uvlo_v"],
            "t_cell_max_c": float(T_cell.max()),
            "t_cell_rise_c": float(T_cell.max() - T_AMBIENT_C),
        },
        "pass_criteria": {
            "c_rate_continuous_post_limit": CONTINUOUS_C_RATE_LIMIT,
            "v_cell_swing_limit_v": V_CELL_SWING_LIMIT_V,
            "t_cell_limit_c": T_THERMAL_LIMIT_C,
            "lic_headroom_v_min": 0.0,
            "pass_c_rate": pass_c_rate,
            "pass_v_swing": pass_v_swing,
            "pass_thermal": pass_thermal,
            "pass_lic_headroom": pass_lic,
            "overall_pass": overall_pass,
        },
        "headline_verdict": (
            f"V4 {'PASS' if overall_pass else 'FAIL'} — N-1 failure 後 per-BBU 持續 "
            f"{c_rate_continuous_post:.2f}C 在 {CONTINUOUS_C_RATE_LIMIT}C 連續上限內,"
            f"V_cell swing {v_swing*1000:.0f} mV < {V_CELL_SWING_LIMIT_V*1000:.0f} mV,"
            f"T_cell max {T_cell.max():.1f}°C < {T_THERMAL_LIMIT_C}°C,"
            f"LIC headroom {lic['headroom_to_uvlo_v']:.2f}V > 0"
        ),
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/generate_n_minus_1_sim.py",
            "v2_validation_chain": "V4",
        },
    }

    for d in OUT_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        out_path = d / "rack_n_minus_1.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        print(f"[V4] -> {out_path}")

    _maybe_plot(t, p_kw, p_lfp, p_lic, v_cell, lic["v_lic"], T_cell,
                n_bbu_active, FAULT_INJECT_T_S, OUT_PNG)

    print("\n=== V4 N-1 BBU failure redundancy ===")
    print(f"  fault injection at t={FAULT_INJECT_T_S}s (BBU 8 -> 7)")
    print(f"  per-BBU continuous (post-fault): {c_rate_continuous_post:.2f} C "
          f"(limit {CONTINUOUS_C_RATE_LIMIT}C -> "
          f"{'PASS' if pass_c_rate else 'FAIL'})")
    print(f"  V_cell swing:    {v_swing*1000:.0f} mV (limit "
          f"{V_CELL_SWING_LIMIT_V*1000:.0f} mV -> {'PASS' if pass_v_swing else 'FAIL'})")
    print(f"  T_cell max:      {T_cell.max():.2f} °C (limit {T_THERMAL_LIMIT_C}°C -> "
          f"{'PASS' if pass_thermal else 'FAIL'})")
    print(f"  LIC headroom:    {lic['headroom_to_uvlo_v']:.2f} V to UVLO "
          f"(must > 0 -> {'PASS' if pass_lic else 'FAIL'})")
    print(f"  OVERALL: {'PASS' if overall_pass else 'FAIL'}")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
