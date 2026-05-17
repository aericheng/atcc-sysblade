"""M2 critical path #3 — edge inference latency histogram.

Loads the LSTM ONNX (FP32 + INT8) and measures single-sample inference
latency over N iterations on whatever execution provider onnxruntime
picks. Produces:

  • data/processed/lstm_latency_<device>.json   — p50/p90/p95/p99 + raw samples
  • data/processed/lstm_latency_<device>.png    — histogram (one panel per dtype)

The script is **device-agnostic** — same code runs on laptop CPU, Raspberry
Pi 5, or STM32N6 host (the latter via X-CUBE-AI ≠ onnxruntime, see
docs/x_cube_ai_install_sop.md). Use ``--device-label`` to tag the output.

Usage::

    # Laptop CPU baseline
    .venv/Scripts/python scripts/measure_lstm_latency.py --device-label laptop_cpu

    # On Raspberry Pi 5 (lean M2 target)
    python scripts/measure_lstm_latency.py --device-label pi5 --n-iter 1000

    # Profile both dtypes (default)
    python scripts/measure_lstm_latency.py --device-label laptop_cpu --dtype both

Refs: docs/BBU_IMPLEMENTATION_PLAN.md §4.3.1 (Pi 5 path) + §5.3 M2 +
docs/whitepaper.md §3.4 / 附錄 C(對標目標).
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import time

# Force UTF-8 console on Windows so µ / ✅ render. The Win10/11 default
# (cp950 for zh-TW locale, cp1252 elsewhere) crashes on non-ASCII print.
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import onnxruntime as ort

REPO = Path(__file__).resolve().parent.parent
MODEL_FP32 = REPO / "models" / "lstm_rul.onnx"
MODEL_INT8 = REPO / "models" / "lstm_rul.int8.onnx"
OUT_DIR = REPO / "data" / "processed"

INPUT_NAME = "per_cycle_features"
INPUT_SHAPE = (1, 99, 7)        # (batch, cycles, features) — confirmed via onnx.load
WARMUP_ITERS = 50               # ORT graph optimisations settle after ~30-40 runs


@dataclass
class LatencyResult:
    label: str
    n_iter: int
    samples_us: np.ndarray

    @property
    def stats(self) -> dict:
        s = self.samples_us
        return {
            "n": int(self.n_iter),
            "mean_us": float(np.mean(s)),
            "std_us": float(np.std(s)),
            "min_us": float(np.min(s)),
            "p50_us": float(np.percentile(s, 50)),
            "p90_us": float(np.percentile(s, 90)),
            "p95_us": float(np.percentile(s, 95)),
            "p99_us": float(np.percentile(s, 99)),
            "max_us": float(np.max(s)),
        }


def make_session(model_path: Path) -> ort.InferenceSession:
    """Build an inference session with profiling-friendly options.

    ``intra_op_num_threads = 1`` removes thread-pool noise so the
    measured latency reflects the model's compute cost, not how the OS
    scheduled threads. Useful for cross-machine comparison.
    """
    so = ort.SessionOptions()
    so.intra_op_num_threads = 1
    so.inter_op_num_threads = 1
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.log_severity_level = 3   # warnings + errors only
    return ort.InferenceSession(str(model_path), sess_options=so)


def measure(label: str, model_path: Path, n_iter: int, seed: int = 0) -> LatencyResult:
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model not found: {model_path}\n"
            "Run scripts/export_lstm_onnx.py first (needs Severson pickle)."
        )
    sess = make_session(model_path)

    # Use a fixed seed so the laptop-CPU baseline can be diff'd against the
    # Pi 5 run for reproducibility checks on the *output* — the LSTM input
    # distribution doesn't affect latency materially but makes outputs
    # numerically comparable.
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(INPUT_SHAPE, dtype=np.float32)

    # Warm-up — ORT does graph optimisation lazily on first runs
    for _ in range(WARMUP_ITERS):
        _ = sess.run(None, {INPUT_NAME: x})

    samples = np.empty(n_iter, dtype=np.float64)
    for i in range(n_iter):
        t0 = time.perf_counter_ns()
        _ = sess.run(None, {INPUT_NAME: x})
        t1 = time.perf_counter_ns()
        samples[i] = (t1 - t0) / 1000.0    # ns → µs
    return LatencyResult(label=label, n_iter=n_iter, samples_us=samples)


def plot_histograms(results: list[LatencyResult], out_path: Path, device_label: str) -> None:
    """Two-panel histogram (FP32 / INT8) with p50/p99 vertical markers."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    n = len(results)
    fig, axes = plt.subplots(n, 1, figsize=(8, 3.2 * n), sharex=False)
    if n == 1:
        axes = [axes]
    for ax, r in zip(axes, results):
        st = r.stats
        # Clip outlier tail at p99 + 3×IQR for readable bins; show p99 mark
        # so reader knows we're not hiding a long tail.
        s = r.samples_us
        upper = st["p99"] * 1.4 if False else np.percentile(s, 99.5)
        ax.hist(s, bins=60, range=(s.min(), upper), color="#34d399", edgecolor="black", alpha=0.75)
        ax.axvline(st["p50_us"], color="#22d3ee", linestyle="--", linewidth=1.4,
                   label=f"p50 {st['p50_us']:.1f} µs")
        ax.axvline(st["p99_us"], color="#f87171", linestyle="--", linewidth=1.4,
                   label=f"p99 {st['p99_us']:.1f} µs")
        ax.set_title(
            f"{device_label} · {r.label}  "
            f"(mean {st['mean_us']:.1f} µs, n={r.n_iter})",
            fontsize=11,
        )
        ax.set_xlabel("Single-sample inference latency (µs)")
        ax.set_ylabel("Count")
        ax.legend(loc="upper right", fontsize=9)
        ax.grid(True, alpha=0.25, linestyle=":")
    fig.suptitle(
        "LSTM RUL inference latency — M2 critical path evidence",
        fontsize=12, y=1.005,
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=140, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--device-label", required=True,
        help="Tag for output files (e.g. laptop_cpu, pi5, stm32n6).",
    )
    ap.add_argument(
        "--n-iter", type=int, default=1000,
        help="Iterations per dtype (default 1000).",
    )
    ap.add_argument(
        "--dtype", choices=["fp32", "int8", "both"], default="both",
        help="Which model(s) to profile.",
    )
    ap.add_argument(
        "--seed", type=int, default=0,
        help="RNG seed for input tensor.",
    )
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[m2] onnxruntime {ort.__version__}  providers={ort.get_available_providers()}")
    print(f"[m2] device-label={args.device_label}  n-iter={args.n_iter}  dtype={args.dtype}")

    results: list[LatencyResult] = []
    if args.dtype in ("fp32", "both"):
        print(f"[m2] measuring FP32 ({MODEL_FP32.name}) …")
        results.append(measure("FP32", MODEL_FP32, args.n_iter, args.seed))
    if args.dtype in ("int8", "both"):
        print(f"[m2] measuring INT8 ({MODEL_INT8.name}) …")
        results.append(measure("INT8", MODEL_INT8, args.n_iter, args.seed))

    for r in results:
        s = r.stats
        print(
            f"[m2] {r.label:5s}: p50 {s['p50_us']:6.1f} µs · "
            f"p95 {s['p95_us']:6.1f} µs · p99 {s['p99_us']:6.1f} µs · "
            f"max {s['max_us']:6.1f} µs · mean {s['mean_us']:6.1f} µs"
        )

    payload = {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/measure_lstm_latency.py",
            "onnxruntime_version": ort.__version__,
            "providers": ort.get_available_providers(),
            "device_label": args.device_label,
            "input_shape": list(INPUT_SHAPE),
            "warmup_iters": WARMUP_ITERS,
            "intra_op_threads": 1,
            "purpose": "M2 critical path #3 per docs/BBU_IMPLEMENTATION_PLAN.md §5.3",
        },
        "results": {
            r.label: {
                **r.stats,
                # Compressed sample stream — first 200 + last 200 + every 5th.
                # Full series is too large for repo and not needed downstream.
                "sample_us_summary": {
                    "head": r.samples_us[:200].tolist(),
                    "tail": r.samples_us[-200:].tolist(),
                    "stride5": r.samples_us[::5].tolist(),
                },
            }
            for r in results
        },
        "interpretation": {
            "spec_target_pi5_p99_ms": 1.0,
            "spec_target_stm32n6_p99_us": 200.0,
            "whitepaper_appendix_c_estimate_us": [27, 109],
            "note": (
                "Per docs/BBU_IMPLEMENTATION_PLAN.md §5.3 pass criteria: "
                "Pi 5 p99 < 1 ms, STM32N6 p99 < 200 µs. Compare 'p99_us' "
                "above against the matching target for go/no-go on M2."
            ),
        },
    }

    json_path = OUT_DIR / f"lstm_latency_{args.device_label}.json"
    png_path = OUT_DIR / f"lstm_latency_{args.device_label}.png"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[m2] wrote {json_path.relative_to(REPO)}")

    try:
        plot_histograms(results, png_path, args.device_label)
        print(f"[m2] wrote {png_path.relative_to(REPO)}")
    except ImportError as e:
        print(f"[m2] WARN: matplotlib not available, skipping PNG ({e})", file=sys.stderr)

    # M2 gate check
    p99_us = max(r.stats["p99_us"] for r in results)
    if args.device_label.startswith("pi5"):
        pass_threshold_us = 1000.0
    elif args.device_label.startswith("stm32n6"):
        pass_threshold_us = 200.0
    else:
        pass_threshold_us = None    # laptop_cpu — no formal pass threshold, baseline only

    if pass_threshold_us is None:
        print(f"[m2] no formal pass threshold for device='{args.device_label}' — baseline measurement only")
    elif p99_us < pass_threshold_us:
        print(f"[m2] ✅ M2 PASS: max p99 {p99_us:.1f} µs < {pass_threshold_us:.0f} µs threshold")
    else:
        print(f"[m2] ❌ M2 FAIL: max p99 {p99_us:.1f} µs >= {pass_threshold_us:.0f} µs threshold")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
