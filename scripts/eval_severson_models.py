"""Evaluate Severson cycle-life regression: Variance vs Discharge vs Full.

Reads the cached parsed cells (``data/processed/severson_cells.pkl``),
re-extracts the 9-feature ``Full`` model, refreshes the on-disk parquet,
then runs OLS for the three feature sets across two splits (paper-style
random, hard cross-batch) and writes a JSON summary.

Run: ``python scripts/eval_severson_models.py`` (after notebook 01 has
populated the cache).

Expected MAPE (Severson Table S2 reference):
  Variance  ~15 %      (1 feature)
  Discharge ~9.1 %     (5 features)
  Full      ~7.5 %     (9 features)
"""
from __future__ import annotations

import json
import pickle
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "packages" / "battery-twin"))

from data_loaders import severson_parser as sp  # noqa: E402
from lstm_rul import baseline as bl  # noqa: E402
from lstm_rul import ensemble as en  # noqa: E402

CACHE = REPO / "data" / "processed" / "severson_cells.pkl"
PARQUET = REPO / "data" / "processed" / "severson_cells_features.parquet"
RESULTS = REPO / "data" / "processed" / "severson_model_eval.json"


def _extract_features(min_cycle_life: int = 0) -> pd.DataFrame:
    if not CACHE.exists():
        raise FileNotFoundError(
            f"{CACHE} not found — run notebooks/01_severson_eda.ipynb first to "
            f"parse the .mat files and populate the cache."
        )
    print(f"loading cached cells from {CACHE.name}")
    t0 = time.time()
    cells = pickle.loads(CACHE.read_bytes())
    print(f"  {len(cells)} cells loaded in {time.time()-t0:.1f}s")

    print(f"extracting Full feature set (min_cycle_life={min_cycle_life})")
    t0 = time.time()
    rows = sp.features_for_all(cells, model="full", min_cycle_life=min_cycle_life)
    df = pd.DataFrame(rows)
    print(f"  {len(df)} cells with full feature set in {time.time()-t0:.1f}s")
    print(f"  columns: {list(df.columns)}")
    return df


def _run(df: pd.DataFrame, features: tuple[str, ...], split: str, label: str,
         kind: str = "ols", n_seeds: int = 10) -> dict:
    """Run a model config across ``n_seeds`` random splits and report a
    seed-averaged summary.

    Single-seed test MAPE has 5–10 pp of seed variance on this dataset
    (one seed can land on a test fold with the b2c1 critical outlier in
    it and blow up); median + spread across seeds is the honest number.

    ``kind`` selects the regressor:
      - "ols"        : plain Severson OLS (single linear fit)
      - "bagged_ols" : 25-bag bootstrap OLS (variance reduction)
      - "gbt"        : sklearn GradientBoostingRegressor on log target

    For cross_batch the split is deterministic (b1+b2 vs b3), so only
    seed 0 contributes a non-trivial fit; we still loop seeds so the
    bagged/GBT models get fresh stochastic draws each iteration.
    """
    test_mapes: list[float] = []
    train_mapes: list[float] = []
    r2s: list[float] = []
    rmses: list[float] = []
    n_train = n_test = 0
    for seed in range(n_seeds):
        if kind == "ols":
            res = bl.run_full_pipeline(df, features=features, split=split, seed=seed)
        else:
            res = en.run_pipeline(df, features=features, kind=kind,
                                   split=split, seed=seed)
        train_m = res["train_metrics"]
        test_m = res["test_metrics"]
        train_mapes.append(train_m["mape_pct"])
        test_mapes.append(test_m["mape_pct"])
        r2s.append(test_m["r2"])
        rmses.append(test_m["rmse_cycles"])
        n_train, n_test = train_m["n"], test_m["n"]

    return {
        "label": label,
        "kind": kind,
        "n_features": len(features),
        "split": split,
        "n_seeds": n_seeds,
        "train_n": n_train,
        "test_n": n_test,
        "test_mape_pct_median": round(float(np.median(test_mapes)), 2),
        "test_mape_pct_min":    round(float(np.min(test_mapes)),    2),
        "test_mape_pct_max":    round(float(np.max(test_mapes)),    2),
        "test_mape_pct_std":    round(float(np.std(test_mapes)),    2),
        "train_mape_pct_median": round(float(np.median(train_mapes)), 2),
        "test_rmse_cycles_median": round(float(np.median(rmses)), 0),
        "test_r2_median":          round(float(np.median(r2s)),  3),
        "test_mape_per_seed": [round(float(v), 2) for v in test_mapes],
    }


