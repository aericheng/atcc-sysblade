"""Severson 2019 baseline: single-feature linear regression for RUL prediction.

Reproduces the headline result of:
  Severson, K.A., Attia, P.M., et al. (2019). "Data-driven prediction of
  battery cycle life before capacity degradation." Nature Energy 4, 383–391.

The paper showed that a SINGLE scalar feature — log10(variance of
ΔQ_{100-10}(V)) — combined with plain ordinary least squares onto
log10(cycle life), achieves ~9.1 % mean-absolute-percentage error on test
cells. This module provides:

  - fit_baseline(X_train, y_train_log)        → (slope, intercept)
  - predict(model, X)                          → cycle life predictions
  - evaluate(y_true, y_pred)                   → dict of MAPE / RMSE / R²
  - severson_train_test_split(df)              → b1+b2 train, b3 test
  - run_full_pipeline(features_df)             → reproduces the paper's number

Usage from a notebook:

  from lstm_rul.baseline import run_full_pipeline
  import pandas as pd
  df = pd.read_parquet('data/processed/severson_cells_features.parquet')
  result = run_full_pipeline(df)
  print(result['summary'])
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Core regression — supports both single- and multi-feature OLS
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class LinearModel:
    """Linear regression: log10(cycle_life) = X·coef + intercept.

    For the single-feature Variance baseline, X has one column. For the
    Discharge model from Severson Table 1, X has the 5 features.
    """

    coef: np.ndarray         # shape (n_features,)
    intercept: float
    features: tuple[str, ...]

    def predict_log(self, X: np.ndarray) -> np.ndarray:
        X = np.atleast_2d(np.asarray(X, dtype=np.float64))
        if X.shape[1] == 1 and len(self.coef) > 1:
            raise ValueError(f"model expects {len(self.coef)} features, got 1")
        return X @ self.coef + self.intercept

    def predict_cycles(self, X: np.ndarray) -> np.ndarray:
        return 10.0 ** self.predict_log(X)


def fit_linear(X: np.ndarray, y_log: np.ndarray, features: tuple[str, ...]) -> LinearModel:
    """OLS in log-log space.

    Parameters
    ----------
    X : (n_samples, n_features)
    y_log : (n_samples,)
    features : names of columns in X, used for reporting only
    """
    X = np.atleast_2d(np.asarray(X, dtype=np.float64))
    y = np.asarray(y_log, dtype=np.float64)

    # OLS via lstsq with a leading bias column
    Xb = np.hstack([np.ones((X.shape[0], 1)), X])
    coef_full, *_ = np.linalg.lstsq(Xb, y, rcond=None)
    intercept = float(coef_full[0])
    coef = coef_full[1:]
    return LinearModel(coef=coef, intercept=intercept, features=features)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Mean Absolute Percentage Error in %."""
    y_true = np.asarray(y_true, dtype=np.float64)
    y_pred = np.asarray(y_pred, dtype=np.float64)
    return float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100.0)


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Root Mean Squared Error in original units (cycles)."""
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Coefficient of determination."""
    y_true = np.asarray(y_true, dtype=np.float64)
    ss_res = np.sum((y_true - np.asarray(y_pred)) ** 2)
    ss_tot = np.sum((y_true - y_true.mean()) ** 2)
    return float(1.0 - ss_res / ss_tot) if ss_tot > 0 else float("nan")


def evaluate(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "mape_pct": mape(y_true, y_pred),
        "rmse_cycles": rmse(y_true, y_pred),
        "r2": r_squared(y_true, y_pred),
        "n": int(len(y_true)),
    }


