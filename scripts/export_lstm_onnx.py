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


def _build_predicted_vs_actual(
    ids: list[str],
    batches: list[str],
    y: np.ndarray,
    pred: np.ndarray,
    te: np.ndarray,
) -> list[dict]:
    """Per-cell prediction rows for the UI's scatter chart."""
    test_set = set(int(i) for i in te)
    return [
        {
            "cell_id": ids[i],
            "batch": batches[i],
            "actual": int(round(float(y[i]))),
            "predicted": int(round(float(pred[i]))),
            "split": "test" if i in test_set else "train",
        }
        for i in range(len(ids))
    ]


# ---------------------------------------------------------------------------
# Fleet-status-aware walkthrough selection
#
# Replaces the older lifetime-quantile picker. The /twin "Inference
# walkthrough" dropdown now mirrors the battery states a fleet manager
# actually sees on /dashboard, so a viewer can connect "the LSTM input
# the model saw for THIS cell" to "what % of my 1000-BBU fleet looks
# like this right now."
#
# Pipeline:
#   1. Read fleet_devices.json (the same file /dashboard renders).
#   2. Re-bucket each device into 4 statuses (healthy / warning /
#      early_aging / critical) using SOH + RUL bands. The raw fleet ships
#      with 3 statuses (healthy / early_aging / thermal_warn); we
#      subdivide healthy into healthy + warning so the walkthrough has a
#      non-degenerate "mostly healthy but watching it" bucket to talk
#      through. Tier-3 admission rule (SOH<0.85 OR RUL<800, per
#      proposal §F) is preserved.
#   3. Map each Severson cell's cycle_life onto the same 4 statuses by
#      reading cycle_life as "the lifetime this cell exhibited", i.e.
#      what its dashboard tile would say if observed mid-life.
#   4. Pick 9 cells weighted by fleet population %, with at least 1 cell
#      per status so all 4 stories appear in the dropdown.
# ---------------------------------------------------------------------------
FLEET_STATUSES: tuple[str, ...] = ("healthy", "warning", "early_aging", "critical")

# Display phrases for the /twin dropdown. Kept short so the option text
# fits on one line on a phone. The underlying status name is appended in
# parentheses so the bucket key is still readable.
_STATUS_DISPLAY: dict[str, str] = {
    "healthy":     "Main population (healthy)",
    "warning":     "Watch list (warning)",
    "early_aging": "Tier-3 queue (early_aging)",
    "critical":    "Premature failure (critical)",
}


def _classify_device_4status(soh: float, rul: int) -> str:
    """Bucket a device into 1 of 4 statuses.

    Thresholds:
      critical    : SOH < 0.80 OR RUL < 200    — replace immediately
      early_aging : SOH < 0.85 OR RUL < 800    — Tier-3 admission rule
      warning     : SOH < 0.92 OR RUL < 1500   — watch list, schedule swap
      healthy     : everything else            — main population

    The early_aging band matches the Tier-3 rule defined in
    scripts/generate_twin_scenarios.py and proposal §F.
    """
    if soh < 0.80 or rul < 200:
        return "critical"
    if soh < 0.85 or rul < 800:
        return "early_aging"
    if soh < 0.92 or rul < 1500:
        return "warning"
    return "healthy"


def _load_fleet_distribution() -> dict[str, float]:
    """Read fleet_devices.json and return percentage by 4-status bucket."""
    fleet_path = REPO / "apps" / "web" / "public" / "scenarios" / "fleet_devices.json"
    if not fleet_path.exists():
        # Soft fallback: if the fleet hasn't been generated yet, use the
        # storyboard distribution from the proposal §F so the UI still
        # renders. Re-run scripts/generate_twin_scenarios.py to refresh.
        return {"healthy": 67.0, "warning": 23.0, "early_aging": 6.0, "critical": 4.0}
    fleet = json.loads(fleet_path.read_text())
    devices = fleet.get("devices", [])
    counts = {s: 0 for s in FLEET_STATUSES}
    for d in devices:
        soh = min(float(d.get("soh_lfp", 1.0)), float(d.get("soh_lic", 1.0)))
        rul = int(d.get("rul_cycles", 9999))
        counts[_classify_device_4status(soh, rul)] += 1
    total = max(1, sum(counts.values()))
    return {s: round(100.0 * counts[s] / total, 1) for s in FLEET_STATUSES}