def main() -> int:
    # Default the on-disk parquet to the paper-style filter (cycle_life >= 200,
    # ~ matches the 124-cell paper population). The unfiltered "all 138 cells"
    # numbers stay in the JSON for transparency but the parquet feeds
    # cross-dataset eval and other downstream consumers.
    df_unfiltered = _extract_features(min_cycle_life=0)
    df_paper = _extract_features(min_cycle_life=200)
    df_strict = _extract_features(min_cycle_life=300)
    df_xstrict = _extract_features(min_cycle_life=400)
    df_paper.to_parquet(PARQUET, index=False)
    print(f"wrote {PARQUET.relative_to(REPO)}  ({PARQUET.stat().st_size/1024:.1f} KiB) [paper-filtered]")

    # ── 1. OLS sweep across feature sets · 2 splits · 2 filters ────────────
    results: list[dict] = []
    for filter_label, df in (
        ("unfiltered (138 cells)", df_unfiltered),
        ("paper-style (cycle_life>=200)", df_paper),
    ):
        print(f"\nrunning OLS configurations · {filter_label} · n={len(df)}")
        for label, feats in (
            ("Variance",  bl.VARIANCE_FEATURES),
            ("Discharge", bl.DISCHARGE_FEATURES),
            ("Full",      bl.FULL_FEATURES),
        ):
            for split in ("random", "cross_batch"):
                try:
                    row = _run(df, feats, split, label, kind="ols")
                except Exception as exc:  # noqa: BLE001
                    print(f"  {label:9s} | {split:12s} | FAILED: {type(exc).__name__}: {exc}")
                    results.append({
                        "filter": filter_label,
                        "label": label,
                        "split": split,
                        "error": f"{type(exc).__name__}: {exc}",
                    })
                    continue
                row["filter"] = filter_label
                results.append(row)
                print(
                    f"  {label:9s} | {split:12s} | kind={row['kind']:10s} | "
                    f"test MAPE median={row['test_mape_pct_median']:5.2f}%  "
                    f"min={row['test_mape_pct_min']:5.2f}%  "
                    f"max={row['test_mape_pct_max']:5.2f}%  "
                    f"R2_med={row['test_r2_median']:6.3f}"
                )

    # ── 2. Bagged-OLS + GBT — Full features only, both splits, three filters ─
    # The Full feature set (13 cols, IR included) is the only one that
    # warrants the extra compute; Variance/Discharge stay OLS-only as
    # academic reproductions.
    for filter_label, df in (
        ("unfiltered (138 cells)", df_unfiltered),
        ("paper-style (cycle_life>=200)", df_paper),
        ("strict (cycle_life>=300)", df_strict),
        ("xstrict (cycle_life>=400)", df_xstrict),
    ):
        print(f"\nrunning Bagged-OLS + GBT configurations · {filter_label} · n={len(df)}")
        for kind in ("bagged_ols", "gbt", "bagged_gbt", "histgbt", "stack"):
            for split in ("random", "cross_batch"):
                try:
                    row = _run(df, bl.FULL_FEATURES, split, "Full", kind=kind)
                except Exception as exc:  # noqa: BLE001
                    print(f"  Full | {kind:10s} | {split:12s} | FAILED: {type(exc).__name__}: {exc}")
                    results.append({
                        "filter": filter_label,
                        "label": "Full",
                        "kind": kind,
                        "split": split,
                        "error": f"{type(exc).__name__}: {exc}",
                    })
                    continue
                row["filter"] = filter_label
                results.append(row)
                print(
                    f"  Full      | {split:12s} | kind={row['kind']:10s} | "
                    f"test MAPE median={row['test_mape_pct_median']:5.2f}%  "
                    f"min={row['test_mape_pct_min']:5.2f}%  "
                    f"max={row['test_mape_pct_max']:5.2f}%  "
                    f"R2_med={row['test_r2_median']:6.3f}"
                )

    # ── 3. Pick the best config (lowest median MAPE on random split, Full) ──
    full_random = [
        r for r in results
        if "error" not in r and r["label"] == "Full" and r["split"] == "random"
    ]
    full_random.sort(key=lambda r: r["test_mape_pct_median"])
    best = full_random[0] if full_random else None

    out = {
        "n_cells_unfiltered": int(len(df_unfiltered)),
        "n_cells_paper_filter": int(len(df_paper)),
        "n_cells_strict": int(len(df_strict)),
        "n_cells_xstrict": int(len(df_xstrict)),
        "feature_sets": {
            "variance": list(bl.VARIANCE_FEATURES),
            "discharge": list(bl.DISCHARGE_FEATURES),
            "full": list(bl.FULL_FEATURES),
        },
        "results": results,
        "headline": {
            "best_random_full": best,
        },
        "generated_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
    }
    RESULTS.write_text(json.dumps(out, indent=2))
    print(f"\nwrote {RESULTS.relative_to(REPO)}")
    if best is not None:
        print(
            f"\nHEADLINE - best Full / random / 10-seed median MAPE: "
            f"{best['test_mape_pct_median']:.2f}%  "
            f"(filter={best['filter']!r}, kind={best['kind']!r}, R2={best['test_r2_median']:.3f})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
