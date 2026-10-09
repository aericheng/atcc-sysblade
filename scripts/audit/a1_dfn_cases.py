"""A1 self-audit, experiment 4: PyBaMM DFN LFP-cell voltage pp, lfp_only vs hybrid.

Step 0 reproduces the published transient headline (61.6 mV / 17.5 mV,
4–6 s window) with the untouched GTS functions; if either number is off by
more than ±2 % the script stops with exit code 2 and no case results.

Then runs Choukse-style 30%↔100% TDP square waves (120 kW rack, 50 % duty —
ASSUMED shape) at 0.2 / 0.25 / 1 / 5 Hz through the same Prada2013 DFN cell with the
same GTS pack→cell current mapping, for lfp_only and hybrid τ ∈ {0.5, 2, 5} s.

Run (from repo root):
    .venv/Scripts/python scripts/audit/a1_dfn_cases.py

Outputs:
    data/processed/audit/a1_dfn_cases.json
    data/processed/audit/a1_dfn_cases.png
"""
from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import a1_common as C  # noqa: E402

gts = C.gts
DT = C.DT
SCRIPT = "scripts/audit/a1_dfn_cases.py"
TOL = 0.02
FREQS = [0.2, 0.25, 1.0, 5.0]
TAUS = [0.5, 2.0, 5.0]
P_LOW_FRAC = 0.30
DUTY = 0.5
WARM_TAU_MAX = max(TAUS)


def _window_stats(sim: dict, t0: float, t1: float, period_s: float) -> dict:
    st = np.asarray(sim["t"])
    v = np.asarray(sim["V_cell"])
    i = np.asarray(sim["I_cell"])
    m = (st >= t0) & (st <= t1)
    vs, ts = v[m], st[m]
    # SOC drift estimated from per-period mean voltage (a straight-line fit on
    # a 2-period square wave would absorb the square itself). Uniform 1 ms
    # resample, slope through first/last full-period means.
    du = 0.001
    tu = t0 + np.arange(int(round((t1 - t0) / du))) * du
    vu = np.interp(tu, ts, vs)
    nper = int(round(period_s / du))
    k = len(vu) // nper
    pm = vu[: k * nper].reshape(k, nper).mean(axis=1)
    slope = float((pm[-1] - pm[0]) / ((k - 1) * period_s)) if k >= 2 else 0.0
    resid = vs - slope * (ts - t0)
    cap = float(gts.pybamm.ParameterValues("Prada2013")["Nominal cell capacity [A.h]"])
    return {
        "window_s": [t0, t1],
        "n_solver_points": int(m.sum()),
        "v_pp_mv": float(1000 * np.ptp(vs)),
        "v_pp_detrended_mv": float(1000 * np.ptp(resid)),
        "v_soc_drift_mv_over_window": float(1000 * slope * (t1 - t0)),
        "n_full_periods_in_window": int(k),
        "v_min_v": float(vs.min()),
        "v_mean_v": float(vs.mean()),
        "i_cell_peak_c_rate": float(np.max(np.abs(i[m])) / cap),
    }


def reproduce_headline() -> dict:
    t, p = gts._build_power_profile(10.0, DT)
    lfp, _ = gts._split_with_lic(p, DT, tau_s=gts.SPLIT_FILTER_TAU_S)
    s_only = gts._simulate_lfp_cell(p, t)
    s_hyb = gts._simulate_lfp_cell(lfp, t)
    pp_only = gts._stable_window_pp(np.asarray(s_only["t"]), np.asarray(s_only["V_cell"]))
    pp_hyb = gts._stable_window_pp(np.asarray(s_hyb["t"]), np.asarray(s_hyb["V_cell"]))
    pub = {}
    for name in ("transient_lfp_only", "transient_hybrid"):
        d = json.loads((C.REPO / "packages" / "shared" / "scenarios" / f"{name}.json")
                       .read_text(encoding="utf-8"))
        pub[name] = {"v_cell_pp_stable": d["stats"]["v_cell_pp_stable"],
                     "pybamm_version": d["_meta"]["pybamm_version"]}
    ref_only = pub["transient_lfp_only"]["v_cell_pp_stable"]
    ref_hyb = pub["transient_hybrid"]["v_cell_pp_stable"]
    err_only = pp_only / ref_only - 1
    err_hyb = pp_hyb / ref_hyb - 1
    return {
        "method": "GTS _build_power_profile + _split_with_lic(τ=0.5, 首樣本初值) + _simulate_lfp_cell + _stable_window_pp(4–6 s)，原函式未改",
        "lfp_only_pp_mv": 1000 * pp_only,
        "hybrid_pp_mv": 1000 * pp_hyb,
        "ratio": pp_only / pp_hyb,
        "published": pub,
        "rel_err_lfp_only": err_only,
        "rel_err_hybrid": err_hyb,
        "tolerance": TOL,
        "pass": bool(abs(err_only) <= TOL and abs(err_hyb) <= TOL),
    }


