"""E1 + E4 + E1-b + E2: leakage-free, multi-seed TCN / bagged-GBT / constant
baselines, with split-conformal coverage audits.

Protocols (all cell-level; every set disjoint, asserted):
  main    : stratified by regime (Severson vs BBU) 50/10/20/20
            train = fit weights | val = early-stop ONLY | cal = conformal q ONLY |
            test = evaluated once at the end.
            Also trains a 'leaky' twin on the SAME train set that early-stops on
            the TEST set (the original protocol's flaw) -> isolates the leak.
  main_t60: same as main with 60/10/10/20 (keeps the original 60 % train
            size; smaller cal set) -- sensitivity to the train-size cut.
  orig    : the original protocol re-run (random 60/20/20, early-stop on test),
            seeds 0..N-1 plus seed 42 -> distribution of the 18.15 % number.
  lbo_b3  : Severson batch b3 = test (all of it); b1+b2+bbu stratified into
            train/val/cal (62.5/12.5/25) -> cross-batch accuracy + coverage.
  extrap  : the mildest 20 % of synthetic BBU cells by duty severity = test
            (never seen); remaining cells stratified train/val/cal
            (62.5/12.5/25) -> extrapolation in the BBU parameter space.

Models per protocol:
  TCN      : tcn_rul.model.train_model (unchanged; epochs 300, bs 16, lr 1e-3,
             dropout .15, patience 40, seed=s) -- same hyper-params as
             scripts/train_tcn_rul.py:237-240.
  GBT (E2) : eval_severson_transfer._train_predict_bagged_gbt (unchanged; 9
             intersection features, K=24 bootstrap GBT, 150 trees, depth 3,
             lr .06, subsample .8), trained on the same train set only.
  const    : regime-aware median of the TRAIN labels (Severson median for
             Severson cells, BBU median for BBU cells).
Conformal: MC-dropout (100 passes, export_tcn_onnx.predict_mc_dropout) +
           export_lstm_onnx.conformal_calibrate/apply_conformal (unchanged),
           alpha = 0.10.

Run: .venv/Scripts/python.exe scripts/audit/ml_e1_tcn_multiseed.py [--seeds 10] [--workers 8]
"""
from __future__ import annotations

import argparse
import os
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np

from ml_common import AUDIT_DIR, assert_disjoint, load_cache, meta, metrics, summarize, write_json

OUT = AUDIT_DIR / "ml_e1_tcn_multiseed.json"
FR_MAIN = (0.5, 0.1, 0.2, 0.2)
FR_T60 = (0.6, 0.1, 0.1, 0.2)  # sensitivity: original 60 % train size, smaller cal
FR_POOL = (0.625, 0.125, 0.25)  # train/val/cal when test is fixed
HP = dict(epochs=300, batch_size=16, lr=1e-3, dropout=0.15, patience=40)
ALPHA = 0.10


# ------------------------------------------------------------------ data
def _data():
    c = load_cache()
    X = c["tcn_X"]; y_log = c["tcn_y_log"]; ids = c["tcn_ids"]; bat = c["tcn_batches"]
    isb = bat == "bbu"
    # 9-feature table aligned to the TCN cell order (NaN row if unavailable)
    f9 = list(c["feat9_cols"]); full_cols = list(c["sev_full_cols"])
    col_idx = [full_cols.index(k) for k in f9]
    sev_map = {cid: row[col_idx] for cid, row in zip(c["sev_full_ids"], c["sev_full_X"])}
    bbu_map = {cid: row for cid, row in zip(c["bbu_ids"], c["bbu_feat9"])}
    sev_by_id = dict(zip(c["bbu_ids"], c["bbu_severity"]))
    F9 = np.full((len(ids), len(f9)), np.nan)
    severity = np.full(len(ids), np.nan)
    for i, cid in enumerate(ids):
        if isb[i]:
            F9[i] = bbu_map[cid]; severity[i] = sev_by_id[cid]
        elif cid in sev_map:
            F9[i] = sev_map[cid]
    return dict(X=X, y_log=y_log, y=10.0 ** y_log, ids=ids, bat=bat, isb=isb, F9=F9, f9=f9, severity=severity)


