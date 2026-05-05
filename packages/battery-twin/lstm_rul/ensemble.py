"""Bagging-OLS and gradient-boosting variants of the Severson RUL regressor.

Why this exists: the v2.2 §B commitment is < 10 % MAPE aligned with the
Severson paper's 9.1 % baseline. The plain 13-feature OLS in
``baseline.py`` lands at median 14.5 % across 10 seeds. Two routes close
the gap without changing the feature set:

* ``BaggedLinearModel`` — bootstrap-aggregated OLS. Each bag fits the
  same 13-feature linear regression on a resampled train set; predictions
  are averaged in log-space. Variance reduction without changing bias,
  so it tends to lift the worst seeds (the ones that landed on a fold
  with an outlier) more than the best ones, pulling the median down.

* ``GradientBoostingModel`` — sklearn's ``GradientBoostingRegressor``
  fit on log-cycle-life. Captures the mild non-linearities in the
  feature set (e.g. saturation in q_at_cycle_100 versus cycle life)
  that pure OLS misses. Tuned conservatively (n_estimators=400, depth=3,
  learning_rate=0.03, subsample=0.8) to match the small-data regime.

Both expose the same ``predict_cycles`` API as
:class:`lstm_rul.baseline.LinearModel`, so the existing eval and
conformal-calibration plumbing in :mod:`scripts.eval_severson_models`
can call them without branching.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from sklearn.ensemble import GradientBoostingRegressor, HistGradientBoostingRegressor

from . import baseline as bl


# ---------------------------------------------------------------------------
# Bagging OLS — bootstrap aggregation around the existing linear fit
# ---------------------------------------------------------------------------
@dataclass
class BaggedLinearModel:
    bags: list[bl.LinearModel] = field(default_factory=list)
    features: tuple[str, ...] = ()

    def predict_log(self, X: np.ndarray) -> np.ndarray:
        # Average predictions in log space — equivalent to geometric mean
        # in cycle space, which matches the OLS log-target geometry.
        preds = np.stack([m.predict_log(X) for m in self.bags], axis=0)
        return preds.mean(axis=0)

    def predict_cycles(self, X: np.ndarray) -> np.ndarray:
        return 10.0 ** self.predict_log(X)


def fit_bagged_linear(
    X: np.ndarray,
    y_log: np.ndarray,
    features: tuple[str, ...],
    n_bags: int = 25,
    bag_fraction: float = 1.0,
    seed: int = 0,
) -> BaggedLinearModel:
    rng = np.random.default_rng(seed)
    n = len(y_log)
    bag_n = max(int(round(n * bag_fraction)), len(features) + 2)
    bags: list[bl.LinearModel] = []
    for _ in range(n_bags):
        idx = rng.integers(0, n, size=bag_n)  # sample with replacement
        bags.append(bl.fit_linear(X[idx], y_log[idx], features))
    return BaggedLinearModel(bags=bags, features=features)


# ---------------------------------------------------------------------------
# Gradient-boosted trees — sklearn baseline, log target to match OLS
# ---------------------------------------------------------------------------
@dataclass
class GradientBoostingModel:
    estimator: GradientBoostingRegressor
    features: tuple[str, ...]

    def predict_log(self, X: np.ndarray) -> np.ndarray:
        return self.estimator.predict(np.atleast_2d(np.asarray(X, dtype=np.float64)))

    def predict_cycles(self, X: np.ndarray) -> np.ndarray:
        return 10.0 ** self.predict_log(X)


def fit_gbt(
    X: np.ndarray,
    y_log: np.ndarray,
    features: tuple[str, ...],
    seed: int = 0,
    n_estimators: int = 400,
    max_depth: int = 3,
    learning_rate: float = 0.03,
    subsample: float = 0.8,
    min_samples_leaf: int = 5,
) -> GradientBoostingModel:
    est = GradientBoostingRegressor(
        n_estimators=n_estimators,
        max_depth=max_depth,
        learning_rate=learning_rate,
        subsample=subsample,
        min_samples_leaf=min_samples_leaf,
        random_state=seed,
    )
    est.fit(np.asarray(X, dtype=np.float64), np.asarray(y_log, dtype=np.float64))
    return GradientBoostingModel(estimator=est, features=features)


# ---------------------------------------------------------------------------
# Bagged GBT — average K stochastic GradientBoostingRegressor predictions
# ---------------------------------------------------------------------------
@dataclass
class BaggedGradientBoostingModel:
    bags: list[GradientBoostingRegressor]
    features: tuple[str, ...]

    def predict_log(self, X: np.ndarray) -> np.ndarray:
        Xa = np.atleast_2d(np.asarray(X, dtype=np.float64))
        preds = np.stack([m.predict(Xa) for m in self.bags], axis=0)
        return preds.mean(axis=0)

    def predict_cycles(self, X: np.ndarray) -> np.ndarray:
        return 10.0 ** self.predict_log(X)


def fit_bagged_gbt(
    X: np.ndarray,
    y_log: np.ndarray,
    features: tuple[str, ...],
    seed: int = 0,
    n_models: int = 24,
    n_estimators: int = 900,
    max_depth: int = 2,
    learning_rate: float = 0.015,
    subsample: float = 0.65,
    min_samples_leaf: int = 8,
) -> BaggedGradientBoostingModel:
    rng = np.random.default_rng(seed)
    Xa = np.asarray(X, dtype=np.float64)
    ya = np.asarray(y_log, dtype=np.float64)
    bags: list[GradientBoostingRegressor] = []
    for _ in range(n_models):
        sub_seed = int(rng.integers(0, 2**31 - 1))
        est = GradientBoostingRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            subsample=subsample,
            min_samples_leaf=min_samples_leaf,
            random_state=sub_seed,
        )
        est.fit(Xa, ya)
        bags.append(est)
    return BaggedGradientBoostingModel(bags=bags, features=features)


# ---------------------------------------------------------------------------
# HistGBT — sklearn's faster gradient boosting; supports L2 + better defaults
# ---------------------------------------------------------------------------
@dataclass
class HistGBTModel:
    estimator: HistGradientBoostingRegressor
    features: tuple[str, ...]

    def predict_log(self, X: np.ndarray) -> np.ndarray:
        return self.estimator.predict(np.atleast_2d(np.asarray(X, dtype=np.float64)))

    def predict_cycles(self, X: np.ndarray) -> np.ndarray:
        return 10.0 ** self.predict_log(X)


def fit_histgbt(
    X: np.ndarray,
    y_log: np.ndarray,
    features: tuple[str, ...],
    seed: int = 0,
    max_iter: int = 500,
    max_depth: int = 4,
    learning_rate: float = 0.03,
    l2_regularization: float = 1.0,
    min_samples_leaf: int = 8,
) -> HistGBTModel:
    est = HistGradientBoostingRegressor(
        max_iter=max_iter,
        max_depth=max_depth,
        learning_rate=learning_rate,
        l2_regularization=l2_regularization,
        min_samples_leaf=min_samples_leaf,
        random_state=seed,
    )
    est.fit(np.asarray(X, dtype=np.float64), np.asarray(y_log, dtype=np.float64))
    return HistGBTModel(estimator=est, features=features)


# ---------------------------------------------------------------------------
# Stacked ensemble — uniform average of bagged-OLS + bagged-GBT + HistGBT
# in log space. Three diverse learners (linear, deep boosting, hist-binned
# boosting) reduce both bias (linear-only error) and variance (single-seed
# tree noise). No meta-learner: a fixed uniform weight keeps the pipeline
# parameter-free and avoids overfitting on the small (~30-cell) test fold.
# ---------------------------------------------------------------------------
@dataclass
class StackedModel:
    members: list  # objects implementing predict_log
    features: tuple[str, ...]

    def predict_log(self, X: np.ndarray) -> np.ndarray:
        Xa = np.atleast_2d(np.asarray(X, dtype=np.float64))
        preds = np.stack([m.predict_log(Xa) for m in self.members], axis=0)
        return preds.mean(axis=0)

    def predict_cycles(self, X: np.ndarray) -> np.ndarray:
        return 10.0 ** self.predict_log(X)


def fit_stack(
    X: np.ndarray,
    y_log: np.ndarray,
    features: tuple[str, ...],
    seed: int = 0,
) -> StackedModel:
    members = [
        fit_bagged_linear(X, y_log, features, seed=seed),
        fit_bagged_gbt(X, y_log, features, seed=seed),
        fit_histgbt(X, y_log, features, seed=seed),
    ]
    return StackedModel(members=members, features=features)


# ---------------------------------------------------------------------------
# Pipeline shim — re-uses baseline.severson_random_split / cross_batch
# ---------------------------------------------------------------------------
ModelKind = str  # "bagged_ols" | "gbt"


def run_pipeline(
    df: pd.DataFrame,
    features: tuple[str, ...],
    kind: ModelKind,
    split: str = "random",
    seed: int = 0,
    test_size: float = 0.30,
    n_bags: int = 25,
    train_batches: tuple[str, ...] = ("b1", "b2"),
    test_batches: tuple[str, ...] = ("b3",),
) -> dict:
    if split == "random":
        train, test = bl.severson_random_split(df, test_size=test_size, seed=seed)
    elif split == "cross_batch":
        train, test = bl.severson_train_test_split(df, train_batches, test_batches)
    else:
        raise ValueError(f"unknown split={split!r}")

    if len(train) < len(features) + 2 or len(test) < 2:
        raise ValueError(
            f"insufficient data: train={len(train)}, test={len(test)}, "
            f"n_features={len(features)}"
        )

    X_train = train[list(features)].values
    X_test = test[list(features)].values
    y_train_log = train["log_cycle_life"].values
    y_test = test["cycle_life"].values

    if kind == "bagged_ols":
        model = fit_bagged_linear(
            X_train, y_train_log, features, n_bags=n_bags, seed=seed
        )
    elif kind == "gbt":
        model = fit_gbt(X_train, y_train_log, features, seed=seed)
    elif kind == "bagged_gbt":
        model = fit_bagged_gbt(X_train, y_train_log, features, seed=seed)
    elif kind == "histgbt":
        model = fit_histgbt(X_train, y_train_log, features, seed=seed)
    elif kind == "stack":
        model = fit_stack(X_train, y_train_log, features, seed=seed)
    else:
        raise ValueError(f"unknown kind={kind!r}")

    test_pred = model.predict_cycles(X_test)
    train_pred = model.predict_cycles(X_train)
    train_metrics = bl.evaluate(train["cycle_life"].values, train_pred)
    test_metrics = bl.evaluate(y_test, test_pred)

    return {
        "model": model,
        "train_metrics": train_metrics,
        "test_metrics": test_metrics,
        "test_df": test,
        "test_pred": test_pred,
    }
