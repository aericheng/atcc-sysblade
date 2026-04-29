"""Parse NASA PCoE Battery Data Set .mat files into the unified ``Cell`` schema.

Reference:
  B. Saha and K. Goebel (2007). "Battery Data Set." NASA Ames Prognostics
  Data Repository. https://www.nasa.gov/intelligent-systems-division/pcoe-data-set-repository/

Each NASA cell .mat file contains a single MATLAB struct named after the
cell (e.g., ``B0005``). The struct carries a ``cycle`` array of three
cycle types — ``charge`` / ``discharge`` / ``impedance``. We keep only
discharge cycles, derive ``Qd(t)`` by integrating the measured discharge
current, and emit ``Cell`` objects compatible with ``severson_parser``'s
feature extractors so the same OLS pipeline can train cross-dataset.

Cycle-life convention. NASA tests usually run until 70 % SOH; for
comparability with Severson's 80 % convention we recompute cycle life as
the first discharge cycle where peak ``Qd`` drops below 80 % of the
reference (cycle-2) capacity. Cells that never reach that threshold within
the recorded run are reported with ``cycle_life = n_discharge_cycles`` —
this is a right-censored estimate; ``run_full_pipeline`` users should be
aware that those cells are lower bounds on true cycle life.
"""
from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from loguru import logger

from .severson_parser import Cell, CycleData


# 4 classic NASA cells used in nearly every reproduction of the dataset.
# These are a subset of the larger archive; the zip also contains B0025+
# from later batches but the canonical paper-comparable set is these four.
NASA_CLASSIC_CELLS: tuple[str, ...] = ("B0005", "B0006", "B0007", "B0018")

# NASA 18650 NMC cells discharge from ~4.2 V down to a 2.5–2.7 V cutoff,
# vs Severson LFP at ~3.5 → 2.0 V. Used as the default voltage_range so the
# ΔQ_{100-10}(V) feature uses the right interpolation grid.
NASA_VOLTAGE_RANGE: tuple[float, float] = (2.7, 4.2)


# ---------------------------------------------------------------------------
# Cycle-level helpers
# ---------------------------------------------------------------------------
def _to_array(x) -> np.ndarray:
    """np.asarray that flattens scalars and never errors for None inputs."""
    if x is None:
        return np.empty(0, dtype=np.float64)
    return np.asarray(x, dtype=np.float64).flatten()


def _qd_from_current(I_meas: np.ndarray, t_seconds: np.ndarray) -> np.ndarray:
    """Cumulative discharge capacity ``Qd(t)`` in Ah from measured current.

    NASA discharge cycles record current with a negative sign (load draws
    current out of the cell). Cumulative discharged charge is the trapezoid
    integral of ``-I dt``; we then convert from Coulombs to Ah and clip
    tiny negative values that arise from sensor noise.
    """
    if I_meas.size != t_seconds.size or I_meas.size < 2:
        return np.empty(0, dtype=np.float64)
    finite = np.isfinite(I_meas) & np.isfinite(t_seconds)
    if finite.sum() < 2:
        return np.empty(0, dtype=np.float64)
    I = I_meas[finite]
    t = t_seconds[finite]
    # Order by time so np.trapz / cumulative integration stays monotonic.
    order = np.argsort(t)
    t = t[order]
    I = I[order]
    # Per-step charge: average current over [t_k, t_{k+1}] times dt
    dt = np.diff(t)
    avg_I = 0.5 * (I[1:] + I[:-1])
    charge_steps = -avg_I * dt  # positive when discharging (I < 0)
    qd = np.concatenate([[0.0], np.cumsum(charge_steps)]) / 3600.0  # As → Ah
    # Light denoising: clip floor at 0 (sensor noise can push to -1e-5 Ah).
    return np.maximum(qd, 0.0)


