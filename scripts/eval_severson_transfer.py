"""V5 — Severson-trained model → BBU duty cells transfer MAPE.

對齊 `docs/BBU_IMPLEMENTATION_PLAN.md` v2.0 § 摘要 V5。透過 cross-regime test 量
化「Severson 18650 fast-charge stress 訓練的 bagged-GBT 在 BBU 浮充 + 偶發
transient regime 的退化幅度」。

Pipeline:
1. 載入 Severson xstrict-filter features parquet(134 cells,cycle_life >= 400)
2. 載入既有 `data/processed/bbu_duty_cells.pkl`(50 顆 Severson-calibrated 合成
   BBU-duty cells,features_9 dict 已含 9-feature Severson subset)
3. **Train**:bagged-GBT(K=24)on Severson cells(用兩者共有的 9-feature 子集)
4. **Test**:在 BBU duty cells 上 predict cycle_life,vs ground truth
5. Output:
   - Random-split MAPE on Severson(自身 baseline,應達 v2.2 §B 8.38% 目標)
   - Transfer MAPE on BBU duty cells(cross-regime degradation 數字)
   - Per-bucket breakdown(by cycle_life range)

V5 的誠實揭露(必標在 JSON):
- BBU duty cells use **analytic decay calibrated to Severson observed fade rates**,
  not pure PyBaMM aging(PyBaMM aging 100 cells × 200 cycles 需 ~hours;此為
  computational scope 限制)
- **Pure PyBaMM physics-grounded test cells** is W3+ EVT scope(2026 Q3)
- Cross-regime degradation MAPE 反映「規範外推 + analytic-decay 近似」混合誤差

Usage:
    .venv/Scripts/python scripts/eval_severson_transfer.py
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

from lstm_rul import baseline as bl  # noqa: E402
from lstm_rul import ensemble as en  # noqa: E402

SEVERSON_PARQUET = REPO / "data" / "processed" / "severson_cells_features.parquet"
BBU_CELLS_PKL = REPO / "data" / "processed" / "bbu_duty_cells.pkl"
SEVERSON_CACHE = REPO / "data" / "processed" / "severson_cells.pkl"
OUT_JSON = REPO / "data" / "processed" / "severson_transfer_mape.json"
OUT_PNG = REPO / "data" / "processed" / "severson_transfer_mape.png"

# 9-feature subset that both Severson features and BBU duty cells share
FEATURES_9 = (
    "log_var_delta_q",
    "log_min_delta_q",
    "slope_q_2_100",
    "intercept_q_2_100",
    "q_at_cycle_2",
    "log_max_temp_2_100",
    "log_temp_integral_2_100",
    "log_charge_time_avg_2_6",
    "slope_q_91_100",
)


def _load_severson_xstrict() -> pd.DataFrame:
    """Load Severson features for xstrict filter (cycle_life >= 400)."""
    if not SEVERSON_PARQUET.exists():
        # If parquet not generated, fall back to extracting from cached pickle
        if not SEVERSON_CACHE.exists():
            sys.exit(
                f"Neither {SEVERSON_PARQUET.name} nor {SEVERSON_CACHE.name} "
                "found; run `python scripts/eval_severson_models.py` first."
            )
        from data_loaders import severson_parser as sp
        cells = pickle.loads(SEVERSON_CACHE.read_bytes())
        rows = sp.features_for_all(cells, model="full", min_cycle_life=400)
        return pd.DataFrame(rows)
    df = pd.read_parquet(SEVERSON_PARQUET)
    return df[df["cycle_life"] >= 400].reset_index(drop=True)


def _load_bbu_cells() -> pd.DataFrame:
    """Load BBU duty cells into a DataFrame matching the Severson schema."""
    if not BBU_CELLS_PKL.exists():
        sys.exit(
            f"{BBU_CELLS_PKL.name} not found; run "
            "`python scripts/generate_bbu_duty_cells.py` first."
        )
    cells = pickle.loads(BBU_CELLS_PKL.read_bytes())
    rows = []
    for c in cells:
        f = c["features_9"]
        rows.append({
            "cell_id": c["cell_id"],
            "batch": c["batch"],
            "cycle_life": c["cycle_life"],
            "log_cycle_life": c["log_cycle_life"],
            "policy": c["policy"],
            **{k: f[k] for k in FEATURES_9},
            "severity": c["duty"]["severity"],
        })
    return pd.DataFrame(rows)


def _train_predict_bagged_gbt(
    sev_train: pd.DataFrame, bbu_test: pd.DataFrame, features: tuple[str, ...],
    n_bags: int = 24, seed: int = 7
) -> dict:
    """Train bagged-GBT on Severson, predict on BBU cells, return MAPE+more."""
    from sklearn.ensemble import GradientBoostingRegressor

    rng = np.random.default_rng(seed)
    n_train = len(sev_train)
    X_train_full = sev_train[list(features)].to_numpy()
    y_train_full = sev_train["log_cycle_life"].to_numpy()
    X_test = bbu_test[list(features)].to_numpy()
    y_test_log = bbu_test["log_cycle_life"].to_numpy()
    y_test = bbu_test["cycle_life"].to_numpy()

    preds_log = np.zeros((n_bags, len(bbu_test)))
    for b in range(n_bags):
        idx = rng.choice(n_train, size=n_train, replace=True)
        gbt = GradientBoostingRegressor(
            n_estimators=150, max_depth=3, learning_rate=0.06,
            subsample=0.8, random_state=seed + b
        )
        gbt.fit(X_train_full[idx], y_train_full[idx])
        preds_log[b] = gbt.predict(X_test)

    pred_log_mean = preds_log.mean(axis=0)
    pred_log_std = preds_log.std(axis=0)
    pred_cycle = 10.0 ** pred_log_mean

    abs_err_pct = 100.0 * np.abs(pred_cycle - y_test) / y_test
    mape_pct = float(np.mean(abs_err_pct))
    median_ape_pct = float(np.median(abs_err_pct))
    rmse_cycles = float(np.sqrt(np.mean((pred_cycle - y_test) ** 2)))
    r2 = float(
        1.0 - np.sum((pred_cycle - y_test) ** 2) / np.sum((y_test - y_test.mean()) ** 2)
    )

    return {
        "mape_pct": mape_pct,
        "median_ape_pct": median_ape_pct,
        "rmse_cycles": rmse_cycles,
        "r2": r2,
        "predictions": [
            {
                "cell_id": cid,
                "ground_truth": int(gt),
                "predicted": float(pred),
                "abs_err_pct": float(err),
                "log_pred_std": float(std),
                "severity": float(sev),
            }
            for cid, gt, pred, err, std, sev in zip(
                bbu_test["cell_id"], y_test, pred_cycle, abs_err_pct,
                pred_log_std, bbu_test["severity"]
            )
        ],
    }


def _bucket_breakdown(predictions: list[dict]) -> dict:
    buckets = {
        "< 2000": [],
        "2000-4000": [],
        "4000-6000": [],
        "6000-10000": [],
        ">= 10000": [],
    }
    for p in predictions:
        gt = p["ground_truth"]
        if gt < 2000:
            buckets["< 2000"].append(p["abs_err_pct"])
        elif gt < 4000:
            buckets["2000-4000"].append(p["abs_err_pct"])
        elif gt < 6000:
            buckets["4000-6000"].append(p["abs_err_pct"])
        elif gt < 10000:
            buckets["6000-10000"].append(p["abs_err_pct"])
        else:
            buckets[">= 10000"].append(p["abs_err_pct"])
    return {
        label: {
            "n_cells": len(arr),
            "mean_ape_pct": float(np.mean(arr)) if arr else None,
            "median_ape_pct": float(np.median(arr)) if arr else None,
        }
        for label, arr in buckets.items()
    }


def _maybe_plot(predictions: list[dict], severson_baseline_mape: float, out_png):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as exc:
        print(f"[skip-plot] {exc}")
        return

    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5))

    gt = np.array([p["ground_truth"] for p in predictions])
    pred = np.array([p["predicted"] for p in predictions])
    sev = np.array([p["severity"] for p in predictions])

    ax = axes[0]
    sc = ax.scatter(gt, pred, c=sev, cmap="viridis", s=40, alpha=0.7)
    lim = max(gt.max(), pred.max())
    ax.plot([0, lim], [0, lim], "k--", lw=1, label="perfect prediction")
    ax.plot([0, lim], [0, lim * 1.5], "r:", lw=1, alpha=0.6, label="+50%")
    ax.plot([0, lim], [0, lim * 0.5], "r:", lw=1, alpha=0.6, label="-50%")
    ax.set_xlabel("Ground truth cycle life")
    ax.set_ylabel("Severson-trained bagged-GBT prediction")
    ax.set_title("V5 — Cross-regime transfer (Severson → BBU duty)")
    ax.legend(loc="upper left", fontsize=9)
    ax.grid(alpha=0.3)
    fig.colorbar(sc, ax=ax, label="BBU duty severity")

    ax = axes[1]
    abs_err = np.array([p["abs_err_pct"] for p in predictions])
    ax.hist(abs_err, bins=20, alpha=0.7, color="tab:orange",
            label=f"BBU transfer (mean MAPE = {abs_err.mean():.1f}%)")
    ax.axvline(severson_baseline_mape, color="green", lw=2,
               label=f"Severson self-baseline ({severson_baseline_mape:.1f}%)")
    ax.set_xlabel("Absolute % error")
    ax.set_ylabel("# cells")
    ax.set_title("Per-cell error distribution")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(out_png, dpi=110)
    print(f"[plot] {out_png}")


def main() -> int:
    print(f"[V5] loading Severson xstrict-filter features ...")
    t0 = time.time()
    sev_df = _load_severson_xstrict()
    print(f"[V5] loaded {len(sev_df)} Severson cells in {time.time()-t0:.1f}s")

    print(f"[V5] loading BBU duty cells ...")
    bbu_df = _load_bbu_cells()
    print(f"[V5] loaded {len(bbu_df)} BBU duty cells")
    print(f"[V5] BBU cycle_life range: {bbu_df['cycle_life'].min()} - "
          f"{bbu_df['cycle_life'].max()}")

    # Train bagged-GBT on Severson, predict on BBU
    print(f"[V5] training bagged-GBT on Severson (K=24 bags) ...")
    t0 = time.time()
    transfer_result = _train_predict_bagged_gbt(sev_df, bbu_df, FEATURES_9)
    print(f"[V5] train+predict done in {time.time()-t0:.1f}s")

    # Severson baseline (random split self-evaluation, also K=24 bagged-GBT)
    print(f"[V5] Severson self-baseline (random split 10 seeds) ...")
    t0 = time.time()
    self_test_mapes = []
    for seed in range(10):
        res = en.run_pipeline(
            sev_df, features=FEATURES_9, kind="bagged_gbt",
            split="random", seed=seed
        )
        self_test_mapes.append(res["test_metrics"]["mape_pct"])
    severson_baseline_mape = float(np.median(self_test_mapes))
    print(f"[V5] Severson self-baseline MAPE median = "
          f"{severson_baseline_mape:.2f}% (took {time.time()-t0:.1f}s)")

    transfer_mape = transfer_result["mape_pct"]
    degradation_pct_points = transfer_mape - severson_baseline_mape
    degradation_factor = transfer_mape / max(severson_baseline_mape, 0.001)

    bucket_breakdown = _bucket_breakdown(transfer_result["predictions"])

    summary = {
        "validation_chain": "V5",
        "version": "v0.1",
        "date": "2026-05-26",
        "model": "bagged-GBT K=24 + 9-feature subset (intersection of Severson FULL_FEATURES and BBU features_9)",
        "training_set": {
            "name": "Severson 2019 xstrict (cycle_life >= 400)",
            "n_cells": len(sev_df),
        },
        "test_set": {
            "name": "BBU duty synthetic cells (Severson-calibrated analytic decay)",
            "n_cells": len(bbu_df),
            "cycle_life_min": int(bbu_df["cycle_life"].min()),
            "cycle_life_max": int(bbu_df["cycle_life"].max()),
            "cycle_life_median": int(bbu_df["cycle_life"].median()),
            "ground_truth_source": "scripts/generate_bbu_duty_cells.py (Wang 2011 + Severson observed fade calibrated)",
        },
        "features_used": list(FEATURES_9),
        "n_features": len(FEATURES_9),
        "headline": {
            "severson_self_baseline_mape_pct": severson_baseline_mape,
            "bbu_transfer_mape_pct": transfer_mape,
            "bbu_transfer_median_ape_pct": transfer_result["median_ape_pct"],
            "bbu_transfer_r2": transfer_result["r2"],
            "bbu_transfer_rmse_cycles": transfer_result["rmse_cycles"],
            "degradation_percentage_points": degradation_pct_points,
            "degradation_factor": degradation_factor,
            "verdict": (
                f"V5 — Severson-trained bagged-GBT achieves "
                f"{severson_baseline_mape:.2f}% MAPE on Severson self-test, "
                f"{transfer_mape:.2f}% MAPE on BBU-duty transfer "
                f"({degradation_factor:.1f}× degradation). This quantifies "
                f"the regime gap explicitly — same model, different duty cycle."
            ),
        },
        "bucket_breakdown_by_cycle_life": bucket_breakdown,
        "per_cell_predictions": transfer_result["predictions"],
        "honest_disclosures": [
            "BBU duty cells use Severson-calibrated analytic decay, NOT pure "
            "PyBaMM aging. PyBaMM aging on 100 cells × 200 cycles is "
            "~hours computational cost; deferred to W3+ EVT physics-grounded "
            "validation work.",
            "Cross-regime MAPE captures both (a) true regime gap (fast-charge "
            "Severson vs gentle BBU duty) AND (b) analytic-decay approximation "
            "error vs PyBaMM ground truth. Both are real engineering errors a "
            "deployed model would face.",
            "9-feature subset used (vs full 13) because BBU duty cells "
            "synthesize features_9 directly; the 4 missing features "
            "(intercept_q_91_100, q_at_cycle_100, log_min_ir_2_100, "
            "log_ir_diff_100_2) are skipped rather than approximated, keeping "
            "the comparison honest.",
            "Deployment SOP (whitepaper §3.3.5): same-protocol clients use "
            "bagged-GBT; new-protocol clients fall back to bagged-OLS "
            "(13.87% MAPE cross-batch baseline); new-chemistry clients require "
            "per-chemistry recalibration via PoC data.",
        ],
        "_meta": {
            "generated_by": "scripts/eval_severson_transfer.py",
        },
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    _maybe_plot(
        transfer_result["predictions"], severson_baseline_mape, OUT_PNG
    )

    print("\n=== V5 Severson -> BBU duty transfer ===")
    print(f"  Severson self-baseline (random split, K=24): "
          f"{severson_baseline_mape:.2f}% median MAPE")
    print(f"  BBU duty transfer:                          "
          f"{transfer_mape:.2f}% mean MAPE "
          f"(median {transfer_result['median_ape_pct']:.2f}%)")
    print(f"  Degradation: +{degradation_pct_points:.2f} pp "
          f"({degradation_factor:.1f}x)")
    print(f"  R^2 on BBU transfer: {transfer_result['r2']:.3f}")
    print(f"  Per-bucket breakdown:")
    for label, stats in bucket_breakdown.items():
        if stats["n_cells"] > 0:
            print(f"    {label:>15s}: n={stats['n_cells']:>2d} "
                  f"mean APE = {stats['mean_ape_pct']:.1f}%")
    print(f"  -> {OUT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
