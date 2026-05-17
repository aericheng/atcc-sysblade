"""Atomic JSON write for live telemetry sinks.

Why this exists
---------------
The dashboard polls ``apps/web/public/scenarios/live_demonstrator.json`` every
few seconds. A naive ``open(path, "w")`` lets the dashboard fetch the file
mid-write and crash on ``JSON.parse``. The classic fix is
``mkstemp + fsync + os.replace`` — same path used by SQLite, atomic on POSIX
and Windows, and durable across crashes within the fsync window.

Public API
----------
``atomic_write_json(path, data)`` — drop-in replacement for
``json.dump(data, open(path, "w"))`` that never leaves a half-written file
visible to readers.

Reference: docs/BBU_IMPLEMENTATION_PLAN.md §4.4 (v1.1 user review #4) +
§7 M4 critical path #4.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def atomic_write_json(path: str | Path, data: Any, *, indent: int | None = 2) -> None:
    """Write ``data`` to ``path`` as JSON, atomically.

    The write goes to a sibling ``*.tmp`` first, then is ``os.replace``-d into
    the final name. Readers either see the previous file or the new file —
    never a partial. ``fsync`` before rename means the byte stream is on disk
    before the rename is durable, so a power loss mid-write cannot produce a
    corrupt visible file.

    Parameters
    ----------
    path
        Final destination. Parent directory must already exist.
    data
        Anything ``json.dump`` accepts.
    indent
        Passed through to ``json.dump``. ``None`` for compact (no whitespace).
    """
    path = Path(path)
    dir_ = path.parent
    # mkstemp puts the temp file in the same directory as the target so the
    # os.replace is a same-filesystem rename (atomic). A /tmp fallback would
    # be a cross-fs move, which is not atomic on POSIX.
    fd, tmp = tempfile.mkstemp(suffix=".tmp", prefix=f".{path.name}.", dir=dir_)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
            f.flush()
            os.fsync(f.fileno())
        # os.replace > os.rename: rename raises on Windows if dst exists.
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
