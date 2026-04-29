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
         n_seeds: int = 10) -> dict:
    """Run an OLS config across ``n_seeds`` random splits and report a
    seed-averaged summary.

    Single-seed test MAPE has 5–10 pp of seed variance on this dataset
    (one seed can land on a test fold with the b2c1 critical outlier in
    it and blow up); median + spread across seeds is the honest number.
    """
    test_mapes: list[float] = []
    train_mapes: list[float] = []
    r2s: list[float] = []
    rmses: list[float] = []
    n_train = n_test = 0
    for seed in range(n_seeds):
        res = bl.run_full_pipeline(df, features=features, split=split, seed=seed)
        train_m = res["train_metrics"]
        test_m = res["test_metrics"]
        train_mapes.append(train_m["mape_pct"])
        test_mapes.append(test_m["mape_pct"])
        r2s.append(test_m["r2"])
        rmses.append(test_m["rmse_cycles"])
        n_train, n_test = train_m["n"], test_m["n"]

    return {
        "label": label,
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
    df_paper.to_parquet(PARQUET, index=False)
    print(f"wrote {PARQUET.relative_to(REPO)}  ({PARQUET.stat().st_size/1024:.1f} KiB) [paper-filtered]")

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
                    row = _run(df, feats, split, label)
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
                    f"  {label:9s} | {split:12s} | n_seeds={row['n_seeds']} | "
                    f"test MAPE median={row['test_mape_pct_median']:5.2f}%  "
                    f"min={row['test_mape_pct_min']:5.2f}%  "
                    f"max={row['test_mape_pct_max']:5.2f}%  "
                    f"R2_med={row['test_r2_median']:6.3f}"
                )

    out = {
        "n_cells_unfiltered": int(len(df_unfiltered)),
        "n_cells_paper_filter": int(len(df_paper)),
        "feature_sets": {
            "variance": list(bl.VARIANCE_FEATURES),
            "discharge": list(bl.DISCHARGE_FEATURES),
            "full": list(bl.FULL_FEATURES),
        },
        "results": results,
        "generated_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
    }
    RESULTS.write_text(json.dumps(out, indent=2))
    print(f"\nwrote {RESULTS.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
