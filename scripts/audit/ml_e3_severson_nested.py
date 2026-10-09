"""E3: Severson headline re-evaluation.

Part A (reproduction): re-runs scripts/eval_severson_models._run (imported,
unchanged) for the Full-feature random-split grid (4 filters x 6 model kinds,
10 seeds) on the audit feature cache. Must reproduce the committed
severson_model_eval.json headline 8.38 % (xstrict, bagged-GBT) and 12.49 %
(paper-style >=200, bagged-GBT). The grid minimum is the "selected on test"
number (garden of forking paths).

Part B (nested selection, no selection bias): for each REPORTING population
P in {paper >=200, xstrict >=400}:
  outer split = bl.severson_random_split(df_P, test_size=0.30, seed=s),
                s = 0..9  (identical test folds to the committed sweep)
  training pool = all 138 Severson cells minus the outer-test cells
  candidates = training filter {0,200,300,400} x kind {ols, bagged_ols, gbt,
               bagged_gbt, histgbt, stack} (24 configs, Full 13 features)
  inner = 5-fold KFold(shuffle, random_state=s) on the training pool; each
          candidate is fit on (inner-train filtered by its training filter)
          and scored by pooled MAPE on inner-val cells that belong to P
  select argmin inner MAPE -> refit on the whole (filtered) pool ->
  evaluate the outer test fold ONCE.
Reported: per-seed choice + outer MAPE; median (same convention as the
committed 10-seed median) and mean +- sd.

Run: .venv/Scripts/python.exe scripts/audit/ml_e3_severson_nested.py [--workers 10]
"""
from __future__ import annotations

import argparse
import os
import time
from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from ml_common import AUDIT_DIR, SME_JSON, load_cache, meta, summarize, write_json

OUT = AUDIT_DIR / "ml_e3_severson_nested.json"
FILTERS = {"unfiltered (138 cells)": 0, "paper-style (cycle_life>=200)": 200,
           "strict (cycle_life>=300)": 300, "xstrict (cycle_life>=400)": 400}
KINDS = ("ols", "bagged_ols", "gbt", "bagged_gbt", "histgbt", "stack")
POPS = {"paper_ge200": 200, "xstrict_ge400": 400}
N_SEEDS = 10
INNER_K = 5


def _df_all() -> pd.DataFrame:
    c = load_cache()
    cols = list(c["sev_full_cols"])
    df = pd.DataFrame(c["sev_full_X"], columns=cols)
    df.insert(0, "cell_id", c["sev_full_ids"].astype(str))
    df.insert(1, "batch", c["sev_full_batch"].astype(str))
    df.insert(2, "cycle_life", c["sev_full_cycle_life"])
    df.insert(3, "log_cycle_life", np.log10(c["sev_full_cycle_life"]))
    return df


def _filt(df, thr):
    return df[df["cycle_life"] >= thr].reset_index(drop=True)


# ------------------------------------------------------------ Part A
def repro_job(args):
    filter_label, kind = args
    from eval_severson_models import _run
    from lstm_rul import baseline as bl
    df = _filt(_df_all(), FILTERS[filter_label])
    feats = bl.FULL_FEATURES
    row = _run(df, feats, "random", "Full", kind=kind)
    row["filter"] = filter_label
    return row


# ------------------------------------------------------------ Part B
def _fit_predict(kind, Xtr, ytr_log, Xte, seed):
    from lstm_rul import baseline as bl
    from lstm_rul import ensemble as en
    f = bl.FULL_FEATURES
    if kind == "ols":
        m = bl.fit_linear(Xtr, ytr_log, f)
    elif kind == "bagged_ols":
        m = en.fit_bagged_linear(Xtr, ytr_log, f, n_bags=25, seed=seed)
    elif kind == "gbt":
        m = en.fit_gbt(Xtr, ytr_log, f, seed=seed)
    elif kind == "bagged_gbt":
        m = en.fit_bagged_gbt(Xtr, ytr_log, f, seed=seed)
    elif kind == "histgbt":
        m = en.fit_histgbt(Xtr, ytr_log, f, seed=seed)
    elif kind == "stack":
        m = en.fit_stack(Xtr, ytr_log, f, seed=seed)
    else:
        raise ValueError(kind)
    return m.predict_cycles(Xte)


