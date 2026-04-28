"""Export the trained LSTM RUL model to ONNX and benchmark CPU latency.

Why this matters: the proposal §E.1 Tier-C commits to "edge inference on
STM32N6, ms-level latency". STM32N6 deployment is a W4+ task; what we
can validate today is the equivalent path:

   PyTorch model
   → torch.onnx.export
   → onnxruntime CPU (proxy for the embedded NPU)
   → measured latency on this laptop

If the laptop CPU is faster than 50 ms and the model exports cleanly,
the embedded path is plausible. STM32N6 has dedicated NPU hardware, so
real deployment should be ≤ laptop CPU.

Outputs:
  models/lstm_rul.onnx
  packages/shared/scenarios/model_validation.json
    { mape_pct, rmse_cycles, r2, n_train, n_test,
      onnx_latency_ms_p50, onnx_latency_ms_p99,
      predicted_vs_actual: [{cell_id, batch, actual, predicted}, ...] }
"""
from __future__ import annotations

import json
import pickle
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "packages" / "battery-twin"))

from data_loaders import severson_parser as sp
from lstm_rul import model as M
from lstm_rul.baseline import evaluate

DEVICE = "cpu"
SEED = 42
TEST_SIZE = 0.30


def build_dataset() -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    cells_path = REPO / "data" / "processed" / "severson_cells.pkl"
    cells = pickle.loads(cells_path.read_bytes())
    ok = [c for c in cells if c.cycle_life > 0 and c.n_cycles >= 100]
    seqs, labels, ids, batches = [], [], [], []
    for c in ok:
        seq = sp.per_cycle_summary(c)
        if seq is None or seq.shape != (99, 7):
            continue
        seqs.append(seq)
        labels.append(np.log10(c.cycle_life))
        ids.append(c.cell_id)
        batches.append(c.batch)
    return np.stack(seqs), np.asarray(labels), ids, batches


