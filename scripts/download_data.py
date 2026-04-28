"""Unified entry point to fetch all training datasets.

Usage:
    python scripts/download_data.py --all
    python scripts/download_data.py --severson
    python scripts/download_data.py --severson --nasa
    python scripts/download_data.py --root ./data/raw --all
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make `packages/battery-twin` importable when this script is invoked directly
# from the repo root (i.e., before `pip install -e packages/battery-twin`).
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / "packages" / "battery-twin"))

import typer
from loguru import logger

from data_loaders import SeversonLoader, NasaLoader, CalceLoader

app = typer.Typer(add_completion=False, help=__doc__)


@app.command()
def main(
    root: Path = typer.Option(Path("data/raw"), help="Root directory for raw data"),
    severson: bool = typer.Option(False, help="Download Severson 2019 TRI dataset (~6 GB)"),
    nasa: bool = typer.Option(False, help="Download NASA PCoE battery aging dataset"),
    calce: bool = typer.Option(False, help="Download CALCE CS2 cell archives"),
    all_: bool = typer.Option(False, "--all", help="Download every dataset"),
) -> None:
    if all_:
        severson = nasa = calce = True

    if not (severson or nasa or calce):
        typer.echo("Nothing selected. Use --all or one of --severson / --nasa / --calce")
        raise typer.Exit(code=1)

    if severson:
        logger.info("=== Severson 2019 TRI ===")
        SeversonLoader(root=root / "severson").fetch()

    if nasa:
        logger.info("=== NASA PCoE ===")
        NasaLoader(root=root / "nasa").fetch()

    if calce:
        logger.info("=== CALCE CS2 ===")
        CalceLoader(root=root / "calce").fetch()

    logger.success("All requested datasets downloaded.")


if __name__ == "__main__":
    app()
