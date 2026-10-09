"""A2-3 — 最壞情境：N−1 在峰值時刻、120 kW 滿載 60 s、peak-hold 敏感度。

不修改原腳本：直接 import scripts/generate_full_rack_60s_sim.py（V3）與
scripts/generate_n_minus_1_sim.py（V4）的函式（DFN、互補濾波、LIC RC、熱模型），
只換輸入的功率曲線與故障時刻。先以原參數重跑 V3/V4，與 committed JSON 比對漂移。

情境：
  repro_v3                 原 V3（peak-hold 0.5 s → 1.5 s 線性降到 30 kW），8 台
  repro_v4                 原 V4（t = 15 s 掉一台）
  a_n1_at_peak             t = 0.25 s（峰值保持中）掉一台，LIC 正常
  a2_n1_at_peak_no_lic     同上，但 LIC 不可用（LFP 承擔全部功率）— 上界
  b_full_load_60s          不降載：120 kW 持續 60 s，8 台，LIC 正常
  b2_full_load_60s_n1      120 kW 60 s 且 t = 0.25 s 掉一台
  c_peak_hold_{1.0,1.5,2.0} peak-hold 敏感度（0.5 s 即 repro_v3）

Usage:
    .venv/Scripts/python scripts/audit/a2_worst_case.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from a2_common import OUT_DIR, SCEN_DIR, fit_prada_thevenin, meta, setup_cjk, write_json  # noqa: E402

import generate_full_rack_60s_sim as V3  # noqa: E402
import generate_n_minus_1_sim as V4  # noqa: E402

SCRIPT = "scripts/audit/a2_worst_case.py"
CELL_CAP_AH = 2.3
V_BMS_CUT = 2.5      # docs/BBU_IMPLEMENTATION_PLAN.md:926 「BMS hard-cut @ 2.5 V/cell」
V_PRADA_CUT = 2.0    # Prada2013 "Lower voltage cut-off [V]"
C_DESIGN = 6.0       # TARGET_PEAK_C_RATE, generate_twin_scenarios.py:72


def profile(peak_hold_s: float, ramp_s: float, cont_kw: float, peak_kw: float = 120.0,
            duration_s: float = 60.0, dt: float = 0.02):
    t = np.arange(0, duration_s + dt, dt)
    p = np.full_like(t, cont_kw)
    p[t < peak_hold_s] = peak_kw
    mb = (t >= peak_hold_s) & (t < peak_hold_s + ramp_s)
    if mb.any():
        s = (t[mb] - peak_hold_s) / ramp_s
        p[mb] = peak_kw + s * (cont_kw - peak_kw)
    return t, p


def run(name: str, t, p_kw, fault_t: float | None, lic: bool, r_alt: float) -> dict:
    dt = t[1] - t[0]
    if lic:
        p_lfp, p_lic = V3._split_with_lic(p_kw, dt, tau_s=V3.SPLIT_FILTER_TAU_S, lfp_init_kw=V3.RACK_CONTINUOUS_KW)
    else:
        p_lfp, p_lic = p_kw.copy(), np.zeros_like(p_kw)
    tic = time.time()
    if fault_t is None:
        sim = V3._simulate_lfp_cell_pybamm(p_lfp, t)
        n_act = np.full_like(t, V3.N_BBU_PER_RACK)
    else:
        sim = V4._simulate_lfp_cell_pybamm_dynamic_split(p_lfp, t, V4.N_BBU_NORMAL, V4.N_BBU_DEGRADED, fault_t)
        n_act = np.asarray(sim["n_bbu_active"], dtype=float)
    t_dfn = time.time() - tic
    v = np.asarray(sim["V_cell"])
    i = np.asarray(sim["I_cell"])
    T = V3._simulate_thermal(i, t, r_int=V3.R_INT_CELL_OHM, c_th=V3.C_TH_CELL_J_PER_K,
                             h_a=V3.H_TIMES_A_W_PER_K, t_amb_c=V3.T_AMBIENT_C)
    T_alt = V3._simulate_thermal(i, t, r_int=r_alt, c_th=V3.C_TH_CELL_J_PER_K,
                                 h_a=V3.H_TIMES_A_W_PER_K, t_amb_c=V3.T_AMBIENT_C)
    lic_rc = V3._simulate_lic_rc(p_lic, t)
    trap = np.trapezoid if hasattr(np, "trapezoid") else np.trapz
    p_dem_bbu = p_kw / n_act
    p_lfp_bbu = p_lfp / n_act
    c_lfp = p_lfp_bbu / V3.LFP_PACK_KWH
    e_rack_kj = float(trap(p_kw, t))
    return {
        "name": name,
        "fault_t_s": fault_t, "lic_available": lic,
        "p_demand_per_bbu_peak_kw": float(p_dem_bbu.max()),
        "c_rate_demand_per_bbu_peak": float(p_dem_bbu.max() / V3.LFP_PACK_KWH),
        "p_lfp_per_bbu_peak_kw": float(p_lfp_bbu.max()),
        "c_rate_lfp_per_bbu_peak": float(c_lfp.max()),
        "c_rate_dfn_cell_peak": float(np.abs(i).max() / CELL_CAP_AH),
        "time_lfp_above_6c_s": float(np.sum(c_lfp > C_DESIGN + 1e-9) * dt),
        "time_lfp_ge_6p8c_s": float(np.sum(c_lfp >= 6.8) * dt),
        "time_lfp_at_peak_c_s": float(np.sum(c_lfp >= c_lfp.max() * (1 - 1e-6)) * dt),
        "time_lfp_ge_5p9c_s": float(np.sum(c_lfp >= 5.9) * dt),
        "time_count_note": "樣本數 × dt（dt = 0.02 s），含端點樣本，故 0.25 s 區間計為 0.26 s",
        "exceeds_6c_design_point_lfp": bool(c_lfp.max() > C_DESIGN + 1e-9),
        "exceeds_6c_design_point_demand": bool(p_dem_bbu.max() / V3.LFP_PACK_KWH > C_DESIGN + 1e-9),
        "energy_rack_kj": e_rack_kj,
        "dod_rack_pct_repo_definition": 100.0 * e_rack_kj / (V3.LFP_PACK_KWH * V3.N_BBU_PER_RACK * 3600.0),
        "dod_per_surviving_bbu_lfp_pct": 100.0 * float(trap(p_lfp_bbu, t)) / (V3.LFP_PACK_KWH * 3600.0),
        "dod_dfn_cell_pct": 100.0 * float(trap(i, t)) / (CELL_CAP_AH * 3600.0),
        "v_cell_min_v": float(v.min()), "v_cell_max_v": float(v.max()),
        "v_cell_margin_to_bms_2v5_v": float(v.min() - V_BMS_CUT),
        "v_cell_end_v": float(v[-1]),
        "t_cell_max_c": float(T.max()), "t_cell_rise_c": float(T.max() - V3.T_AMBIENT_C),
        "t_cell_rise_c_with_dfn_resistance": float(T_alt.max() - V3.T_AMBIENT_C),
        "lic_bank_i_peak_a": float(np.abs(lic_rc["i_lic_a"]).max()),
        "lic_v_min_v_repo_rc": lic_rc["v_min"], "lic_v_max_v_repo_rc": float(np.max(lic_rc["v_lic"])),
        "lic_energy_out_kj": float(trap(np.clip(p_lic, 0, None), t)),
        "_dfn_runtime_s": round(t_dfn, 1),
        "_series": {"t": t, "c_lfp": c_lfp, "v": v, "T": T},
    }


def main() -> int:
    fit6 = fit_prada_thevenin(6.0)
    r_alt = fit6["r0_ohm"] + fit6["r1_ohm"]
    PH, RAMP, CONT = V3.PEAK_HOLD_S, V3.RAMP_S, V3.RACK_CONTINUOUS_KW
    specs = [
        ("repro_v3", (PH, RAMP, CONT), None, True),
        ("repro_v4", (PH, RAMP, CONT), V4.FAULT_INJECT_T_S, True),
        ("a_n1_at_peak", (PH, RAMP, CONT), 0.25, True),
        ("a2_n1_at_peak_no_lic", (PH, RAMP, CONT), 0.25, False),
        ("b_full_load_60s", (60.0, RAMP, 120.0), None, True),
        ("b2_full_load_60s_n1", (60.0, RAMP, 120.0), 0.25, True),
        ("c_peak_hold_1.0", (1.0, RAMP, CONT), None, True),
        ("c_peak_hold_1.5", (1.5, RAMP, CONT), None, True),
        ("c_peak_hold_2.0", (2.0, RAMP, CONT), None, True),
    ]
    rows = []
    for name, (ph, rp, cont), ft, lic in specs:
        t, p = profile(ph, rp, cont, duration_s=V3.DURATION_S, dt=V3.DT)
        r = run(name, t, p, ft, lic, r_alt)
        r["profile"] = {"peak_hold_s": ph, "ramp_s": rp, "continuous_kw": cont}
        print(f"[a2-3] {name} (DFN {r.pop('_dfn_runtime_s')} s): LFP peak {r['c_rate_lfp_per_bbu_peak']:.2f}C demand {r['c_rate_demand_per_bbu_peak']:.2f}C "
              f"DoD {r['dod_rack_pct_repo_definition']:.2f}% Vmin {r['v_cell_min_v']:.3f} dT {r['t_cell_rise_c']:.2f}/{r['t_cell_rise_c_with_dfn_resistance']:.2f}")
        rows.append(r)

    # Reproduction check vs committed JSON (PyBaMM 26.4.1 era files)
    com_v3 = json.load(open(SCEN_DIR / "rack_60s_graceful.json", encoding="utf-8"))["stats"]
    com_v4 = json.load(open(SCEN_DIR / "rack_n_minus_1.json", encoding="utf-8"))["stats"]
    r3, r4 = rows[0], rows[1]
    repro = {
        "v3": {
            "dod_pct": {"committed": com_v3["dod_pct"], "rerun": r3["dod_rack_pct_repo_definition"]},
            "v_cell_min": {"committed": com_v3["v_cell_min"], "rerun": r3["v_cell_min_v"]},
            "v_cell_max": {"committed": com_v3["v_cell_max"], "rerun": r3["v_cell_max_v"]},
            "t_cell_max_c": {"committed": com_v3["t_cell_max_c"], "rerun": r3["t_cell_max_c"]},
            "v_lic_min": {"committed": com_v3["v_lic_min"], "rerun": r3["lic_v_min_v_repo_rc"]},
        },
        "v4": {
            "v_cell_min": {"committed": com_v4["v_cell_min"], "rerun": r4["v_cell_min_v"]},
            "t_cell_max_c": {"committed": com_v4["t_cell_max_c"], "rerun": r4["t_cell_max_c"]},
        },
        "note": "dod_pct 為能量算術（不經 PyBaMM），應完全一致；v_cell / T 經 DFN，差值為 PyBaMM 版本漂移",
    }
    for blk in ("v3", "v4"):
        for k, d in repro[blk].items():
            d["diff"] = d["rerun"] - d["committed"]

    series = {r["name"]: r.pop("_series") for r in rows}
    payload = {
        "_meta": meta(SCRIPT, {
            "dt_s": V3.DT, "duration_s": V3.DURATION_S, "split_tau_s": V3.SPLIT_FILTER_TAU_S,
            "lfp_init_kw": V3.RACK_CONTINUOUS_KW, "n_bbu": V3.N_BBU_PER_RACK, "pack_kwh": V3.LFP_PACK_KWH,
            "thermal": {"c_th_j_per_k": V3.C_TH_CELL_J_PER_K, "r_int_ohm": V3.R_INT_CELL_OHM,
                        "h_a_w_per_k": V3.H_TIMES_A_W_PER_K, "t_amb_c": V3.T_AMBIENT_C},
            "r_int_alt_ohm_dfn_fit_6c": r_alt, "v_bms_cut_v": V_BMS_CUT, "v_prada_cut_v": V_PRADA_CUT,
        }, [
            "沿用 repo 的 cell 映射：120 kW/8 台 = 15 kW/台 ↔ Prada 2.3 Ah cell 6C；C-rate = 每台 kW / 2.5 kWh",
            "沿用 repo 熱模型：單 cell 集總、C_th 70 J/K、R 8 mΩ、h·A 0.1 W/K；不含 LIC、DC-DC、pack 熱耦合",
            "另以 DFN 6C 脈衝擬合的 R0+R1 作熱敏感度（t_cell_rise_c_with_dfn_resistance）",
            "LFP 初始狀態 = Prada2013 預設（近滿電，OCV ≈ 3.6 V），與 repo 一致",
            "LIC 側沿用 repo 的 51.3 V / 332 F / 2.5 mΩ RC（僅供對照，其工作點超 Eaton 規格，見 a2_spec_bounds）",
            "N−1：倖存 7 台平均分攤（對稱假設），不含故障瞬間的電流重分配暫態",
        ], [
            "V_BMS_CUT 出處 docs/BBU_IMPLEMENTATION_PLAN.md:926；6C 設計點出處 generate_twin_scenarios.py:72",
        ]),
        "reproduction_check": repro,
        "scenarios": rows,
        "dcdc_cap_analysis": cap_analysis(),
    }
    write_json("a2_worst_case.json", payload)
    plot(series, rows)
    return 0


def cap_analysis() -> dict:
    """If the DC-DC (LIC path) is power-limited to `cap` kW at the bus, the excess goes to LFP.
    Pure arithmetic on the repo control law (no DFN). Per-BBU C-rate = kW / n / 2.5 kWh."""
    out = {"note": "LIC 功率限幅後的 LFP 峰值 C-rate（8 台；N−1 欄為 t=0.25 s 掉一台後 7 台）；純算術，不經 DFN",
           "caps_kw": [30.0, 40.0, 60.0, 90.0, 120.0], "cases": {}}
    dt = V3.DT
    for name, ph, cont, seed in [("v3_mainsfail_seed30", V3.PEAK_HOLD_S, V3.RACK_CONTINUOUS_KW, 30.0),
                                 ("v3_mainsfail_seed0", V3.PEAK_HOLD_S, V3.RACK_CONTINUOUS_KW, 0.0),
                                 ("full_load_60s_seed30", 60.0, 120.0, 30.0),
                                 ("full_load_60s_seed0", 60.0, 120.0, 0.0)]:
        t, p = profile(ph, V3.RAMP_S, cont, duration_s=V3.DURATION_S, dt=dt)
        p_lfp0, p_lic0 = V3._split_with_lic(p, dt, tau_s=V3.SPLIT_FILTER_TAU_S, lfp_init_kw=seed)
        n7 = np.where(t < 0.25, 8.0, 7.0)
        rows = []
        for cap in out["caps_kw"]:
            lic = np.clip(p_lic0, -cap, cap)
            lfp = p - lic
            rows.append({"cap_kw": cap, "lic_peak_kw": float(np.abs(lic).max()),
                         "lfp_peak_c_8bbu": float((lfp / 8.0).max() / V3.LFP_PACK_KWH),
                         "lfp_peak_c_n1_at_0p25s": float((lfp / n7).max() / V3.LFP_PACK_KWH),
                         "lic_energy_out_kj": float(np.sum(np.clip(lic, 0, None)) * dt)})
        out["cases"][name] = {"lic_peak_uncapped_kw": float(np.abs(p_lic0).max()), "rows": rows}
    return out


def plot(series, rows):
    plt = setup_cjk()
    fig, axes = plt.subplots(3, 1, figsize=(11, 11), sharex=False)
    show = ["repro_v3", "a_n1_at_peak", "a2_n1_at_peak_no_lic", "b_full_load_60s", "b2_full_load_60s_n1", "c_peak_hold_2.0"]
    label = {"repro_v3": "原 V3（重跑）", "a_n1_at_peak": "(a) 峰值 t=0.25 s 掉一台",
             "a2_n1_at_peak_no_lic": "(a') 同上且 LIC 不可用", "b_full_load_60s": "(b) 120 kW 滿載 60 s",
             "b2_full_load_60s_n1": "(b') 滿載 60 s + 掉一台", "c_peak_hold_2.0": "(c) peak-hold 2.0 s"}
    for n in show:
        s = series[n]
        axes[0].plot(s["t"], s["c_lfp"], lw=1.4, label=label[n])
        axes[1].plot(s["t"], s["v"], lw=1.4, label=label[n])
        axes[2].plot(s["t"], s["T"], lw=1.4, label=label[n])
    axes[0].axhline(6.0, color="red", ls="--", lw=1, label="6C 設計點")
    axes[0].set_ylabel("每台 LFP C-rate")
    axes[0].set_xlim(0, 6)
    axes[0].set_xlabel("時間 [s]（本圖只顯示 0–6 s；下兩圖為 0–60 s）")
    axes[0].set_title("A2-3 最壞情境：每台 BBU 的 LFP C-rate（前 6 s 放大）")
    axes[1].axhline(2.5, color="red", ls="--", lw=1, label="BMS 2.5 V 截止")
    axes[1].set_ylabel("代表電芯電壓 [V]（DFN）")
    axes[1].set_title("代表電芯電壓（PyBaMM DFN，Prada2013）")
    axes[1].set_xlabel("時間 [s]")
    axes[2].set_ylabel("電芯溫度 [°C]（repo 集總熱模型）")
    axes[2].set_xlabel("時間 [s]")
    axes[2].set_title("電芯溫度（R=8 mΩ 集總模型；不含 LIC／DC-DC 熱）")
    for ax in axes:
        ax.grid(alpha=0.3)
        ax.legend(fontsize=8, loc="best")
    fig.tight_layout()
    out = OUT_DIR / "a2_worst_case.png"
    fig.savefig(out, dpi=110)
    print(f"[a2-3] -> {out}")


if __name__ == "__main__":
    sys.exit(main())