def run_freq(f_hz: float) -> dict:
    T = 1.0 / f_hz
    warm = math.ceil(max(5 * WARM_TAU_MAX, 2 * T) / T - 1e-9) * T
    win = math.ceil(max(4.0, 2 * T) / T - 1e-9) * T
    n = int(round((warm + win) / DT)) + 1
    t = np.arange(n) * DT
    p = C.choukse_wave(t, f_hz, gts.RACK_POWER_KW, P_LOW_FRAC * gts.RACK_POWER_KW,
                       duty=DUTY, shape="square")
    i0, i1 = int(round(warm / DT)), int(round((warm + win) / DT))
    seed = float(np.mean(p[i0:i1]))
    out = {"f_hz": f_hz, "duration_s": float(t[-1]), "window_s": [warm, warm + win],
           "ema_seed_kw": seed, "cases": {}}
    t_start = time.perf_counter()
    s = gts._simulate_lfp_cell(p, t)
    out["cases"]["lfp_only"] = {**_window_stats(s, warm, warm + win, T),
                                "p_lfp_pp_kw": float(np.ptp(p[i0:i1]))}
    trace = {"lfp_only": s}
    for tau in TAUS:
        lfp = C.ema(p, DT, tau, seed)
        s = gts._simulate_lfp_cell(lfp, t)
        out["cases"][f"hybrid_tau{tau:g}"] = {**_window_stats(s, warm, warm + win, T),
                                              "tau_s": tau,
                                              "p_lfp_pp_kw": float(np.ptp(lfp[i0:i1]))}
        trace[f"hybrid_tau{tau:g}"] = s
    base = out["cases"]["lfp_only"]
    for k, c in out["cases"].items():
        if k == "lfp_only":
            continue
        c["pp_ratio_lfp_only_over_hybrid"] = base["v_pp_mv"] / c["v_pp_mv"]
        c["pp_ratio_detrended"] = base["v_pp_detrended_mv"] / c["v_pp_detrended_mv"]
    print(f"f={f_hz} Hz done in {time.perf_counter() - t_start:.1f} s")
    return out, trace, (t, p)


def plot(runs: list, traces: list) -> str:
    plt = C.setup_cjk_font()
    fig, axs = plt.subplots(1, len(runs), figsize=(4.4 * len(runs), 4.4), dpi=150)
    cols = {"lfp_only": "#444444", "hybrid_tau0.5": "#1f4e79",
            "hybrid_tau2": "#d08c1f", "hybrid_tau5": "#b22222"}
    labs = {"lfp_only": "純 LFP", "hybrid_tau0.5": "混合 τ=0.5 s",
            "hybrid_tau2": "混合 τ=2 s", "hybrid_tau5": "混合 τ=5 s"}
    for ax, r, tr in zip(axs, runs, traces):
        t0, t1 = r["window_s"]
        for k, s in tr.items():
            st, v = np.asarray(s["t"]), np.asarray(s["V_cell"])
            m = (st >= t0) & (st <= t1)
            pp = r["cases"][k]["v_pp_mv"]
            ax.plot(st[m] - t0, v[m], color=cols[k], lw=1.0, label=f"{labs[k]}（pp {pp:.1f} mV）")
        ax.set_title(f"{r['f_hz']:g} Hz，30%↔100% TDP 方波")
        ax.set_xlabel("穩態窗內時間（s）")
        ax.set_ylabel("LFP 電芯電壓（V）")
        ax.grid(True, alpha=0.3)
        ax.legend(fontsize=7, loc="lower right")
    fig.suptitle("PyBaMM DFN（Prada2013，GTS 電流映射）：LFP 電芯電壓峰對峰")
    fig.tight_layout()
    p = C.OUT_DIR / "a1_dfn_cases.png"
    fig.savefig(p, metadata={"Software": None})
    plt.close(fig)
    return str(p)


def main() -> int:
    rep = reproduce_headline()
    print(f"repro: lfp_only {rep['lfp_only_pp_mv']:.3f} mV (err {rep['rel_err_lfp_only']:+.2%}), "
          f"hybrid {rep['hybrid_pp_mv']:.3f} mV (err {rep['rel_err_hybrid']:+.2%}), pass={rep['pass']}")
    params = {"dt_s": DT, "freqs_hz": FREQS, "taus_s": TAUS, "p_low_frac": P_LOW_FRAC,
              "duty": DUTY, "rack_tdp_kw": gts.RACK_POWER_KW,
              "warmup_rule": "ceil(max(5·τmax, 2T)/T)·T，τmax=5 s，所有 τ 與純 LFP 用同一時間窗",
              "window_rule": "ceil(max(4 s, 2T)/T)·T",
              "ema_seed": "穩態窗平均功率", "dfn": "pybamm DFN, ParameterValues('Prada2013'), GTS _simulate_lfp_cell 原樣呼叫"}
    assumptions = [
        "假設：120 kW 機櫃、compute 100% / comm 30% TDP、50% duty 方波（Choukse 未給機櫃 kW、comm 百分比與 duty）。",
        "沿用 GTS 電流映射：104 kW 機櫃功率 → Prada2013 電芯 6 C；故 120 kW 峰值 → 6.92 C（超出 GTS 原設計點）。",
        "單一代表電芯，無熱模型、無 pack 不均；初始 SOC 為 Prada2013 預設值。",
        "v_pp_mv 為原始峰對峰（同 GTS 口徑）；v_pp_detrended_mv 以首末整週期平均電壓估 SOC 漂移斜率後扣除，兩者並列。",
    ]
    if not rep["pass"]:
        C.write_json("a1_dfn_cases.json", SCRIPT, params, assumptions,
                     {"reproduction": rep, "status": "STOPPED: reproduction outside ±2 %"})
        print("STOP: reproduction failed")
        return 2
    runs, traces = [], []
    for f in FREQS:
        r, tr, _ = run_freq(f)
        runs.append(r)
        traces.append(tr)
    fig = plot(runs, traces)
    out = C.write_json("a1_dfn_cases.json", SCRIPT, params, assumptions,
                       {"reproduction": rep, "choukse_square_cases": runs,
                        "figures": [Path(fig).name], "status": "OK"})
    print("wrote", out)
    for r in runs:
        b = r["cases"]["lfp_only"]
        line = f"f={r['f_hz']:<5} lfp_only {b['v_pp_mv']:.1f} mV"
        for k, c in r["cases"].items():
            if k != "lfp_only":
                line += f" | {k} {c['v_pp_mv']:.1f} mV ×{c['pp_ratio_lfp_only_over_hybrid']:.2f}"
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