def _build_discharge_cycle(index: int, data: dict) -> CycleData | None:
    """One discharge cycle → ``CycleData`` with V/Qd/T/t aligned and finite."""
    V = _to_array(data.get("Voltage_measured"))
    I = _to_array(data.get("Current_measured"))
    T = _to_array(data.get("Temperature_measured"))
    t = _to_array(data.get("Time"))

    if V.size < 5 or I.size < 5 or t.size < 5:
        return None
    if not (V.size == I.size == t.size):
        # Some NASA cycles have mismatched sample counts (rare); skip.
        return None

    Qd = _qd_from_current(I, t)
    if Qd.size != V.size:
        return None
    # Re-pad temperature if it's shorter (occasionally happens at end-of-cycle)
    if T.size != V.size:
        if T.size == 0:
            T = np.full_like(V, np.nan)
        else:
            T = np.interp(np.arange(V.size), np.linspace(0, V.size - 1, T.size), T)

    return CycleData(index=index, Qd=Qd, V=V, T=T, t=t)


# ---------------------------------------------------------------------------
# Cell-level — derive cycle_life from observed capacity fade
# ---------------------------------------------------------------------------
def _peak_qd_per_cycle(cycles: list[CycleData]) -> np.ndarray:
    """Vector of peak ``Qd`` for each cycle (NaN where unavailable)."""
    peaks = np.full(len(cycles), np.nan, dtype=np.float64)
    for i, c in enumerate(cycles):
        if c.Qd is None or c.Qd.size == 0:
            continue
        finite = c.Qd[np.isfinite(c.Qd)]
        if finite.size == 0:
            continue
        peak = float(np.max(finite))
        if peak > 0:
            peaks[i] = peak
    return peaks


def _estimate_cycle_life(cycles: list[CycleData], soh_threshold: float = 0.8) -> int:
    """First cycle index where peak ``Qd`` drops below ``threshold * Qd_ref``.

    Reference capacity is the mean peak Qd over cycles 2..6 (skipping cycle
    1 which can show formation noise). If the cell never crosses the
    threshold in the recorded run, returns the total cycle count — a
    right-censored estimate that downstream callers should treat as a
    lower bound on the true cycle life.
    """
    peaks = _peak_qd_per_cycle(cycles)
    n = len(peaks)
    if n < 6:
        return 0
    ref_window = peaks[1:6]  # cycles 2..6 (0-indexed 1..5)
    finite_ref = ref_window[np.isfinite(ref_window)]
    if finite_ref.size < 2:
        return 0
    qd_ref = float(np.mean(finite_ref))
    if qd_ref <= 0:
        return 0
    threshold = soh_threshold * qd_ref
    for i in range(5, n):
        p = peaks[i]
        if np.isfinite(p) and p < threshold:
            return i + 1  # 1-based cycle index
    return n  # right-censored


# ---------------------------------------------------------------------------
# .mat → Cell
# ---------------------------------------------------------------------------
def parse_nasa_cell(cell_id: str, mat_dict: dict) -> Cell | None:
    """Parse one NASA .mat (already loaded with ``simplify_cells=True``).

    The .mat top-level key matches ``cell_id`` (e.g., ``"B0005"``). The
    inner struct's ``cycle`` field is a list of dicts; we keep only entries
    with ``type == "discharge"`` and assign monotonic indices 1..N to them
    in observation order.
    """
    if cell_id not in mat_dict:
        logger.warning(f"[{cell_id}] not found in .mat keys: {list(mat_dict.keys())}")
        return None
    cell_struct = mat_dict[cell_id]
    if not isinstance(cell_struct, dict) or "cycle" not in cell_struct:
        logger.warning(f"[{cell_id}] unexpected structure; keys: "
                       f"{list(cell_struct.keys()) if isinstance(cell_struct, dict) else type(cell_struct)}")
        return None

    raw_cycles = cell_struct["cycle"]
    if isinstance(raw_cycles, dict):
        raw_cycles = [raw_cycles]

    discharge_cycles: list[CycleData] = []
    ambient_temps: list[float] = []
    for raw in raw_cycles:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("type", "")).strip().lower() != "discharge":
            continue
        amb = raw.get("ambient_temperature")
        if amb is not None:
            try:
                ambient_temps.append(float(np.atleast_1d(amb).flatten()[0]))
            except (ValueError, TypeError, IndexError):
                pass
        data = raw.get("data") or {}
        if not isinstance(data, dict):
            continue
        cyc = _build_discharge_cycle(len(discharge_cycles) + 1, data)
        if cyc is not None:
            discharge_cycles.append(cyc)

    if len(discharge_cycles) < 10:
        logger.warning(f"[{cell_id}] only {len(discharge_cycles)} usable discharge cycles, skipping")
        return None

    cycle_life = _estimate_cycle_life(discharge_cycles, soh_threshold=0.8)
    if cycle_life <= 0:
        logger.warning(f"[{cell_id}] could not estimate cycle life, skipping")
        return None

    policy = "nasa_aging"
    if ambient_temps:
        avg_amb = float(np.mean(ambient_temps))
        policy = f"nasa_aging_{avg_amb:.0f}C"

    return Cell(
        cell_id=f"nasa_{cell_id}",
        batch="nasa",
        cycle_life=cycle_life,
        policy=policy,
        summary={},
        cycles=discharge_cycles,
        voltage_range=NASA_VOLTAGE_RANGE,
    )


