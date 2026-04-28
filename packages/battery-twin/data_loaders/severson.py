"""Severson 2019 TRI dataset (124 LFP cells) — main training set for RUL prediction.

Reference:
  Severson, K.A., Attia, P.M., et al. "Data-driven prediction of battery cycle life
  before capacity degradation." Nature Energy 4, 383–391 (2019).

Dataset hosted at https://data.matr.io/1/projects/5c48dd2bc625d700019f3204/
Three .mat files (~6 GB total) covering three batches of cycling tests.

NOTE: data.matr.io serves a JS landing page on direct GET, so automated download
may fail. Two alternatives:
  (1) Manually download via browser (recommended first run) and place the three
      .mat files into data/raw/severson/.
  (2) Set SEVERSON_MIRROR env var to point at a host that serves the .mat files
      directly (e.g., a private S3 mirror or the batteryarchive.org per-cell
      derivative).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from loguru import logger

from ._http import download

# Minimum bytes considered a "real" .mat file. data.matr.io's landing page is ~5 KB,
# while each batch .mat is several hundred MB, so any download under this threshold
# is almost certainly the HTML wrapper rather than the data.
_MIN_VALID_BYTES = 50 * 1024 * 1024  # 50 MiB

# Public dataset hosted by Toyota Research Institute / batteryarchive
# URLs verified from data.matr.io project page; if these break, see batteryarchive.org mirror
SEVERSON_FILES: tuple[tuple[str, str], ...] = (
    (
        "2017-05-12_batchdata_updated_struct_errorcorrect.mat",
        "https://data.matr.io/1/api/v1/file/5c86c0bafe2ede00015ddf66/download",
    ),
    (
        "2017-06-30_batchdata_updated_struct_errorcorrect.mat",
        "https://data.matr.io/1/api/v1/file/5c86bd64fe2ede00015ddd82/download",
    ),
    (
        "2018-04-12_batchdata_updated_struct_errorcorrect.mat",
        "https://data.matr.io/1/api/v1/file/5dcef1fe110002c7215b2c94/download",
    ),
)


@dataclass(frozen=True)
class SeversonLoader:
    """Download + load Severson TRI dataset.

    Parameters
    ----------
    root : Path
        Directory under which the .mat files will be stored.
    """

    root: Path

    def __post_init__(self) -> None:
        Path(self.root).mkdir(parents=True, exist_ok=True)

    def fetch(self) -> list[Path]:
        """Download all three batch .mat files (resumable).

        If SEVERSON_MIRROR env var is set, prepend it to each filename instead of
        using the data.matr.io URLs (which serve a JS landing page on direct GET).
        Returns list of local paths.
        """
        mirror = os.environ.get("SEVERSON_MIRROR")
        paths: list[Path] = []
        for name, default_url in SEVERSON_FILES:
            url = f"{mirror.rstrip('/')}/{name}" if mirror else default_url
            dest = Path(self.root) / name
            path = download(url, dest, description=f"severson/{name}")
            if path.stat().st_size < _MIN_VALID_BYTES:
                raise RuntimeError(
                    f"[severson] {name} is only {path.stat().st_size} bytes — "
                    f"likely a landing page, not the .mat. "
                    f"Manually download from https://data.matr.io/1/ and place "
                    f"into {self.root}/, or set SEVERSON_MIRROR env var."
                )
            paths.append(path)
        return paths

    def files(self) -> Iterable[Path]:
        for name, _ in SEVERSON_FILES:
            yield Path(self.root) / name


if __name__ == "__main__":
    import sys

    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/raw/severson")
    loader = SeversonLoader(root=target)
    paths = loader.fetch()
    logger.info(f"Severson dataset ready: {len(paths)} files at {target}")
