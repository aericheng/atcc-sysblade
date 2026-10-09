"""A2-2 — 電容工作點對規格邊界檢查（Eaton XLR-48R6167-R）＋ LIC 版尺寸重估。

Part A：只讀既有 scenario JSON（packages/shared/scenarios/*.json，不重產），算每模組
        電壓峰值、RMS 電流、峰值電流，對照 Eaton 公開規格。
Part B：以 JSR Micro / JM Energy 2012 公開簡報的 ULTIMO 3300F 方形 LIC（R&D 原型、暫定值）
        為單體參數，掃 nS × mP，找滿足 repo 控制律下 LIC 功率曲線、電壓窗 2.2–3.8 V/cell、
        單體 1 s 峰值電流的最小配置，並給中點 SOC 設定與可用能量。
        注意：找不到 Musashi CPQ3300SD 原廠規格書；本檔單體參數「不是」CPQ3300SD 規格。

Usage:
    .venv/Scripts/python scripts/audit/a2_spec_bounds_lic_sizing.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from a2_common import OUT_DIR, SCEN_DIR, SPLIT_TAU_S, lpf, meta, setup_cjk, write_json  # noqa: E402

SCRIPT = "scripts/audit/a2_spec_bounds_lic_sizing.py"
TRAPZ = getattr(np, "trapezoid", None) or np.trapz

EATON_URL = "https://www.eaton.com/us/en-us/skuPage.XLR-48R6167-R.html"
EATON = {
    "max_voltage_v": 48.6, "capacitance_f": 166.0, "esr_dc_ohm": 0.005,
    "continuous_current_a_15c_rise": 86.0, "peak_current_a_1s": 2200.0,
    "source": EATON_URL,
    "verification": ("2026-10-09 以 WebSearch 取得 Eaton 官方 SKU 頁（us/sg/de/tw 各區）規格摘錄："
                     "48.6 V、166 F、5 mΩ、Continuous current (15 °C rise) 86 A、Peak current (1 sec) 2200 A。"
                     "WebFetch 對該頁與 datasheet PDF 皆逾時（3 次），未取得 PDF 原文。"),
    "thermal_resistance_c_per_w": None,
    "thermal_resistance_note": ("0.4 °C/W 未查證（紅隊報告引用）；本檔改用規格自洽推得："
                                "R_th ≈ 15 °C / (86² × 0.005 Ω) = 0.406 °C/W"),
}
MODULES_PER_BANK = 2  # repo: LIC_N_PARALLEL = 2

LIC_URL = "https://nccavs-usergroups.avs.org/wp-content/uploads/Joint2012/2012_2Peterson.pdf"
LIC_CELL = {
    "name": "JSR Micro / JM Energy ULTIMO prismatic 3300F type (R&D prototype, 2012, tentative values)",
    "v_max_v": 3.8, "v_min_v": 2.2, "capacitance_f": 3300.0, "dcir_ohm": 0.0010,
    "i_peak_1s_a": 1100.0, "mass_kg": 0.360, "dims_mm": "150 x 91.5 x 15.5 (without terminals)",
    "source": LIC_URL + " (slide 29 'Typical properties of Prismatic type ULTIMO')",
    "caveat": ("假設，非 Musashi CPQ3300SD 規格：CPQ3300SD 原廠規格書以 WebSearch 查無；"
               "此為 2012 年 R&D 原型暫定值。1100 A 為原廠『由倍率數據推估』的 1 s 峰值；"
               "連續電流額定與熱阻未公開（未查證）。紅隊所稱『二手來源 3000 F』未找到出處，"
               "本次找到的唯一一手來源寫 3300F type。"),
}
ETA = 0.95          # 假設：DC-DC 效率（LIC 端功率 = bus 端 / η 放電、× η 充電）
NS_RANGE = list(range(10, 17))
ROBUST_VREF_WIDTH = 0.20  # V/cell
DCDC_CAP_KW = 60.0        # 假設：DC-DC bus 側功率額定（限幅敏感度）
MP_RANGE = list(range(1, 7))


# ---------------------------------------------------------------------------
# Part A
# ---------------------------------------------------------------------------
def part_a() -> dict:
    out = {}
    for name, steady_from in [("transient_hybrid", 4.0), ("rack_60s_graceful", 0.0), ("rack_n_minus_1", 0.0)]:
        d = json.load(open(SCEN_DIR / f"{name}.json", encoding="utf-8"))
        s, st = d["series"], d["stats"]
        t = np.asarray(s["t"])
        i_bank = np.asarray(s["i_lic_a"])
        v = np.asarray(s["v_lic"])
        i_mod = i_bank / MODULES_PER_BANK
        v_max = max(float(v.max()), float(st.get("lic_v_max", -1)))
        # peak current: series max vs stats-derived (lic_peak_kw / V_nominal) — take the larger
        i_peak_series = float(np.abs(i_mod).max())
        i_peak_stats = (st["lic_peak_kw"] * 1000 / st["lic_v_nominal"] / MODULES_PER_BANK) if "lic_peak_kw" in st else None
        i_peak = max(i_peak_series, i_peak_stats or 0.0)
        # RMS: time-weighted (series grid can be non-uniform after decimation)
        def rms(mask):
            tt, ii = t[mask], i_mod[mask]
            return float(np.sqrt(TRAPZ(ii ** 2, tt) / (tt[-1] - tt[0])))
        m_ss = t >= steady_from
        rms_full = rms(np.ones_like(t, dtype=bool))
        rms_ss = rms(m_ss)
        # max 1 s moving-window RMS (compare with the 1 s peak rating)
        w = []
        for t0 in np.arange(t[0], t[-1] - 1.0 + 1e-9, 0.05):
            mm = (t >= t0) & (t <= t0 + 1.0)
            if mm.sum() > 2:
                w.append(rms(mm))
        rms_1s_max = float(max(w))
        p_loss = rms_ss ** 2 * EATON["esr_dc_ohm"]
        dT_ss = 15.0 * (rms_ss / EATON["continuous_current_a_15c_rise"]) ** 2
        out[name] = {
            "source_json": f"packages/shared/scenarios/{name}.json",
            "series_points": int(len(t)), "series_decimated": True,
            "v_module_max_v": v_max, "v_limit_v": EATON["max_voltage_v"],
            "v_exceeds": bool(v_max > EATON["max_voltage_v"]),
            "v_terminal_initial_v": float(v[0]),
            "lic_v_ocv_constant_v": float(st.get("lic_v_nominal", 51.3)),
            "lic_v_ocv_constant_source": "LIC_V_NOMINAL_V = 51.3 (generate_twin_scenarios.py:84; generate_full_rack_60s_sim.py:47)",
            "ocv_constant_exceeds_v_limit": bool(float(st.get("lic_v_nominal", 51.3)) > EATON["max_voltage_v"]),
            "i_module_peak_a": i_peak, "i_module_peak_from_series_a": i_peak_series,
            "i_module_peak_from_stats_a": i_peak_stats,
            "i_peak_limit_1s_a": EATON["peak_current_a_1s"], "i_peak_exceeds": bool(i_peak > EATON["peak_current_a_1s"]),
            "i_module_rms_full_a": rms_full,
            "i_module_rms_window_a": rms_ss, "rms_window": f"t >= {steady_from} s",
            "i_module_rms_max_1s_window_a": rms_1s_max,
            "i_cont_limit_a": EATON["continuous_current_a_15c_rise"],
            "rms_over_continuous_ratio": rms_ss / EATON["continuous_current_a_15c_rise"],
            "i_rms_exceeds_continuous": bool(rms_ss > EATON["continuous_current_a_15c_rise"]),
            "esr_loss_per_module_w": p_loss,
            "steady_state_temp_rise_if_sustained_c": dT_ss,
            "temp_rise_note": "15 °C × (I_rms/86 A)²：假設 86 A 額定對應穩態 15 °C 溫升；模組熱容未知，短事件實際溫升較低",
        }
    return out


# ---------------------------------------------------------------------------
# Part B
# ---------------------------------------------------------------------------
def lic_profiles() -> dict:
    """LIC bus-side power (kW) under the repo control law (EMA τ=0.5 s, LIC = residual)."""
    prof = {}
    dt = 0.005
    t = np.arange(0, 10 + dt, dt)
    p = 80.0 * (1 + 0.30 * ((np.floor(t / 0.1).astype(int) % 2) * 2 - 1))
    prof["P1_demo_5hz_10s"] = (t, p - lpf(p, dt, SPLIT_TAU_S, p[0]))
    dt = 0.02
    t = np.arange(0, 60 + dt, dt)

    def mf(ph, cont):
        q = np.full_like(t, cont)
        q[t < ph] = 120.0
        mb = (t >= ph) & (t < ph + 1.5)
        q[mb] = 120.0 + (t[mb] - ph) / 1.5 * (cont - 120.0)
        return q
    for key, ph, cont, seed in [("P2_v3_mainsfail", 0.5, 30.0, 30.0), ("P3_peak_hold_2s", 2.0, 30.0, 30.0),
                                ("P4_full_load_60s", 60.0, 120.0, 30.0), ("P5_full_load_60s_seed0", 60.0, 120.0, 0.0)]:
        q = mf(ph, cont)
        prof[key] = (t, q - lpf(q, dt, SPLIT_TAU_S, seed))
    return prof


def sim_rc(t, p_bus_kw, c_f, r_ohm, v0):
    """Nonlinear RC, vectorised over initial voltages v0 (array).

    P_term = V_t·i, V_t = V_oc − i·R. Returns V_t, i with shape (len(t), len(v0));
    NaN from the step where the requested power is not deliverable (voltage collapse).
    """
    p_bus = p_bus_kw * 1000.0
    p_term = np.where(p_bus > 0, p_bus / ETA, p_bus * ETA)
    voc = np.atleast_1d(np.asarray(v0, dtype=float)).copy()
    dead = np.zeros_like(voc, dtype=bool)
    vt = np.empty((len(t), len(voc)))
    ia = np.empty((len(t), len(voc)))
    dts = np.diff(t)
    for k in range(len(t)):
        disc = voc * voc - 4 * r_ohm * p_term[k]
        dead |= disc < 0
        i = (voc - np.sqrt(np.maximum(disc, 0.0))) / (2 * r_ohm)
        vt[k] = np.where(dead, np.nan, voc - i * r_ohm)
        ia[k] = np.where(dead, np.nan, i)
        if k < len(dts):
            voc = voc - i * dts[k] / c_f
    return vt, ia


def check_cfg(ns, mp, profiles, v_refs):
    """Feasibility of each candidate V_ref (array) + per-profile details per candidate."""
    c = LIC_CELL["capacitance_f"] * mp / ns
    r = LIC_CELL["dcir_ohm"] * ns / mp
    v_hi, v_lo = LIC_CELL["v_max_v"] * ns, LIC_CELL["v_min_v"] * ns
    v_refs = np.atleast_1d(v_refs)
    ok_all = np.ones(len(v_refs), dtype=bool)
    det = {}
    for k, (t, p) in profiles.items():
        vt, ia = sim_rc(t, p, c, r, v_refs)
        dead = np.isnan(vt).any(axis=0)
        vmin = np.nanmin(np.where(np.isnan(vt), np.inf, vt), axis=0)
        vmax = np.nanmax(np.where(np.isnan(vt), -np.inf, vt), axis=0)
        ipk = np.nanmax(np.abs(np.where(np.isnan(ia), 0, ia)), axis=0) / mp
        ok = (~dead) & (vmin >= v_lo) & (vmax <= v_hi) & (ipk <= LIC_CELL["i_peak_1s_a"])
        ok_all &= ok
        det[k] = {"ok": ok, "dead": dead, "v_min_v": vmin, "v_max_v": vmax, "i_cell_peak_a": ipk,
                  "i_cell_rms_a": np.sqrt(np.nanmean((ia / mp) ** 2, axis=0)),
                  "esr_loss_bank_avg_w": np.nanmean(ia ** 2, axis=0) * r}
    return ok_all, det


def _pick(det, j):
    return {k: {kk: (bool(vv[j]) if vv.dtype == bool else float(vv[j])) for kk, vv in d.items()} for k, d in det.items()}


def sizing(profiles: dict, keys: list[str]) -> dict:
    prof = {k: profiles[k] for k in keys}
    grid = []
    for ns in NS_RANGE:
        for mp in MP_RANGE:
            v_hi, v_lo = LIC_CELL["v_max_v"] * ns, LIC_CELL["v_min_v"] * ns
            vrefs = np.round(np.arange(2.2, 3.8 + 1e-9, 0.01) * ns, 4)
            ok, det = check_cfg(ns, mp, prof, vrefs)
            row = {"nS": ns, "mP": mp, "n_cells": ns * mp, "v_window_v": [v_lo, v_hi], "feasible": bool(ok.any())}
            if ok.any():
                idx = np.flatnonzero(ok)
                j = int(idx[len(idx) // 2])  # middle of the feasible set = max margin both ways
                v_ref = float(vrefs[j])
                c = LIC_CELL["capacitance_f"] * mp / ns
                row.update({
                    "v_ref_feasible_range_v": [float(vrefs[idx[0]]), float(vrefs[idx[-1]])],
                    "v_ref_feasible_is_contiguous": bool(idx[-1] - idx[0] + 1 == len(idx)),
                    "v_ref_chosen_v": v_ref, "v_ref_per_cell_v": v_ref / ns,
                    "soc_energy_at_v_ref_pct": 100 * (v_ref ** 2 - v_lo ** 2) / (v_hi ** 2 - v_lo ** 2),
                    "usable_discharge_kj": 0.5 * c * (v_ref ** 2 - v_lo ** 2) / 1000,
                    "usable_absorb_kj": 0.5 * c * (v_hi ** 2 - v_ref ** 2) / 1000,
                    "total_window_energy_kj": 0.5 * c * (v_hi ** 2 - v_lo ** 2) / 1000,
                    "mass_kg": ns * mp * LIC_CELL["mass_kg"],
                    "per_profile": _pick(det, j),
                })
            else:
                # report why: best-case per-profile at the V_ref that maximises min margin
                row["binding_reason"] = {k: {"any_vref_voltage_ok": bool(((d["v_min_v"] >= v_lo) & (d["v_max_v"] <= v_hi) & ~d["dead"]).any()),
                                             "min_i_cell_peak_a_over_vref": (float(np.min(d["i_cell_peak_a"][~d["dead"]])) if (~d["dead"]).any() else None),
                                             "cell_peak_limit_a": LIC_CELL["i_peak_1s_a"]}
                                         for k, d in det.items()}
            grid.append(row)
    feas = [g for g in grid if g["feasible"]]
    best = min(feas, key=lambda g: (g["n_cells"], -g["nS"])) if feas else None
    for g in feas:
        g["v_ref_window_width_v_per_cell"] = (g["v_ref_feasible_range_v"][1] - g["v_ref_feasible_range_v"][0]) / g["nS"]
    robust = [g for g in feas if g["v_ref_window_width_v_per_cell"] >= ROBUST_VREF_WIDTH]
    rec = min(robust, key=lambda g: (g["n_cells"], -g["v_ref_window_width_v_per_cell"])) if robust else None
    return {"profiles": keys, "grid": grid, "minimum_cell_config": best,
            "recommended_robust_config": rec,
            "robust_rule": f"最少單體數，且可行 V_ref 區間寬度 ≥ {ROBUST_VREF_WIDTH} V/cell（容許 SOC 設定誤差、C/ESR 老化）"}


def main() -> int:
    a = part_a()
    profiles = lic_profiles()
    prof_summary = {k: {"p_bus_peak_kw": float(np.max(p)), "p_bus_min_kw": float(np.min(p)),
                        "energy_out_kj": float(TRAPZ(np.clip(p, 0, None), t)),
                        "max_cum_discharge_kj": float(np.max(np.concatenate(([0], np.cumsum(p[:-1] * np.diff(t)))))),
                        "max_cum_charge_kj": float(-np.min(np.concatenate(([0], np.cumsum(p[:-1] * np.diff(t))))))}
                    for k, (t, p) in profiles.items()}
    s_main = sizing(profiles, ["P1_demo_5hz_10s", "P2_v3_mainsfail", "P3_peak_hold_2s", "P4_full_load_60s"])
    s_seed0 = sizing(profiles, ["P1_demo_5hz_10s", "P2_v3_mainsfail", "P3_peak_hold_2s", "P4_full_load_60s",
                                "P5_full_load_60s_seed0"])
    capped = {k: (t, np.clip(p, -DCDC_CAP_KW, DCDC_CAP_KW)) for k, (t, p) in profiles.items()}
    s_cap = sizing(capped, ["P1_demo_5hz_10s", "P2_v3_mainsfail", "P3_peak_hold_2s", "P4_full_load_60s",
                            "P5_full_load_60s_seed0"])
    payload = {
        "_meta": meta(SCRIPT, {"eta": ETA, "nS_range": NS_RANGE, "mP_range": MP_RANGE,
                               "modules_per_bank": MODULES_PER_BANK, "split_tau_s": SPLIT_TAU_S}, [
            "假設：DC-DC 效率 0.95（LIC 端功率換算）",
            "假設：LIC 單體參數取自 2012 JSR Micro 簡報的 ULTIMO 3300F 原型暫定值，非 Musashi CPQ3300SD 規格書",
            "LIC 以理想 RC（C 恆定、DCIR 恆定）模擬；未含 C(V)、ESR(SOC/T)、自放電、單體不平衡",
            "可行判準：端電壓全程在 nS×[2.2, 3.8] V、單體峰值電流 ≤ 1100 A（1 s 峰值推估值）；連續電流額定未知未納入",
            "LIC 功率曲線 = repo 控制律（EMA τ=0.5 s，LIC 取殘差）；P5 改以 BBU 停電前閒置（LPF 起始 0 kW）為敏感度",
        ], [
            "Part A 只讀既有 JSON；series 經抽樣（800 點），峰值另以 stats 推算取較大者",
        ]),
        "eaton_spec": EATON,
        "part_a_eaton_bounds": a,
        "lic_cell": LIC_CELL,
        "lic_profiles": prof_summary,
        "part_b_sizing_P1_to_P4": s_main,
        "part_b_sizing_with_P5_seed0": s_seed0,
        "part_b_sizing_with_P5_dcdc_cap": {"dcdc_cap_bus_kw": DCDC_CAP_KW,
                                           "note": "LIC 功率在 bus 側限幅 ±60 kW（假設 DC-DC 額定），超出部分由 LFP 承擔；LFP 影響見 a2_worst_case.json dcdc_cap_analysis",
                                           **s_cap},
    }
    write_json("a2_spec_bounds_lic_sizing.json", payload)
    plot(a, s_main, s_seed0, profiles)
    for k, v in a.items():
        print(f"[a2-2A] {k}: Vmax {v['v_module_max_v']:.2f} (lim 48.6) Ipk {v['i_module_peak_a']:.0f} A "
              f"Irms {v['i_module_rms_window_a']:.0f} A (lim 86) dT_ss {v['steady_state_temp_rise_if_sustained_c']:.0f} C")
    for lab, s, kk in [("P1-P4 min", s_main, "minimum_cell_config"), ("+P5 min", s_seed0, "minimum_cell_config"),
                       ("P1-P4 robust", s_main, "recommended_robust_config"), ("+P5 robust", s_seed0, "recommended_robust_config"),
                       ("+P5 cap60 robust", s_cap, "recommended_robust_config")]:
        b = s[kk]
        if b:
            print(f"[a2-2B] {lab}: min config {b['nS']}S{b['mP']}P ({b['n_cells']} cells, {b['mass_kg']:.1f} kg) "
                  f"V_ref {b['v_ref_chosen_v']:.1f} V ({b['v_ref_per_cell_v']:.2f} V/cell, SOC {b['soc_energy_at_v_ref_pct']:.0f}%)")
        else:
            print(f"[a2-2B] {lab}: no feasible config in grid")
    return 0


def plot(a, s_main, s_seed0, profiles):
    plt = setup_cjk()
    fig, axes = plt.subplots(1, 3, figsize=(17, 5.6))
    # (1) Eaton bounds bar chart
    ax = axes[0]
    names = list(a.keys())
    x = np.arange(len(names))
    ax.bar(x - 0.2, [a[n]["i_module_rms_window_a"] for n in names], 0.4, label="每模組 RMS 電流 [A]")
    ax.bar(x + 0.2, [a[n]["i_module_peak_a"] / 10 for n in names], 0.4, label="每模組峰值電流 /10 [A]")
    ax.axhline(86, color="red", ls="--", lw=1, label="連續額定 86 A（15 °C 溫升）")
    ax.axhline(220, color="purple", ls=":", lw=1, label="1 s 峰值 2200 A（/10）")
    for xi, n in zip(x, names):
        ax.text(xi, max(a[n]["i_module_rms_window_a"], a[n]["i_module_peak_a"] / 10) + 6,
                f"Vmax {a[n]['v_module_max_v']:.1f} V", ha="center", fontsize=8.5)
    ax.set_xticks(x, ["示範暫態\n(t≥4 s)", "V3 60 s", "V4 N−1"])
    ax.set_title("A2-2A 既有模擬 vs Eaton XLR-48R6167-R\n（電壓上限 48.6 V；三案 Vmax 皆 >51 V）", fontsize=10)
    ax.set_ylabel("每模組電流 [A]（峰值以 /10 顯示）")
    ax.set_ylim(0, 290)
    ax.legend(fontsize=8, loc="upper right")
    ax.grid(alpha=0.3, axis="y")
    # (2) feasibility grid
    ax = axes[1]
    for s, mk, col, lab in [(s_main, "s", "tab:green", "P1–P4 可行"), (s_seed0, "o", "tab:blue", "含 P5（停電前閒置）可行")]:
        pts = [(g["nS"], g["mP"]) for g in s["grid"] if g["feasible"]]
        if pts:
            ax.scatter(*zip(*pts), marker=mk, s=140 if mk == "s" else 50, facecolors="none" if mk == "s" else col,
                       edgecolors=col, label=lab)
    for s, col in [(s_main, "tab:green"), (s_seed0, "tab:blue")]:
        b = s["recommended_robust_config"]
        if b:
            ax.annotate(f"建議 {b['nS']}S{b['mP']}P", (b["nS"], b["mP"]), textcoords="offset points",
                        xytext=(6, 6 if col == "tab:green" else -14), color=col, fontsize=9)
    ax.set_xticks(NS_RANGE)
    ax.set_yticks(MP_RANGE)
    ax.set_xlabel("串聯數 nS")
    ax.set_ylabel("並聯數 mP")
    ax.set_title("A2-2B LIC 尺寸可行域（ULTIMO 3300F 原型參數＝假設）\n判準：2.2–3.8 V/cell、單體 ≤1100 A；建議＝V_ref 可行寬度 ≥0.2 V/cell 的最少單體", fontsize=9.5)
    ax.grid(alpha=0.3)
    ax.set_ylim(0.5, 7.6)
    ax.legend(fontsize=8, loc="upper left", ncol=2)
    # (3) voltage traces of chosen config
    ax = axes[2]
    b = s_seed0["recommended_robust_config"] or s_main["recommended_robust_config"]
    if b:
        ns, mp, vr = b["nS"], b["mP"], b["v_ref_chosen_v"]
        c = LIC_CELL["capacitance_f"] * mp / ns
        r = LIC_CELL["dcir_ohm"] * ns / mp
        for k, (t, p) in profiles.items():
            vt, _ = sim_rc(t, p, c, r, [vr])
            ax.plot(t, vt[:, 0] / ns, lw=1.2, label=k)
        ax.axhline(3.8, color="red", ls="--", lw=1)
        ax.axhline(2.2, color="red", ls="--", lw=1)
        ax.set_xlim(0, 10)
        ax.set_title(f"{ns}S{mp}P、中點 {vr / ns:.2f} V/cell 的單體端電壓（前 10 s）", fontsize=10)
        ax.set_xlabel("時間 [s]")
        ax.set_ylabel("單體端電壓 [V]")
        ax.legend(fontsize=7.5)
        ax.grid(alpha=0.3)
    fig.tight_layout()
    out = OUT_DIR / "a2_spec_bounds_lic_sizing.png"
    fig.savefig(out, dpi=110)
    print(f"[a2-2] -> {out}")


if __name__ == "__main__":
    sys.exit(main())
