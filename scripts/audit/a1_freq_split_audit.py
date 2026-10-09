"""A1 self-audit, experiments 1–3 (numpy only, no DFN).

  1. Frequency response of the GTS split filter: |H(f)| = LFP share.
  2. Decomposition of the 5.7× headline (definition / window / EMA seed).
  3. Choukse-2025-style compute/comm waveforms × τ sweep: LFP std ratio,
     LFP pp share, LFP peak C-rate, LIC energy swing vs repo LIC sizing.

Run (from repo root):
    .venv/Scripts/python scripts/audit/a1_freq_split_audit.py

Outputs:
    data/processed/audit/a1_frequency_split.json
    data/processed/audit/a1_freq_response.png
    data/processed/audit/a1_tau_definition.png
    data/processed/audit/a1_choukse_sweep.png
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import a1_common as C  # noqa: E402

gts = C.gts
DT = C.DT
SCRIPT = "scripts/audit/a1_freq_split_audit.py"

TAUS_DEF = [0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
TAUS_SWEEP = [0.5, 1.0, 2.0, 5.0]
FREQS_SWEEP = [0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0]
FREQS_TABLE = [0.05, 0.1, 0.2, 0.25, 0.318, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 50.0, 100.0, 200.0]
CHOUKSE_BAND = (0.2, 3.0)
RACK_TDP_KW = gts.RACK_POWER_KW  # 120 kW

WAVEFORMS = {
    # name: (p_low_frac, duty, shape, note)
    "sq_30_100_d50": (0.30, 0.5, "square",
                      "主案：compute 100% TDP ↔ comm 30% TDP（假設：Choukse 只說 comm 接近 idle，30% 為假設值），50% duty（假設）"),
    "trap_30_100_d50": (0.30, 0.5, "trapezoid",
                        "同主案但每個邊緣線性斜坡 10%·T（假設），檢驗方波高次諧波是否灌水"),
    "sq_65_100_d50": (0.65, 0.5, "square",
                      "GPU 端 power floor 65% TDP（取自 Choukse IV-B GB200 實驗設定）時的殘餘擺盪，50% duty（假設）"),
    "sq_30_100_d80": (0.30, 0.8, "square",
                      "敏感度：compute 占 80% 週期（假設）"),
}


# ---------------------------------------------------------------------------
# Experiment 1 — frequency response
# ---------------------------------------------------------------------------
def exp1_frequency_response() -> dict:
    f = np.array(FREQS_TABLE)
    table = {}
    for tau in TAUS_DEF:
        hc = C.h_continuous(f, tau)
        fd = f[f < 0.5 / DT]
        hd = C.h_discrete(fd, tau)
        table[str(tau)] = {
            "fc_hz": 1.0 / (2 * math.pi * tau),
            "lfp_share_continuous": dict(zip(map(str, f.tolist()), hc.tolist())),
            "lic_share_continuous": dict(zip(map(str, f.tolist()),
                                             (2 * np.pi * f * tau / np.sqrt(1 + (2 * np.pi * f * tau) ** 2)).tolist())),
            "lfp_share_discrete_ema_dt0.005": dict(zip(map(str, fd.tolist()), hd.tolist())),
        }
    return {
        "definition": "|H(f)| = 1/sqrt(1+(2πfτ)^2) = 單一正弦成分下 LFP 承擔的振幅比例；LIC 承擔 |1−H| = 2πfτ/sqrt(1+(2πfτ)^2)",
        "note_discrete": "GTS 實際用離散 EMA（dt=0.005 s，Nyquist 100 Hz），≤10 Hz 與連續式差 <0.1%；200 Hz 超過 Nyquist，只列連續式",
        "by_tau": table,
    }


# ---------------------------------------------------------------------------
# Experiment 2 — 5.7× definition decomposition (current 5 Hz demo waveform)
# ---------------------------------------------------------------------------
def analytic_square_ratio(f0: float, tau: float, kmax: int = 200001) -> float:
    """Steady-state std(p)/std(LFP) for a 50 %-duty square through a continuous 1st-order LPF.

    Square ±A has odd harmonics with power 8A²/(π²k²) (sums to A²).
    """
    k = np.arange(1, kmax, 2, dtype=float)
    w = 8.0 / (np.pi ** 2 * k ** 2)
    return float(1.0 / math.sqrt(np.sum(w * C.h_continuous(k * f0, tau) ** 2)))


HALF_N = int(round(gts.TRANSIENT_PERIOD_S / DT))  # 20 samples per 100 ms half-period


def clean_square_steady_ratio(tau: float, win_s: float = 40.0) -> float:
    """Steady std ratio for the demo square built by integer index (no float edge jitter)."""
    n_tot = int(round((5 * tau + win_s) / DT))
    n = np.arange(n_tot)
    p = gts.RACK_BASELINE_KW * (1.0 + gts.TRANSIENT_AMPLITUDE * (((n // HALF_N) % 2) * 2 - 1))
    lfp = C.ema(p, DT, tau, float(np.mean(p)))
    m = n >= int(round(5 * tau / DT))
    return float(np.std(p[m]) / np.std(lfp[m]))


def exp2_definition() -> dict:
    out = {}
    # Equivalence check: vectorised EMA == GTS loop
    t, p = gts._build_power_profile(10.0, DT)
    lfp_gts, _ = gts._split_with_lic(p, DT, tau_s=0.5)
    lfp_vec = C.ema(p, DT, 0.5, p[0])
    out["ema_equivalence_max_abs_diff_kw"] = float(np.max(np.abs(lfp_gts - lfp_vec)))

    rows = []
    for tau in TAUS_DEF:
        # (a) current headline definition: full 0–10 s window, EMA seeded at first sample
        t, p = gts._build_power_profile(10.0, DT)
        lfp_a, _ = gts._split_with_lic(p, DT, tau_s=tau)
        ratio_a = float(np.std(p) / np.std(lfp_a))
        # (c) same window, EMA seeded at the waveform mean
        lfp_c, _ = gts._split_with_lic(p, DT, tau_s=tau, lfp_init_kw=float(np.mean(p)))
        ratio_c = float(np.std(p) / np.std(lfp_c))
        # transient-only component inside the 10 s window
        trans = lfp_a - lfp_c
        # (b) steady window: drop first 5τ. Original 10 s window when 5τ<10 s,
        #     plus an extended run [5τ, 5τ+10 s] valid for every τ.
        if 5 * tau < 10.0:
            m = t >= 5 * tau
            ratio_b_in10 = float(np.std(p[m]) / np.std(lfp_a[m]))
        else:
            ratio_b_in10 = None
        dur = 5 * tau + 10.0
        t2, p2 = gts._build_power_profile(dur, DT)
        lfp2, _ = gts._split_with_lic(p2, DT, tau_s=tau)
        m2 = t2 >= 5 * tau
        ratio_b_ext = float(np.std(p2[m2]) / np.std(lfp2[m2]))
        rows.append({
            "tau_s": tau,
            "fc_hz": 1.0 / (2 * math.pi * tau),
            "std_p_total_kw_full": float(np.std(p)),
            "a_full_window_seed_first_sample": {
                "std_lfp_kw": float(np.std(lfp_a)), "ratio": ratio_a},
            "b_steady_drop_5tau_within_10s": ratio_b_in10,
            "b_steady_drop_5tau_extended_10s_window": {
                "window_s": [5 * tau, dur], "ratio": ratio_b_ext,
                "std_lfp_kw": float(np.std(lfp2[m2]))},
            "c_full_window_seed_mean": {
                "seed_kw": float(np.mean(p)),
                "std_lfp_kw": float(np.std(lfp_c)), "ratio": ratio_c},
            "analytic_steady_continuous_lpf_ratio": analytic_square_ratio(5.0, tau),
            "startup_transient_rms_kw_in_10s": float(np.sqrt(np.mean(trans ** 2))),
            "steady_ripple_std_kw": float(np.std(lfp2[m2])),
            "lic_energy_swing_steady_kj": float(np.ptp(C.cum_energy_kj(
                (p2 - lfp2)[m2] - np.mean((p2 - lfp2)[m2]), DT))),
            "lic_peak_kw_steady": float(np.max(np.abs((p2 - lfp2)[m2]))),
            "clean_square_steady_40s_ratio": clean_square_steady_ratio(tau),
        })
    out["rows"] = rows
    t, p = gts._build_power_profile(10.0, DT)
    n = np.arange(len(t))
    clean = gts.RACK_BASELINE_KW * (1.0 + gts.TRANSIENT_AMPLITUDE * (((n // HALF_N) % 2) * 2 - 1))
    out["gts_profile_float_edge_jitter"] = {
        "n_samples_differing_from_integer_index_square_0_10s": int(np.sum(p != clean)),
        "n_samples_total": int(len(t)),
        "note": ("GTS 用 np.floor(t/0.1) 判斷翻轉，t=n·0.005 的浮點誤差使部分邊緣樣本落到錯誤半週期；"
                 "乾淨（整數索引）方波的長窗穩態倍率見 rows[i].clean_square_steady_40s_ratio，"
                 "τ=0.5 s 時與解析值差 <0.3%；(b) 欄 17.2 與解析 17.4 的落差主要來自此抖動。"),
    }
    out["waveform"] = "GTS _build_power_profile：80 kW ±30%，每 100 ms 翻轉（5 Hz 方波，56↔104 kW），從低點 56 kW 起跳，dt=0.005 s"
    out["why_non_monotonic"] = (
        "全窗 std(LFP)² ≈ 穩態漣波² + 啟動暫態均方。漣波隨 τ 增大而下降（∝1/τ），"
        "但 EMA 從 56 kW 起跳、爬回 80 kW 的 24 kW 缺口以 e^(−t/τ) 消退，"
        "τ 越大在 10 s 窗內占比越大（均方 ≈ 24²·τ/(2·10)）。小 τ 由漣波主導、大 τ 由暫態主導，"
        "所以全窗倍率在 τ≈0.25–0.5 s 出現峰值後下降，這是窗長＋初值的人為產物，不是濾波器的物理特性。")
    return out


# ---------------------------------------------------------------------------
# Experiment 3 — Choukse-style waveform × τ sweep
# ---------------------------------------------------------------------------
def run_case(f_hz: float, tau: float, p_low_frac: float, duty: float, shape: str) -> dict:
    T = 1.0 / f_hz
    warm = math.ceil(max(5 * tau, 2 * T) / T - 1e-9) * T
    win = math.ceil(max(20.0, 4 * T) / T - 1e-9) * T
    n = int(round((warm + win) / DT))
    t = np.arange(n) * DT
    p_hi = RACK_TDP_KW
    p_lo = p_low_frac * RACK_TDP_KW
    p = C.choukse_wave(t, f_hz, p_hi, p_lo, duty=duty, shape=shape)
    i0 = int(round(warm / DT))
    i1 = i0 + int(round(win / DT))
    # Seed EMA at the waveform's period-mean → removes the startup artefact.
    seed = float(np.mean(p[i0:i1]))
    lfp = C.ema(p, DT, tau, seed)
    lic = p - lfp
    sl = slice(i0, i1)
    pw, lw, cw = p[sl], lfp[sl], lic[sl]
    # Raw swing includes any residual DC in P_LIC left by the EMA start-up
    # (decays as e^(−t/τ)); in a real system an SOC-hold loop removes that DC.
    # Primary metric = swing of ∫(P_LIC − mean) dt; raw kept for transparency.
    lic_dc_kw = float(np.mean(cw))
    swing_raw = float(np.ptp(C.cum_energy_kj(cw, DT)))
    swing = float(np.ptp(C.cum_energy_kj(cw - lic_dc_kw, DT)))
    rc = gts._simulate_lic_rc(cw, t[sl] - t[i0])
    v_top = gts.LIC_V_NOMINAL_V
    v_floor_sq = v_top ** 2 - 2 * swing * 1000.0 / gts.LIC_BANK_C_F
    return {
        "f_hz": f_hz, "tau_s": tau,
        "window_s": [warm, warm + win],
        "lfp_std_ratio": float(np.std(pw) / np.std(lw)),
        "lfp_pp_share": float(np.ptp(lw) / np.ptp(pw)),
        "p_total_pp_kw": float(np.ptp(pw)),
        "lfp_pp_kw": float(np.ptp(lw)),
        "lfp_peak_kw": float(np.max(lw)),
        "lfp_only_peak_kw": float(np.max(pw)),
        "lfp_peak_c_rate_dfn_mapping": C.c_rate_dfn_mapping(float(np.max(lw))),
        "lfp_only_peak_c_rate_dfn_mapping": C.c_rate_dfn_mapping(float(np.max(pw))),
        "lfp_peak_c_rate_pack_energy": C.c_rate_pack_energy(float(np.max(lw))),
        "lic_peak_kw": float(np.max(np.abs(cw))),
        "lic_peak_current_a_at_51v3": float(np.max(np.abs(cw)) * 1000.0 / gts.LIC_V_NOMINAL_V),
        "lic_energy_swing_kj": swing,
        "lic_energy_swing_raw_kj": swing_raw,
        "lic_residual_dc_kw": lic_dc_kw,
        "lic_rc_linear_v_pp_v": float(rc["v_pp_v"]),
        "lic_v_min_if_top_at_51v3_v": float(math.sqrt(v_floor_sq)) if v_floor_sq > 0 else None,
        "fits_tierA_5kJ": swing <= gts.LIC_ENERGY_KJ_PER_RACK,
        "fits_usable_51v3_to_38v": swing <= C.LIC_USABLE_KJ_51V3_TO_38V,
        "fits_usable_48v6_to_38v_assumed_rating": swing <= C.LIC_USABLE_KJ_48V6_TO_38V,
        "fits_nominal_345kJ": swing <= C.LIC_NOMINAL_TOTAL_KJ,
    }


def exp3_choukse_sweep() -> dict:
    res = {}
    for name, (lo, duty, shape, note) in WAVEFORMS.items():
        cases = []
        for tau in TAUS_SWEEP:
            for f in FREQS_SWEEP:
                r = run_case(f, tau, lo, duty, shape)
                if shape == "square" and duty == 0.5:
                    r["analytic_steady_ratio_crosscheck"] = analytic_square_ratio(f, tau)
                cases.append(r)
        res[name] = {"p_high_kw": RACK_TDP_KW, "p_low_kw": lo * RACK_TDP_KW,
                     "duty_compute": duty, "shape": shape, "note": note,
                     "cases": cases}
    base = {(c["tau_s"], c["f_hz"]): c for c in res["sq_30_100_d50"]["cases"]}
    metrics = ["lfp_std_ratio", "lfp_pp_share", "lfp_peak_c_rate_dfn_mapping",
               "lic_energy_swing_kj", "lic_peak_kw"]
    sens = {}
    for name, w in res.items():
        if name == "sq_30_100_d50":
            continue
        sens[name] = {}
        for mname in metrics:
            rel = []
            for c in w["cases"]:
                b = base[(c["tau_s"], c["f_hz"])]
                rel.append((c[mname] / b[mname] - 1.0, c["tau_s"], c["f_hz"], b[mname], c[mname]))
            ab = np.array([abs(r[0]) for r in rel])
            worst = rel[int(np.argmax(ab))]
            sens[name][mname] = {
                "median_abs_rel_diff": float(np.median(ab)),
                "max_abs_rel_diff": float(ab.max()),
                "worst_case": {"tau_s": worst[1], "f_hz": worst[2],
                               "base_sq_30_100_d50": worst[3], "this_waveform": worst[4],
                               "rel_diff": worst[0]},
            }
    main_peak = max(res["sq_30_100_d50"]["cases"], key=lambda c: c["lic_peak_kw"])
    return {
        "sensitivity_vs_sq_30_100_d50": sens,
        "main_waveform_lic_peak": {
            "lic_peak_kw": main_peak["lic_peak_kw"],
            "lic_peak_current_a_at_51v3": main_peak["lic_peak_current_a_at_51v3"],
            "tau_s": main_peak["tau_s"], "f_hz": main_peak["f_hz"],
            "note": "方波瞬時邊緣主導此峰值，不穩健；梯形斜坡下的降幅見 sensitivity_vs_sq_30_100_d50.trap_30_100_d50.lic_peak_kw.worst_case",
        },
        "lic_capacity_reference": {
            "tierA_need_kj (GTS LIC_ENERGY_KJ_PER_RACK)": gts.LIC_ENERGY_KJ_PER_RACK,
            "nominal_total_kj (GTS 5×69)": C.LIC_NOMINAL_TOTAL_KJ,
            "usable_kj_332F_51.3V_to_38V (derived ½C(V1²−V0²))": C.LIC_USABLE_KJ_51V3_TO_38V,
            "usable_kj_332F_48.6V_to_38V (derived; 48.6 V rating ASSUMED, from red-team probe, not datasheet-checked)": C.LIC_USABLE_KJ_48V6_TO_38V,
            "caveat": "兩個可用能量都未扣 ESR 損耗與 DC-DC UVLO；GTS 用 51.3 V 作滿電電壓，若模組額定為 48.6 V 則 51.3 V 已超額定（假設，待 datasheet 確認）",
        },
        "c_rate_mapping_note": (
            f"dfn_mapping：沿用 GTS，{C.P_AT_TARGET_C_KW:.0f} kW 機櫃功率 → {gts.TARGET_PEAK_C_RATE} C（Prada2013 電芯）；"
            "pack_energy：以每台 BBU 2.5 kWh 為 1 C（120 kW → 6 C）。兩者差 15%，GTS 內部即存在此口徑差。"),
        "metric_definitions": {
            "lfp_std_ratio": "std(P_total)/std(P_LFP)，穩態窗（丟掉 max(5τ,2T) 暖機，EMA 初值設在平均值）",
            "lfp_pp_share": "峰對峰(P_LFP)/峰對峰(P_total)",
            "lic_energy_swing_kj": "穩態窗內 ∫(P_LIC − 窗內平均) dt 的峰對峰（LIC 儲能必須來回擺動的量）；殘餘 DC 全案 <0.02 kW，raw 版本見 lic_energy_swing_raw_kj（兩者差 ≤0.13 kJ）",
            "lic_rc_linear_v_pp_v": "GTS _simulate_lic_rc（332 F、2.5 mΩ、i≈P/51.3V 線性化）在穩態窗的電壓峰對峰；ΔV 大時線性化失準",
            "lic_v_min_if_top_at_51v3_v": "若擺動上緣在 51.3 V，依 ½CV² 算的下緣電壓",
        },
        "waveforms": res,
    }


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------
def _plain_log_ticks(fig) -> None:
    """Replace mathtext 10^x tick labels (JhengHei lacks U+2212) with plain numbers."""
    from matplotlib.ticker import FuncFormatter, NullFormatter
    fmt = FuncFormatter(lambda v, _: f"{v:g}")
    for ax in fig.axes:
        for axis, scale in ((ax.xaxis, ax.get_xscale()), (ax.yaxis, ax.get_yscale())):
            if scale == "log":
                axis.set_major_formatter(fmt)
                axis.set_minor_formatter(NullFormatter())


def plot_all(e2: dict, e3: dict) -> list[str]:
    plt = C.setup_cjk_font()
    paths = []
    colors = {0.1: "#999999", 0.25: "#7aa6c2", 0.5: "#1f4e79", 1.0: "#2e8b57",
              2.0: "#d08c1f", 5.0: "#b22222"}

    # --- Fig 1: frequency response
    f = np.logspace(np.log10(0.05), np.log10(200), 600)
    fig, ax = plt.subplots(figsize=(8.5, 5.0), dpi=150)
    ax.axvspan(*CHOUKSE_BAND, color="#f2c94c", alpha=0.25,
               label="Choukse 2025 主頻帶 0.2–3 Hz")
    for tau in TAUS_DEF:
        fc = 1 / (2 * math.pi * tau)
        lw = 2.6 if tau == 0.5 else 1.4
        ax.semilogx(f, C.h_continuous(f, tau), color=colors[tau], lw=lw,
                    label=f"τ={tau:g} s（fc={fc:.3g} Hz）")
    ax.axvline(5.0, color="k", ls="--", lw=1)
    ax.text(5.3, 0.9, "現行示範波形 5 Hz", fontsize=9)
    ax.set_xlabel("頻率 f（Hz）")
    ax.set_ylabel("|H(f)| ＝ LFP 承擔比例")
    ax.set_title("一階低通分流的頻率響應：LFP 承擔比例 vs 頻率")
    ax.set_ylim(0, 1.02)
    ax.grid(True, which="both", alpha=0.3)
    ax.legend(fontsize=8, loc="lower left")
    _plain_log_ticks(fig)
    fig.tight_layout()
    p1 = C.OUT_DIR / "a1_freq_response.png"
    fig.savefig(p1, metadata={"Software": None})
    plt.close(fig)
    paths.append(str(p1))

    # --- Fig 2: τ-sweep definitions
    rows = e2["rows"]
    taus = [r["tau_s"] for r in rows]
    fig, axs = plt.subplots(1, 2, figsize=(11, 4.6), dpi=150)
    ax = axs[0]
    ax.plot(taus, [r["a_full_window_seed_first_sample"]["ratio"] for r in rows], "o-",
            color="#b22222", label="(a) 現行：全窗 0–10 s，初值＝首樣本")
    ax.plot(taus, [r["b_steady_drop_5tau_extended_10s_window"]["ratio"] for r in rows], "s-",
            color="#1f4e79", label="(b) 穩態窗：丟前 5τ")
    ax.plot(taus, [r["c_full_window_seed_mean"]["ratio"] for r in rows], "^-",
            color="#2e8b57", label="(c) 全窗，初值＝平均值")
    ax.plot(taus, [r["analytic_steady_continuous_lpf_ratio"] for r in rows], "k:",
            label="解析解（連續一階 LPF，穩態）")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("τ（s）")
    ax.set_ylabel("std(P_total)/std(P_LFP)")
    ax.set_title("同一個 5 Hz 波形，三種定義的倍率")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend(fontsize=8)
    ax = axs[1]
    t, p = gts._build_power_profile(10.0, DT)
    lfp_a, _ = gts._split_with_lic(p, DT, tau_s=0.5)
    lfp_c, _ = gts._split_with_lic(p, DT, tau_s=0.5, lfp_init_kw=float(np.mean(p)))
    ax.plot(t, p, color="#cccccc", lw=0.6, label="P_total（56↔104 kW）")
    ax.plot(t, lfp_a, color="#b22222", lw=1.2, label="P_LFP，初值 56 kW（現行）")
    ax.plot(t, lfp_c, color="#2e8b57", lw=1.2, label="P_LFP，初值 80 kW")
    ax.axvspan(0, 2.5, color="#b22222", alpha=0.08)
    ax.text(0.1, 100, "5τ≈2.5 s 啟動暫態", fontsize=9, color="#b22222")
    ax.set_xlabel("時間（s）")
    ax.set_ylabel("功率（kW）")
    ax.set_title("τ=0.5 s：5.7× 的分母被啟動暫態撐大")
    ax.legend(fontsize=8, loc="lower right")
    ax.grid(True, alpha=0.3)
    _plain_log_ticks(fig)
    fig.tight_layout()
    p2 = C.OUT_DIR / "a1_tau_definition.png"
    fig.savefig(p2, metadata={"Software": None})
    plt.close(fig)
    paths.append(str(p2))

    # --- Fig 3: Choukse sweep (main waveform)
    main = e3["waveforms"]["sq_30_100_d50"]["cases"]
    fig, axs = plt.subplots(2, 2, figsize=(11, 8.2), dpi=150)
    for tau in TAUS_SWEEP:
        cs = [c for c in main if c["tau_s"] == tau]
        fs = [c["f_hz"] for c in cs]
        kw = dict(color=colors[tau], marker="o", label=f"τ={tau:g} s")
        axs[0, 0].semilogx(fs, [c["lfp_pp_share"] for c in cs], **kw)
        axs[0, 1].loglog(fs, [c["lfp_std_ratio"] for c in cs], **kw)
        axs[1, 0].loglog(fs, [c["lic_energy_swing_kj"] for c in cs], **kw)
        axs[1, 1].semilogx(fs, [c["lfp_peak_c_rate_dfn_mapping"] for c in cs], **kw)
    cs0 = [c for c in main if c["tau_s"] == TAUS_SWEEP[0]]
    axs[1, 1].semilogx([c["f_hz"] for c in cs0], [c["lfp_only_peak_c_rate_dfn_mapping"] for c in cs0],
                       "k--", label="純 LFP（無 LIC）")
    ref = e3["lic_capacity_reference"]
    for val, lab, ls in [(gts.LIC_ENERGY_KJ_PER_RACK, "Tier-A 需求 5 kJ", ":"),
                         (C.LIC_USABLE_KJ_51V3_TO_38V, f"332 F 51.3→38 V 可用 {C.LIC_USABLE_KJ_51V3_TO_38V:.0f} kJ", "--"),
                         (C.LIC_NOMINAL_TOTAL_KJ, "名目總量 345 kJ（5×69）", "-."),
                         (C.LIC_USABLE_KJ_48V6_TO_38V, f"若額定 48.6 V（假設）：{C.LIC_USABLE_KJ_48V6_TO_38V:.0f} kJ", (0, (5, 1, 1, 1)))]:
        axs[1, 0].axhline(val, color="k", ls=ls, lw=1, label=lab)
    titles = ["LFP 峰對峰承擔比例", "LFP 功率 std 倍率（穩態）",
              "LIC 所需能量擺幅（kJ，穩態）", "LFP 峰值 C-rate（GTS DFN 映射）"]
    ylabels = ["P_LFP 峰對峰 / P_total 峰對峰（無單位，0–1）",
               "std(P_total)/std(P_LFP)（倍，無單位）",
               "能量擺幅（kJ）",
               "C-rate（1/h，Prada2013 電芯）"]
    for ax, ti, yl in zip(axs.flat, titles, ylabels):
        ax.axvspan(*CHOUKSE_BAND, color="#f2c94c", alpha=0.25)
        ax.set_title(ti)
        ax.set_ylabel(yl, fontsize=9)
        ax.set_xlabel("compute/comm 擺盪頻率（Hz）")
        ax.grid(True, which="both", alpha=0.3)
        ax.legend(fontsize=7)
    fig.suptitle("Choukse 式波形（120 kW 機櫃，30%↔100% TDP 方波，50% duty；黃帶＝0.2–3 Hz）× τ 掃描")
    _plain_log_ticks(fig)
    fig.tight_layout()
    p3 = C.OUT_DIR / "a1_choukse_sweep.png"
    fig.savefig(p3, metadata={"Software": None})
    plt.close(fig)
    paths.append(str(p3))
    return paths


def main() -> None:
    e1 = exp1_frequency_response()
    e2 = exp2_definition()
    e3 = exp3_choukse_sweep()
    figs = plot_all(e2, e3)
    params = {
        "dt_s": DT,
        "taus_definition": TAUS_DEF,
        "taus_sweep": TAUS_SWEEP,
        "freqs_sweep_hz": FREQS_SWEEP,
        "freqs_table_hz": FREQS_TABLE,
        "rack_tdp_kw": RACK_TDP_KW,
        "waveforms": {k: {"p_low_frac": v[0], "duty": v[1], "shape": v[2]} for k, v in WAVEFORMS.items()},
        "trapezoid_ramp_frac_of_period": 0.1,
        "steady_window_rule": "warmup = ceil(max(5τ,2T)/T)·T；window = ceil(max(20 s,4T)/T)·T；EMA 初值＝穩態窗平均",
    }
    assumptions = [
        "假設：機櫃 TDP 取 GTS RACK_POWER_KW=120 kW；Choukse 2025 本身未給機櫃 kW。",
        "假設：comm 階段 30% TDP（Choukse I 節只說 'close to the idle power'，未給百分比）。",
        "假設：compute/comm 50% duty（敏感度另跑 80%）；Choukse II-C 只說週期 'once per second or less, to once every tens of seconds'。",
        "假設：梯形波每個邊緣斜坡 10%·T；Choukse 未給 AI 負載的 MW/s 數值。",
        "取自 Choukse 2025 §III-A：'FFT energy concentrated between 0.2–3 Hz'（指其 Figure 1 的 DGX-H100 機櫃量測 trace）；全文（HTML v1）未出現 ±30% 或 100 ms 擺盪週期。",
        "取自 Choukse IV-B：GB200 方波 micro-benchmark 'The power floor was set to 65% of the TDP'（用於 sq_65_100 案）。",
        "LIC 可用能量 197 kJ 為由 GTS 常數（332 F，51.3→38 V）推得，忽略 ESR 損耗與 DC-DC 輸入電壓下限；345 kJ 為 GTS 名目值（5 kJ×69）。",
        "假設：模組額定 48.6 V（來源：紅隊 probe／主對話，未在本稽核中對照 datasheet）；額定窗 48.6→38 V 的 2 模組可用能量約 152 kJ。",
        "LIC 端只有 GTS 的一階 RC 等效模型，未模擬 DC-DC 頻寬、損耗與電流上限。",
    ]
    out = C.write_json("a1_frequency_split.json", SCRIPT, params, assumptions,
                       {"exp1_frequency_response": e1, "exp2_definition_5p7x": e2,
                        "exp3_choukse_sweep": e3, "figures": [Path(p).name for p in figs]})
    print("wrote", out)
    for r in e2["rows"]:
        print(f"tau={r['tau_s']:<5} a={r['a_full_window_seed_first_sample']['ratio']:.3f} "
              f"b={r['b_steady_drop_5tau_extended_10s_window']['ratio']:.2f} "
              f"c={r['c_full_window_seed_mean']['ratio']:.2f} "
              f"analytic={r['analytic_steady_continuous_lpf_ratio']:.2f}")
    print("ema equivalence max diff kW:", e2["ema_equivalence_max_abs_diff_kw"])


if __name__ == "__main__":
    main()
