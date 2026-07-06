"""H3 bench calibration — replace datasheet/Prada2013 anchors with MEASURED params.

Ingests CSV logs from a cell cycler / programmable electronic load (measured on
the actual LFP cell + LIC module 系統電 provides), extracts the lumped parameters
the twin actually uses, and re-checks that the V1/V2 predictions still hold once
the model is fed measured values instead of datasheet / Prada2013 anchors.

This converts the twin's evidence from "model vs literature" into "model vs
measured on real hardware" — the single biggest credibility upgrade available
without an STM32N6 board.

What it measures (mapped to the model parameters they replace):
  - LIC  : C (F), ESR (mOhm)         -> eval_lic_rc_fit.py BANK_C_F / BANK_ESR_OHM
  - Cell : capacity (Ah), DCIR (mOhm)-> aging DCIR growth anchor; pack runtime
  - Cell : OCV-SOC (best effort)     -> reference curve

Expected CSV columns (see docs/hardware_characterization_protocol.md):
  LIC step test      : t_s, i_a, v_v[, temp_c]
  Cell capacity test : t_s, i_a, v_v[, temp_c]
  Cell DCIR pulses   : t_s, i_a, v_v[, soc_pct]

Usage:
    # verify the pipeline works BEFORE you have hardware (synthetic round-trip):
    .venv/Scripts/python scripts/calibrate_from_measured.py --selftest

    # write empty CSV templates with the exact headers for the lab:
    .venv/Scripts/python scripts/calibrate_from_measured.py --make-template

    # real run once you have bench data:
    .venv/Scripts/python scripts/calibrate_from_measured.py \
        --lic data/raw/measured/lic_step.csv \
        --cell-capacity data/raw/measured/cell_capacity.csv \
        --cell-dcir data/raw/measured/cell_dcir.csv

Outputs data/processed/measured_calibration.json
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
RAW_DIR = REPO / "data" / "raw" / "measured"
OUT_JSON = REPO / "data" / "processed" / "measured_calibration.json"
OUT_PNG = REPO / "data" / "processed" / "measured_calibration.png"

# Reuse the V2 LIC RC model so the recomputed droop stays numerically in sync
# with scripts/eval_lic_rc_fit.py (single source of truth for the model).
sys.path.insert(0, str(REPO / "scripts"))
import eval_lic_rc_fit as v2  # noqa: E402

_TRAPZ = getattr(np, "trapezoid", np.trapz)  # np.trapz removed in numpy 2.0

# Tolerance bands for the calibration verdict (measured vs model anchor).
# These are "is the measured hardware in the same ballpark as the anchor" gates,
# not accuracy claims — the honest result is the measured number either way.
LIC_C_TOL_PCT = 20.0
LIC_ESR_TOL_PCT = 30.0
CELL_CAP_TOL_PCT = 10.0


# --------------------------------------------------------------------------- #
# CSV loading                                                                  #
# --------------------------------------------------------------------------- #
def _load_csv(path: Path) -> dict[str, np.ndarray]:
    """Load a measured CSV with a header row into a dict of float columns."""
    arr = np.genfromtxt(path, delimiter=",", names=True, dtype=float)
    if arr.dtype.names is None:
        raise ValueError(f"{path}: could not parse header row (need names like t_s,i_a,v_v)")
    cols = {name: np.atleast_1d(arr[name]).astype(float) for name in arr.dtype.names}
    for req in ("t_s", "i_a", "v_v"):
        if req not in cols:
            raise ValueError(f"{path}: missing required column '{req}' (have {list(cols)})")
    n = len(cols["t_s"])
    if n < 5:
        raise ValueError(f"{path}: only {n} rows — need a proper time series")
    return cols


# --------------------------------------------------------------------------- #
# LIC: capacitance + ESR from a constant-current step                          #
# --------------------------------------------------------------------------- #
def extract_lic_params(cols: dict[str, np.ndarray], i_step_hint: float | None = None) -> dict:
    """Extract C (F) and ESR (Ohm) from a constant-current discharge step.

    Physics during a constant-current discharge of magnitude I:
        V(t) = V0 - I*ESR - (I / C) * t
    -> the instantaneous ohmic jump at the step edge gives ESR = dV_jump / I
    -> the linear ramp slope during the step gives C = I / |dV/dt|
    """
    t = cols["t_s"]
    i = np.abs(cols["i_a"])
    v = cols["v_v"]

    i_load = i_step_hint if i_step_hint else float(np.median(i[i > 0.5 * i.max()]))
    on_mask = i > 0.5 * i_load
    if on_mask.sum() < 3:
        raise ValueError("LIC step: could not locate a constant-current discharge window")

    on_idx = np.where(on_mask)[0]
    k_on, k_off = on_idx[0], on_idx[-1]

    # ESR from the ohmic jump at step-on (V just before vs first established sample).
    v_pre = float(np.median(v[max(0, k_on - 3):k_on])) if k_on >= 1 else float(v[0])
    v_post = float(v[k_on])
    esr_on = (v_pre - v_post) / i_load if i_load else float("nan")
    # ESR from the ohmic recovery at step-off (symmetry check).
    v_last = float(v[k_off])
    v_rec = float(np.median(v[k_off + 1:k_off + 4])) if k_off + 1 < len(v) else v_last
    esr_off = (v_rec - v_last) / i_load if i_load else float("nan")
    esr = float(np.nanmean([e for e in (esr_on, esr_off) if np.isfinite(e) and e > 0]))

    # C from the ramp slope over the steady part of the step (trim edges).
    pad = max(1, int(0.1 * len(on_idx)))
    seg = on_idx[pad:-pad] if len(on_idx) > 2 * pad else on_idx
    slope = float(np.polyfit(t[seg], v[seg], 1)[0])  # dV/dt < 0
    c_f = i_load / abs(slope) if slope else float("nan")

    return {
        "i_step_a": i_load,
        "esr_on_ohm": esr_on,
        "esr_off_ohm": esr_off,
        "esr_ohm": esr,
        "esr_mohm": esr * 1000.0,
        "capacitance_f": c_f,
        "ramp_slope_v_per_s": slope,
        "window_s": [float(t[k_on]), float(t[k_off])],
    }


def recompute_lic_droop(c_module_f: float, esr_module_ohm: float, n_parallel: int) -> dict:
    """Re-run the V2 droop sim with MEASURED per-module C/ESR vs the datasheet anchor.

    Bank scaling for n parallel identical modules: C_bank = n*C, ESR_bank = ESR/n.
    """
    t = np.linspace(0, 60.0, 6001)
    p = v2._bbu_duty_profile(t)

    c_bank_meas = n_parallel * c_module_f
    esr_bank_meas = esr_module_ohm / n_parallel

    v_model = v2._simulate_simple_rc(p, t, v2.BANK_C_F, v2.BANK_ESR_OHM, v2.V_NOMINAL_V)
    v_meas = v2._simulate_simple_rc(p, t, c_bank_meas, esr_bank_meas, v2.V_NOMINAL_V)

    d_model = v2._droop_stats(v_model, v2.V_NOMINAL_V)
    d_meas = v2._droop_stats(v_meas, v2.V_NOMINAL_V)
    return {
        "n_parallel_assumed": n_parallel,
        "bank_c_f": {"datasheet": v2.BANK_C_F, "measured": c_bank_meas},
        "bank_esr_ohm": {"datasheet": v2.BANK_ESR_OHM, "measured": esr_bank_meas},
        "droop_v": {"datasheet": d_model["droop_v"], "measured": d_meas["droop_v"]},
        "headroom_to_uvlo_v": {
            "datasheet": d_model["headroom_to_uvlo_v"],
            "measured": d_meas["headroom_to_uvlo_v"],
        },
        "measured_passes_uvlo": bool(d_meas["headroom_to_uvlo_v"] > 0),
        "droop_delta_v": float(d_meas["droop_v"] - d_model["droop_v"]),
    }


# --------------------------------------------------------------------------- #
# Cell: capacity + DCIR                                                        #
# --------------------------------------------------------------------------- #
def extract_cell_capacity(cols: dict[str, np.ndarray]) -> dict:
    """Coulomb-count the discharge portion of a CC capacity test."""
    t = cols["t_s"]
    i = cols["i_a"]
    v = cols["v_v"]
    dis = i < -0.05 * np.abs(i).max()  # discharge = negative current
    if dis.sum() < 3:
        # fall back: treat |i| as discharge magnitude if sign convention is positive
        dis = np.abs(i) > 0.05 * np.abs(i).max()
    i_mag = np.abs(i[dis])
    t_dis = t[dis]
    ah = float(_TRAPZ(i_mag, t_dis) / 3600.0)
    wh = float(_TRAPZ(np.abs(v[dis]) * i_mag, t_dis) / 3600.0)
    return {
        "capacity_ah": ah,
        "energy_wh": wh,
        "v_start_v": float(v[dis][0]),
        "v_end_v": float(v[dis][-1]),
        "mean_discharge_a": float(i_mag.mean()),
    }


def extract_dcir(cols: dict[str, np.ndarray]) -> dict:
    """Extract ohmic DCIR (R0) from each current pulse: R = dV_edge / dI."""
    t = cols["t_s"]
    i = cols["i_a"]
    v = cols["v_v"]
    soc = cols.get("soc_pct")

    di = np.diff(i)
    mag = np.abs(di)
    thr = 0.3 * mag.max() if mag.max() > 0 else 0.0
    # Discharge-pulse ONSET = |current| steps up; gives the clean ohmic R0 jump.
    # Using onset edges only (not the recovery edge) is sign-convention robust.
    onset = (np.abs(i[1:]) > np.abs(i[:-1])) & (mag > thr)
    edges = np.where(onset)[0]
    pulses = []
    for k in edges:
        d_i = float(i[k + 1] - i[k])
        d_v = float(v[k + 1] - v[k])
        if abs(d_i) < 1e-6:
            continue
        r0 = abs(d_v / d_i)
        pulses.append({
            "t_s": float(t[k]),
            "delta_i_a": d_i,
            "delta_v_v": d_v,
            "dcir_r0_ohm": r0,
            "dcir_r0_mohm": r0 * 1000.0,
            "soc_pct": (float(soc[k]) if soc is not None else None),
        })
    r0_vals = [p["dcir_r0_mohm"] for p in pulses]
    return {
        "n_pulses": len(pulses),
        "dcir_r0_mohm_mean": float(np.mean(r0_vals)) if r0_vals else None,
        "dcir_r0_mohm_min": float(np.min(r0_vals)) if r0_vals else None,
        "dcir_r0_mohm_max": float(np.max(r0_vals)) if r0_vals else None,
        "pulses": pulses,
    }


# --------------------------------------------------------------------------- #
# Templates + self-test                                                        #
# --------------------------------------------------------------------------- #
def _write_cols_csv(path: Path, cols: dict[str, np.ndarray], order: list[str]) -> None:
    import csv
    n = len(cols[order[0]])
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(order)
        for k in range(n):
            w.writerow([f"{float(cols[c][k]):.6g}" for c in order])


def _synth_cell_capacity_csv(cap_ah: float, i_dis: float) -> dict[str, np.ndarray]:
    dur = cap_ah / i_dis * 3600.0
    t = np.linspace(0, dur, 1200)
    v = np.linspace(3.50, 2.50, len(t))
    rng = np.random.default_rng(1)
    v = v + rng.normal(0, 2e-3, size=v.shape)
    return {"t_s": t, "i_a": np.full_like(t, -i_dis), "v_v": v, "temp_c": np.full_like(t, 25.0)}


def _synth_cell_dcir_csv(r0_ohm: float, i_pulse: float) -> dict[str, np.ndarray]:
    ocv = {90: 3.330, 70: 3.300, 50: 3.280, 30: 3.250}
    rt, ri, rv, rs = [], [], [], []
    tt = 0.0
    for s in (90, 70, 50, 30):
        base = ocv[s]
        rt += [tt, tt + 0.01, tt + 10.0, tt + 10.01]
        ri += [0.0, -i_pulse, -i_pulse, 0.0]
        rv += [base, base - i_pulse * r0_ohm, base - i_pulse * r0_ohm - 0.02, base - 0.004]
        rs += [float(s)] * 4
        tt += 60.0
    return {"t_s": np.array(rt), "i_a": np.array(ri), "v_v": np.array(rv), "soc_pct": np.array(rs)}


def write_templates() -> list[Path]:
    """Write runnable synthetic CSVs (overwrite with real bench data later)."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    written = []

    lic = _synth_lic_csv(166.0, 0.0050, 51.3, 4.0)
    lic["temp_c"] = np.full_like(lic["t_s"], 25.0)
    _write_cols_csv(RAW_DIR / "lic_step.csv", lic, ["t_s", "i_a", "v_v", "temp_c"])
    written.append(RAW_DIR / "lic_step.csv")

    cap = _synth_cell_capacity_csv(5.0, 2.5)
    _write_cols_csv(RAW_DIR / "cell_capacity.csv", cap, ["t_s", "i_a", "v_v", "temp_c"])
    written.append(RAW_DIR / "cell_capacity.csv")

    dcir = _synth_cell_dcir_csv(0.012, 5.0)
    _write_cols_csv(RAW_DIR / "cell_dcir.csv", dcir, ["t_s", "i_a", "v_v", "soc_pct"])
    written.append(RAW_DIR / "cell_dcir.csv")

    return written


