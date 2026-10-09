"""Post-hoc robust statistics from ml_e1_tcn_multiseed.json (no retraining):
median APE per seed (TCN / GBT / constant) and the worst-cell blow-ups that
drive the heavy-tailed MAPE of the TCN.

Run: .venv/Scripts/python.exe scripts/audit/ml_e1_extras.py
"""
from __future__ import annotations

import json

import numpy as np

from ml_common import AUDIT_DIR, meta, summarize, write_json

SRC = AUDIT_DIR / "ml_e1_tcn_multiseed.json"
OUT = AUDIT_DIR / "ml_e1_extras.json"


def main() -> int:
    d = json.loads(SRC.read_text(encoding="utf-8"))
    out = {"_meta": meta("scripts/audit/ml_e1_extras.py", source=SRC.name, source_generated_at=d["_meta"]["generated_at"])}
    for kind in ("main", "main_t60", "lbo_b3", "extrap"):
        R = [r for r in d["per_seed"] if r["kind"] == kind]
        rows = []
        for r in R:
            y = np.array(r["y_test"]); p = np.array(r["tcn_pred_test"])
            g = np.array([np.nan if v is None else v for v in r["gbt_pred_test"]], float)
            isb = np.array([c.startswith("bbu") for c in r["test_ids"]])
            c = np.where(isb, r["const_medians"]["bbu"], r["const_medians"]["severson"])
            ape = lambda q: np.abs(q - y) / y * 100  # noqa: E731
            a_t = ape(p)
            worst = int(np.argmax(a_t))
            rows.append({"seed": r["seed"], "tcn_median_ape": float(np.median(a_t)), "gbt_median_ape": float(np.nanmedian(ape(g))),
                         "const_median_ape": float(np.median(ape(c))), "tcn_max_ape": float(a_t.max()),
                         "tcn_n_cells_ape_gt_100": int((a_t > 100).sum()),
                         "tcn_worst_cell": {"id": r["test_ids"][worst], "actual": float(y[worst]), "pred": float(p[worst])}})
        out[kind] = {
            "per_seed": rows,
            "tcn_median_ape": summarize([x["tcn_median_ape"] for x in rows]),
            "gbt_median_ape": summarize([x["gbt_median_ape"] for x in rows]),
            "const_median_ape": summarize([x["const_median_ape"] for x in rows]),
            "seeds_with_tcn_cell_ape_gt_100": int(sum(x["tcn_n_cells_ape_gt_100"] > 0 for x in rows)),
        }
    write_json(OUT, out)
    for k in ("main", "main_t60", "lbo_b3", "extrap"):
        o = out[k]
        print(k, "medAPE tcn %.1f gbt %.1f const %.1f | seeds w/ APE>100: %d" % (
            o["tcn_median_ape"]["median"], o["gbt_median_ape"]["median"], o["const_median_ape"]["median"], o["seeds_with_tcn_cell_ape_gt_100"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
