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


def _extract_features() -> pd.DataFrame:
    if not CACHE.exists():
        raise FileNotFoundError(
            f"{CACHE} not found — run notebooks/01_severson_eda.ipynb first to "
            f"parse the .mat files and populate the cache."
        )
    print(f"loading cached cells from {CACHE.name}")
    t0 = time.time()
    cells = pickle.loads(CACHE.read_bytes())
    print(f"  {len(cells)} cells loaded in {time.time()-t0:.1f}s")

    print("extracting 9-feature Full set")
    t0 = time.time()
    rows = sp.features_for_all(cells, model="full")
    df = pd.DataFrame(rows)
    print(f"  {len(df)} cells with full feature set in {time.time()-t0:.1f}s")
    print(f"  columns: {list(df.columns)}")
    return df


def _run(df: pd.DataFrame, features: tuple[str, ...], split: str, label: str) -> dict:
    """Run a single OLS configuration and return a result row."""
    res = bl.run_full_pipeline(df, features=features, split=split, seed=0)
    train_m = res["train_metrics"]
    test_m = res["test_metrics"]
    return {
        "label": label,
        "n_features": len(features),
        "split": split,
        "train_n": train_m["n"],
        "test_n": test_m["n"],
        "train_mape_pct": round(train_m["mape_pct"], 2),
        "test_mape_pct": round(test_m["mape_pct"], 2),
        "test_rmse_cycles": round(test_m["rmse_cycles"], 0),
        "test_r2": round(test_m["r2"], 3),
    }


def main() -> int:
    df = _extract_features()
    df.to_parquet(PARQUET, index=False)
    print(f"wrote {PARQUET.relative_to(REPO)}  ({PARQUET.stat().st_size/1024:.1f} KiB)")

    print("\nrunning OLS configurations")
    results: list[dict] = []
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
                    "label": label,
                    "split": split,
                    "error": f"{type(exc).__name__}: {exc}",
                })
                continue
            results.append(row)
            print(
                f"  {label:9s} | {split:12s} | "
                f"train MAPE {row['train_mape_pct']:5.2f}%  "
                f"test MAPE {row['test_mape_pct']:5.2f}%  "
                f"R2 {row['test_r2']:6.3f}  (n_test={row['test_n']})"
            )

    out = {
        "n_cells_with_full_features": int(len(df)),
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