def _strat_pool(pool: np.ndarray, isb: np.ndarray, seed: int, fr=FR_POOL) -> dict:
    rng = np.random.default_rng(seed)
    out = {"train": [], "val": [], "cal": []}
    for g in (False, True):
        idx = pool[isb[pool] == g]
        idx = idx[rng.permutation(len(idx))]
        n = len(idx); n_cal = int(np.floor(fr[2] * n)); n_val = int(np.floor(fr[1] * n))
        out["cal"].extend(idx[:n_cal]); out["val"].extend(idx[n_cal:n_cal + n_val]); out["train"].extend(idx[n_cal + n_val:])
    return {k: np.sort(np.asarray(v, int)) for k, v in out.items()}


def make_split(kind: str, seed: int, D: dict) -> dict:
    n = len(D["X"]); isb = D["isb"]
    if kind in ("main", "main_t60"):
        from ml_common import stratified_split
        sp = stratified_split(np.where(isb, "bbu", "sev"), seed, FR_MAIN if kind == "main" else FR_T60)
    elif kind == "orig":
        idx = np.random.default_rng(seed).permutation(n)
        n_te = int(n * 0.2); n_cal = int(n * 0.2)
        sp = {"test": np.sort(idx[:n_te]), "cal": np.sort(idx[n_te:n_te + n_cal]), "train": np.sort(idx[n_te + n_cal:])}
    elif kind == "lbo_b3":
        test = np.flatnonzero(D["bat"] == "b3")
        pool = np.setdiff1d(np.arange(n), test)
        sp = {**_strat_pool(pool, isb, seed), "test": test}
    elif kind == "extrap":
        b = np.flatnonzero(isb)
        order = b[np.argsort(D["severity"][b])]
        test = np.sort(order[: int(round(0.2 * len(b)))])  # mildest 20 %
        pool = np.setdiff1d(np.arange(n), test)
        sp = {**_strat_pool(pool, isb, seed), "test": test}
    else:
        raise ValueError(kind)
    assert_disjoint(sp)
    return sp


# ------------------------------------------------------------------ job
def _cov(y, lo, hi):
    return ((y >= lo) & (y <= hi)).astype(float)


def _sub(y, p, isb, mask):
    d = {"all": metrics(y[mask], p[mask])}
    if (mask & ~isb).sum():
        d["severson"] = metrics(y[mask & ~isb], p[mask & ~isb])
    if (mask & isb).sum():
        d["bbu"] = metrics(y[mask & isb], p[mask & isb])
    return d


