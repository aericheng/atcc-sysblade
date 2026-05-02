"""Quantise lstm_rul.onnx to INT8 and validate accuracy + latency on the
held-out Severson + BBU-duty test set.

Why this script exists. The whitepaper Appendix C currently estimates
"FP32 → INT8 weights ÷ 4" as a heuristic. The proper validation is to
actually quantise the model and measure (a) the file shrinks as expected,
(b) the predictions don't degrade meaningfully versus FP32, and (c) the
single-sample CPU latency benchmark to compare with the FP32 baseline.

We use ``onnxruntime.quantization.quantize_dynamic`` with INT8 weights;
this matches what STMicroelectronics' X-CUBE-AI 9.x toolchain does for
the STM32N6 NPU (per AN5354 §INT8 quantisation), so the FP32→INT8
accuracy gap reported here is a faithful proxy for what an ST trace
would show. The actual NPU latency still has to be measured on hardware
(see ``docs/x_cube_ai_install_sop.md`` for the hand-off path).

Outputs:
  models/lstm_rul.int8.onnx                     — INT8-quantised model
  data/processed/lstm_quantization_report.json  — accuracy + latency deltas

Inputs (must already be generated):
  models/lstm_rul.onnx                          — FP32 export
  packages/shared/scenarios/model_validation.json — FP32 baseline numbers
  data/processed/severson_cells.pkl             — Severson cells cache
  data/processed/bbu_duty_cells.pkl             — synthetic BBU-duty cells
"""
from __future__ import annotations

import json
import pickle
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from onnxruntime.quantization.shape_inference import quant_pre_process

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "packages" / "battery-twin"))

from data_loaders import severson_parser as sp  # noqa: E402
from lstm_rul.model import load_checkpoint  # noqa: E402

FP32_PATH = REPO / "models" / "lstm_rul.onnx"
LSTM_CKPT = REPO / "models" / "lstm_rul.pt"
FP32_PREPROCESSED = REPO / "models" / "lstm_rul.preprocessed.onnx"
INT8_PATH = REPO / "models" / "lstm_rul.int8.onnx"
MODEL_VALIDATION = REPO / "packages" / "shared" / "scenarios" / "model_validation.json"
SEVERSON_CACHE = REPO / "data" / "processed" / "severson_cells.pkl"
BBU_CACHE = REPO / "data" / "processed" / "bbu_duty_cells.pkl"
REPORT = REPO / "data" / "processed" / "lstm_quantization_report.json"

SEED = 42
TEST_SIZE = 0.20
CALIB_SIZE = 0.20