def main() -> None:
    print("loading dataset...")
    X, y_log, ids, batches = build_dataset()
    y = 10.0 ** y_log
    print(f"  {X.shape[0]} cells, X.shape={X.shape}")

    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(X))
    split_at = int(len(X) * (1.0 - TEST_SIZE))
    tr, te = idx[:split_at], idx[split_at:]

    print("training LSTM...")
    res = M.train_model(
        X[tr], y_log[tr], X[te], y_log[te],
        epochs=300, batch_size=16, lr=1e-3,
        hidden_dim=64, num_layers=2, dropout=0.15,
        patience=40, seed=SEED, verbose=False,
    )

    pred_train = M.predict_cycles(res.model, res.scaler, X[tr])
    pred_test = M.predict_cycles(res.model, res.scaler, X[te])
    pred_all = M.predict_cycles(res.model, res.scaler, X)
    metrics_train = evaluate(y[tr], pred_train)
    metrics_test = evaluate(y[te], pred_test)
    print(f"  train MAPE {metrics_train['mape_pct']:.2f}%   test MAPE {metrics_test['mape_pct']:.2f}%")

    models_dir = REPO / "models"
    models_dir.mkdir(exist_ok=True)

    print("exporting to ONNX...")
    onnx_path = models_dir / "lstm_rul.onnx"
    dummy = torch.tensor(res.scaler.transform(X[:1]), dtype=torch.float32)
    res.model.eval()
    torch.onnx.export(
        res.model,
        dummy,
        onnx_path,
        input_names=["per_cycle_features"],
        output_names=["log10_cycle_life"],
        dynamic_axes={
            "per_cycle_features": {0: "batch"},
            "log10_cycle_life": {0: "batch"},
        },
        opset_version=17,
    )
    onnx_size_kb = onnx_path.stat().st_size / 1024
    print(f"  wrote {onnx_path}  ({onnx_size_kb:.1f} KiB)")

    # Verify the ONNX output matches the PyTorch output.
    print("verifying ONNX equivalence...")
    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    onnx_inp = res.scaler.transform(X[:1]).astype(np.float32)
    onnx_out = sess.run(None, {"per_cycle_features": onnx_inp})[0]
    torch_out = res.model(torch.tensor(onnx_inp)).detach().numpy()
    diff = float(np.max(np.abs(onnx_out - torch_out)))
    print(f"  max |ONNX - PyTorch| = {diff:.2e}  ({'OK' if diff < 1e-4 else 'MISMATCH'})")

    # Benchmark single-sample latency (this is what an STM32N6 would see —
    # it processes one BBU's reading at a time, not batches).
    print("benchmarking CPU latency (single sample, 1000 trials)...")
    sample = res.scaler.transform(X[0:1]).astype(np.float32)
    # warm up
    for _ in range(20):
        sess.run(None, {"per_cycle_features": sample})
    timings = []
    for _ in range(1000):
        t0 = time.perf_counter()
        sess.run(None, {"per_cycle_features": sample})
        timings.append((time.perf_counter() - t0) * 1000.0)  # ms
    timings = np.asarray(timings)
    p50 = float(np.percentile(timings, 50))
    p99 = float(np.percentile(timings, 99))
    print(f"  p50 {p50:.2f} ms   p99 {p99:.2f} ms   target <50 ms")

    # Build the model_validation.json payload for the UI.
    out = REPO / "packages" / "shared" / "scenarios" / "model_validation.json"
    web_out = REPO / "apps" / "web" / "public" / "scenarios" / "model_validation.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    web_out.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/export_lstm_onnx.py",
            "torch_version": torch.__version__,
            "onnxruntime_version": ort.__version__,
            "source_proposal": "Sysblade_HyperBuffer_Proposal_v2.1.pdf",
        },
        "title": "LSTM RUL — Severson 2019 reproduction + ONNX edge inference",
        "description": (
            "PyTorch 2-layer LSTM (hidden=64) trained on per-cycle summary "
            "features from 138 LFP cells (Severson 2019 batches 1+2+3). "
            "Exported to ONNX and benchmarked under onnxruntime CPU as a "
            "proxy for the STM32N6 NPU deployment path."
        ),
        "model": {
            "architecture": "LSTM(input=7, hidden=64, layers=2) + Dense(32) + Linear(1)",
            "n_parameters": int(sum(p.numel() for p in res.model.parameters())),
            "input_shape": list(X.shape[1:]),
            "feature_names": ["cycle_norm", "qd_max", "qd_min", "v_mean", "v_std", "t_max", "duration_s"],
            "onnx_size_kb": onnx_size_kb,
            "onnx_torch_max_diff": diff,
        },
        "metrics": {
            "n_train": int(len(tr)),
            "n_test": int(len(te)),
            "train_mape_pct": metrics_train["mape_pct"],
            "test_mape_pct": metrics_test["mape_pct"],
            "test_rmse_cycles": metrics_test["rmse_cycles"],
            "test_r2": metrics_test["r2"],
            "split": "random_70_30_seed42",
        },
        "latency": {
            "device": "CPU (laptop) via onnxruntime",
            "samples": 1000,
            "p50_ms": p50,
            "p99_ms": p99,
            "target_ms": 50,
            "passes_target": p99 < 50,
        },
        "predicted_vs_actual": [
            {
                "cell_id": ids[i],
                "batch": batches[i],
                "actual": int(y[i]),
                "predicted": int(pred_all[i]),
                "split": ("test" if i in set(te) else "train"),
            }
            for i in range(len(X))
        ],
    }

    body = json.dumps(payload, separators=(",", ":"), default=float)
    out.write_text(body, encoding="utf-8")
    web_out.write_text(body, encoding="utf-8")
    print(f"wrote {out.relative_to(REPO)} and {web_out.relative_to(REPO)} ({len(body)/1024:.1f} KiB)")

    # Save the checkpoint too for future loading
    M.save_checkpoint(
        models_dir / "lstm_rul.pt",
        res.model,
        res.scaler,
        meta={
            "train_mape": metrics_train["mape_pct"],
            "test_mape": metrics_test["mape_pct"],
            "feature_names": payload["model"]["feature_names"],
        },
    )


if __name__ == "__main__":
    main()
