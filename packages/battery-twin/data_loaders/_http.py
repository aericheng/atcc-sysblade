"""HTTP utilities with resume + checksum + progress bar shared across loaders."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Optional

import requests
from loguru import logger
from tqdm import tqdm

CHUNK_SIZE = 1024 * 1024  # 1 MiB
TIMEOUT = (15, 120)  # connect, read


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(CHUNK_SIZE), b""):
            h.update(chunk)
    return h.hexdigest()


def download(
    url: str,
    dest: Path,
    *,
    expected_sha256: Optional[str] = None,
    overwrite: bool = False,
    description: Optional[str] = None,
) -> Path:
    """Download a URL to dest with HTTP Range resume + tqdm progress.

    If dest already exists and matches expected_sha256, returns immediately.
    Partial downloads (.part suffix) resume from the existing byte offset.
    """
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    desc = description or dest.name

    if dest.exists() and not overwrite:
        if expected_sha256 is None:
            logger.info(f"[{desc}] already exists, skipping (no checksum to verify)")
            return dest
        actual = _sha256(dest)
        if actual == expected_sha256:
            logger.info(f"[{desc}] already exists with matching sha256, skipping")
            return dest
        logger.warning(f"[{desc}] checksum mismatch — re-downloading")
        dest.unlink()

    part = dest.with_suffix(dest.suffix + ".part")
    resume_from = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={resume_from}-"} if resume_from else {}

    with requests.get(url, headers=headers, stream=True, timeout=TIMEOUT) as r:
        r.raise_for_status()
        total = int(r.headers.get("Content-Length", 0)) + resume_from
        mode = "ab" if resume_from else "wb"
        with open(part, mode) as f, tqdm(
            total=total or None,
            initial=resume_from,
            unit="B",
            unit_scale=True,
            desc=desc,
        ) as pbar:
            for chunk in r.iter_content(chunk_size=CHUNK_SIZE):
                if not chunk:
                    continue
                f.write(chunk)
                pbar.update(len(chunk))

    if expected_sha256:
        actual = _sha256(part)
        if actual != expected_sha256:
            raise ValueError(
                f"[{desc}] sha256 mismatch after download. "
                f"expected={expected_sha256} actual={actual}"
            )

    os.replace(part, dest)
    logger.success(f"[{desc}] downloaded → {dest}")
    return dest