def _load_dataset() -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Mirror scripts/export_lstm_onnx.py::build_dataset minus the training.

    Severson pickle stores ``Cell`` dataclass instances; the BBU pickle
    stores plain dicts (key set defined in
    ``scripts/generate_bbu_duty_cells.py``). Both layouts must produce
    identical (99, 7) sequences for the LSTM to consume.
    """
    if not SEVERSON_CACHE.exists():
        raise FileNotFoundError(f"missing {SEVERSON_CACHE}")

    seqs: list[np.ndarray] = []
    labels: list[float] = []
    ids: list[str] = []

    sev_cells = pickle.loads(SEVERSON_CACHE.read_bytes())
    sev_ok = [c for c in sev_cells if c.cycle_life > 0 and c.n_cycles >= 100]
    for c in sev_ok:
        seq = sp.per_cycle_summary(c)
        if seq is None or seq.shape != (99, 7):
            continue
        seqs.append(seq.astype(np.float32))
        labels.append(float(np.log10(c.cycle_life)))
        ids.append(c.cell_id)

    if BBU_CACHE.exists():
        for c in pickle.loads(BBU_CACHE.read_bytes()):
            seq = c["sequence"]
            if seq is None or seq.shape != (99, 7):
                continue
            seqs.append(seq.astype(np.float32))
            labels.append(float(c["log_cycle_life"]))
            ids.append(c["cell_id"])

    return np.stack(seqs), np.asarray(labels, dtype=np.float32), ids


def _split_indices(n: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED)
    idx = rng.permutation(n)
    n_test = int(n * TEST_SIZE)
    n_cal = int(n * CALIB_SIZE)
    te = idx[:n_test]
    cal = idx[n_test : n_test + n_cal]
    tr = idx[n_test + n_cal :]
    return tr, cal, te


def _load_scaler() -> tuple[np.ndarray, np.ndarray]:
    """Load the FeatureScaler that the LSTM was trained against.

    ``torch.onnx.export`` was called on the model AFTER the scaler step,
    so the ONNX graph expects already-z-scored inputs. The fitted mean
    and std live in the ``lstm_rul.pt`` checkpoint — we read them via
    ``load_checkpoint`` to keep parity with how the LSTM trainer feeds
    inputs at training time.
    """
    if not LSTM_CKPT.exists():
        raise FileNotFoundError(
            f"missing {LSTM_CKPT} — run scripts/export_lstm_onnx.py to "
            f"refresh both the .pt checkpoint and the .onnx export"
        )
    _, scaler, _ = load_checkpoint(LSTM_CKPT, device="cpu")
    mean = np.asarray(scaler.mean, dtype=np.float64)
    std = np.asarray(scaler.std, dtype=np.float64)
    if mean.shape != (7,) or std.shape != (7,) or not np.all(std > 0):
        raise RuntimeError(
            f"scaler shape mismatch: mean={mean.shape}, std={std.shape}"
        )
    return mean, std


def _benchmark_latency(sess: ort.InferenceSession, sample: np.ndarray, n: int = 1000) -> dict:
    for _ in range(20):  # warm-up
        sess.run(None, {"per_cycle_features": sample})
    timings = np.empty(n, dtype=np.float64)
    for i in range(n):
        t0 = time.perf_counter()
        sess.run(None, {"per_cycle_features": sample})
        timings[i] = (time.perf_counter() - t0) * 1000.0
    return {
        "p50_ms": float(np.percentile(timings, 50)),
        "p90_ms": float(np.percentile(timings, 90)),
        "p99_ms": float(np.percentile(timings, 99)),
        "mean_ms": float(timings.mean()),
        "samples": n,
    }


def _mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100.0)


def _r2(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    ss_res = float(np.sum((y_true - y_pred) ** 2))
    ss_tot = float(np.sum((y_true - y_true.mean()) ** 2))
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan")


def main() -> int:
    if not FP32_PATH.exists():
        print(f"ERROR: {FP32_PATH} missing — run scripts/export_lstm_onnx.py first.")
        return 1

    # FP32 weights live in the external .data sidecar (torch.onnx.export
    # default for >2 MB graphs). Report total = onnx + onnx.data so the
    # compression ratio against INT8 is honest.
    fp32_graph_kb = FP32_PATH.stat().st_size / 1024.0
    fp32_data_path = FP32_PATH.with_suffix(".onnx.data")
    fp32_data_kb = (fp32_data_path.stat().st_size / 1024.0) if fp32_data_path.exists() else 0.0
    fp32_total_kb = fp32_graph_kb + fp32_data_kb
    print(
        f"FP32 ONNX:  graph={fp32_graph_kb:.1f} KiB + external data={fp32_data_kb:.1f} KiB"
        f"  = {fp32_total_kb:.1f} KiB total"
    )

    # ONNX shape inference + symbolic shape inference clean-up.
    # quantize_dynamic needs every value_info to match the actual runtime
    # shape; the LSTM-with-dynamic-batch export trips a shape mismatch
    # (64 vs 32 along the batch dim) without this pre-processing step.
    print("pre-processing FP32 ONNX (shape inference + symbolic shape) ...")
    quant_pre_process(
        input_model=str(FP32_PATH),
        output_model_path=str(FP32_PREPROCESSED),
        skip_optimization=False,
        skip_onnx_shape=False,
        skip_symbolic_shape=False,
    )

    print("dynamic-quantising weights to INT8 ...")
    quantize_dynamic(
        model_input=str(FP32_PREPROCESSED),
        model_output=str(INT8_PATH),
        weight_type=QuantType.QInt8,
    )
    int8_size_kb = INT8_PATH.stat().st_size / 1024.0
    print(f"INT8 ONNX:  {INT8_PATH.relative_to(REPO)}  ({int8_size_kb:.1f} KiB) "
          f"— {fp32_total_kb / int8_size_kb:.2f}x smaller vs FP32 total")

    print("loading dataset (Severson + BBU-duty)...")
    X, y_log, ids = _load_dataset()
    y = 10.0 ** y_log
    tr, cal, te = _split_indices(len(X))
    print(f"  {X.shape[0]} cells; train={len(tr)} cal={len(cal)} test={len(te)}")

    print("loading scaler from lstm_rul.pt checkpoint ...")
    mean, std = _load_scaler()
    Xz = ((X.astype(np.float64) - mean) / std).astype(np.float32)

    print("running FP32 + INT8 inference on test set ...")
    sess_fp32 = ort.InferenceSession(str(FP32_PATH), providers=["CPUExecutionProvider"])
    sess_int8 = ort.InferenceSession(str(INT8_PATH), providers=["CPUExecutionProvider"])

    # The pre-processed ONNX freezes the dynamic batch axis to 1; this also
    # matches the real STM32N6 inference path (one BBU at a time, no batching).
    # We loop one sample at a time and stack results.
    def _infer(sess: ort.InferenceSession, Xb: np.ndarray) -> np.ndarray:
        outs = []
        for i in range(Xb.shape[0]):
            out = sess.run(None, {"per_cycle_features": Xb[i:i+1]})[0]
            outs.append(float(np.squeeze(out)))
        return np.asarray(outs, dtype=np.float64)

    pred_fp32_log = _infer(sess_fp32, Xz[te])
    pred_int8_log = _infer(sess_int8, Xz[te])
    pred_fp32 = 10.0 ** pred_fp32_log
    pred_int8 = 10.0 ** pred_int8_log
    y_te = y[te]

    fp32_mape = _mape(y_te, pred_fp32)
    int8_mape = _mape(y_te, pred_int8)
    fp32_r2 = _r2(y_te, pred_fp32)
    int8_r2 = _r2(y_te, pred_int8)
    pred_max_diff_log = float(np.max(np.abs(pred_fp32_log - pred_int8_log)))
    pred_relative_diff_pct = float(
        np.mean(np.abs((pred_int8 - pred_fp32) / pred_fp32)) * 100.0
    )

    print(f"  FP32 test MAPE: {fp32_mape:.2f}%   R^2: {fp32_r2:.3f}")
    print(f"  INT8 test MAPE: {int8_mape:.2f}%   R^2: {int8_r2:.3f}")
    print(f"  ΔMAPE (INT8 - FP32): {int8_mape - fp32_mape:+.2f} pp")
    print(f"  Mean |Δprediction| / FP32 prediction: {pred_relative_diff_pct:.2f}%")

    print("benchmarking single-sample CPU latency (1000 trials) ...")
    sample = Xz[te[0]:te[0] + 1].astype(np.float32)
    fp32_lat = _benchmark_latency(sess_fp32, sample)
    int8_lat = _benchmark_latency(sess_int8, sample)
    print(f"  FP32  p50={fp32_lat['p50_ms']:.3f} ms   p99={fp32_lat['p99_ms']:.3f} ms")
    print(f"  INT8  p50={int8_lat['p50_ms']:.3f} ms   p99={int8_lat['p99_ms']:.3f} ms")

    report = {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/quantize_lstm_onnx.py",
            "onnxruntime_version": ort.__version__,
            "onnx_version": onnx.__version__,
            "fp32_input": str(FP32_PATH.relative_to(REPO)),
            "int8_output": str(INT8_PATH.relative_to(REPO)),
        },
        "size": {
            "fp32_graph_kib": round(fp32_graph_kb, 2),
            "fp32_external_data_kib": round(fp32_data_kb, 2),
            "fp32_total_kib": round(fp32_total_kb, 2),
            "int8_kib": round(int8_size_kb, 2),
            "compression_ratio": round(fp32_total_kb / int8_size_kb, 3),
        },
        "accuracy_test_set": {
            "n_test": int(len(te)),
            "fp32_mape_pct": round(fp32_mape, 3),
            "int8_mape_pct": round(int8_mape, 3),
            "delta_mape_pp": round(int8_mape - fp32_mape, 3),
            "fp32_r2": round(fp32_r2, 4),
            "int8_r2": round(int8_r2, 4),
            "max_log_prediction_diff": round(pred_max_diff_log, 6),
            "mean_relative_prediction_diff_pct": round(pred_relative_diff_pct, 4),
        },
        "latency_cpu_single_sample": {
            "device": "laptop CPU via onnxruntime CPUExecutionProvider",
            "samples": fp32_lat["samples"],
            "fp32": {k: round(v, 4) for k, v in fp32_lat.items() if k != "samples"},
            "int8": {k: round(v, 4) for k, v in int8_lat.items() if k != "samples"},
            "speedup_p50": round(fp32_lat["p50_ms"] / int8_lat["p50_ms"], 3),
            "speedup_p99": round(fp32_lat["p99_ms"] / int8_lat["p99_ms"], 3),
        },
        "stm32n6_extrapolation": {
            "note": (
                "INT8 NPU latency is NOT measured here — onnxruntime CPU INT8 "
                "is a different execution path from the STM32N6 Neural-ART NPU. "
                "Use this report for accuracy validation only; for real NPU "
                "latency, follow docs/x_cube_ai_install_sop.md."
            ),
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nwrote {REPORT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