def run_job(job: tuple) -> dict:
    kind, seed = job
    import torch
    torch.set_num_threads(1)
    from tcn_rul import model as TCN
    from export_tcn_onnx import predict_mc_dropout
    from export_lstm_onnx import conformal_calibrate, apply_conformal
    import pandas as pd
    from eval_severson_transfer import _train_predict_bagged_gbt

    D = _data(); X, y_log, y, isb = D["X"], D["y_log"], D["y"], D["isb"]
    sp = make_split(kind, seed, D)
    tr, te = sp["train"], sp["test"]
    n = len(X)
    te_mask = np.zeros(n, bool); te_mask[te] = True
    rec = {"kind": kind, "seed": seed, "sizes": {k: int(len(v)) for k, v in sp.items()},
           "sizes_bbu": {k: int(isb[v].sum()) for k, v in sp.items()},
           "test_ids": D["ids"][te].tolist()}

    # ---- constant baseline: regime-aware TRAIN median
    med = {g: float(np.median(y[tr][isb[tr] == g])) if (isb[tr] == g).any() else float(np.median(y[tr])) for g in (False, True)}
    const = np.array([med[bool(b)] for b in isb])
    rec["const_medians"] = {"severson": med[False], "bbu": med[True]}
    rec["const"] = _sub(y, const, isb, te_mask)

    def fit_tcn(val_idx):
        t0 = time.time()
        r = TCN.train_model(X[tr], y_log[tr], X[val_idx], y_log[val_idx], seed=seed, verbose=False, **HP)
        dt = time.time() - t0
        best_ep = int(np.argmin([h["val_loss"] for h in r.history]) + 1)
        return r, dt, best_ep, len(r.history)

    if kind == "orig":
        r, dt, be, ne = fit_tcn(te)  # original flaw reproduced deliberately
        p = TCN.predict_cycles(r.model, r.scaler, X)
        rec["tcn_leaky"] = _sub(y, p, isb, te_mask)
        rec["train_seconds"] = dt; rec["best_epoch"] = be; rec["epochs_run"] = ne
        return rec

    # ---- clean TCN: early-stop on val only
    r, dt, be, ne = fit_tcn(sp["val"])
    rec["train_seconds"] = dt; rec["best_epoch"] = be; rec["epochs_run"] = ne
    p = TCN.predict_cycles(r.model, r.scaler, X)
    rec["tcn"] = _sub(y, p, isb, te_mask)
    rec["tcn_pred_test"] = p[te].round(1).tolist()
    rec["y_test"] = y[te].round(1).tolist()

    # ---- MC dropout + split conformal (cal only); test used once
    torch.manual_seed(10_000 + seed)
    pi = predict_mc_dropout(r.model, r.scaler, X, n_samples=100)
    cal = sp["cal"]
    conf = {}

    def _apply(cal_idx, label):
        if len(cal_idx) < 2:
            return None
        q, diag = conformal_calibrate({k: v[cal_idx] for k, v in pi.items()}, y[cal_idx], alpha=ALPHA)
        pic = apply_conformal(pi, q)
        cov = _cov(y, pic["conformal_lower"], pic["conformal_upper"])
        w = pic["conformal_upper"] - pic["conformal_lower"]
        out = {"q": q, "n_cal": int(len(cal_idx)), "raw_cal_cov_pct": diag["raw_pi_coverage_pct"]}
        for name, m in (("all", te_mask), ("severson", te_mask & ~isb), ("bbu", te_mask & isb)):
            if m.sum():
                out[f"cov_{name}"] = float(cov[m].mean()); out[f"n_{name}"] = int(m.sum())
                out[f"covered_{name}"] = int(cov[m].sum())
                out[f"median_width_{name}"] = float(np.median(w[m]))
        conf[label] = out
        return pic

    _apply(cal, "pooled_cal")
    _apply(cal[~isb[cal]], "severson_cal_only")
    _apply(cal[isb[cal]], "bbu_cal_only")
    # Mondrian (per-regime) conformal: each regime calibrated on its own cal cells
    pic_s = _apply(cal[~isb[cal]], "_tmp_s"); pic_b = _apply(cal[isb[cal]], "_tmp_b")
    if pic_s is not None and pic_b is not None:
        lo = np.where(isb, pic_b["conformal_lower"], pic_s["conformal_lower"])
        hi = np.where(isb, pic_b["conformal_upper"], pic_s["conformal_upper"])
        cov = _cov(y, lo, hi); w = hi - lo
        mo = {}
        for name, m in (("all", te_mask), ("severson", te_mask & ~isb), ("bbu", te_mask & isb)):
            if m.sum():
                mo[f"cov_{name}"] = float(cov[m].mean()); mo[f"n_{name}"] = int(m.sum()); mo[f"covered_{name}"] = int(cov[m].sum())
                mo[f"median_width_{name}"] = float(np.median(w[m]))
        conf["mondrian_per_regime"] = mo
    conf.pop("_tmp_s", None); conf.pop("_tmp_b", None)
    raw = _cov(y, pi["p5"], pi["p95"])
    conf["raw_mc_dropout_cov_all"] = float(raw[te_mask].mean())
    rec["conformal"] = conf

    # ---- leaky twin (main only): same train, early-stop on TEST
    if kind in ("main", "main_t60"):
        rl, dtl, bel, _ = fit_tcn(te)
        pl = TCN.predict_cycles(rl.model, rl.scaler, X)
        rec["tcn_leaky"] = _sub(y, pl, isb, te_mask)
        rec["leaky_best_epoch"] = bel

    # ---- E2: bagged-GBT on 9 intersection features, same train set
    ok = ~np.isnan(D["F9"]).any(axis=1)
    tr_g = tr[ok[tr]]
    te_g_mask = te_mask & ok

    def _df(idx):
        d = pd.DataFrame(D["F9"][idx], columns=D["f9"])
        d["cell_id"] = D["ids"][idx]; d["log_cycle_life"] = y_log[idx]; d["cycle_life"] = y[idx]
        d["severity"] = np.nan_to_num(D["severity"][idx], nan=-1.0)
        return d
    g = _train_predict_bagged_gbt(_df(tr_g), _df(np.flatnonzero(te_g_mask)), tuple(D["f9"]), n_bags=24, seed=seed)
    pg = np.full(n, np.nan); pg[np.flatnonzero(te_g_mask)] = [q["predicted"] for q in g["predictions"]]
    rec["gbt"] = _sub(y, np.nan_to_num(pg, nan=1.0), isb, te_g_mask)
    rec["tcn_on_gbt_cells"] = _sub(y, p, isb, te_g_mask)
    rec["gbt_n_train"] = int(len(tr_g)); rec["gbt_n_test"] = int(te_g_mask.sum())
    rec["gbt_pred_test"] = [None if np.isnan(v) else round(float(v), 1) for v in pg[te]]

    if kind == "extrap":
        rec["extrap_info"] = {
            "train_bbu_max_label": float(y[tr][isb[tr]].max()),
            "test_actual_range": [float(y[te].min()), float(y[te].max())],
            "test_severity_range": [float(np.nanmin(D["severity"][te])), float(np.nanmax(D["severity"][te]))],
            "train_severity_min": float(np.nanmin(D["severity"][tr][isb[tr]])),
            "tcn_test_pred_range": [float(p[te].min()), float(p[te].max())],
            "gbt_test_pred_range": [float(np.nanmin(pg[te])), float(np.nanmax(pg[te]))],
            "share_tcn_pred_above_train_bbu_max": float(np.mean(p[te] > y[tr][isb[tr]].max())),
        }
    return rec