# ---------------------------------------------------------------------------
# Train/test split
# ---------------------------------------------------------------------------
def severson_train_test_split(
    df: pd.DataFrame,
    train_batches: Iterable[str] = ("b1", "b2"),
    test_batches: Iterable[str] = ("b3",),
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Whole-batch split: train on batches 1 + 2, hold out batch 3 for test.

    Cross-batch is the harder case (different fast-charge policies across
    batches). The Severson 2019 paper's 9.1 % headline came from a within-
    batch random split — use `severson_random_split` to reproduce that.
    """
    train = df[df["batch"].isin(train_batches)].reset_index(drop=True)
    test = df[df["batch"].isin(test_batches)].reset_index(drop=True)
    return train, test


def severson_random_split(
    df: pd.DataFrame,
    test_size: float = 0.30,
    seed: int = 0,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Random shuffle split across all batches.

    Closer to the paper's primary-test setup (which mixes batches inside
    train+test) than the whole-batch split. Use this when targeting the
    paper's 9.1 % headline. Cross-batch generalisation is harder; whole-
    batch splits expose distribution shift between fast-charge policies.
    """
    shuffled = df.sample(frac=1.0, random_state=seed).reset_index(drop=True)
    split_at = int(len(shuffled) * (1.0 - test_size))
    return shuffled.iloc[:split_at].copy(), shuffled.iloc[split_at:].copy()


# ---------------------------------------------------------------------------
# End-to-end pipeline
# ---------------------------------------------------------------------------
VARIANCE_FEATURES: tuple[str, ...] = ("log_var_delta_q",)
DISCHARGE_FEATURES: tuple[str, ...] = (
    "log_var_delta_q",
    "log_min_delta_q",
    "slope_q_2_100",
    "intercept_q_2_100",
    "q_at_cycle_2",
)
# Severson 2019 Table S2 'Full' model — 5 Discharge features + 6 paper-aligned
# thermal / charge / late-fade features. The paper's two IR features are not
# extractable from our v7.3 .mat parse path; we substitute by KEEPING the
# 2-100-window slope/intercept/Q-at-2 from Discharge alongside the paper's
# 91-100-window variants, so the design matrix has 11 columns total. The
# extra columns help in practice — different fade phases.
# Reproduced by ``severson_features_full`` in ``data_loaders.severson_parser``;
# keep the column order in sync between the two so OLS coefficients line up.
FULL_FEATURES: tuple[str, ...] = DISCHARGE_FEATURES + (
    "log_max_temp_2_100",
    "log_temp_integral_2_100",
    "log_charge_time_avg_2_6",
    "slope_q_91_100",
    "intercept_q_91_100",
    "q_at_cycle_100",
)


def run_full_pipeline(
    df: pd.DataFrame,
    features: tuple[str, ...] = DISCHARGE_FEATURES,
    target: str = "cycle_life",
    log_target: str = "log_cycle_life",
    split: str = "random",
    train_batches: Iterable[str] = ("b1", "b2"),
    test_batches: Iterable[str] = ("b3",),
    seed: int = 0,
    test_size: float = 0.30,
) -> dict:
    """Train, evaluate, return everything a notebook needs to render results.

    Defaults to the Severson Discharge model (5 features) — pass
    ``features=VARIANCE_FEATURES`` to reproduce the simpler 1-feature
    baseline (and confirm it lands at ~15 % MAPE per Severson Table 1).

    Parameters
    ----------
    split : 'random' (default, paper-style) or 'cross_batch' (harder).
    """
    if split == "random":
        train, test = severson_random_split(df, test_size=test_size, seed=seed)
    elif split == "cross_batch":
        train, test = severson_train_test_split(df, train_batches, test_batches)
    else:
        raise ValueError(f"unknown split={split!r}")
    if len(train) < len(features) + 1 or len(test) < 2:
        raise ValueError(
            f"insufficient data: train={len(train)}, test={len(test)}, n_features={len(features)}"
        )

    X_train = train[list(features)].values
    X_test = test[list(features)].values

    model = fit_linear(X_train, train[log_target].values, features)

    train_pred = model.predict_cycles(X_train)
    test_pred = model.predict_cycles(X_test)

    train_metrics = evaluate(train[target].values, train_pred)
    test_metrics = evaluate(test[target].values, test_pred)

    coef_str = ", ".join(f"{f}={c:.4f}" for f, c in zip(model.features, model.coef))

    summary = (
        f"Severson 2019 reproduction · {len(features)}-feature model\n"
        f"  features  : {list(features)}\n"
        f"  train     : {train_metrics['n']} cells (batches {sorted(train['batch'].unique())})\n"
        f"  test      : {test_metrics['n']} cells (batches {sorted(test['batch'].unique())})\n"
        f"  intercept : {model.intercept:.4f}\n"
        f"  coef      : {coef_str}\n"
        f"  train MAPE: {train_metrics['mape_pct']:.2f} %\n"
        f"  test  MAPE: {test_metrics['mape_pct']:.2f} %\n"
        f"  test  RMSE: {test_metrics['rmse_cycles']:.0f} cycles\n"
        f"  test  R²  : {test_metrics['r2']:.3f}"
    )

    return {
        "model": model,
        "train_df": train,
        "test_df": test,
        "train_pred": train_pred,
        "test_pred": test_pred,
        "train_metrics": train_metrics,
        "test_metrics": test_metrics,
        "summary": summary,
    }