def _cycle_life_to_status(cycle_life: int) -> str:
    """Map a Severson cell's full-life cycle_life onto the 4 fleet buckets.

    Inverse of the fleet bucketing: a cell with high cycle_life corresponds
    to a 'healthy' device observed mid-life; a low-cycle-life cell would
    already be in Tier-3 by the same observation point.

    Bands are picked so the Severson population's Q1/median/Q3 land in
    the 'main' three buckets and only outright early failures hit
    critical:
      < 200            → critical    (Severson n ≈ 1)
      < 600            → early_aging
      < 1000           → warning
      ≥ 1000           → healthy     (the bulk of long-lived Severson cells)
    """
    if cycle_life < 200:
        return "critical"
    if cycle_life < 600:
        return "early_aging"
    if cycle_life < 1000:
        return "warning"
    return "healthy"


def _allocate_picks_by_pct(pct_by_status: dict[str, float], n_picks: int) -> dict[str, int]:
    """Allocate ``n_picks`` slots across statuses weighted by ``pct_by_status``,
    guaranteeing each status gets at least 1 slot so all 4 stories appear.
    """
    base = {s: max(1, round(pct_by_status[s] / 100.0 * n_picks)) for s in FLEET_STATUSES}
    # Clamp total to exactly n_picks. Trim from the largest bucket; if we
    # need more, add to the largest bucket.
    while sum(base.values()) > n_picks:
        biggest = max(FLEET_STATUSES, key=lambda s: base[s])
        if base[biggest] <= 1:
            break  # everyone at floor
        base[biggest] -= 1
    while sum(base.values()) < n_picks:
        biggest = max(FLEET_STATUSES, key=lambda s: base[s])
        base[biggest] += 1
    return base


