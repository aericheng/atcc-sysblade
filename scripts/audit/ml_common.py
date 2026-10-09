"""Shared helpers for the ML-rigor audit (A3) experiments.

Read-only with respect to the rest of the repo: every function here either
imports an existing helper unchanged or adds new audit-only logic. Outputs go
to data/processed/audit/ml_*.json only.
"""
from __future__ import annotations

import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
AUDIT_DIR = REPO / "data" / "processed" / "audit"
CACHE_NPZ = AUDIT_DIR / "ml_cache_dataset.npz"
MV_JSON = REPO / "apps" / "web" / "public" / "scenarios" / "model_validation.json"
SME_JSON = REPO / "data" / "processed" / "severson_model_eval.json"

for p in (REPO / "packages" / "battery-twin", REPO / "scripts"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def versions() -> dict:
    out = {"python": platform.python_version(), "numpy": np.__version__}
    for mod in ("torch", "sklearn", "scipy", "pandas"):
        try:
            out[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            out[mod] = None
    return out


def meta(generator: str, **extra) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": generator,
        "versions": versions(),
        "rerun": f".venv/Scripts/python.exe {generator}",
        **extra,
    }


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=_np_default), encoding="utf-8")
    print(f"wrote {path.relative_to(REPO)}")


def _np_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


# ---------------------------------------------------------------- metrics
def mape(y, p) -> float:
    y = np.asarray(y, float); p = np.asarray(p, float)
    return float(np.mean(np.abs((y - p) / y)) * 100.0)


def r2(y, p) -> float:
    y = np.asarray(y, float); p = np.asarray(p, float)
    ss_tot = np.sum((y - y.mean()) ** 2)
    return float(1.0 - np.sum((y - p) ** 2) / ss_tot) if ss_tot > 0 else float("nan")


def spearman(y, p) -> float:
    from scipy.stats import spearmanr
    if len(y) < 3 or np.ptp(np.asarray(p, float)) == 0 or np.ptp(np.asarray(y, float)) == 0:
        return float("nan")  # undefined for a constant predictor
    return float(spearmanr(y, p).statistic)


def metrics(y, p) -> dict:
    return {"n": int(len(y)), "mape_pct": mape(y, p), "r2": r2(y, p), "spearman": spearman(y, p)}


def summarize(vals) -> dict:
    a = np.asarray([v for v in vals if v is not None and np.isfinite(v)], float)
    if len(a) == 0:
        return {"n": 0}
    return {
        "n": int(len(a)),
        "mean": float(a.mean()),
        "sd": float(a.std(ddof=1)) if len(a) > 1 else 0.0,
        "median": float(np.median(a)),
        "min": float(a.min()),
        "max": float(a.max()),
    }


def load_cache() -> dict:
    if not CACHE_NPZ.exists():
        raise FileNotFoundError(f"{CACHE_NPZ} missing - run scripts/audit/ml_build_cache.py first")
    z = np.load(CACHE_NPZ, allow_pickle=False)
    return {k: z[k] for k in z.files}


# ---------------------------------------------------------------- splits
def stratified_split(groups: np.ndarray, seed: int, fracs=(0.5, 0.1, 0.2, 0.2)) -> dict:
    """Cell-level split stratified by regime group (e.g. 'sev' / 'bbu').

    fracs = (train, val, cal, test). Within each group: permute with
    default_rng(seed), allocate test/cal/val by floor(frac * n_group), rest
    to train. Each cell lands in exactly one of the four sets.
    """
    rng = np.random.default_rng(seed)
    out = {"train": [], "val": [], "cal": [], "test": []}
    for g in sorted(set(groups.tolist())):
        idx = np.flatnonzero(groups == g)
        idx = idx[rng.permutation(len(idx))]
        n = len(idx)
        n_te = int(np.floor(fracs[3] * n)); n_cal = int(np.floor(fracs[2] * n)); n_val = int(np.floor(fracs[1] * n))
        out["test"].extend(idx[:n_te])
        out["cal"].extend(idx[n_te:n_te + n_cal])
        out["val"].extend(idx[n_te + n_cal:n_te + n_cal + n_val])
        out["train"].extend(idx[n_te + n_cal + n_val:])
    res = {k: np.sort(np.asarray(v, int)) for k, v in out.items()}
    allidx = np.concatenate(list(res.values()))
    assert len(allidx) == len(set(allidx.tolist())) == len(groups), "split overlap/missing"
    return res


def assert_disjoint(split: dict) -> None:
    keys = list(split)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            inter = set(np.asarray(split[a]).tolist()) & set(np.asarray(split[b]).tolist())
            assert not inter, f"leak: {a} & {b} share {sorted(inter)[:5]}"
