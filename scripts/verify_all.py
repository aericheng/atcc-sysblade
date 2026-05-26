"""V6 — One-command reproducibility gate.

對齊 `docs/BBU_IMPLEMENTATION_PLAN.md` v2.0 § 摘要 V6。Orchestrates re-running
all twin validation chains V1-V5 + existing whitepaper number cross-check, then
outputs a PASS / FAIL JSON report so an RD reviewer can verify all headline
numbers in 30 minutes.

Pipeline:
  V1: scripts/eval_pybamm_lfp_fit.py        (Severson b1 load ~30s + PyBaMM ~3s × n_cells)
  V2: scripts/eval_lic_rc_fit.py            (~ < 1s)
  V3: scripts/generate_full_rack_60s_sim.py (PyBaMM ~3s + thermal ~ < 1s)
  V4: scripts/generate_n_minus_1_sim.py     (PyBaMM ~3s + thermal ~ < 1s)
  V5: scripts/eval_severson_transfer.py     (parquet load + GBT × 24 bags + 10 seeds, ~ 35s)
  Cross-check: scripts/check_whitepaper_numbers.py  (~ < 5s)

Approximate total wallclock: ~3-5 minutes on the first run (cold Severson load
dominates), <1 minute on subsequent runs (assuming caches warm).

Each V chain script writes its own JSON artifact; this script reads each
artifact's `headline.*_pass` (or computed equivalent) and emits an aggregate
verification report.

Usage:
    .venv/Scripts/python scripts/verify_all.py
    .venv/Scripts/python scripts/verify_all.py --skip-v1  # if Severson load too slow
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_JSON = REPO / "data" / "processed" / "verify_all_report.json"
PYTHON = REPO / ".venv" / "Scripts" / "python.exe"


CHAINS = [
    {
        "id": "V1",
        "name": "PyBaMM vs Severson LFP fit error",
        "script": "scripts/eval_pybamm_lfp_fit.py",
        "args": ["--n-cells", "3"],
        "artifact": "data/processed/pybamm_lfp_fit_error.json",
        "pass_path": ["headline", "v_rms_pass"],
    },
    {
        "id": "V2",
        "name": "LIC RC nonlinear extension fit",
        "script": "scripts/eval_lic_rc_fit.py",
        "args": [],
        "artifact": "data/processed/lic_rc_fit_error.json",
        "pass_path": ["headline", "v_rms_pass"],
    },
    {
        "id": "V3",
        "name": "Rack 60s graceful integrated sim",
        "script": "scripts/generate_full_rack_60s_sim.py",
        "args": [],
        "artifact": "apps/web/public/scenarios/rack_60s_graceful.json",
        "pass_path": ["thermal_model", "passes_thermal_limit"],
    },
    {
        "id": "V4",
        "name": "N-1 BBU failure redundancy",
        "script": "scripts/generate_n_minus_1_sim.py",
        "args": [],
        "artifact": "apps/web/public/scenarios/rack_n_minus_1.json",
        "pass_path": ["pass_criteria", "overall_pass"],
    },
    {
        "id": "V5",
        "name": "Severson cross-regime transfer MAPE",
        "script": "scripts/eval_severson_transfer.py",
        "args": [],
        "artifact": "data/processed/severson_transfer_mape.json",
        # V5 doesn't have a binary pass — the result IS the honest disclosure.
        # We pass iff the script ran and produced a reasonable artifact.
        "pass_path": None,
    },
    {
        "id": "XCHECK",
        "name": "Whitepaper headline number cross-check (38 assertions)",
        "script": "scripts/check_whitepaper_numbers.py",
        "args": [],
        "artifact": None,
        "pass_path": None,
    },
]


def _get_nested(d: dict, path: list[str]):
    cur = d
    for k in path:
        cur = cur[k]
    return cur


def _run_chain(chain: dict, verbose: bool) -> dict:
    cmd = [str(PYTHON), str(REPO / chain["script"])] + chain["args"]
    t0 = time.time()
    print(f"[V6] running {chain['id']}: {chain['name']} ...")
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8",
            errors="replace", timeout=900, cwd=str(REPO),
        )
        elapsed = time.time() - t0
    except subprocess.TimeoutExpired:
        return {
            "id": chain["id"], "name": chain["name"],
            "ran": True, "passed": False, "elapsed_s": 900.0,
            "error": "timeout (>15 min)",
        }
    except Exception as exc:
        return {
            "id": chain["id"], "name": chain["name"],
            "ran": False, "passed": False, "elapsed_s": time.time() - t0,
            "error": f"{type(exc).__name__}: {exc}",
        }

    if result.returncode != 0:
        return {
            "id": chain["id"], "name": chain["name"],
            "ran": True, "passed": False, "elapsed_s": elapsed,
            "error": f"non-zero exit {result.returncode}",
            "stderr_tail": (result.stderr or "")[-500:],
        }

    # Check artifact pass criterion (if defined)
    artifact_pass = True
    artifact_headline = None
    if chain["artifact"]:
        artifact_path = REPO / chain["artifact"]
        if not artifact_path.exists():
            return {
                "id": chain["id"], "name": chain["name"],
                "ran": True, "passed": False, "elapsed_s": elapsed,
                "error": f"artifact {chain['artifact']} not produced",
            }
        with open(artifact_path, "r", encoding="utf-8") as f:
            artifact_data = json.load(f)
        if chain["pass_path"]:
            try:
                artifact_pass = bool(_get_nested(artifact_data, chain["pass_path"]))
            except (KeyError, TypeError) as exc:
                return {
                    "id": chain["id"], "name": chain["name"],
                    "ran": True, "passed": False, "elapsed_s": elapsed,
                    "error": f"pass_path {chain['pass_path']} not found: {exc}",
                }
        artifact_headline = artifact_data.get("headline") or {
            k: artifact_data.get(k) for k in ("stats", "thermal_model")
            if artifact_data.get(k)
        }

    return {
        "id": chain["id"], "name": chain["name"],
        "ran": True, "passed": artifact_pass, "elapsed_s": elapsed,
        "artifact_headline": artifact_headline,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skip-v1", action="store_true",
                    help="skip V1 (Severson 3GB .mat load is slow)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    chains = CHAINS
    if args.skip_v1:
        chains = [c for c in chains if c["id"] != "V1"]
        print("[V6] skipping V1 (--skip-v1)")

    t_start = time.time()
    results = []
    for chain in chains:
        r = _run_chain(chain, args.verbose)
        results.append(r)
        status = "PASS" if r["passed"] else "FAIL"
        err = f" ({r['error']})" if r.get("error") else ""
        print(f"[V6] {r['id']:6s} {status:4s} in {r['elapsed_s']:5.1f}s{err}")

    total_elapsed = time.time() - t_start
    n_pass = sum(1 for r in results if r["passed"])
    n_total = len(results)
    overall_pass = n_pass == n_total

    report = {
        "validation_chain": "V6",
        "version": "v0.1",
        "date": "2026-05-26",
        "overall_pass": overall_pass,
        "n_pass": n_pass,
        "n_total": n_total,
        "total_elapsed_s": total_elapsed,
        "results": results,
        "interpretation_notes": [
            "Each V chain is independently re-runnable; this script just orchestrates.",
            "V5 (Severson cross-regime transfer) has no binary PASS — the result IS "
            "the honest disclosure of cross-regime degradation. Marked 'passed' if "
            "artifact was successfully produced.",
            "Skip V1 with --skip-v1 if Severson .mat load is too slow for CI.",
            "All chains write to data/processed/ or apps/web/public/scenarios/; "
            "fresh artifacts overwrite prior runs.",
        ],
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\n=== V6 verify_all report ===")
    print(f"  {n_pass}/{n_total} chains PASS in {total_elapsed:.1f}s")
    print(f"  overall: {'PASS' if overall_pass else 'FAIL'}")
    print(f"  -> {OUT_JSON}")
    return 0 if overall_pass else 1


if __name__ == "__main__":
    sys.exit(main())