def _synth_lic_csv(c_true: float, esr_true: float, v0: float, i_step: float) -> dict[str, np.ndarray]:
    t = np.concatenate([np.linspace(0, 0.5, 6), np.linspace(0.51, 5.5, 500),
                        np.linspace(5.51, 6.0, 6)])
    i = np.where((t > 0.5) & (t <= 5.5), i_step, 0.0)
    v = np.full_like(t, v0)
    on = (t > 0.5) & (t <= 5.5)
    t_on = t[on] - 0.5
    v[on] = v0 - i_step * esr_true - (i_step / c_true) * t_on
    v[t > 5.5] = v0 - (i_step / c_true) * (5.5 - 0.5)  # residual after step
    rng = np.random.default_rng(0)
    v = v + rng.normal(0, 1e-3, size=v.shape)
    return {"t_s": t, "i_a": i, "v_v": v}


def selftest() -> int:
    """Round-trip: synthesize data from known params, verify extraction recovers them."""
    print("[selftest] LIC C/ESR extraction round-trip ...")
    c_true, esr_true, v0, i_step = 166.0, 0.0050, 51.3, 4.0
    cols = _synth_lic_csv(c_true, esr_true, v0, i_step)
    lic = extract_lic_params(cols, i_step_hint=i_step)
    c_err = 100.0 * abs(lic["capacitance_f"] - c_true) / c_true
    esr_err = 100.0 * abs(lic["esr_ohm"] - esr_true) / esr_true
    print(f"  C   recovered {lic['capacitance_f']:.1f} F (true {c_true}) -> {c_err:.1f}% err")
    print(f"  ESR recovered {lic['esr_mohm']:.2f} mOhm (true {esr_true*1000:.2f}) -> {esr_err:.1f}% err")

    print("[selftest] cell capacity coulomb-count round-trip ...")
    cap_true_ah = 2.5
    t = np.linspace(0, cap_true_ah / 2.5 * 3600.0, 2000)  # 2.5 A discharge
    cap_cols = {"t_s": t, "i_a": np.full_like(t, -2.5), "v_v": np.linspace(3.5, 2.5, len(t))}
    cap = extract_cell_capacity(cap_cols)
    cap_err = 100.0 * abs(cap["capacity_ah"] - cap_true_ah) / cap_true_ah
    print(f"  capacity recovered {cap['capacity_ah']:.3f} Ah (true {cap_true_ah}) -> {cap_err:.2f}% err")

    ok = c_err < 5 and esr_err < 15 and cap_err < 2
    print(f"\n[selftest] {'PASS' if ok else 'FAIL'} — pipeline recovers known params")
    return 0 if ok else 1


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lic", type=Path, help="LIC constant-current step CSV")
    ap.add_argument("--cell-capacity", type=Path, help="Cell CC capacity-test CSV")
    ap.add_argument("--cell-dcir", type=Path, help="Cell DCIR pulse CSV")
    ap.add_argument("--i-step", type=float, default=None, help="known LIC step current (A); else auto-detect")
    ap.add_argument("--n-parallel", type=int, default=2, help="LIC modules in parallel for bank droop recompute")
    ap.add_argument("--cell-nominal-ah", type=float, default=None, help="nameplate cell capacity for the delta")
    ap.add_argument("--make-template", action="store_true", help="write CSV header templates and exit")
    ap.add_argument("--selftest", action="store_true", help="synthetic round-trip test (no hardware needed)")
    ap.add_argument("--plot", action="store_true", help="save a calibration overview PNG")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if args.make_template:
        for p in write_templates():
            print(f"[template] {p}")
        print("\nEdit these with real bench data, then re-run with --lic / --cell-capacity / --cell-dcir.")
        return 0

    if not (args.lic or args.cell_capacity or args.cell_dcir):
        ap.error("give at least one of --lic / --cell-capacity / --cell-dcir (or --selftest / --make-template)")

    t0 = time.time()
    report: dict = {
        "artifact": "H3 measured-parameter twin calibration",
        "purpose": "Replace datasheet/Prada2013 anchors with parameters measured on the "
                   "actual LFP cell + LIC module; re-check V1/V2 predictions hold on measured values.",
        "protocol": "docs/hardware_characterization_protocol.md",
        "inputs": {},
        "lic": None,
        "cell": None,
        "verdict": {},
    }

    # ---- LIC ----------------------------------------------------------------
    if args.lic:
        report["inputs"]["lic_csv"] = str(args.lic)
        lic = extract_lic_params(_load_csv(args.lic), i_step_hint=args.i_step)
        droop = recompute_lic_droop(lic["capacitance_f"], lic["esr_ohm"], args.n_parallel)
        # anchor per-module = bank / n_parallel for a like-for-like comparison
        c_anchor_module = v2.BANK_C_F / args.n_parallel
        esr_anchor_module = v2.BANK_ESR_OHM * args.n_parallel
        c_dev = 100.0 * abs(lic["capacitance_f"] - c_anchor_module) / c_anchor_module
        esr_dev = 100.0 * abs(lic["esr_ohm"] - esr_anchor_module) / esr_anchor_module
        report["lic"] = {
            "measured": lic,
            "anchor_per_module": {"c_f": c_anchor_module, "esr_ohm": esr_anchor_module,
                                  "source": "eval_lic_rc_fit.py BANK / n_parallel"},
            "deviation_pct": {"capacitance": c_dev, "esr": esr_dev},
            "droop_recompute": droop,
            "within_tolerance": bool(c_dev <= LIC_C_TOL_PCT and esr_dev <= LIC_ESR_TOL_PCT),
        }
        report["verdict"]["lic_droop_holds_on_measured"] = droop["measured_passes_uvlo"]

    # ---- Cell ---------------------------------------------------------------
    cell: dict = {}
    if args.cell_capacity:
        report["inputs"]["cell_capacity_csv"] = str(args.cell_capacity)
        cap = extract_cell_capacity(_load_csv(args.cell_capacity))
        if args.cell_nominal_ah:
            cap["nameplate_ah"] = args.cell_nominal_ah
            cap["deviation_pct"] = 100.0 * abs(cap["capacity_ah"] - args.cell_nominal_ah) / args.cell_nominal_ah
            cap["within_tolerance"] = bool(cap["deviation_pct"] <= CELL_CAP_TOL_PCT)
        cell["capacity"] = cap
    if args.cell_dcir:
        report["inputs"]["cell_dcir_csv"] = str(args.cell_dcir)
        cell["dcir"] = extract_dcir(_load_csv(args.cell_dcir))
        cell["dcir"]["note"] = ("BoL ohmic DCIR — anchors the aging model's +50% @80% SOH "
                                "growth assumption (apps/web/src/lib/aging.ts / generate_twin_scenarios.py).")
    if cell:
        report["cell"] = cell

    report["elapsed_s"] = time.time() - t0
    report["interpretation_notes"] = [
        "Measured numbers are the honest result whether or not they match the anchor.",
        "A match upgrades V1/V2 from 'model vs datasheet/Prada2013' to 'model vs measured'.",
        "A mismatch is itself a finding: it tells the team which anchor to recalibrate before EVT.",
        "LIC droop is recomputed with the SAME V2 model (eval_lic_rc_fit.py) — only C/ESR change.",
        "Cell OCV-SOC and full PyBaMM re-fit are follow-on work; this script anchors the lumped params.",
    ]

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    # ---- console summary ----------------------------------------------------
    print("\n=== H3 measured-parameter calibration ===")
    if report["lic"]:
        lic = report["lic"]
        m = lic["measured"]
        print(f"  LIC  C   = {m['capacitance_f']:.1f} F   (anchor {lic['anchor_per_module']['c_f']:.1f} F, "
              f"{lic['deviation_pct']['capacitance']:.1f}% dev)")
        print(f"  LIC  ESR = {m['esr_mohm']:.2f} mOhm (anchor {lic['anchor_per_module']['esr_ohm']*1000:.2f} mOhm, "
              f"{lic['deviation_pct']['esr']:.1f}% dev)")
        dr = lic["droop_recompute"]
        print(f"  droop (datasheet -> measured): {dr['droop_v']['datasheet']:.3f} V -> "
              f"{dr['droop_v']['measured']:.3f} V; UVLO headroom measured "
              f"{dr['headroom_to_uvlo_v']['measured']:.2f} V "
              f"({'PASS' if dr['measured_passes_uvlo'] else 'FAIL'})")
    if report["cell"]:
        c = report["cell"]
        if "capacity" in c:
            print(f"  cell capacity = {c['capacity']['capacity_ah']:.3f} Ah, "
                  f"energy {c['capacity']['energy_wh']:.2f} Wh")
        if "dcir" in c and c["dcir"]["dcir_r0_mohm_mean"] is not None:
            print(f"  cell DCIR(R0) = {c['dcir']['dcir_r0_mohm_mean']:.2f} mOhm "
                  f"(n={c['dcir']['n_pulses']} pulses)")
    print(f"  -> {OUT_JSON}")

    if args.plot:
        _maybe_plot(args, report)
    return 0


