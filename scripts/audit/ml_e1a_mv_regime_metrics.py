"""E1-a: per-regime metrics + constant baselines from the EXISTING
model_validation.json predictions (no retraining).

Reproduces red-team appendix A (redteam-ml-biz.md:240-258) and extends it
with R^2 / Spearman per regime.

Baselines ("two-constant" = regime-aware median):
  * baseline_mv_train151 : median of MV rows labelled split=='train'
    (MV labels the 37 conformal-cal cells as 'train' too, so this is 114+37
    = 151 cells -- exactly what the red-team appendix used).
  * baseline_train114    : median of the true 114 training cells only
    (seed-42 permutation of build_dataset order, from the audit cache) --
    only computed when data/processed/audit/ml_cache_dataset.npz exists.
  * global_median_train151 : one global median (regime-blind), for reference.

Run: .venv/Scripts/python.exe scripts/audit/ml_e1a_mv_regime_metrics.py
"""
from __future__ import annotations

import json

import numpy as np

from ml_common import AUDIT_DIR, CACHE_NPZ, MV_JSON, meta, metrics, write_json

OUT = AUDIT_DIR / "ml_e1a_mv_regime_metrics.json"


def block(a, pred, m):
    return {
        "all": metrics(a, pred),
        "severson": metrics(a[~m], pred[~m]),
        "bbu": metrics(a[m], pred[m]),
    }


def main() -> int:
    d = json.loads(MV_JSON.read_text(encoding="utf-8"))
    pv = d["predicted_vs_actual"]
    isb = lambda r: r["batch"] == "bbu"  # noqa: E731
    tr = [r for r in pv if r["split"] == "train"]
    te = [r for r in pv if r["split"] == "test"]
    a = np.array([r["actual"] for r in te], float)
    t = np.array([r["predicted"] for r in te], float)
    m = np.array([isb(r) for r in te])

    med151 = {g: float(np.median([r["actual"] for r in tr if isb(r) == g])) for g in (True, False)}
    base151 = np.array([med151[isb(r)] for r in te])
    gmed = float(np.median([r["actual"] for r in tr]))

    out = {
        "_meta": meta("scripts/audit/ml_e1a_mv_regime_metrics.py",
                      source=str(MV_JSON.relative_to(MV_JSON.parents[3])),
                      source_generator=d["_meta"].get("generator"),
                      source_torch=d["_meta"].get("torch_version"),
                      note="Uses MV point predictions ('predicted', deterministic TCN). Test = MV split=='test' (n=37, seed-42). "
                           "These test cells were ALSO the early-stopping set in the original run (tcn_rul_report.json _meta.protocol)."),
        "n_test": int(len(te)), "n_test_bbu": int(m.sum()), "n_test_severson": int((~m).sum()),
        "n_mv_train_rows": len(tr),
        "baseline_medians_train151": {"bbu": med151[True], "severson": med151[False]},
        "tcn_mv": block(a, t, m),
        "baseline_regime_median_train151": block(a, base151, m),
        "baseline_global_median_train151": block(a, np.full_like(a, gmed), m),
        "test_prediction_range": {
            "bbu_pred": [float(t[m].min()), float(t[m].max())],
            "bbu_actual": [float(a[m].min()), float(a[m].max())],
            "severson_pred": [float(t[~m].min()), float(t[~m].max())],
            "severson_actual": [float(a[~m].min()), float(a[~m].max())],
        },
    }

    if CACHE_NPZ.exists():
        z = np.load(CACHE_NPZ, allow_pickle=False)
        ids = z["tcn_ids"].tolist(); batches = z["tcn_batches"]
        y = 10.0 ** z["tcn_y_log"]
        n = len(ids)
        idx = np.random.default_rng(42).permutation(n)
        n_te = int(n * 0.2); n_cal = int(n * 0.2)
        te_i, cal_i, tr_i = idx[:n_te], idx[n_te:n_te + n_cal], idx[n_te + n_cal:]
        mv_test_ids = sorted(r["cell_id"] for r in te)
        out["split_reconstruction_matches_mv"] = sorted(ids[i] for i in te_i) == mv_test_ids
        isb_all = batches == "bbu"
        med114 = {g: float(np.median(y[tr_i][isb_all[tr_i] == g])) for g in (True, False)}
        id2pos = {c: i for i, c in enumerate(ids)}
        base114 = np.array([med114[bool(isb_all[id2pos[r["cell_id"]]])] for r in te])
        out["baseline_medians_train114"] = {"bbu": med114[True], "severson": med114[False]}
        out["baseline_regime_median_train114"] = block(a, base114, m)

    write_json(OUT, out)
    tm, bm = out["tcn_mv"], out["baseline_regime_median_train151"]
    print(f"TCN all MAPE {tm['all']['mape_pct']:.2f} R2 {tm['all']['r2']:.3f} | base all {bm['all']['mape_pct']:.2f} R2 {bm['all']['r2']:.3f}")
    print(f"BBU: TCN {tm['bbu']['mape_pct']:.2f} R2 {tm['bbu']['r2']:.3f} rho {tm['bbu']['spearman']:.2f} | base {bm['bbu']['mape_pct']:.2f}")
    print(f"SEV: TCN {tm['severson']['mape_pct']:.2f} R2 {tm['severson']['r2']:.3f} rho {tm['severson']['spearman']:.2f} | base {bm['severson']['mape_pct']:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