# ---------------------------------------------------------------------------
# Zip handling — the canonical archive bundles many .mat files together
# ---------------------------------------------------------------------------
def _extract_zip(zip_path: Path, dest: Path) -> Path:
    """Extract zip into ``dest`` (idempotent — skipped if dest already populated)."""
    dest.mkdir(parents=True, exist_ok=True)
    # Heuristic: if any .mat file is already extracted, treat as done.
    existing = list(dest.rglob("*.mat"))
    if existing:
        logger.info(f"  {len(existing)} .mat files already extracted under {dest}")
        return dest
    logger.info(f"  extracting {zip_path.name} → {dest}")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(dest)
    extracted = list(dest.rglob("*.mat"))
    logger.success(f"  extracted {len(extracted)} .mat files")
    return dest


def _find_cell_mat(extract_root: Path, cell_id: str) -> Path | None:
    """Locate ``<cell_id>.mat`` anywhere under ``extract_root``."""
    matches = list(extract_root.rglob(f"{cell_id}.mat"))
    if not matches:
        return None
    return matches[0]


def load_nasa_cells(
    zip_path: Path,
    extract_root: Path,
    cell_ids: Iterable[str] = NASA_CLASSIC_CELLS,
) -> list[Cell]:
    """Extract the NASA archive (if needed) and parse the requested cells.

    Returns a list of ``Cell`` objects, one per cell that parsed
    successfully; cells that failed validation are logged and skipped.
    """
    from scipy.io import loadmat  # local import — heavy, optional dependency

    if not zip_path.exists():
        raise FileNotFoundError(
            f"{zip_path} not found — run ``NasaLoader(root=...).fetch()`` first."
        )

    extract_root = Path(extract_root)
    _extract_zip(zip_path, extract_root)

    cells: list[Cell] = []
    for cid in cell_ids:
        mat_path = _find_cell_mat(extract_root, cid)
        if mat_path is None:
            logger.warning(f"[{cid}] .mat not found under {extract_root}, skipping")
            continue
        try:
            mat = loadmat(str(mat_path), simplify_cells=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[{cid}] failed to load {mat_path.name}: {type(exc).__name__}: {exc}")
            continue
        cell = parse_nasa_cell(cid, mat)
        if cell is None:
            continue
        logger.success(
            f"  {cell.cell_id}  cycle_life={cell.cycle_life}  "
            f"n_cycles={cell.n_cycles}  policy={cell.policy}"
        )
        cells.append(cell)

    if not cells:
        logger.warning(f"no NASA cells parsed from {zip_path}")
    return cells


# ---------------------------------------------------------------------------
# CLI — extract + parse + summarise
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    repo = Path(__file__).resolve().parents[3]
    zip_path = Path(sys.argv[1]) if len(sys.argv) > 1 else repo / "data/raw/nasa/BatteryAgingARC-FY08Q4.zip"
    extract_root = Path(sys.argv[2]) if len(sys.argv) > 2 else repo / "data/raw/nasa/extracted"

    cells = load_nasa_cells(zip_path, extract_root)
    for c in cells:
        print(f"{c.cell_id:15s}  cycle_life={c.cycle_life:4d}  n_cycles={c.n_cycles:4d}")