def nested_job(args):
    pop, seed = args
    from sklearn.model_selection import KFold
    from lstm_rul import baseline as bl
    feats = list(bl.FULL_FEATURES)
    thr_pop = POPS[pop]
    df_all = _df_all()
    df_P = _filt(df_all, thr_pop)
    _, outer_test = bl.severson_random_split(df_P, test_size=0.30, seed=seed)
    test_ids = set(outer_test["cell_id"])
    pool = df_all[~df_all["cell_id"].isin(test_ids)].reset_index(drop=True)
    assert not (set(pool["cell_id"]) & test_ids)

    kf = KFold(n_splits=INNER_K, shuffle=True, random_state=seed)
    scores = {}
    for fname, fthr in FILTERS.items():
        for kind in KINDS:
            ape = []
            for itr, iva in kf.split(pool):
                tr = pool.iloc[itr]; va = pool.iloc[iva]
                tr = tr[tr["cycle_life"] >= fthr]
                va = va[va["cycle_life"] >= thr_pop]
                if len(va) == 0:
                    continue
                p = _fit_predict(kind, tr[feats].values, tr["log_cycle_life"].values, va[feats].values, seed)
                ape.extend((np.abs(p - va["cycle_life"].values) / va["cycle_life"].values * 100).tolist())
            scores[f"{fname}|{kind}"] = float(np.mean(ape))
    best = min(scores, key=scores.get)
    bf, bk = best.split("|")
    tr = pool[pool["cycle_life"] >= FILTERS[bf]]
    p = _fit_predict(bk, tr[feats].values, tr["log_cycle_life"].values, outer_test[feats].values, seed)
    y = outer_test["cycle_life"].values
    mape = float(np.mean(np.abs(p - y) / y) * 100)
    r2 = float(1 - np.sum((y - p) ** 2) / np.sum((y - y.mean()) ** 2))
    # fixed (pre-registered, no selection) reference: bagged-GBT trained on pool filtered at the pop threshold
    trf = pool[pool["cycle_life"] >= thr_pop]
    pf = _fit_predict("bagged_gbt", trf[feats].values, trf["log_cycle_life"].values, outer_test[feats].values, seed)
    return {"pop": pop, "seed": seed, "n_pool": int(len(pool)), "n_test": int(len(outer_test)),
            "selected": best, "selected_inner_mape": scores[best], "outer_test_mape_pct": mape, "outer_test_r2": r2,
            "fixed_bagged_gbt_pool_mape_pct": float(np.mean(np.abs(pf - y) / y) * 100),
            "inner_scores": scores, "test_ids": sorted(test_ids)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=min(10, os.cpu_count() or 1))
    args = ap.parse_args()
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        grid = list(ex.map(repro_job, [(f, k) for f in FILTERS for k in KINDS]))
        nested = list(ex.map(nested_job, [(p, s) for p in POPS for s in range(N_SEEDS)]))
    wall = time.time() - t0

    import json
    sme = json.loads(SME_JSON.read_text())
    ref = {(r["filter"], r["kind"]): r for r in sme["results"] if "error" not in r and r["label"] == "Full" and r["split"] == "random"}
    for r in grid:
        rr = ref.get((r["filter"], r["kind"]))
        r["committed_median"] = rr["test_mape_pct_median"] if rr else None
        r["delta_vs_committed"] = (r["test_mape_pct_median"] - rr["test_mape_pct_median"]) if rr else None
    pick = lambda f, k: next(r for r in grid if r["filter"] == f and r["kind"] == k)  # noqa: E731
    x = pick("xstrict (cycle_life>=400)", "bagged_gbt"); pp = pick("paper-style (cycle_life>=200)", "bagged_gbt")
    grid_sorted = sorted(grid, key=lambda r: r["test_mape_pct_median"])

    summ = {}
    for pop in POPS:
        R = [r for r in nested if r["pop"] == pop]
        v = [r["outer_test_mape_pct"] for r in R]
        summ[pop] = {
            "nested_outer_mape": summarize(v),
            "nested_outer_r2": summarize([r["outer_test_r2"] for r in R]),
            "fixed_bagged_gbt_pool_mape": summarize([r["fixed_bagged_gbt_pool_mape_pct"] for r in R]),
            "selected_configs": {c: sum(r["selected"] == c for r in R) for c in sorted({r["selected"] for r in R})},
            "per_seed_outer_mape": [round(x_, 2) for x_ in v],
            "n_test_per_seed": R[0]["n_test"],
        }
    out = {
        "_meta": meta("scripts/audit/ml_e3_severson_nested.py", wall_seconds=round(wall, 1), workers=args.workers,
                      inner_k=INNER_K, n_seeds=N_SEEDS,
                      data_usage="Part A = committed protocol (test folds also used to pick the headline = selection on test). "
                                 "Part B: outer test fold untouched until the single final evaluation; selection by inner 5-fold CV on the training pool only.",
                      populations=POPS, candidate_filters=FILTERS, candidate_kinds=KINDS),
        "repro": {
            "xstrict_bagged_gbt_median": x["test_mape_pct_median"], "xstrict_bagged_gbt_per_seed": x["test_mape_per_seed"],
            "xstrict_bagged_gbt_committed": 8.38,
            "paper_bagged_gbt_median": pp["test_mape_pct_median"], "paper_bagged_gbt_per_seed": pp["test_mape_per_seed"],
            "paper_bagged_gbt_committed": 12.49,
            "grid_min_config": f"{grid_sorted[0]['filter']} | {grid_sorted[0]['kind']}",
            "grid_min_median": grid_sorted[0]["test_mape_pct_median"],
            "paper_pop_grid_min": min(r["test_mape_pct_median"] for r in grid if r["filter"].startswith("paper")),
            "max_abs_delta_vs_committed_over_grid": max(abs(r["delta_vs_committed"]) for r in grid if r["delta_vs_committed"] is not None),
        },
        "grid": grid,
        "nested_summary": summ,
        "nested_per_seed": nested,
    }
    write_json(OUT, out)
    print(out["repro"]); print({k: (v["nested_outer_mape"], v["selected_configs"]) for k, v in summ.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
