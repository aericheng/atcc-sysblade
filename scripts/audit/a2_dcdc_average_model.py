"""A2-1 — 雙向 buck-boost DC-DC 平均模型：把「計入 DC-DC 約 2.4–3.9×」補成可重跑的腳本。

定稿:82 的「2.4–3.9×」原本只出自 docs/product_realization/01_product_review.md:90 的一句估計，
且該區間是把「功率 RMS 3.1–3.9×」與「電壓 pp 2.4–3.2×」兩種指標合併。本腳本把兩種指標分開算。

模型（rack 層級、平均值模型，非開關模型）：
  * 負載 P_load(t)：80 kW ±30 % 方波（與 generate_twin_scenarios.py 的 demo 波形同型），
    方波頻率 f_w 掃 {0.25, 1, 5, 50, 200} Hz（5 Hz = repo demo 波形）。
  * 外環：與 repo 相同的一階 EMA（τ = 0.5 s）；HPF 指令 P_hpf = P_load − LPF(P_load)。
  * LIC SOC 回復項：P_soc = C·V_ref·(V_oc − V_ref)/τ_soc（V_oc 高於設定點就多放、低於就回充）。
  * 數位控制：取樣 50 µs（假設），電流命令延遲一個取樣週期後才送進內環（避免與負載邊緣零延遲同步）。
  * 積分步長 dt = 50 µs / n，dt ≤ min(週期/800, 1/(50·f_bw))；dt 減半做收斂測試，結果寫入 JSON。
  * 「3.1×／3.9×／200 Hz 達 1.5×」所需 f_bw 以密掃求得（非粗網格內插）。
  * DC-DC 電流內環：一階，頻寬 f_bw（假設）；LIC 側電流上限 I_max（假設）；效率 η（假設，
    放電時 P_bus = η·P_term，充電時 P_term = η·P_bus）。
  * LIC：RC（C、ESR，沿用 repo 的 2×Eaton 參數 332 F / 2.5 mΩ），初始 V_oc = V_ref。
  * LFP：rack 等效 Thevenin（R0 + R1‖C1），由 PyBaMM DFN (Prada2013) 3C 脈衝擬合後依
    repo 的 cell→pack 映射放大；LFP 直接掛在共用 bus 上，殘差功率 P_lfp = P_load − P_dcdc,bus
    由 LFP 承擔；bus KVL：V_bus = E − R0·P_lfp/V_bus（解二次式）。
輸出兩個倍率（不混成一個區間）：
  * power_std_ratio  = std(P_load) / std(P_lfp)        （穩態視窗）
  * vbus_pp_ratio    = pp(V_bus | 無 LIC) / pp(V_bus | 混合)（穩態視窗）

Usage:
    .venv/Scripts/python scripts/audit/a2_dcdc_average_model.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from a2_common import (OUT_DIR, SPLIT_TAU_S, fit_prada_thevenin, lpf, meta,  # noqa: E402
                       rack_thevenin_from_cell, setup_cjk, write_json)

SCRIPT = "scripts/audit/a2_dcdc_average_model.py"

P0_KW = 80.0
AMP = 0.30
F_WAVE_HZ = [0.25, 1.0, 5.0, 50.0, 200.0]
F_BW_HZ = [5.0, 10.0, 20.0, 50.0, 100.0, 1000.0]
ETAS = [0.95, 0.97]

# Assumptions (all labelled 假設 in JSON)
LIC_C_F = 332.0          # repo bank (2 x Eaton 166 F) — generate_twin_scenarios.py:80-86
LIC_ESR_OHM = 0.0025     # repo bank
LIC_V_REF_V = 40.0       # 假設：中段 SOC 設定點（< Eaton 48.6 V 上限；能量 SOC ≈ 68 %）
TAU_SOC_S = 10.0         # 假設：SOC 回復時間常數
I_MAX_A = 1500.0         # 假設：DC-DC LIC 側電流上限（≈ 60 kW @ 40 V）
BUS_V_FLOOR = 46.0       # docs/product_realization/03_product_spec.md:77 「busbar 不低於 46 V」
THEVENIN_FIT_C = 3.0     # demo 波形 LFP 約 3–5C（repo 映射）


def square(t: np.ndarray, f_hz: float) -> np.ndarray:
    # identical phase convention to generate_twin_scenarios.py demo (starts at -1)
    return (np.floor(2.0 * f_hz * t).astype(int) % 2) * 2 - 1


T_CTRL_S = 50e-6     # 假設：數位控制取樣週期 50 µs（20 kHz）；電流命令延遲一個取樣週期
F_BW_DENSE_5HZ = list(np.round(np.arange(15.0, 60.0 + 1e-9, 0.5), 3))
F_BW_DENSE_200HZ = list(np.round(np.arange(150.0, 450.0 + 1e-9, 5.0), 3))


def n_sub(f_w: float, f_bw_max: float, refine: int = 1) -> int:
    """Integration sub-steps per control period: dt = T_CTRL/n with
    dt <= min(period/800, 1/(50*f_bw_max)); `refine` multiplies n (convergence test)."""
    dt_need = min(1.0 / (f_w * 800.0), 1.0 / (50.0 * f_bw_max))
    return int(np.ceil(T_CTRL_S / dt_need - 1e-9)) * refine


def sim_grid(f_w: float, n: int) -> tuple[np.ndarray, float, float]:
    dur = 24.0 if f_w < 0.5 else 12.0
    dt = T_CTRL_S / n
    t = np.arange(0.0, dur, dt)
    return t, dt, dur / 2.0  # steady window = second half


def thevenin_vbus(p_lfp_w, e, r0):
    disc = np.maximum(e * e - 4.0 * r0 * p_lfp_w, 0.0)
    return 0.5 * (e + np.sqrt(disc))


class Acc:
    """Online mean/std/min/max (offset-shifted sums for numerical stability)."""

    def __init__(self, n_case, ref):
        self.ref = ref
        self.s1 = np.zeros(n_case); self.s2 = np.zeros(n_case); self.n = 0
        self.mn = np.full(n_case, np.inf); self.mx = np.full(n_case, -np.inf)

    def add(self, x):
        d = x - self.ref
        self.s1 += d; self.s2 += d * d; self.n += 1
        self.mn = np.minimum(self.mn, x); self.mx = np.maximum(self.mx, x)

    def mean(self):
        return self.ref + self.s1 / self.n

    def std(self):
        m = self.s1 / self.n
        return np.sqrt(np.maximum(self.s2 / self.n - m * m, 0.0))

    def pp(self):
        return self.mx - self.mn


def run_lfp_only(p_w: np.ndarray, dt: float, th: dict, k_ss: int) -> dict:
    """V_bus when the LFP rack carries the whole load (no LIC)."""
    r0, r1, tau1, ocv = th["r0_rack_ohm"], th["r1_rack_ohm"], th["tau1_s"], th["ocv_rack_v"]
    ed = np.exp(-dt / tau1)
    v1 = p_w[0] / thevenin_vbus(p_w[0], ocv, r0 + r1) * r1
    acc = Acc(1, 50.0)
    vmin = np.inf
    for k in range(len(p_w)):
        v = thevenin_vbus(p_w[k], ocv - v1, r0)
        vmin = min(vmin, v)
        if k >= k_ss:
            acc.add(np.array([v]))
        v1 = v1 * ed + (p_w[k] / v) * r1 * (1 - ed)
    return {"pp": float(acc.pp()[0]), "std": float(acc.std()[0]), "min": float(vmin)}


def run_hybrid(p_w: np.ndarray, n: int, th: dict, f_bw: np.ndarray, eta: np.ndarray,
               k_ss: int, ideal: bool = False) -> dict:
    """Vectorised over cases. dt = T_CTRL/n. Non-ideal: the LIC current command computed
    from measurements at step k is applied at step k+n (one control-period delay)."""
    dt = T_CTRL_S / n
    n_case = len(f_bw)
    r0, r1, tau1, ocv = th["r0_rack_ohm"], th["r1_rack_ohm"], th["tau1_s"], th["ocv_rack_v"]
    ed = np.exp(-dt / tau1)
    a_lpf = dt / (SPLIT_TAU_S + dt)
    b_loop = 1.0 - np.exp(-2 * np.pi * f_bw * dt)
    y = p_w[0]  # repo seeds EMA at first sample
    i = np.zeros(n_case)
    voc = np.full(n_case, LIC_V_REF_V)
    v1 = np.full(n_case, p_w[0] / thevenin_vbus(p_w[0], ocv, r0 + r1) * r1)
    buf = np.zeros((n, n_case))  # command delay line (n steps = T_CTRL)
    k_soc = LIC_C_F * LIC_V_REF_V / TAU_SOC_S
    a_pl = Acc(n_case, P0_KW * 1000.0)
    a_vb = Acc(n_case, 50.0)
    i2 = np.zeros(n_case); n_ss = 0
    vb_min = np.full(n_case, np.inf); vl_min = np.full(n_case, np.inf); vl_max = np.full(n_case, -np.inf)
    i_pk = np.zeros(n_case); pb_pk = np.zeros(n_case); n_lim = np.zeros(n_case)
    for k in range(len(p_w)):
        p = p_w[k]
        if k > 0:
            y = a_lpf * p + (1 - a_lpf) * y
        p_hpf = p - y
        if ideal:
            ik = np.full(n_case, p_hpf) / voc
            pb = np.full(n_case, p_hpf)
        else:
            p_cmd = p_hpf + k_soc * (voc - LIC_V_REF_V)
            p_term_cmd = np.where(p_cmd > 0, p_cmd / eta, p_cmd * eta)
            slot = k % n
            i_cmd = buf[slot].copy()          # command issued n steps (= T_CTRL) ago
            buf[slot] = p_term_cmd / voc      # new command from current measurement
            i = i + (i_cmd - i) * b_loop
            i = np.clip(i, -I_MAX_A, I_MAX_A)
            ik = i
            p_term = (voc - ik * LIC_ESR_OHM) * ik
            pb = np.where(p_term > 0, p_term * eta, p_term / eta)
        vl = voc - ik * LIC_ESR_OHM
        voc = voc - ik * dt / LIC_C_F
        pl = p - pb
        v = thevenin_vbus(pl, ocv - v1, r0)
        v1 = v1 * ed + (pl / v) * r1 * (1 - ed)
        vb_min = np.minimum(vb_min, v); vl_min = np.minimum(vl_min, vl); vl_max = np.maximum(vl_max, vl)
        aik = np.abs(ik)
        i_pk = np.maximum(i_pk, aik); pb_pk = np.maximum(pb_pk, np.abs(pb)); n_lim += aik >= I_MAX_A - 1e-6
        if k >= k_ss:
            a_pl.add(pl); a_vb.add(v); i2 += ik * ik; n_ss += 1
    return {"pl_std": a_pl.std(), "pl_pp": a_pl.pp(), "pl_mean": a_pl.mean(),
            "vb_std": a_vb.std(), "vb_pp": a_vb.pp(), "vb_min": vb_min,
            "vl_min": vl_min, "vl_max": vl_max, "i_rms_ss": np.sqrt(i2 / n_ss), "i_pk": i_pk,
            "frac_lim": n_lim / len(p_w), "pb_pk": pb_pk}


def sweep(f_w: float, fbws: list[float], etas: list[float], th: dict, refine: int = 1) -> dict:
    cases = [(fb, e) for e in etas for fb in fbws]
    fb_arr = np.array([c[0] for c in cases]); e_arr = np.array([c[1] for c in cases])
    n = n_sub(f_w, max(fbws), refine)
    t, dt, t_ss = sim_grid(f_w, n)
    k_ss = int(np.searchsorted(t, t_ss))
    p_w = P0_KW * 1000.0 * (1 + AMP * square(t, f_w))
    m = t >= t_ss
    std_load = float(np.std(p_w[m]))
    tic = time.time()
    base = run_lfp_only(p_w, dt, th, k_ss)
    r = run_hybrid(p_w, n, th, fb_arr, e_arr, k_ss)
    print(f"[a2-1] f_w={f_w:g} Hz, {len(cases)} cases, dt={dt*1e6:.2f} us ({len(t)} steps): {time.time()-tic:.1f}s")
    rows = []
    for j, (fb, e) in enumerate(cases):
        rows.append({
            "f_wave_hz": f_w, "f_bw_hz": fb, "eta": e, "dt_s": dt,
            "power_std_ratio": std_load / float(r["pl_std"][j]),
            "vbus_pp_ratio": base["pp"] / float(r["vb_pp"][j]),
            "vbus_std_ratio": base["std"] / float(r["vb_std"][j]),
            "lfp_power_pp_kw": float(r["pl_pp"][j] / 1000.0),
            "load_power_pp_kw": float(np.ptp(p_w[m]) / 1000.0),
            "vbus_pp_v": float(r["vb_pp"][j]),
            "vbus_min_v": float(r["vb_min"][j]),
            "vbus_pp_lfp_only_v": base["pp"], "vbus_min_lfp_only_v": base["min"],
            "lic_v_min_v": float(r["vl_min"][j]), "lic_v_max_v": float(r["vl_max"][j]),
            "lic_i_rms_ss_a": float(r["i_rms_ss"][j]), "lic_i_peak_a": float(r["i_pk"][j]),
            "frac_time_current_limited": float(r["frac_lim"][j]),
            "dcdc_bus_power_peak_kw": float(r["pb_pk"][j] / 1000.0),
            "lfp_mean_power_kw_ss": float(r["pl_mean"][j] / 1000.0),
        })
    return {"rows": rows, "dt": dt, "n": n, "std_load": std_load, "p_w": p_w, "t": t, "k_ss": k_ss, "base": base}


def first_crossing(rows, key, eta, target):
    """f_bw where `key` first reaches `target` on a dense monotone sweep (linear interp between
    adjacent dense points). None if never reached."""
    rr = sorted([r for r in rows if r["eta"] == eta], key=lambda r: r["f_bw_hz"])
    x = np.array([r["f_bw_hz"] for r in rr]); y = np.array([r[key] for r in rr])
    idx = np.flatnonzero(y >= target)
    if len(idx) == 0 or idx[0] == 0:
        return None
    i = idx[0]
    return float(x[i - 1] + (x[i] - x[i - 1]) * (target - y[i - 1]) / (y[i] - y[i - 1]))


def main() -> int:
    t0 = time.time()
    fits = {f"{c:g}C": fit_prada_thevenin(c) for c in (1.0, 3.0, 6.0)}
    cell = fits[f"{THEVENIN_FIT_C:g}C"]
    th = rack_thevenin_from_cell(cell)
    print(f"[a2-1] Thevenin rack: R0={th['r0_rack_ohm']*1e3:.3f} mOhm R1={th['r1_rack_ohm']*1e3:.3f} mOhm "
          f"tau1={th['tau1_s']:.3f}s OCV={th['ocv_rack_v']:.2f} V")

    results, ideal_rows, conv = [], [], {}
    for f_w in F_WAVE_HZ:
        s = sweep(f_w, F_BW_HZ, ETAS, th)
        results += s["rows"]
        # ideal lossless/instant case: no fast loop, so dt only needs period/800
        n_id = n_sub(f_w, 1.0)
        t_id, dt_id, t_ss_id = sim_grid(f_w, n_id)
        k_id = int(np.searchsorted(t_id, t_ss_id))
        p_id = P0_KW * 1000.0 * (1 + AMP * square(t_id, f_w))
        b_id = run_lfp_only(p_id, dt_id, th, k_id)
        r_id = run_hybrid(p_id, n_id, th, np.array([np.inf]), np.array([1.0]), k_id, ideal=True)
        ideal_rows.append({
            "f_wave_hz": f_w, "dt_s": dt_id,
            "power_std_ratio": float(np.std(p_id[k_id:])) / float(r_id["pl_std"][0]),
            "vbus_pp_ratio": b_id["pp"] / float(r_id["vb_pp"][0]),
            "vbus_std_ratio": b_id["std"] / float(r_id["vb_std"][0]),
        })
        if f_w in (5.0, 200.0):  # convergence test: halve dt (and keep T_CTRL delay fixed)
            s2 = sweep(f_w, F_BW_HZ, ETAS, th, refine=2)
            keys = ["power_std_ratio", "vbus_pp_ratio", "vbus_std_ratio", "vbus_min_v", "dcdc_bus_power_peak_kw"]
            worst = {k: max(abs(b[k] - a[k]) / abs(a[k]) for a, b in zip(s["rows"], s2["rows"])) for k in keys}
            conv[f"f_wave_{f_w:g}hz_grid"] = {"dt_s": s["dt"], "dt_half_s": s2["dt"],
                                              "max_rel_change": worst, "pass_lt_1pct": bool(max(worst.values()) < 0.01)}

    # Dense f_bw sweeps for the review-doc thresholds (replaces log-interp on the coarse grid)
    d5 = sweep(5.0, F_BW_DENSE_5HZ, ETAS, th)
    d200 = sweep(200.0, F_BW_DENSE_200HZ, ETAS, th)
    claim_map = {}
    for eta in ETAS:
        claim_map[f"eta_{eta}"] = {
            "f_wave_5hz_power_std_3.1x_at_fbw_hz": first_crossing(d5["rows"], "power_std_ratio", eta, 3.1),
            "f_wave_5hz_power_std_3.9x_at_fbw_hz": first_crossing(d5["rows"], "power_std_ratio", eta, 3.9),
            "f_wave_200hz_power_std_1.5x_at_fbw_hz": first_crossing(d200["rows"], "power_std_ratio", eta, 1.5),
            "f_wave_5hz_vbus_pp_ratio_max_over_coarse_grid_le_1khz": max(
                r["vbus_pp_ratio"] for r in results if r["f_wave_hz"] == 5.0 and r["eta"] == eta),
            "f_wave_5hz_vbus_pp_2.4x_reached_le_1khz": any(
                r["vbus_pp_ratio"] >= 2.4 for r in results if r["f_wave_hz"] == 5.0 and r["eta"] == eta),
            "method": "密掃 f_bw（5 Hz：15–60 Hz 每 0.5 Hz；200 Hz：150–450 Hz 每 5 Hz），相鄰點線性內插",
        }
    # Convergence of the thresholds: re-run a narrow dense band at dt/2
    thr_conv = {}
    for key, f_w, tgt, step in [("f_wave_5hz_power_std_3.1x_at_fbw_hz", 5.0, 3.1, 0.5),
                                ("f_wave_5hz_power_std_3.9x_at_fbw_hz", 5.0, 3.9, 0.5),
                                ("f_wave_200hz_power_std_1.5x_at_fbw_hz", 200.0, 1.5, 5.0)]:
        xs = [claim_map[f"eta_{e}"][key] for e in ETAS if claim_map[f"eta_{e}"][key] is not None]
        if not xs:
            continue
        lo = np.floor(min(xs) / step) * step - step
        hi = np.ceil(max(xs) / step) * step + step
        band = list(np.round(np.arange(lo, hi + 1e-9, step), 3))
        sb = sweep(f_w, band, ETAS, th, refine=2)
        for e in ETAS:
            x0 = claim_map[f"eta_{e}"][key]
            x1 = first_crossing(sb["rows"], "power_std_ratio", e, tgt)
            thr_conv[f"eta_{e}:{key}"] = {"base_dt": x0, "half_dt": x1, "band_hz": band,
                                          "rel_change": (abs(x1 - x0) / x0) if (x0 and x1) else None}
    conv["thresholds"] = thr_conv
    conv["pass_all_lt_1pct"] = bool(all(v["pass_lt_1pct"] for k, v in conv.items() if k.endswith("_grid"))
                                    and all((v["rel_change"] is not None and v["rel_change"] < 0.01) for v in thr_conv.values()))

    # Repo-definition cross-check: 5 Hz demo, dt=0.005, std over FULL 10 s window, EMA seeded at p[0]
    dt_r = 0.005
    t_r = np.arange(0, 10 + dt_r, dt_r)
    p_r = P0_KW * (1 + AMP * square(t_r, 5.0))
    lfp_r = lpf(p_r, dt_r, SPLIT_TAU_S, p_r[0])
    repo_def = {
        "power_std_ratio_full_window": float(np.std(p_r) / np.std(lfp_r)),
        "power_std_ratio_t_ge_4s": float(np.std(p_r[t_r >= 4]) / np.std(lfp_r[t_r >= 4])),
        "note": "full-window value reproduces repo 5.72x (includes EMA start transient); steady value is the ideal lossless upper bound",
    }

    payload = {
        "_meta": meta(SCRIPT, {
            "p0_kw": P0_KW, "amplitude": AMP, "f_wave_hz": F_WAVE_HZ, "f_bw_hz": F_BW_HZ, "eta": ETAS,
            "f_bw_dense_5hz": F_BW_DENSE_5HZ, "f_bw_dense_200hz": F_BW_DENSE_200HZ,
            "split_tau_s": SPLIT_TAU_S, "lic_c_f": LIC_C_F, "lic_esr_ohm": LIC_ESR_OHM,
            "lic_v_ref_v": LIC_V_REF_V, "tau_soc_s": TAU_SOC_S, "i_max_a": I_MAX_A,
            "t_ctrl_s": T_CTRL_S,
            "thevenin_fit_c_rate": THEVENIN_FIT_C, "steady_window": "second half of run (6 s; 12 s for 0.25 Hz)",
            "dt_rule": "dt = T_CTRL/n, n = ceil(T_CTRL / min(period/800, 1/(50*max f_bw in the sweep))); first-order blocks discretised exactly (exp); convergence test at dt/2",
        }, [
            "假設：DC-DC 電流迴路為一階、頻寬 f_bw（未設計功率級，非量測值）",
            "假設：數位控制取樣 50 µs（20 kHz），電流命令延遲一個取樣週期（不與負載邊緣同步零延遲反應）",
            "假設：DC-DC 效率 η ∈ {0.95, 0.97}，與功率無關的常數",
            "假設：LIC 側電流上限 1500 A；SOC 設定點 40 V、回復時間常數 10 s",
            "假設：LFP rack 直接掛 bus（其 BBU 輸出級視為直通），Thevenin 由 DFN 3C 脈衝擬合，忽略 OCV 漂移與 R 對電流的非線性（1C/6C 擬合值另列）",
            "LIC 沿用 repo 的 2×Eaton 166 F / 2.5 mΩ RC 等效（Eaton 為 EDLC，非 LIC）",
            "平均值模型：無開關漣波、無死區、無電感飽和、無 bus 大電容",
        ], [
            "power_std_ratio 與 vbus_pp_ratio 是兩種不同指標，不可合併成一個區間",
            "vbus_pp_ratio 為瞬時峰峰值：本模型無 bus 大電容、負載為理想方波，迴路有限頻寬時每個邊緣 LFP 瞬間承擔最多 2 倍階躍（LIC 尚未反向），故 pp 可 <1；vbus_std_ratio 另列供對照",
            "repo 的 5.72x 是 10 s 全視窗 std（含 EMA 啟動暫態），本檔穩態理想值見 ideal_lossless",
            "v1（2026-10-09 首版）dt 未隨 f_bw 縮小、命令零延遲、門檻以粗網格 log 內插，已由本版取代",
        ]),
        "thevenin": {"cell_fits": fits, "rack": th, "bus_v_floor_v": BUS_V_FLOOR,
                     "bus_v_floor_source": "docs/product_realization/03_product_spec.md:77"},
        "repo_definition_crosscheck_5hz": repo_def,
        "ideal_lossless": ideal_rows,
        "grid": results,
        "dense_sweep_5hz": d5["rows"],
        "dense_sweep_200hz": d200["rows"],
        "claim_mapping_5hz_demo": claim_map,
        "convergence": conv,
    }
    write_json("a2_dcdc_average_model.json", payload)
    plot(results, ideal_rows)
    print(f"[a2-1] done in {time.time()-t0:.1f}s")
    for k, v in claim_map.items():
        print(k, v)
    print("convergence", json.dumps(conv, ensure_ascii=False)[:1500])
    return 0


def plot(results, ideal_rows):
    plt = setup_cjk()
    fig, axes = plt.subplots(2, 2, figsize=(13, 9.5))
    for col, eta in enumerate(ETAS):
        for row, (key, title) in enumerate([("power_std_ratio", "LFP 功率標準差倍率 std(P_load)/std(P_LFP)"),
                                            ("vbus_pp_ratio", "bus 電壓峰峰值倍率 pp(無 LIC)/pp(混合)；<1 表示比無 LIC 更差")]):
            ax = axes[row, col]
            M = np.array([[next(r[key] for r in results if r["f_wave_hz"] == fw and r["f_bw_hz"] == fb and r["eta"] == eta)
                           for fw in F_WAVE_HZ] for fb in F_BW_HZ])
            im = ax.imshow(M, origin="lower", cmap="viridis", aspect="auto", vmin=1.0, vmax=max(6.0, float(np.nanmax(M))))
            for i in range(len(F_BW_HZ)):
                for j in range(len(F_WAVE_HZ)):
                    ax.text(j, i, f"{M[i, j]:.2f}×", ha="center", va="center",
                            color="white" if M[i, j] < 3.5 else "black", fontsize=10)
            ax.set_xticks(range(len(F_WAVE_HZ)), [f"{f:g}" for f in F_WAVE_HZ])
            ax.set_yticks(range(len(F_BW_HZ)), [f"{f:g}" for f in F_BW_HZ])
            ax.set_xlabel("負載方波頻率 f_w [Hz]（5 Hz = repo 示範波形）")
            ax.set_ylabel("電流迴路頻寬 f_bw [Hz]（假設）")
            ideal = "  ".join(f"{r['f_wave_hz']:g}Hz:{r[key]:.1f}" for r in ideal_rows)
            ax.set_title(f"{title}\nη={eta}（假設）｜理想無損上界 {ideal}", fontsize=9.5)
            fig.colorbar(im, ax=ax, fraction=0.046)
    fig.suptitle("A2-1 雙向 DC-DC 平均模型：倍率對迴路頻寬與波形頻率（穩態視窗；兩指標分開）", fontsize=12)
    fig.tight_layout()
    out = OUT_DIR / "a2_dcdc_heatmap.png"
    fig.savefig(out, dpi=110)
    print(f"[a2-1] -> {out}")


if __name__ == "__main__":
    sys.exit(main())