def _pick_walkthrough_cells(
    y: np.ndarray, pred: np.ndarray, n_picks: int = 9
) -> list[tuple[int, str, str, float]]:
    """Pick cells weighted by fleet status distribution.

    Returns (index, label, fleet_status, fleet_pct) tuples, sorted from
    healthy → critical so the dropdown reads as a tour of the fleet from
    'main population' down to 'imminent failure'.
    """
    n = len(y)
    if n_picks > n:
        n_picks = n

    pct_by_status = _load_fleet_distribution()
    targets = _allocate_picks_by_pct(pct_by_status, n_picks)

    # Group Severson cells by the same 4 statuses.
    sorted_idx = np.argsort(y)  # ascending cycle_life
    by_status: dict[str, list[int]] = {s: [] for s in FLEET_STATUSES}
    for idx in sorted_idx:
        status = _cycle_life_to_status(int(y[int(idx)]))
        by_status[status].append(int(idx))

    picks: list[tuple[int, str, str, float]] = []
    for status in FLEET_STATUSES:
        bucket = by_status[status]
        n_target = targets[status]
        if n_target <= 0 or not bucket:
            continue
        if n_target == 1:
            chosen = [bucket[len(bucket) // 2]]
        elif n_target >= len(bucket):
            chosen = list(bucket)
        else:
            # Evenly spaced sample across the bucket so we span the
            # status-internal range (e.g. healthy bucket stretches from
            # 1000 to 1934 cycles in Severson — we want the spread).
            step = (len(bucket) - 1) / (n_target - 1)
            chosen = [bucket[int(round(i * step))] for i in range(n_target)]
            # Dedupe if rounding collapsed two indices.
            chosen = list(dict.fromkeys(chosen))

        for idx in chosen:
            cycle_life = int(y[idx])
            display = _STATUS_DISPLAY[status]
            label = f"{display} (~{pct_by_status[status]:.0f}%) · {cycle_life} cycles"
            picks.append((idx, label, status, pct_by_status[status]))

    # Sort: healthy first (large cycle_life), critical last (small cycle_life).
    status_rank = {s: i for i, s in enumerate(FLEET_STATUSES)}
    picks.sort(key=lambda t: (status_rank[t[2]], -y[t[0]]))
    return picks


# ---------------------------------------------------------------------------
# Probabilistic prediction via Monte Carlo Dropout
#
# Gal & Ghahramani (2016) "Dropout as a Bayesian Approximation": running N
# forward passes with dropout left active at inference yields a posterior-
# predictive distribution over the model's output. We keep the existing
# trained checkpoint as-is and add this on top so the demo can show
# per-cell prediction intervals without re-training.
#
# Empirical caveats (documented in whitepaper §6.2):
#   - MC dropout produces *epistemic* uncertainty (model uncertainty), not
#     aleatoric (data noise). For LSTM with dropout=0.15 the resulting PIs
#     can under-cover; we report the actual coverage on the held-out test
#     set so the calibration story is honest.
#   - Conformal calibration (a post-hoc rescale that guarantees coverage)
#     is in the W3 plan if the raw coverage is meaningfully <90 %.
# ---------------------------------------------------------------------------
def _enable_dropout_for_inference(model: torch.nn.Module) -> None:
    """Set every Dropout layer (including the LSTM's internal dropout) to
    train mode while keeping the rest of the network in eval mode."""
    model.eval()
    for m in model.modules():
        if isinstance(m, torch.nn.Dropout):
            m.train()
    # nn.LSTM applies its `dropout` argument only when the module itself is
    # in train mode; toggling the inner Dropout modules above isn't enough.
    if isinstance(model.lstm, torch.nn.LSTM):
        model.lstm.train()


def predict_mc_dropout(
    model: torch.nn.Module,
    scaler,
    X: np.ndarray,
    n_samples: int = 100,
) -> dict[str, np.ndarray]:
    """Run ``n_samples`` MC-dropout passes and return predictive percentiles.

    Returns a dict with keys ``{"median", "p5", "p10", "p90", "p95"}``,
    each a (N,) array of cycle-life estimates aligned with ``X``.
    """
    _enable_dropout_for_inference(model)
    Xn = torch.tensor(scaler.transform(X), dtype=torch.float32)
    samples: list[np.ndarray] = []
    with torch.no_grad():
        for _ in range(n_samples):
            log_pred = model(Xn).cpu().numpy()
            samples.append(10.0 ** log_pred)
    arr = np.stack(samples, axis=0)  # (n_samples, N)
    return {
        "median": np.percentile(arr, 50, axis=0),
        "p5":     np.percentile(arr,  5, axis=0),
        "p10":    np.percentile(arr, 10, axis=0),
        "p90":    np.percentile(arr, 90, axis=0),
        "p95":    np.percentile(arr, 95, axis=0),
    }


def extract_walkthroughs(
    model,
    scaler,
    X: np.ndarray,
    y: np.ndarray,
    ids: list[str],
    batches: list[str],
    pred_all: np.ndarray,
    cell_indices: list[tuple[int, str, str, float]],
    pi: dict[str, np.ndarray] | None = None,
) -> list[dict]:
    """Capture (input, hidden state, cumulative prediction) for chosen cells.

    ``cell_indices`` carries (idx, label, fleet_status, fleet_pct) per cell.
    ``pi`` (optional) carries MC-dropout percentiles aligned with ``X`` and,
    when present, threads ``pi_lower`` / ``pi_upper`` / ``pi_median`` per
    cell into the JSON payload so the /twin UI can render a 90 % PI bar.
    """
    model.eval()
    out: list[dict] = []
    with torch.no_grad():
        for idx, label, fleet_status, fleet_pct in cell_indices:
            x_raw = X[idx]                            # (99, 7) original units
            x_scaled = scaler.transform(X[idx : idx + 1])  # (1, 99, 7)
            x_t = torch.tensor(x_scaled, dtype=torch.float32)

            # Run only the LSTM portion to get hidden states at every timestep.
            lstm_out, _ = model.lstm(x_t)  # (1, 99, hidden_dim)

            # Mean |activation| collapses the 64 hidden dims into a single
            # 'how strongly is the model firing right now' scalar per timestep.
            hidden_act = lstm_out[0].abs().mean(dim=-1).numpy()  # (99,)

            # Cumulative prediction: at each timestep apply the head as if we
            # stopped there. Lets the UI show convergence over the 99 cycles.
            cumul: list[float] = []
            for t_idx in range(lstm_out.shape[1]):
                pred_log = model.head(lstm_out[:, t_idx, :])
                cumul.append(float(10.0 ** float(pred_log.item())))

            entry = {
                "cell_id": ids[idx],
                "batch": batches[idx],
                "label": label,
                "fleet_status": fleet_status,
                "fleet_pct": fleet_pct,
                "actual": int(round(float(y[idx]))),
                "predicted": int(round(float(pred_all[idx]))),
                "input_raw": [
                    [round(float(v), 5) for v in cycle_row]
                    for cycle_row in x_raw.tolist()
                ],
                "hidden_activation": [round(float(v), 4) for v in hidden_act.tolist()],
                "cumulative_pred": [int(round(c)) for c in cumul],
            }
            if pi is not None:
                entry["pi_median"] = int(round(float(pi["median"][idx])))
                entry["pi_lower"]  = int(round(float(pi["p5"][idx])))
                entry["pi_upper"]  = int(round(float(pi["p95"][idx])))
            out.append(entry)
    return out


def build_dataset() -> tuple[np.ndarray, np.ndarray, list[str], list[str]]:
    """Concat Severson lab cells with synthetic BBU-duty cells (if present).

    Severson cells come from the standard pickle path; BBU cells from the
    optional ``bbu_duty_cells.pkl`` produced by
    ``scripts/generate_bbu_duty_cells.py``. Combining the two closes the
    regime gap: the LSTM sees both fast-charge stress trajectories and
    gentle-fade BBU trajectories at training time, so its feature
    coverage no longer collapses to the Severson distribution.

    BBU cells are skipped silently if the pickle is missing (keeps the
    Severson-only build path working).
    """
    seqs: list[np.ndarray] = []
    labels: list[float] = []
    ids: list[str] = []
    batches: list[str] = []

    sev_path = REPO / "data" / "processed" / "severson_cells.pkl"
    sev_cells = pickle.loads(sev_path.read_bytes())
    sev_ok = [c for c in sev_cells if c.cycle_life > 0 and c.n_cycles >= 100]
    n_sev_kept = 0
    for c in sev_ok:
        seq = sp.per_cycle_summary(c)
        if seq is None or seq.shape != (99, 7):
            continue
        seqs.append(seq)
        labels.append(np.log10(c.cycle_life))
        ids.append(c.cell_id)
        batches.append(c.batch)
        n_sev_kept += 1
    print(f"  Severson cells: {n_sev_kept}")

    bbu_path = REPO / "data" / "processed" / "bbu_duty_cells.pkl"
    n_bbu_kept = 0
    if bbu_path.exists():
        bbu_cells = pickle.loads(bbu_path.read_bytes())
        for c in bbu_cells:
            seq = c["sequence"]
            if seq is None or seq.shape != (99, 7):
                continue
            seqs.append(seq)
            labels.append(c["log_cycle_life"])
            ids.append(c["cell_id"])
            batches.append(c["batch"])
            n_bbu_kept += 1
        print(f"  BBU-duty cells: {n_bbu_kept}  (regime-gap augmentation)")
    else:
        print(f"  BBU-duty cells: 0  ({bbu_path.relative_to(REPO)} not found — "
              f"run scripts/generate_bbu_duty_cells.py first)")

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
        "title": "LSTM RUL — Severson 2019 + PyBaMM BBU-duty + ONNX edge inference",
        "description": (
            f"PyTorch 2-layer LSTM (hidden=64) trained on per-cycle summary features "
            f"from {X.shape[0]} LFP cells "
            f"({sum(1 for b in batches if b != 'bbu')} Severson 2019 batches 1+2+3 + "
            f"{sum(1 for b in batches if b == 'bbu')} PyBaMM-calibrated BBU-duty cells "
            f"to close the regime gap, see whitepaper §3.3.5). "
            f"Exported to ONNX and benchmarked under onnxruntime CPU as a "
            f"proxy for the STM32N6 NPU deployment path."
        ),
        "model": {
            "architecture": "LSTM(input=7, hidden=64, layers=2) + Dense(32) + Linear(1)",
            "n_parameters": int(sum(p.numel() for p in res.model.parameters())),
            "input_shape": list(X.shape[1:]),
            "feature_names": list(sp.PER_CYCLE_FEATURE_NAMES),
            "onnx_size_kb": onnx_size_kb,
            "onnx_torch_max_diff": diff,
        },
        "metrics": {
            "n_train": len(tr),
            "n_test": len(te),
            "train_mape_pct": metrics_train["mape_pct"],
            "test_mape_pct": metrics_test["mape_pct"],
            "test_rmse_cycles": metrics_test["rmse_cycles"],
            "test_r2": metrics_test["r2"],
            "split": f"random_{int(round((1-TEST_SIZE)*100))}_{int(round(TEST_SIZE*100))}_seed{SEED}",
        },
        "latency": {
            "device": "CPU (laptop) via onnxruntime",
            "samples": 1000,
            "p50_ms": p50,
            "p99_ms": p99,
            "target_ms": 50,
            "passes_target": p99 < 50,
        },
        "predicted_vs_actual": _build_predicted_vs_actual(ids, batches, y, pred_all, te),
    }

    # MC Dropout — 100 stochastic forward passes per cell to convert the
    # deterministic point prediction into a posterior-predictive
    # distribution. Median is used as the point estimate; 5th–95th
    # percentile as the 90 % prediction interval. See predict_mc_dropout
    # docstring for the calibration caveat.
    print("computing MC Dropout uncertainty (100 samples)...")
    pi = predict_mc_dropout(res.model, res.scaler, X, n_samples=100)
    # Test-set coverage: what fraction of held-out cells fall inside the
    # 90 % PI? Well-calibrated → ~90 %; under-covered → MC dropout is too
    # narrow (a known property; conformal post-hoc fix is W3 work).
    test_in_pi = (y[te] >= pi["p5"][te]) & (y[te] <= pi["p95"][te])
    coverage = float(np.mean(test_in_pi))
    pi_widths = pi["p95"] - pi["p5"]
    print(f"  90% PI test coverage: {coverage*100:.1f}% (target ~90%)")
    print(f"  median PI width: {float(np.median(pi_widths)):.0f} cycles")
    payload["uncertainty"] = {
        "method": "mc_dropout",
        "n_samples": 100,
        "test_coverage_90pct": coverage,
        "median_pi_width_cycles": float(np.median(pi_widths)),
    }

    # Walkthroughs — per-cell input + hidden state + cumulative-prediction
    # trajectory for a curated set of cells. Used by the /twin "Inference
    # walkthrough" UI to let the viewer step through one cell at a time.
    # Cells are picked weighted by the dashboard fleet's 4-status
    # distribution so the dropdown stays in lockstep with /dashboard.
    print("extracting per-cell walkthrough trajectories...")
    fleet_dist = _load_fleet_distribution()
    print("  fleet distribution: " + ", ".join(
        f"{s} {fleet_dist[s]:.1f}%" for s in FLEET_STATUSES
    ))
    picks = _pick_walkthrough_cells(y, pred_all, n_picks=9)
    payload["walkthroughs"] = extract_walkthroughs(
        res.model, res.scaler, X, y, ids, batches, pred_all, picks, pi=pi,
    )
    payload["fleet_status_distribution_pct"] = fleet_dist
    print(f"  captured {len(payload['walkthroughs'])} cells:")
    for w in payload["walkthroughs"]:
        print(f"    [{w['fleet_status']:11s}] {w['cell_id']:6s} · "
              f"actual {w['actual']:>4d}  median {w['pi_median']:>4d}  "
              f"90% PI [{w['pi_lower']:>4d}, {w['pi_upper']:>5d}]")

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
