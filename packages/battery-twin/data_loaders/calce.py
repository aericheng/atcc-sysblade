"""CALCE battery dataset (University of Maryland).

Reference:
  Center for Advanced Life Cycle Engineering, https://calce.umd.edu/battery-data
  CS2 / CX2 series — graphite/LCO 18650 cells cycled under various profiles.

Used as a SECONDARY dataset for retraining diversity (the primary training set is
Severson 2019 TRI 124-cell LFP); CALCE adds different chemistries and degradation
modes so the LSTM doesn't overfit to one cycling protocol.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from loguru import logger

from ._http import download

# CALCE distributes per-cell .zip archives. We use a representative subset of CS2 cells
# (most-cited in literature) to keep the download manageable; user can extend by
# adding entries here.
CALCE_FILES: tuple[tuple[str, str], ...] = (
    (
        "CS2_35.zip",
        "https://web.calce.umd.edu/batteries/data/CS2_35.zip",
    ),
    (
        "CS2_36.zip",
        "https://web.calce.umd.edu/batteries/data/CS2_36.zip",
    ),
    (
        "CS2_37.zip",
        "https://web.calce.umd.edu/batteries/data/CS2_37.zip",
    ),
    (
        "CS2_38.zip",
        "https://web.calce.umd.edu/batteries/data/CS2_38.zip",
    ),
)


@dataclass(frozen=True)
class CalceLoader:
    """Download CALCE CS2 cell archives."""

    root: Path

    def __post_init__(self) -> None:
        Path(self.root).mkdir(parents=True, exist_ok=True)

    def fetch(self) -> list[Path]:
        paths: list[Path] = []
        for name, url in CALCE_FILES:
            dest = Path(self.root) / name
            paths.append(download(url, dest, description=f"calce/{name}"))
        return paths

    def files(self) -> Iterable[Path]:
        for name, _ in CALCE_FILES:
            yield Path(self.root) / name


if __name__ == "__main__":
    import sys

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/raw/calce")
    loader = CalceLoader(root=target)
    paths = loader.fetch()
    logger.info(f"CALCE dataset ready: {len(paths)} files at {target}")
