"""Build the audit feature cache ONCE from the 5.9 GB Severson pickle.

Produces data/processed/audit/ml_cache_dataset.npz with:
  * tcn_X (188, 99, 7), tcn_y_log, tcn_ids, tcn_batches
      -> exactly export_lstm_onnx.build_dataset(include_bbu=True) (imported, unchanged)
  * sev_full_cols, sev_full_X, sev_full_ids, sev_full_batch, sev_full_cycle_life
      -> data_loaders.severson_parser.features_for_all(cells, model="full",
         min_cycle_life=0) (unfiltered 138; the 200/300/400 filters used by
         scripts/eval_severson_models.py are pure row filters on cycle_life)
  * bbu_ids, bbu_feat9 (50, 9), bbu_severity, bbu_cycle_life (from bbu_duty_cells.pkl)

Sanity checks recorded in ml_cache_dataset_meta.json:
  * seed-42 60/20/20 permutation of build_dataset order reproduces MV test ids
  * sev features (>=200 rows) equal the committed paper-filter parquet

Run: .venv/Scripts/python.exe scripts/audit/ml_build_cache.py
"""
from __future__ import annotations

import json
import pickle
import time

import numpy as np
import pandas as pd

from ml_common import AUDIT_DIR, CACHE_NPZ, MV_JSON, REPO, meta, write_json

from export_lstm_onnx import build_dataset  # noqa: E402
from data_loaders import severson_parser as sp  # noqa: E402
from eval_severson_transfer import FEATURES_9  # noqa: E402
from lstm_rul import baseline as bl  # noqa: E402


def main() -> int:
    t0 = time.time()
    X, y_log, ids, batches = build_dataset(include_bbu=True)
    t_build = time.time() - t0
    print(f"build_dataset: {X.shape} in {t_build:.1f}s")

    t0 = time.time()
    cells = pickle.loads((REPO / "data" / "processed" / "severson_cells.pkl").read_bytes())
    rows = sp.features_for_all(cells, model="full", min_cycle_life=0)
    del cells
    df = pd.DataFrame(rows)
    t_feat = time.time() - t0
    print(f"features_for_all: {len(df)} rows in {t_feat:.1f}s")
    cols = list(bl.FULL_FEATURES)

    bbu = pickle.loads((REPO / "data" / "processed" / "bbu_duty_cells.pkl").read_bytes())

    np.savez_compressed(
        CACHE_NPZ,
        tcn_X=X.astype(np.float64), tcn_y_log=np.asarray(y_log, float),
        tcn_ids=np.asarray(ids, dtype="U32"), tcn_batches=np.asarray(batches, dtype="U8"),
        sev_full_cols=np.asarray(cols, dtype="U40"),
        sev_full_X=df[cols].to_numpy(float),
        sev_full_ids=df["cell_id"].to_numpy(dtype="U32"),
        sev_full_batch=df["batch"].to_numpy(dtype="U8"),
        sev_full_cycle_life=df["cycle_life"].to_numpy(float),
        feat9_cols=np.asarray(FEATURES_9, dtype="U40"),
        bbu_ids=np.asarray([c["cell_id"] for c in bbu], dtype="U32"),
        bbu_feat9=np.asarray([[c["features_9"][k] for k in FEATURES_9] for c in bbu], float),
        bbu_severity=np.asarray([c["duty"]["severity"] for c in bbu], float),
        bbu_cycle_life=np.asarray([c["cycle_life"] for c in bbu], float),
    )
    print(f"wrote {CACHE_NPZ.relative_to(REPO)}")

    # ---- sanity checks
    mv = json.loads(MV_JSON.read_text(encoding="utf-8"))
    mv_test = sorted(r["cell_id"] for r in mv["predicted_vs_actual"] if r["split"] == "test")
    idx = np.random.default_rng(42).permutation(len(X))
    te = idx[: int(len(X) * 0.2)]
    split_ok = sorted(ids[i] for i in te) == mv_test
    pq = pd.read_parquet(REPO / "data" / "processed" / "severson_cells_features.parquet")
    df200 = df[df["cycle_life"] >= 200].reset_index(drop=True)
    parquet_ok = (list(pq["cell_id"]) == list(df200["cell_id"])) and bool(
        np.allclose(pq[cols].to_numpy(float), df200[cols].to_numpy(float), equal_nan=True))
    sev_ids_tcn = {i for i, b in zip(ids, batches) if b != "bbu"}
    info = {
        "_meta": meta("scripts/audit/ml_build_cache.py"),
        "tcn_n": int(len(X)), "tcn_n_bbu": int(sum(b == "bbu" for b in batches)),
        "sev_full_n": int(len(df)),
        "sev_full_n_ge200": int((df.cycle_life >= 200).sum()),
        "sev_full_n_ge300": int((df.cycle_life >= 300).sum()),
        "sev_full_n_ge400": int((df.cycle_life >= 400).sum()),
        "tcn_severson_ids_missing_full_features": sorted(sev_ids_tcn - set(df["cell_id"])),
        "seed42_split_reproduces_mv_test_ids": split_ok,
        "paper_filter_parquet_equals_cache": parquet_ok,
        "seconds_build_dataset": round(t_build, 1), "seconds_features": round(t_feat, 1),
    }
    write_json(AUDIT_DIR / "ml_cache_dataset_meta.json", info)
    print(json.dumps({k: v for k, v in info.items() if k != "_meta"}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
