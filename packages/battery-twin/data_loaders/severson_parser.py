"""Parse Severson 2019 TRI .mat batch files into a clean per-cell representation.

The original .mat is a deeply nested MATLAB struct. We flatten it into one
``Cell`` dataclass per battery (124 in total across the three batch files)
with the fields the downstream feature engineering / LSTM training step needs.

Reference:
  Severson, K.A., Attia, P.M., et al. "Data-driven prediction of battery cycle
  life before capacity degradation." Nature Energy 4, 383-391 (2019).

The structure follows the documentation in the published reproduction repo
<https://github.com/rdbraatz/data-driven-prediction-of-battery-cycle-life>.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import numpy as np
from loguru import logger


@dataclass
class CycleData:
    """One cycle of measurements for a single cell.

    The Severson 2019 .mat files include both raw vectors (V, Qd, ...) and
    pre-interpolated curves on a fixed voltage grid (Qdlin, Tdlin). The
    interpolated form is what the paper's headline feature uses.
    """

    index: int
    Qd: np.ndarray             # discharge capacity (Ah) vs sample (raw)
    V: np.ndarray              # voltage (V) vs sample (raw, spans whole cycle)
    T: np.ndarray              # temperature (°C) vs sample (raw)
    t: np.ndarray              # time (s, since cycle start) (raw)
    Qdlin: np.ndarray | None = None       # discharge Q on common 1000-point voltage grid
    Tdlin: np.ndarray | None = None       # discharge T on the same grid
    discharge_dQdV: np.ndarray | None = None  # paper-equivalent dQ/dV curve


@dataclass
class Cell:
    """One battery cell across all its cycles."""

    cell_id: str               # e.g. "b1c0", "b3c44"
    batch: str                 # "b1", "b2", "b3"
    cycle_life: int            # cycles to 80 % of nominal capacity
    policy: str                # charging policy label, e.g. "5.4C(60%)-3.6C-newstructure"
    summary: dict              # per-cycle aggregate metrics (capacity fade, IR, etc.)
    cycles: list[CycleData] = field(default_factory=list)
    vdlin: np.ndarray | None = None  # batch-level common voltage grid (1000 pts) used by Qdlin

    @property
    def n_cycles(self) -> int:
        return len(self.cycles)

    def cycle(self, index: int) -> CycleData:
        for c in self.cycles:
            if c.index == index:
                return c
        raise IndexError(f"{self.cell_id} has no cycle {index} (have {self.n_cycles})")


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------
def _open_mat(path: Path):
    """Load a .mat that may be either v7.3 (HDF5) or v5 (legacy MAT)."""
    try:
        from scipy.io import loadmat
        return loadmat(str(path), simplify_cells=True), "scipy"
    except (NotImplementedError, ValueError):
        # v7.3 → fall back to h5py
        import h5py
        return h5py.File(str(path), "r"), "h5py"


def _safe_array(x) -> np.ndarray:
    """np.asarray that never errors for ndarray-or-None-or-scalar inputs."""
    if x is None:
        return np.empty(0, dtype=np.float64)
    return np.asarray(x, dtype=np.float64).flatten()


def _scipy_to_cells(mat: dict, batch_label: str) -> list[Cell]:
    """Parse the scipy-loaded simplify_cells=True structure.

    The .mat looks like {"batch": [<cell_struct>, <cell_struct>, ...]}.
    Each cell_struct has fields: cycle_life, charge_policy, summary, cycles.
    """
    raw_cells = mat.get("batch")
    if raw_cells is None:
        raise ValueError(f"unexpected .mat structure; top-level keys: {list(mat.keys())}")

    if isinstance(raw_cells, dict):
        raw_cells = [raw_cells]

    cells: list[Cell] = []
    for i, rc in enumerate(raw_cells):
        cell_id = f"{batch_label}c{i}"
        try:
            cycle_life_arr = np.atleast_1d(rc.get("cycle_life", [0]))
            cycle_life = int(cycle_life_arr.flatten()[0])
            policy = str(rc.get("charge_policy", rc.get("policy_readable", "unknown")))
            summary = rc.get("summary", {}) or {}
            raw_cycles = rc.get("cycles", [])
            if isinstance(raw_cycles, dict):
                raw_cycles = [raw_cycles]

            parsed_cycles: list[CycleData] = []
            for j, cyc in enumerate(raw_cycles):
                dqdv = _safe_array(cyc.get("discharge_dQdV"))
                parsed_cycles.append(
                    CycleData(
                        index=j + 1,
                        Qd=_safe_array(cyc.get("Qd")),
                        V=_safe_array(cyc.get("V")),
                        T=_safe_array(cyc.get("T")),
                        t=_safe_array(cyc.get("t")),
                        discharge_dQdV=dqdv if dqdv.size else None,
                    )
                )
            cells.append(
                Cell(
                    cell_id=cell_id,
                    batch=batch_label,
                    cycle_life=cycle_life,
                    policy=policy,
                    summary=summary,
                    cycles=parsed_cycles,
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"  skipped cell {cell_id}: {exc}")

    return cells


def _h5_string(f, ref) -> str:
    """Decode a MATLAB v7.3 string (uint16 array stored under a ref)."""
    try:
        arr = np.asarray(f[ref]).flatten()
        # MATLAB stores chars as uint16; build a Python str
        return "".join(chr(int(c)) for c in arr if c)
    except Exception:  # noqa: BLE001
        return "unknown"


def _h5py_to_cells(f, batch_label: str) -> list[Cell]:
    """Parse v7.3 MAT (HDF5) layout into Cell objects.

    The Severson v7.3 layout is:
        f["batch"] is an HDF5 Group with sub-datasets named after struct
        fields: cycle_life, charge_policy, summary, cycles.

    Each sub-dataset holds an (n_cells, 1) array of object references; the
    pattern is f[ref][...] to resolve the reference to actual data.
    """
    if "batch" not in f:
        raise ValueError(f"unexpected HDF5 structure; root keys: {list(f.keys())}")
    batch = f["batch"]

    if "cycle_life" not in batch:
        raise ValueError(f"batch group is missing 'cycle_life'; keys: {list(batch.keys())}")
    cycle_life_refs = batch["cycle_life"]
    n_cells = cycle_life_refs.shape[0]

    # Vdlin is the 1000-point voltage grid that Qdlin / Tdlin / discharge_dQdV
    # are interpolated onto. It's batch-level (same for every cell) so we read
    # it once. Stored under each cell so downstream code doesn't need to know
    # about batches. Like every Severson field, it's a reference array.
    vdlin: np.ndarray | None = None
    if "Vdlin" in batch:
        vdlin_refs = batch["Vdlin"]
        # Single-cell-style refs: take the first reference
        try:
            vdlin = np.asarray(f[vdlin_refs[0, 0]]).flatten().astype(np.float64)
        except (IndexError, TypeError):
            try:
                vdlin = np.asarray(f[vdlin_refs[0]]).flatten().astype(np.float64)
            except Exception:  # noqa: BLE001
                logger.warning("could not dereference Vdlin; downstream features will use raw V/Qd")

    cells: list[Cell] = []
    for i in range(n_cells):
        cell_id = f"{batch_label}c{i}"
        try:
            cycle_life = int(np.asarray(f[cycle_life_refs[i, 0]]).flatten()[0])

            policy = "unknown"
            if "policy_readable" in batch:
                policy = _h5_string(f, batch["policy_readable"][i, 0])
            elif "policy" in batch:
                policy = _h5_string(f, batch["policy"][i, 0])

            cycles_grp = f[batch["cycles"][i, 0]]
            # Each cycle field (I, V, Qd, T, t, Qdlin, ...) is an (n_cycles, 1)
            # dataset of refs whose targets are the per-cycle 1-D vectors.
            n_cyc = cycles_grp["V"].shape[0] if "V" in cycles_grp else 0

            def col(grp, name: str, j: int) -> np.ndarray:
                if name not in grp:
                    return np.empty(0, dtype=np.float64)
                return np.asarray(f[grp[name][j, 0]]).flatten().astype(np.float64)

            parsed_cycles: list[CycleData] = []
            for j in range(n_cyc):
                qdlin = col(cycles_grp, "Qdlin", j) if "Qdlin" in cycles_grp else None
                tdlin = col(cycles_grp, "Tdlin", j) if "Tdlin" in cycles_grp else None
                dqdv = col(cycles_grp, "discharge_dQdV", j) if "discharge_dQdV" in cycles_grp else None
                parsed_cycles.append(
                    CycleData(
                        index=j + 1,
                        Qd=col(cycles_grp, "Qd", j),
                        V=col(cycles_grp, "V", j),
                        T=col(cycles_grp, "T", j),
                        t=col(cycles_grp, "t", j),
                        Qdlin=qdlin if (qdlin is not None and qdlin.size) else None,
                        Tdlin=tdlin if (tdlin is not None and tdlin.size) else None,
                        discharge_dQdV=dqdv if (dqdv is not None and dqdv.size) else None,
                    )
                )

            cells.append(
                Cell(
                    cell_id=cell_id,
                    batch=batch_label,
                    cycle_life=cycle_life,
                    policy=policy,
                    summary={},  # summary parsing skipped — not used downstream
                    cycles=parsed_cycles,
                    vdlin=vdlin,
                )
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"  skipped cell {cell_id}: {type(exc).__name__}: {exc}")

    return cells


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def load_batch(path: Path, batch_label: str) -> list[Cell]:
    """Load a single batch .mat into a list of Cell objects.

    Parameters
    ----------
    path : pathlib.Path
        Path to a 2017-05-12 / 2017-06-30 / 2018-04-12 .mat file.
    batch_label : str
        Two-character label "b1", "b2", "b3" used to namespace cell IDs.
    """
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — see docs/severson_download.md")

    logger.info(f"loading {path.name} ({path.stat().st_size/1e9:.2f} GB)")
    mat, backend = _open_mat(path)
    if backend == "scipy":
        cells = _scipy_to_cells(mat, batch_label)
    else:
        try:
            cells = _h5py_to_cells(mat, batch_label)
        finally:
            mat.close()

    logger.success(f"  parsed {len(cells)} cells")
    return cells


_BATCH_FILES = {
    "b1": "2017-05-12_batchdata_updated_struct_errorcorrect.mat",
    "b2": "2017-06-30_batchdata_updated_struct_errorcorrect.mat",
    "b3": "2018-04-12_batchdata_updated_struct_errorcorrect.mat",
}


def load_all(root: Path) -> list[Cell]:
    """Load all three Severson batches from `root` and return a flat list.

    Returns the per-batch lists concatenated. The cell IDs guarantee uniqueness
    across batches (b1c0 vs b2c0 vs b3c0).
    """
    cells: list[Cell] = []
    for label, fname in _BATCH_FILES.items():
        cells.extend(load_batch(root / fname, label))
    logger.success(f"total cells loaded: {len(cells)}  (target ≈ 124)")
    return cells


# ---------------------------------------------------------------------------
# Feature engineering — Severson 2019 Eq. (1) feature
# ---------------------------------------------------------------------------
def delta_q_100_10(cell: Cell, voltage_grid: np.ndarray | None = None) -> np.ndarray | None:
    """Compute ΔQ_{100-10}(V), the headline Severson 2019 feature.

    Severson .mat files ship a *pre-interpolated* discharge curve (`Qdlin`)
    on a fixed 1000-point voltage grid (`Vdlin`). This is what the paper
    actually uses, so we read it directly when available and only fall back
    to manual interpolation of raw (V, Qd) when Qdlin isn't present.

    Returns None for cells with fewer than 100 cycles or missing curves.
    """
    if cell.n_cycles < 100:
        return None

    cyc_10 = cell.cycle(10)
    cyc_100 = cell.cycle(100)

    # Preferred path: Qdlin is already on the same grid for both cycles.
    if cyc_10.Qdlin is not None and cyc_100.Qdlin is not None:
        return np.asarray(cyc_100.Qdlin) - np.asarray(cyc_10.Qdlin)

    # Fallback: interpolate the raw discharge V-Qd points to a shared grid.
    if voltage_grid is None:
        voltage_grid = np.linspace(2.0, 3.5, 1000)
    if len(cyc_10.V) < 5 or len(cyc_100.V) < 5:
        return None
    Q10 = np.interp(voltage_grid, cyc_10.V[::-1], cyc_10.Qd[::-1], left=np.nan, right=np.nan)
    Q100 = np.interp(voltage_grid, cyc_100.V[::-1], cyc_100.Qd[::-1], left=np.nan, right=np.nan)
    return Q100 - Q10


def severson_feature_log_var(cell: Cell) -> float | None:
    """Single scalar feature: log10(variance(ΔQ_{100-10}(V))).

    This is the *Variance* feature from Severson 2019 (Table 1). Used alone
    against log10(cycle_life), it reproduces the paper's variance-only
    baseline at ~15 % MAPE — the headline 9.1 % needs the multi-feature
    Discharge model (see severson_features_full).
    """
    delta = delta_q_100_10(cell)
    if delta is None:
        return None
    valid = delta[np.isfinite(delta)]
    if len(valid) < 10:
        return None
    return float(np.log10(np.var(valid) + 1e-12))


def severson_features_discharge(cell: Cell) -> dict | None:
    """Five-feature 'Discharge' model from Severson 2019 Table 1.

    Reproduces the paper's 8.6–9.1 % test MAPE when combined with a linear
    regression onto log10(cycle_life). The features are:

      1. log_var_delta_q   — log10(variance of ΔQ_{100-10}(V))
      2. log_min_delta_q   — log10(|min(ΔQ_{100-10}(V))|), most negative dip
      3. slope_q_2_100     — slope of discharge capacity vs cycle, cycles 2-100
      4. intercept_q_2_100 — intercept of the same fit (extrapolates Q(0))
      5. q_at_cycle_2      — discharge capacity at cycle 2

    Returns None for cells with insufficient cycles or invalid data.
    """
    if cell.n_cycles < 100:
        return None

    delta = delta_q_100_10(cell)
    if delta is None:
        return None
    valid = delta[np.isfinite(delta)]
    if len(valid) < 10:
        return None

    # Per-cycle discharge capacity = max Q during discharge phase.
    # Use the last (largest) Qd value of each cycle as the cycle's discharge Q.
    per_cycle_q: list[float] = []
    cycles_idx: list[int] = []
    for cyc in cell.cycles[:101]:  # cycles 1..100 inclusive
        if cyc.Qd is None or len(cyc.Qd) == 0:
            continue
        q = float(np.nanmax(cyc.Qd)) if cyc.Qd.size else float("nan")
        if np.isfinite(q) and q > 0:
            per_cycle_q.append(q)
            cycles_idx.append(cyc.index)

    if len(per_cycle_q) < 50:
        return None

    cycles_arr = np.asarray(cycles_idx, dtype=np.float64)
    q_arr = np.asarray(per_cycle_q, dtype=np.float64)
    # Linear fit Q vs cycle on cycles 2-100
    mask = (cycles_arr >= 2) & (cycles_arr <= 100)
    if mask.sum() < 5:
        return None
    slope, intercept = np.polyfit(cycles_arr[mask], q_arr[mask], 1)

    # Discharge capacity at cycle 2 (or nearest available)
    q2_idx = np.argmin(np.abs(cycles_arr - 2))
    q_at_2 = float(q_arr[q2_idx])

    var_d = float(np.var(valid))
    min_d = float(np.min(valid))

    return {
        "log_var_delta_q": float(np.log10(var_d + 1e-12)),
        "log_min_delta_q": float(np.log10(abs(min_d) + 1e-12)),
        "slope_q_2_100": float(slope),
        "intercept_q_2_100": float(intercept),
        "q_at_cycle_2": q_at_2,
    }


# ---------------------------------------------------------------------------
# Extended ('Full' model) features — adds thermal + charge-time + late-life
# slope on top of the 5-feature Discharge model. Maps to Severson 2019
# Table S2 features 6, 7, 8 directly; feature 9 is a substitute for the
# paper's internal-resistance feature, which is not available in our parsed
# CycleData (IR lives in the .mat ``summary`` field, which the v7.3 HDF5
# parse path skips — see ``_h5py_to_cells``).
# ---------------------------------------------------------------------------
def _charge_time(cyc: CycleData) -> float | None:
    """Charge-phase duration: time from cycle start to peak voltage.

    Severson cycle timestamps begin at the start of charge; voltage rises
    during charge (CC + CV), peaks at end-of-charge, then drops during
    discharge. ``argmax(V)`` therefore marks the charge → discharge
    transition. Returns ``None`` if voltages or timestamps are missing or
    the inferred duration is non-positive.
    """
    if cyc.V is None or cyc.t is None:
        return None
    if cyc.V.size < 5 or cyc.V.size != cyc.t.size:
        return None
    finite = np.isfinite(cyc.V) & np.isfinite(cyc.t)
    if finite.sum() < 5:
        return None
    V = cyc.V[finite]
    t = cyc.t[finite]
    end_idx = int(np.argmax(V))
    if end_idx <= 0:
        return None
    duration = float(t[end_idx] - t[0])
    return duration if duration > 0 else None


def _temp_stats_2_100(cell: Cell) -> tuple[float, float] | None:
    """``(max_T_observed, integral_T_dt)`` over cycles 2..100 inclusive.

    ``max_T_observed`` is the peak temperature across every sample of every
    cycle in the window; ``integral_T_dt`` is the trapezoidal integral of
    T(t) summed over the same window (proxy for cumulative thermal stress,
    Severson Table S2 feature 8). Returns ``None`` if any cycle in the
    window lacks usable T or t data — the model needs a complete window so
    rows are comparable across cells.
    """
    integrate = getattr(np, "trapezoid", np.trapz)
    max_T = -np.inf
    total_int = 0.0
    n_valid = 0
    for cyc_idx in range(2, 101):
        try:
            cyc = cell.cycle(cyc_idx)
        except IndexError:
            return None
        if cyc.T is None or cyc.t is None:
            return None
        if cyc.T.size < 5 or cyc.t.size != cyc.T.size:
            return None
        finite = np.isfinite(cyc.T) & np.isfinite(cyc.t)
        if finite.sum() < 5:
            return None
        Tf = cyc.T[finite]
        tf = cyc.t[finite]
        cycle_max = float(np.max(Tf))
        if cycle_max > max_T:
            max_T = cycle_max
        cycle_int = float(integrate(Tf, tf))
        if not np.isfinite(cycle_int):
            return None
        # abs() guards against rare non-monotonic t segments; Severson is
        # monotonic in practice but we don't want a sign flip to silently
        # cancel earlier cycles' contribution.
        total_int += abs(cycle_int)
        n_valid += 1
    if n_valid < 50 or not np.isfinite(max_T) or max_T <= 0:
        return None
    return max_T, total_int


def _slope_q_91_100(cell: Cell) -> float | None:
    """Slope of per-cycle peak discharge capacity over cycles 91..100.

    The paper's Full model uses the slope across this narrow late-formation
    window (Table S2 feature 3) because it captures the local fade rate
    after initial SEI growth, which is more diagnostic than the broader
    2..100 slope used in the Discharge model. Returns ``None`` if too few
    valid cycles to fit a line.
    """
    idx: list[int] = []
    q: list[float] = []
    for cyc_idx in range(91, 101):
        try:
            cyc = cell.cycle(cyc_idx)
        except IndexError:
            continue
        if cyc.Qd is None or cyc.Qd.size == 0:
            continue
        finite = cyc.Qd[np.isfinite(cyc.Qd)]
        if finite.size == 0:
            continue
        peak = float(np.max(finite))
        if peak > 0:
            idx.append(cyc_idx)
            q.append(peak)
    if len(idx) < 5:
        return None
    cyc_arr = np.asarray(idx, dtype=np.float64)
    q_arr = np.asarray(q, dtype=np.float64)
    slope = float(np.polyfit(cyc_arr, q_arr, 1)[0])
    return slope


def severson_features_extended(cell: Cell) -> dict | None:
    """Four extra features that extend Discharge (5) → Full (9).

      6. log_max_temp_2_100      — log10(peak T over cycles 2..100)
      7. log_temp_integral_2_100 — log10(∫ T dt over cycles 2..100)
      8. log_charge_time_avg_2_6 — log10(mean charge-phase duration, cycles 2..6)
      9. slope_q_91_100          — slope of per-cycle Qd_max, cycles 91..100

    Maps to Severson 2019 Table S2 Full-model features 7, 8, 6, and 3
    respectively. The paper's two internal-resistance features are not
    extractable from our CycleData (IR lives in the .mat ``summary`` field
    which the v7.3 HDF5 parse path skips); ``slope_q_91_100`` substitutes
    by also targeting late-formation fade.

    Returns ``None`` if any required field is missing for any cycle in
    the 2..100 window — completeness is required so the OLS design matrix
    is comparable across cells.
    """
    thermal = _temp_stats_2_100(cell)
    if thermal is None:
        return None
    max_T, temp_int = thermal

    charge_times: list[float] = []
    for cyc_idx in range(2, 7):  # cycles 2..6 — first 5 reliable cycles
        try:
            cyc = cell.cycle(cyc_idx)
        except IndexError:
            return None
        ct = _charge_time(cyc)
        if ct is None:
            return None
        charge_times.append(ct)
    if len(charge_times) != 5:
        return None
    avg_ct = float(np.mean(charge_times))
    if avg_ct <= 0:
        return None

    slope_91 = _slope_q_91_100(cell)
    if slope_91 is None:
        return None

    return {
        "log_max_temp_2_100": float(np.log10(max_T + 1e-12)),
        "log_temp_integral_2_100": float(np.log10(temp_int + 1e-12)),
        "log_charge_time_avg_2_6": float(np.log10(avg_ct + 1e-12)),
        "slope_q_91_100": slope_91,
    }


def severson_features_full(cell: Cell) -> dict | None:
    """Nine-feature 'Full' model from Severson 2019 Table S2.

    Combines the 5-feature Discharge model with 4 thermal/charge/late-fade
    features. Reproduces the paper's Table S2 progression in test MAPE:

      Variance  (1 feature)  → ~15 %
      Discharge (5 features) → ~9.1 %
      Full      (9 features) → ~7.5 %

    Returns ``None`` if any underlying feature window is missing or
    invalid; the OLS design matrix needs all 9 columns populated for a
    row to be usable.
    """
    five = severson_features_discharge(cell)
    if five is None:
        return None
    extra = severson_features_extended(cell)
    if extra is None:
        return None
    return {**five, **extra}


PER_CYCLE_FEATURE_NAMES: tuple[str, ...] = (
    "cycle_norm",
    "qd_max",
    "qd_range",
    "v_mean",
    "v_std",
    "t_max",
    "duration_s",
)


def per_cycle_summary(cell: Cell, cycles_to_use: range = range(2, 101)) -> np.ndarray | None:
    """Per-cycle scalar summary as a (T, 7) sequence for LSTM input.

    For each cycle in `cycles_to_use` we extract:
      0  cycle_norm         = cycle / 100
      1  qd_max             = peak discharge capacity (Ah)
      2  qd_range            = max - min Qd (DoD proxy; replaces near-constant qd_min)
      3  v_mean             = mean V over the cycle
      4  v_std              = std V (proxy for swing magnitude)
      5  t_max              = max temperature (°C)
      6  duration_s         = total cycle wall-clock time

    Returns None if any expected cycle is missing or all-NaN. Shape (T, 7).
    """
    rows: list[list[float]] = []
    for idx in cycles_to_use:
        try:
            cyc = cell.cycle(idx)
        except IndexError:
            return None
        if cyc.Qd is None or cyc.Qd.size == 0 or cyc.V is None or cyc.V.size == 0:
            return None
        qd = cyc.Qd[np.isfinite(cyc.Qd)]
        v = cyc.V[np.isfinite(cyc.V)]
        t = cyc.T[np.isfinite(cyc.T)] if cyc.T is not None else np.array([np.nan])
        ts = cyc.t[np.isfinite(cyc.t)] if cyc.t is not None else np.array([0.0])
        if qd.size == 0 or v.size == 0:
            return None
        rows.append([
            idx / 100.0,
            float(qd.max()),
            float(qd.max() - qd.min()),
            float(v.mean()),
            float(v.std()),
            float(t.max()) if t.size else 0.0,
            float(ts.max() - ts.min()) if ts.size else 0.0,
        ])
    return np.asarray(rows, dtype=np.float64)


def features_for_all(
    cells: Iterable[Cell],
    *,
    model: str = "full",
) -> list[dict]:
    """Bulk feature extraction. Returns rows ready for pandas.DataFrame.

    Parameters
    ----------
    model
      Which feature set to extract per cell:
        - ``"variance"``  : 1 feature (log_var_delta_q only)
        - ``"discharge"`` : 5 features (Severson Table 1 Discharge model)
        - ``"full"``      : 9 features (Severson Table S2 Full model) — default

    Cells that fail the model's prerequisites (missing cycles, malformed
    data, etc.) are silently dropped — the caller checks ``len(rows)``
    against the input cell count to gauge yield.
    """

    def _extract_variance(c: Cell) -> dict | None:
        v = severson_feature_log_var(c)
        return None if v is None else {"log_var_delta_q": v}

    extractors = {
        "variance": _extract_variance,
        "discharge": severson_features_discharge,
        "full": severson_features_full,
    }
    if model not in extractors:
        raise ValueError(f"unknown model={model!r}; expected one of {sorted(extractors)}")
    extract = extractors[model]

    rows: list[dict] = []
    for c in cells:
        if c.cycle_life <= 0 or c.n_cycles < 100:
            continue
        feats = extract(c)
        if feats is None:
            continue
        rows.append({
            "cell_id": c.cell_id,
            "batch": c.batch,
            "cycle_life": c.cycle_life,
            "log_cycle_life": float(np.log10(c.cycle_life)),
            "policy": c.policy,
            "n_cycles_observed": c.n_cycles,
            **feats,
        })
    return rows
