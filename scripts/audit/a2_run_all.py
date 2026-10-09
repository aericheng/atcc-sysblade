"""A2 audit — one-line rerun of all three experiments.

Usage (repo root):
    .venv/Scripts/python scripts/audit/a2_run_all.py
Outputs: data/processed/audit/a2_*.json / a2_*.png
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = ["a2_dcdc_average_model.py", "a2_spec_bounds_lic_sizing.py", "a2_worst_case.py"]

if __name__ == "__main__":
    for s in SCRIPTS:
        print(f"=== {s}", flush=True)
        r = subprocess.run([sys.executable, str(HERE / s)], cwd=HERE.parents[1])
        if r.returncode != 0:
            sys.exit(r.returncode)
