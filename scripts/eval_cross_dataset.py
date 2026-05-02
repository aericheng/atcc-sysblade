"""Cross-dataset RUL evaluation: train on Severson, test on NASA.

Reproduces three evaluation regimes that get progressively harder:

  1. Severson · random split             (paper-style, in-distribution)
  2. Severson · cross-batch (b1+b2 → b3) (different fast-charge protocols)
  3. Cross-dataset (Severson → NASA)     (different chemistry: LFP → NMC)

The third regime is the honest stress test: we expect MAPE to degrade,
and the report quantifies *how much*. Severson cells are LFP fast-charge
(2.0-3.5 V); NASA cells are 18650 NMC at constant 24-44 °C ambient
(2.7-4.2 V). The model is being asked to extrapolate across both
chemistry and protocol, so a clean failure mode tells the story.

Run: ``python scripts/eval_cross_dataset.py``

Inputs:
  - data/processed/severson_cells_features.parquet (from notebook 01)
  - data/raw/nasa/BatteryAgingARC-FY08Q4.zip (from NasaLoader.fetch())

Outputs:
  - data/processed/cross_dataset_mape.json
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "packages" / "battery-twin"))

from data_loaders import nasa_parser as nsp  # noqa: E402
from data_loaders import severson_parser as sp  # noqa: E402
from lstm_rul import baseline as bl  # noqa: E402

SEVERSON_PARQUET = REPO / "data" / "processed" / "severson_cells_features.parquet"
NASA_ZIP = REPO / "data" / "raw" / "nasa" / "BatteryAgingARC-FY08Q4.zip"
NASA_EXTRACT = REPO / "data" / "raw" / "nasa" / "extracted"
NASA_PARQUET = REPO / "data" / "processed" / "nasa_cells_features.parquet"
RESULTS = REPO / "data" / "processed" / "cross_dataset_mape.json"


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------
def load_severson() -> pd.DataFrame:
    if not SEVERSON_PARQUET.exists():
        raise FileNotFoundError(
            f"{SEVERSON_PARQUET.relative_to(REPO)} missing — run "
            f"``python scripts/eval_severson_models.py`` first."
        )
    df = pd.read_parquet(SEVERSON_PARQUET)
    missing = [c for c in bl.FULL_FEATURES if c not in df.columns]
    if missing:
        raise ValueError(
            f"Severson parquet is missing Full-feature columns {missing} — "
            f"regenerate with ``python scripts/eval_severson_models.py``."
        )
    return df


def load_nasa() -> pd.DataFrame:
    """Load NASA cells and emit a 5-feature DataFrame (Discharge model).

    We use the 5-feature Discharge model rather than the Full-feature Full
    model for cross-dataset eval because two of the 4 extended features
    don't transfer cleanly:

      - ``log_charge_time_avg_2_6`` requires charge-phase data; NASA stores
        charge and discharge as separate cycle entries and our parser keeps
        only discharge cycles, so the argmax(V) heuristic in
        ``_charge_time`` doesn't apply.
      - Severson's fast-charge protocols (~10-30 min charge) and NASA's
        slow-charge convention (~2-3 hr) live in different feature ranges
        anyway, so OLS extrapolation would dominate the error.

    The 5-feature Discharge model uses only V/Qd/cycles 2..100 — quantities
    that exist in both datasets — so it's the chemistry-agnostic baseline
    we can defend in the cross-dataset regime.
    """
    if not NASA_ZIP.exists():
        raise FileNotFoundError(
            f"{NASA_ZIP.relative_to(REPO)} missing — run "
            f"``PYTHONPATH=packages/battery-twin python -m data_loaders.nasa "
            f"data/raw/nasa`` to download (~210 MB)."
        )
    print(f"loading NASA cells from {NASA_ZIP.name}")
    t0 = time.time()
    cells = nsp.load_nasa_cells(NASA_ZIP, NASA_EXTRACT)
    print(f"  {len(cells)} NASA cells parsed in {time.time()-t0:.1f}s")
    if not cells:
        raise RuntimeError("no NASA cells parsed — see logs above")

    rows = sp.features_for_all(cells, model="discharge")
    df = pd.DataFrame(rows)
    if df.empty:
        raise RuntimeError(
            "NASA Discharge feature extraction yielded 0 rows — likely "
            "ΔQ_{100-10}(V) failed because cycles 10/100 are missing or "
            "voltage range mismatch. Check Cell.voltage_range setting in "
            "nasa_parser.py and that cells have ≥100 discharge cycles."
        )
    df.to_parquet(NASA_PARQUET, index=False)
    print(f"  wrote {NASA_PARQUET.relative_to(REPO)} ({len(df)} rows)")
    return df


# ---------------------------------------------------------------------------
# OLS regimes
# ---------------------------------------------------------------------------
def _eval(features: tuple[str, ...], df: pd.DataFrame, split: str) -> dict:
    """Within-Severson regimes: random split + cross-batch split."""
    res = bl.run_full_pipeline(df, features=features, split=split, seed=0)
    return {
        "regime": f"severson_{split}",
        "n_features": len(features),
        "train_n": res["train_metrics"]["n"],
        "test_n": res["test_metrics"]["n"],
        "train_mape_pct": round(res["train_metrics"]["mape_pct"], 2),
        "test_mape_pct": round(res["test_metrics"]["mape_pct"], 2),
        "test_rmse_cycles": round(res["test_metrics"]["rmse_cycles"], 0),
        "test_r2": round(res["test_metrics"]["r2"], 3),
    }


def _feature_distribution_check(
    features: tuple[str, ...],
    sev_df: pd.DataFrame,
    nasa_df: pd.DataFrame,
) -> dict:
    """For each feature, check whether NASA values lie within Severson's training range.

    The cross-dataset OLS prediction is only meaningful when test-set
    features fall inside the training distribution. If any feature is
    out-of-range, the linear model is extrapolating — and extrapolation in
    log-space can produce wildly wrong cycle-life predictions even when
    each input shift is modest. This block surfaces the per-feature shift
    so the headline MAPE is interpretable: a 10000% MAPE driven by 5/5
    out-of-range features is a *distributional* failure, not a modeling
    failure that would respond to more training cells.
    """
    rows: list[dict] = []
    for f in features:
        s_min = float(sev_df[f].min())
        s_max = float(sev_df[f].max())
        s_mean = float(sev_df[f].mean())
        s_std = float(sev_df[f].std()) or 1e-12
        n_min = float(nasa_df[f].min())
        n_max = float(nasa_df[f].max())
        # z-distance: how many train-stds away the closest NASA point is
        # from the Severson mean (lower bound on the 'extrapolation budget'
        # the OLS coefficients are being asked to handle).
        worst_z = max(abs(n_min - s_mean), abs(n_max - s_mean)) / s_std
        rows.append({
            "feature": f,
            "severson_min": round(s_min, 4),
            "severson_max": round(s_max, 4),
            "severson_mean": round(s_mean, 4),
            "severson_std": round(s_std, 4),
            "nasa_min": round(n_min, 4),
            "nasa_max": round(n_max, 4),
            "nasa_within_severson_range": (n_min >= s_min) and (n_max <= s_max),
            "worst_z_from_severson_mean": round(worst_z, 2),
        })
    n_outside = sum(1 for r in rows if not r["nasa_within_severson_range"])
    return {
        "per_feature": rows,
        "n_features_outside_training_range": n_outside,
        "n_features_total": len(features),
    }


def _eval_cross_dataset(
    features: tuple[str, ...],
    sev_df: pd.DataFrame,
    nasa_df: pd.DataFrame,
) -> dict:
    """Train on the *whole* Severson set, test on every NASA cell."""
    X_train = sev_df[list(features)].values
    y_train_log = sev_df["log_cycle_life"].values
    model = bl.fit_linear(X_train, y_train_log, features)

    X_test = nasa_df[list(features)].values
    y_test = nasa_df["cycle_life"].values
    test_pred = model.predict_cycles(X_test)
    metrics = bl.evaluate(y_test, test_pred)

    return {
        "regime": "cross_dataset_severson_to_nasa",
        "n_features": len(features),
        "train_n": int(len(sev_df)),
        "test_n": int(len(nasa_df)),
        "test_mape_pct": round(metrics["mape_pct"], 2),
        "test_rmse_cycles": round(metrics["rmse_cycles"], 0),
        "test_r2": round(metrics["r2"], 3),
        "feature_distribution_check": _feature_distribution_check(features, sev_df, nasa_df),
        "test_predictions": [
            {
                "cell_id": str(r["cell_id"]),
                "actual_cycle_life": int(r["cycle_life"]),
                "predicted_cycle_life": float(p),
                "abs_pct_error": float(abs(r["cycle_life"] - p) / r["cycle_life"] * 100.0),
            }
            for r, p in zip(nasa_df.to_dict("records"), test_pred)
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    sev_df = load_severson()
    print(f"Severson : {len(sev_df)} cells with Full-feature set")

    nasa_df = load_nasa()
    print(f"NASA     : {len(nasa_df)} cells with Full-feature set")
    print()

    print("=" * 70)
    print("Severson · random split (in-distribution)")
    print("=" * 70)
    sev_random = []
    for label, feats in (("Discharge", bl.DISCHARGE_FEATURES), ("Full", bl.FULL_FEATURES)):
        r = _eval(feats, sev_df, split="random")
        sev_random.append({"label": label, **r})
        print(f"  {label:9s} (n_feat={len(feats)})  test MAPE={r['test_mape_pct']:5.2f}%  R2={r['test_r2']:6.3f}")

    print()
    print("=" * 70)
    print("Severson · cross-batch (b1+b2 -> b3) — different fast-charge protocols")
    print("=" * 70)
    sev_xbatch = []
    for label, feats in (("Discharge", bl.DISCHARGE_FEATURES), ("Full", bl.FULL_FEATURES)):
        r = _eval(feats, sev_df, split="cross_batch")
        sev_xbatch.append({"label": label, **r})
        print(f"  {label:9s} (n_feat={len(feats)})  test MAPE={r['test_mape_pct']:5.2f}%  R2={r['test_r2']:6.3f}")

    print()
    print("=" * 70)
    print("Cross-dataset (Severson all -> NASA all) — LFP -> NMC chemistry shift")
    print("(5-feature Discharge model only — 4 extended features don't transfer)")
    print("=" * 70)
    cross = []
    for label, feats in (("Discharge", bl.DISCHARGE_FEATURES),):
        r = _eval_cross_dataset(feats, sev_df, nasa_df)
        cross.append({"label": label, **r})
        print(f"  {label:9s} (n_feat={len(feats)})  test MAPE={r['test_mape_pct']:5.2f}%  R2={r['test_r2']:6.3f}")

    cross_check = cross[0]["feature_distribution_check"]
    print(
        f"\n  feature distribution: "
        f"{cross_check['n_features_outside_training_range']}/{cross_check['n_features_total']} "
        f"NASA features outside Severson training range — see JSON for per-feature z-distances"
    )

    out = {
        "summary": (
            "Severson cycle-life regression evaluated on three progressively "
            "harder regimes. The cross-dataset (Severson -> NASA) result is "
            "dominated by feature-distribution shift: every NASA feature "
            "lies outside the Severson training range, so the linear OLS "
            "extrapolates into a regime where its coefficients have no "
            "support and predicted cycle lives diverge by orders of "
            "magnitude. The headline finding for the white paper is "
            "therefore *distributional* (cannot deploy across chemistries "
            "without per-chemistry calibration) rather than a clean "
            "MAPE-degradation curve."
        ),
        "feature_sets": {
            "discharge": list(bl.DISCHARGE_FEATURES),
            "full": list(bl.FULL_FEATURES),
        },
        "n_train_severson": int(len(sev_df)),
        "n_test_nasa": int(len(nasa_df)),
        "regimes": {
            "severson_random": sev_random,
            "severson_cross_batch": sev_xbatch,
            "cross_dataset": cross,
        },
        "generated_at_utc": pd.Timestamp.now(tz="UTC").isoformat(),
    }
    RESULTS.write_text(json.dumps(out, indent=2))
    print(f"\nwrote {RESULTS.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
