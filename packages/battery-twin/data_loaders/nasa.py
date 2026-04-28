"""NASA Prognostics Center of Excellence — Li-ion Battery Aging Datasets.

Reference:
  B. Saha and K. Goebel (2007). "Battery Data Set", NASA Ames Prognostics Data Repository
  https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/

Mirror used: phm-datasets (GitHub) hosting the original .mat archives.
The PCoE site requires a click-through and changes URLs frequently; the GitHub mirror
is more stable for automated download.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from loguru import logger

from ._http import download

# These archives cover the original "Battery Data Set" — 4 groups of 18650 cells
# cycled to various end-of-life criteria. Mirror chosen for automation reliability.
NASA_FILES: tuple[tuple[str, str], ...] = (
    (
        "BatteryAgingARC-FY08Q4.zip",
        "https://phm-datasets.s3.amazonaws.com/NASA/5.+Battery+Data+Set.zip",
    ),
)


@dataclass(frozen=True)
class NasaLoader:
    """Download NASA PCoE battery aging dataset (zip)."""

    root: Path

    def __post_init__(self) -> None:
        Path(self.root).mkdir(parents=True, exist_ok=True)

    def fetch(self) -> list[Path]:
        paths: list[Path] = []
        for name, url in NASA_FILES:
            dest = Path(self.root) / name
            paths.append(download(url, dest, description=f"nasa/{name}"))
        return paths

    def files(self) -> Iterable[Path]:
        for name, _ in NASA_FILES:
            yield Path(self.root) / name


if __name__ == "__main__":
    import sys

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/raw/nasa")
    loader = NasaLoader(root=target)
    paths = loader.fetch()
    logger.info(f"NASA dataset ready: {len(paths)} files at {target}")