# ------------------------------------------------------------------ aggregate
def _get(d, path):
    for k in path:
        if d is None or k not in d:
            return None
        d = d[k]
    return d


def aggregate(recs: list[dict]) -> dict:
    out = {}
    kinds = sorted({r["kind"] for r in recs})
    for kind in kinds:
        R = [r for r in recs if r["kind"] == kind and not (kind == "orig" and r["seed"] == 42)]
        s = {"n_seeds": len(R), "seeds": [r["seed"] for r in R],
             "train_seconds": summarize([r.get("train_seconds") for r in R])}
        for model in ("tcn", "tcn_leaky", "const", "gbt", "tcn_on_gbt_cells"):
            for sub in ("all", "severson", "bbu"):
                for met in ("mape_pct", "r2", "spearman"):
                    v = [_get(r, [model, sub, met]) for r in R]
                    if any(x is not None for x in v):
                        s[f"{model}.{sub}.{met}"] = summarize(v)
        # paired differences (per seed)
        for a, b in (("tcn", "const"), ("tcn", "tcn_leaky"), ("gbt", "tcn_on_gbt_cells"), ("tcn_leaky", "const")):
            for sub in ("all", "severson", "bbu"):
                da = [_get(r, [a, sub, "mape_pct"]) for r in R]; db = [_get(r, [b, sub, "mape_pct"]) for r in R]
                pairs = [(x, y) for x, y in zip(da, db) if x is not None and y is not None]
                if pairs:
                    diff = [x - y for x, y in pairs]
                    s[f"diff_mape.{a}_minus_{b}.{sub}"] = {**summarize(diff), "n_seeds_a_better": int(sum(d < 0 for d in diff))}
        if any("conformal" in r for r in R):
            for lab in ("pooled_cal", "severson_cal_only", "bbu_cal_only", "mondrian_per_regime"):
                for sub in ("all", "severson", "bbu"):
                    v = [_get(r, ["conformal", lab, f"cov_{sub}"]) for r in R]
                    if any(x is not None for x in v):
                        cov_n = sum(_get(r, ["conformal", lab, f"n_{sub}"]) or 0 for r in R)
                        cov_k = sum(_get(r, ["conformal", lab, f"covered_{sub}"]) or 0 for r in R)
                        s[f"cov.{lab}.{sub}"] = {**summarize(v), "pooled_covered": cov_k, "pooled_n": cov_n,
                                                 "pooled_rate": (cov_k / cov_n) if cov_n else None}
                        s[f"width.{lab}.{sub}"] = summarize([_get(r, ["conformal", lab, f"median_width_{sub}"]) for r in R])
                s[f"q.{lab}"] = summarize([_get(r, ["conformal", lab, "q"]) for r in R])
            s["cov.raw_mc_dropout.all"] = summarize([_get(r, ["conformal", "raw_mc_dropout_cov_all"]) for r in R])
        if kind == "extrap":
            s["share_tcn_pred_above_train_bbu_max"] = summarize([r["extrap_info"]["share_tcn_pred_above_train_bbu_max"] for r in R])
        out[kind] = s
    seed42 = [r for r in recs if r["kind"] == "orig" and r["seed"] == 42]
    if seed42:
        out["orig_seed42_rerun"] = {"tcn_leaky": seed42[0]["tcn_leaky"], "train_seconds": seed42[0]["train_seconds"],
                                    "reference_tcn_rul_report_mape_pct": 18.146, "reference_torch": "2.11.0+cpu"}
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=10)
    ap.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    ap.add_argument("--kinds", default="main,main_t60,orig,lbo_b3,extrap")
    args = ap.parse_args()
    seeds = list(range(args.seeds))
    kinds = args.kinds.split(",")
    jobs = [(k, s) for k in kinds for s in seeds]
    if "orig" in kinds:
        jobs.append(("orig", 42))
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        recs = list(ex.map(run_job, jobs))
    wall = time.time() - t0
    D = _data()
    out = {
        "_meta": meta("scripts/audit/ml_e1_tcn_multiseed.py",
                      seeds=seeds, workers=args.workers, wall_seconds=round(wall, 1), torch_threads_per_worker=1,
                      tcn_hparams=HP, alpha=ALPHA, fractions_main=FR_MAIN, fractions_pool=FR_POOL,
                      n_cells=int(len(D["X"])), n_bbu=int(D["isb"].sum()),
                      n_severson_with_9feat=int((~np.isnan(D["F9"]).any(axis=1) & ~D["isb"]).sum()),
                      data_usage={
                          "main": "train=weights; val=early-stop only; cal=conformal q only; test=final eval once (leaky twin early-stops on test, reported separately as the flawed reference)",
                          "main_t60": "sensitivity: same as main but 60/10/10/20 (train size = original 60 %); cal only 18-19 cells",
                          "orig": "original flawed protocol (val=test) re-run for reference; NOT a valid test estimate",
                          "lbo_b3": "test=all Severson b3; train/val/cal from b1+b2+bbu",
                          "extrap": "test=mildest 20% BBU by severity (fixed); train/val/cal from the rest",
                          "gbt": "fit on train only (no val/cal needed); same test cells",
                          "const": "regime-aware median of train labels"},
                      note="torch 2.13 vs original 2.11 -> not bit-identical to tcn_rul_report.json"),
        "summary": aggregate(recs),
        "per_seed": recs,
    }
    write_json(OUT, out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
