"""Regenerate the fleet inference artifact (model_validation.json) from the
PRODUCTION TCN model, replacing the competition-era LSTM on the live fleet
path (/twin + /dashboard).

Schema is byte-for-byte compatible with scripts/export_lstm_onnx.py's output
so the Server Components consume it unchanged; only the underlying sequence
model changes (LSTM -> dilated 1D-CNN). The LSTM remains documented as the
baseline (whitepaper §3.3.6 / §3.4) and its quant report is untouched.

Reuses the pure helpers (dataset, conformal, fleet-status picker) from
export_lstm_onnx; supplies TCN-specific MC-dropout + walkthrough extraction.

Outputs:
  models/tcn_rul.fleet.onnx
  packages/shared/scenarios/model_validation.json
  apps/web/public/scenarios/model_validation.json
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "packages" / "battery-twin"))
sys.path.insert(0, str(REPO / "scripts"))

from data_loaders import severson_parser as sp
from tcn_rul import model as TCN
from lstm_rul.baseline import evaluate
# Reuse the pure (model-agnostic) helpers from the LSTM exporter.
from export_lstm_onnx import (
    SEED, TEST_SIZE, CALIB_SIZE, FLEET_STATUSES,
    build_dataset, _build_predicted_vs_actual, _load_fleet_distribution,
    _pick_walkthrough_cells, conformal_calibrate, apply_conformal,
)


def _enable_dropout(model: torch.nn.Module) -> None:
    """Eval mode everywhere except Dropout layers (kept in train for MC dropout).
    TCN has no recurrent module, so toggling nn.Dropout is sufficient."""
    model.eval()
    for m in model.modules():
        if isinstance(m, torch.nn.Dropout):
            m.train()


def predict_mc_dropout(model, scaler, X, n_samples: int = 100) -> dict:
    _enable_dropout(model)
    Xn = torch.tensor(scaler.transform(X), dtype=torch.float32)
    samples = []
    with torch.no_grad():
        for _ in range(n_samples):
            samples.append(10.0 ** model(Xn).cpu().numpy())
    arr = np.stack(samples, axis=0)
    return {
        "median": np.percentile(arr, 50, axis=0),
        "p5": np.percentile(arr, 5, axis=0), "p10": np.percentile(arr, 10, axis=0),
        "p90": np.percentile(arr, 90, axis=0), "p95": np.percentile(arr, 95, axis=0),
    }


def extract_walkthroughs(model, scaler, X, y, ids, batches, pred_all, cell_indices, pi=None):
    """TCN analog of the LSTM walkthrough: hidden_activation = per-timestep mean
    |conv feature| from the last TCN block; cumulative_pred = prefix global-avg-
    pool up to timestep t -> head (a 'prediction converges as cycles accrue' curve)."""
    model.eval()
    out = []
    with torch.no_grad():
        for idx, label, fleet_status, fleet_pct in cell_indices:
            x_raw = X[idx]
            x_t = torch.tensor(scaler.transform(X[idx : idx + 1]), dtype=torch.float32)
            feat = model.tcn(x_t.transpose(1, 2))           # (1, C, 99)
            hidden_act = feat[0].abs().mean(dim=0).numpy()  # (99,) mean over channels
            cumul = []
            for t in range(feat.shape[2]):
                prefix = feat[:, :, : t + 1].mean(dim=2)    # (1, C) prefix avg pool
                cumul.append(float(10.0 ** float(model.head(prefix).item())))
            entry = {
                "cell_id": ids[idx], "batch": batches[idx], "label": label,
                "fleet_status": fleet_status, "fleet_pct": fleet_pct,
                "actual": int(round(float(y[idx]))), "predicted": int(round(float(pred_all[idx]))),
                "input_raw": [[round(float(v), 5) for v in row] for row in x_raw.tolist()],
                "hidden_activation": [round(float(v), 4) for v in hidden_act.tolist()],
                "cumulative_pred": [int(round(c)) for c in cumul],
            }
            if pi is not None:
                entry["pi_median"] = int(round(float(pi["median"][idx])))
                entry["pi_lower"] = int(round(float(pi["p5"][idx])))
                entry["pi_upper"] = int(round(float(pi["p95"][idx])))
            out.append(entry)
    return out


def main() -> None:
    print("loading dataset (Severson + BBU-duty)...")
    X, y_log, ids, batches = build_dataset(include_bbu=True)
    y = 10.0 ** y_log
    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(X))
    n = len(X)
    n_test = int(n * TEST_SIZE)
    n_cal = int(n * CALIB_SIZE)
    te, cal, tr = idx[:n_test], idx[n_test : n_test + n_cal], idx[n_test + n_cal :]
    print(f"  {n} cells  train={len(tr)} cal={len(cal)} test={len(te)}")

    print("training production TCN (same protocol as LSTM fleet path)...")
    res = TCN.train_model(
        X[tr], y_log[tr], X[te], y_log[te],
        epochs=300, batch_size=16, lr=1e-3, dropout=0.15, patience=40, seed=SEED, verbose=False,
    )
    pred_train = TCN.predict_cycles(res.model, res.scaler, X[tr])
    pred_test = TCN.predict_cycles(res.model, res.scaler, X[te])
    pred_all = TCN.predict_cycles(res.model, res.scaler, X)
    m_tr = evaluate(y[tr], pred_train)
    m_te = evaluate(y[te], pred_test)
    print(f"  train MAPE {m_tr['mape_pct']:.2f}%   test MAPE {m_te['mape_pct']:.2f}%   R2 {m_te['r2']:.3f}")

    models = REPO / "models"; models.mkdir(exist_ok=True)
    onnx_path = models / "tcn_rul.fleet.onnx"
    dummy = torch.tensor(res.scaler.transform(X[:1]), dtype=torch.float32)
    res.model.eval()
    torch.onnx.export(
        res.model, dummy, str(onnx_path),
        input_names=["per_cycle_features"], output_names=["log10_cycle_life"],
        dynamic_axes={"per_cycle_features": {0: "batch"}, "log10_cycle_life": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    onnx_size_kb = onnx_path.stat().st_size / 1024.0

    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    onnx_inp = res.scaler.transform(X[:1]).astype(np.float32)
    diff = float(np.max(np.abs(
        sess.run(None, {"per_cycle_features": onnx_inp})[0]
        - res.model(torch.tensor(onnx_inp)).detach().numpy()
    )))
    sample = res.scaler.transform(X[0:1]).astype(np.float32)
    for _ in range(20):
        sess.run(None, {"per_cycle_features": sample})
    t = np.array([(lambda t0: (sess.run(None, {"per_cycle_features": sample}), (time.perf_counter() - t0) * 1000)[1])(time.perf_counter()) for _ in range(1000)])
    p50, p99 = float(np.percentile(t, 50)), float(np.percentile(t, 99))
    print(f"  ONNX {onnx_size_kb:.1f} KiB  max|onnx-torch|={diff:.2e}  latency p50 {p50:.3f}ms p99 {p99:.3f}ms")

    out = REPO / "packages" / "shared" / "scenarios" / "model_validation.json"
    web_out = REPO / "apps" / "web" / "public" / "scenarios" / "model_validation.json"

    payload = {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/export_tcn_onnx.py",
            "torch_version": torch.__version__,
            "onnxruntime_version": ort.__version__,
            "source_proposal": "Sysblade_HyperBuffer_Proposal_v2.2.pdf",
            "model_family": "TCN (production; replaces LSTM on fleet path — see whitepaper §3.4.1)",
        },
        "title": "TCN (1D-CNN) RUL — Severson 2019 + synthetic BBU-duty + ONNX edge inference (production fleet model)",
        "description": (
            f"Production dilated 1D-CNN (TCN) trained on per-cycle summary features from "
            f"{X.shape[0]} LFP cells ({sum(1 for b in batches if b != 'bbu')} Severson 2019 "
            f"+ {sum(1 for b in batches if b == 'bbu')} synthetic BBU-duty regime-augmentation "
            f"cells). Replaces the competition-era LSTM on the fleet inference path: NPU-native "
            f"(no recurrent ops), statically INT8-quantisable (QAT-deployable). LSTM retained as "
            f"documented baseline (whitepaper §3.3.6 / §3.4). Same seed=42 / 60-20-20 split."
        ),
        "model": {
            "architecture": "TCN: dilated Conv1d x4 (dilations 1/2/4/8, ch 32/32/32/48) + GlobalAvgPool + Dense(32) + Linear(1)",
            "n_parameters": int(sum(p.numel() for p in res.model.parameters())),
            "input_shape": list(X.shape[1:]),
            "feature_names": list(sp.PER_CYCLE_FEATURE_NAMES),
            "onnx_size_kb": onnx_size_kb,
            "onnx_torch_max_diff": diff,
        },
        "metrics": {
            "n_train": len(tr), "n_test": len(te),
            "train_mape_pct": m_tr["mape_pct"], "test_mape_pct": m_te["mape_pct"],
            "test_rmse_cycles": m_te["rmse_cycles"], "test_r2": m_te["r2"],
            "split": f"random_{int(round((1-TEST_SIZE)*100))}_{int(round(TEST_SIZE*100))}_seed{SEED}",
        },
        "latency": {
            "device": "CPU (laptop) via onnxruntime", "samples": 1000,
            "p50_ms": p50, "p99_ms": p99, "target_ms": 50, "passes_target": p99 < 50,
        },
        "predicted_vs_actual": _build_predicted_vs_actual(ids, batches, y, pred_all, te),
    }

    print("MC Dropout (100) + split conformal...")
    pi = predict_mc_dropout(res.model, res.scaler, X, n_samples=100)
    raw_w = pi["p95"] - pi["p5"]
    raw_cov = float(np.mean((y[te] >= pi["p5"][te]) & (y[te] <= pi["p95"][te])))
    cal_pi = {k: v[cal] for k, v in pi.items()}
    q, diag = conformal_calibrate(cal_pi, y[cal], alpha=0.10)
    pic = apply_conformal(pi, q)
    conf_w = pic["conformal_upper"] - pic["conformal_lower"]
    cal_cov = float(np.mean((y[te] >= pic["conformal_lower"][te]) & (y[te] <= pic["conformal_upper"][te])))
    print(f"  q={q:.3f}  raw cov {raw_cov*100:.0f}% w {np.median(raw_w):.0f}  conformal cov {cal_cov*100:.0f}% w {np.median(conf_w):.0f}")
    payload["uncertainty"] = {
        "method": "mc_dropout", "n_samples": 100,
        "raw_test_coverage_90pct": raw_cov, "raw_median_pi_width_cycles": float(np.median(raw_w)),
        "conformal_method": "split_conformal_adaptive", "conformal_alpha": 0.10,
        "conformal_q_factor": q, "conformal_n_calibration": int(len(cal)),
        "conformal_test_coverage_90pct": cal_cov,
        "conformal_median_pi_width_cycles": float(np.median(conf_w)),
        "test_coverage_90pct": cal_cov, "median_pi_width_cycles": float(np.median(conf_w)),
    }
    pi["p5"], pi["p95"] = pic["conformal_lower"], pic["conformal_upper"]

    fleet_dist = _load_fleet_distribution()
    picks = _pick_walkthrough_cells(y, pred_all, n_picks=9)
    payload["walkthroughs"] = extract_walkthroughs(res.model, res.scaler, X, y, ids, batches, pred_all, picks, pi=pi)
    payload["fleet_status_distribution_pct"] = fleet_dist

    body = json.dumps(payload, separators=(",", ":"), default=float)
    out.write_text(body, encoding="utf-8")
    web_out.write_text(body, encoding="utf-8")
    print(f"wrote {out.relative_to(REPO)} and {web_out.relative_to(REPO)} ({len(body)/1024:.1f} KiB)")

    torch.save({"state_dict": res.model.state_dict(), "scaler": res.scaler.to_dict(),
                "meta": {"test_mape": m_te["mape_pct"], "test_r2": m_te["r2"], "role": "fleet"}},
               models / "tcn_rul.fleet.pt")
    print(f"\n=== fleet model = TCN === test MAPE {m_te['mape_pct']:.2f}%  R2 {m_te['r2']:.3f}  "
          f"conformal PI {np.median(raw_w):.0f}->{np.median(conf_w):.0f} cycles  ({len(tr)}tr/{len(cal)}cal/{len(te)}te)")


if __name__ == "__main__":
    main()