def _maybe_plot(args, report) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as exc:
        print(f"[skip-plot] matplotlib not available: {exc}")
        return
    panels = [k for k in ("lic", "cell") if report.get(k)]
    if not panels:
        return
    fig, axes = plt.subplots(len(panels), 1, figsize=(9, 4 * len(panels)))
    axes = np.atleast_1d(axes)
    ax_i = 0
    if report.get("lic") and args.lic:
        c = _load_csv(args.lic)
        ax = axes[ax_i]; ax_i += 1
        ax.plot(c["t_s"], c["v_v"], lw=1.4)
        ax.set_title("LIC step — measured V(t)")
        ax.set_xlabel("t [s]"); ax.set_ylabel("V [V]"); ax.grid(alpha=0.3)
    if report.get("cell") and args.cell_capacity:
        c = _load_csv(args.cell_capacity)
        ax = axes[ax_i]; ax_i += 1
        ax.plot(c["t_s"] / 3600.0, c["v_v"], lw=1.4)
        ax.set_title("Cell capacity test — measured V vs time")
        ax.set_xlabel("t [h]"); ax.set_ylabel("V [V]"); ax.grid(alpha=0.3)
    fig.tight_layout(); fig.savefig(OUT_PNG, dpi=110)
    print(f"[plot] {OUT_PNG}")


if __name__ == "__main__":
    sys.exit(main())
