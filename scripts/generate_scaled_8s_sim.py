"""W1 Day 1 模擬 gate — 8S LFP demonstrator scaled simulation.

對應 docs/BBU_IMPLEMENTATION_PLAN.md §1.3。目的:在採購下單前驗證縮放後的
demonstrator(8S LFP × 0.25 kWh + Maxwell BMOD0058 supercap)能否重現
v2.2 spec 的 5.7× / 3.5× 削峰 ratio。

跑出來的 ratio 決定 supercap bank 配置:
  • ratio ≥ 3× / 2×           → 採購清單照 Part 2 走,2× Maxwell
  • 2× ≤ ratio < 3×           → 升 3× Maxwell(BoM +NT$ 4,500)
  • ratio < 2×                → 暫停採購,先 sweep τ + supercap 配置

執行: .venv/Scripts/python scripts/generate_scaled_8s_sim.py
輸出: data/processed/scaled_8s_sim.json
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pybamm
from loguru import logger

# ---------------------------------------------------------------------------
# Demonstrator (8S) constants — scaled from v2.2 spec (15S × 2.5 kWh / 15 kW)
# ---------------------------------------------------------------------------
N_SERIES = 8                      # 8S vs spec 15S
LFP_PACK_NOMINAL_V = 25.6         # 8 × 3.2 V
LFP_PACK_KWH = 0.25               # ~1/10 of spec 2.5 kWh
BASELINE_KW = 0.5                 # v1.2:1.0 → 0.5 kW,因 Maxwell BMOD0058 Ioper 19A 限制;
                                  # per-cell C-rate 因此從 6C → ~5C peak(仍在車規 LFP pulse 區)
TRANSIENT_AMPLITUDE = 0.30        # ±30 % swing (same as spec)
TRANSIENT_PERIOD_S = 0.10         # 100 ms square wave (same as spec)
SPLIT_FILTER_TAU_S = 0.5          # 一階互補濾波器 τ (same as spec)
TARGET_PEAK_C_RATE = 6.0          # per-cell C-rate at peak (same as spec — KEY)

I_PEAK_PACK_A = (
    BASELINE_KW * (1.0 + TRANSIENT_AMPLITUDE) * 1000.0 / LFP_PACK_NOMINAL_V
)

# ---------------------------------------------------------------------------
# Supercap configurations to evaluate.
# Maxwell BMOD0058-E016-B02 (16 V / 58 F module). ESR datasheet typical
# ~22 mΩ DC; we'll explore both datasheet-typical and pessimistic (used
# second-hand). UVLO 推算為 datasheet 最低 SOC 對應電壓,以模組電壓 50 %
# 取保守值。實際採購前必須查到貨 lot 的真實 datasheet。
# ---------------------------------------------------------------------------
@dataclass
class SupercapConfig:
    label: str
    n_series: int                 # 模組串
    n_parallel: int               # 模組並
    c_module_f: float             # 單模組 F
    esr_module_ohm: float         # 單模組 DC ESR
    v_nominal_module_v: float     # 單模組額定電壓
    v_min_module_v: float         # 單模組 UVLO

    @property
    def v_nominal_bank_v(self) -> float:
        return self.v_nominal_module_v * self.n_series

    @property
    def v_min_bank_v(self) -> float:
        return self.v_min_module_v * self.n_series

    @property
    def c_bank_f(self) -> float:
        return self.c_module_f * self.n_parallel / self.n_series

    @property
    def esr_bank_ohm(self) -> float:
        return self.esr_module_ohm * self.n_series / self.n_parallel

    @property
    def cost_nt(self) -> int:
        return 4500 * self.n_series * self.n_parallel


CONFIGS: list[SupercapConfig] = [
    SupercapConfig(
        label="2× Maxwell BMOD0058 並聯 (16 V bank, needs DC-DC)",
        n_series=1, n_parallel=2,
        c_module_f=58.0, esr_module_ohm=0.022,
        v_nominal_module_v=16.0, v_min_module_v=8.0,
    ),
    SupercapConfig(
        label="2× Maxwell BMOD0058 串聯 (32 V bank, ~match 8S LFP)",
        n_series=2, n_parallel=1,
        c_module_f=58.0, esr_module_ohm=0.022,
        v_nominal_module_v=16.0, v_min_module_v=8.0,
    ),
    SupercapConfig(
        label="4× Maxwell BMOD0058 串並 2S2P (32 V / 58 F / 11 mΩ)",
        n_series=2, n_parallel=2,
        c_module_f=58.0, esr_module_ohm=0.022,
        v_nominal_module_v=16.0, v_min_module_v=8.0,
    ),
    # 悲觀情境:ESR 二手老化 2×
    SupercapConfig(
        label="2× Maxwell 串聯,ESR 悲觀 2× (二手老化)",
        n_series=2, n_parallel=1,
        c_module_f=58.0, esr_module_ohm=0.044,
        v_nominal_module_v=16.0, v_min_module_v=8.0,
    ),
]


# ---------------------------------------------------------------------------
# Helpers (照 generate_twin_scenarios.py 同款邏輯,僅去掉 rack 多 BBU 假設)
# ---------------------------------------------------------------------------
def _build_power_profile(duration_s: float, dt: float) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(0.0, duration_s + dt, dt)
    pulse = (np.floor(t / TRANSIENT_PERIOD_S).astype(int) % 2) * 2 - 1
    p_kw = BASELINE_KW * (1.0 + TRANSIENT_AMPLITUDE * pulse)
    return t, p_kw


def _split_with_lic(
    p_total_kw: np.ndarray, dt: float, tau_s: float = SPLIT_FILTER_TAU_S,
) -> tuple[np.ndarray, np.ndarray]:
    alpha = dt / (tau_s + dt)
    lfp = np.empty_like(p_total_kw)
    lfp[0] = p_total_kw[0]
    for i in range(1, len(p_total_kw)):
        lfp[i] = alpha * p_total_kw[i] + (1 - alpha) * lfp[i - 1]
    lic = p_total_kw - lfp
    return lfp, lic


def _simulate_lfp_cell(power_kw: np.ndarray, t: np.ndarray) -> dict[str, np.ndarray]:
    """Run a single LFP cell through PyBaMM DFN."""
    i_pack = power_kw * 1000.0 / LFP_PACK_NOMINAL_V
    i_cell = i_pack  # series → same current

    model = pybamm.lithium_ion.DFN()
    params = pybamm.ParameterValues("Prada2013")
    nominal_cap = params["Nominal cell capacity [A.h]"]
    scale = (TARGET_PEAK_C_RATE * float(nominal_cap)) / I_PEAK_PACK_A
    i_sim = i_cell * scale

    params["Current function [A]"] = pybamm.Interpolant(
        t, i_sim, pybamm.t, name="profile", interpolator="linear"
    )
    sim = pybamm.Simulation(model, parameter_values=params)
    sol = sim.solve(t_eval=t)
    return {
        "t": np.asarray(sol["Time [s]"].entries),
        "V_cell": np.asarray(sol["Voltage [V]"].entries),
        "I_cell": np.asarray(sol["Current [A]"].entries),
    }


def _simulate_supercap_droop(
    p_lic_kw: np.ndarray, t: np.ndarray, cfg: SupercapConfig,
) -> dict:
    """First-order RC model — same as generate_twin_scenarios._simulate_lic_rc."""
    v_nominal = cfg.v_nominal_bank_v
    p_w = p_lic_kw * 1000.0
    i_a = p_w / v_nominal

    dt_arr = np.diff(t)
    seg = 0.5 * (i_a[:-1] + i_a[1:])
    q_c = np.concatenate(([0.0], np.cumsum(seg * dt_arr)))

    v_bank = v_nominal - q_c / cfg.c_bank_f - i_a * cfg.esr_bank_ohm
    v_min = float(np.min(v_bank))
    v_max = float(np.max(v_bank))

    i_peak = float(np.max(np.abs(i_a)))
    esr_drop_peak = i_peak * cfg.esr_bank_ohm
    total_droop = v_nominal - v_min
    esr_fraction = float(esr_drop_peak / total_droop) if total_droop > 1e-9 else float("nan")

    return {
        "v_min": v_min,
        "v_max": v_max,
        "v_pp": float(v_max - v_min),
        "v_droop_from_nominal": float(total_droop),
        "headroom_to_uvlo_v": float(v_min - cfg.v_min_bank_v),
        "passes_uvlo": bool(v_min > cfg.v_min_bank_v),
        "i_peak_a": i_peak,
        "esr_drop_peak_v": float(esr_drop_peak),
        "esr_drop_fraction": esr_fraction,
    }


def _stable_window_pp(t: np.ndarray, v: np.ndarray, t0: float = 4.0, t1: float = 6.0) -> float:
    mask = (t >= t0) & (t <= t1)
    if not mask.any():
        return float(np.ptp(v))
    return float(np.ptp(v[mask]))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    duration_s = 10.0
    dt = 0.005
    t, p_total_kw = _build_power_profile(duration_s, dt)

    logger.info(f"=== 8S Demonstrator scaled sim ===")
    logger.info(f"  N_SERIES={N_SERIES}  V_pack={LFP_PACK_NOMINAL_V}V  "
                f"baseline={BASELINE_KW}kW  τ={SPLIT_FILTER_TAU_S}s")

    # --- LFP-only (純電池應對全部負載) ---
    logger.info(">>> Running PyBaMM DFN: LFP-only baseline ...")
    sim_lfp_only = _simulate_lfp_cell(p_total_kw, t)
    v_lfp_only = np.asarray(sim_lfp_only["V_cell"])
    std_pure_kw = float(np.std(p_total_kw))
    pp_pure_v = _stable_window_pp(np.asarray(sim_lfp_only["t"]), v_lfp_only)
    logger.info(f"    p_total std = {std_pure_kw:.4f} kW   v_cell pp = {pp_pure_v*1000:.2f} mV")

    # --- Hybrid (LFP + supercap split) — 對每個 supercap 配置都跑一次 ---
    p_lfp, p_lic = _split_with_lic(p_total_kw, dt)
    logger.info(">>> Running PyBaMM DFN: Hybrid LFP receive power ...")
    sim_hybrid = _simulate_lfp_cell(p_lfp, t)
    v_hybrid = np.asarray(sim_hybrid["V_cell"])
    std_hybrid_kw = float(np.std(p_lfp))
    pp_hybrid_v = _stable_window_pp(np.asarray(sim_hybrid["t"]), v_hybrid)

    ratio_power = std_pure_kw / max(std_hybrid_kw, 1e-9)
    ratio_voltage = pp_pure_v / max(pp_hybrid_v, 1e-9)
    logger.info(f"    p_lfp std = {std_hybrid_kw:.4f} kW   v_cell pp = {pp_hybrid_v*1000:.2f} mV")
    logger.success(f"    削峰 ratio: power = {ratio_power:.2f}×   voltage = {ratio_voltage:.2f}×")

    # Supercap configurations — RC droop only (LIC power split independent of cap params)
    supercap_results = []
    for cfg in CONFIGS:
        droop = _simulate_supercap_droop(p_lic, t, cfg)
        supercap_results.append({
            "config": {
                "label": cfg.label,
                "n_series": cfg.n_series, "n_parallel": cfg.n_parallel,
                "c_bank_f": cfg.c_bank_f, "esr_bank_ohm": cfg.esr_bank_ohm,
                "v_nominal_bank_v": cfg.v_nominal_bank_v,
                "v_min_bank_v": cfg.v_min_bank_v,
                "cost_nt": cfg.cost_nt,
            },
            "droop_check": droop,
        })
        status = "✅ pass" if droop["passes_uvlo"] else "❌ FAIL"
        logger.info(
            f"  [{status}] {cfg.label}: v_min={droop['v_min']:.2f}V "
            f"(UVLO={cfg.v_min_bank_v:.1f}V, headroom={droop['headroom_to_uvlo_v']:.2f}V), "
            f"i_peak={droop['i_peak_a']:.1f}A, cost=NT${cfg.cost_nt:,}"
        )

    # --- Gate decision ---
    if ratio_power >= 3.0 and ratio_voltage >= 2.0:
        gate_decision = "PASS"
        gate_supercap_recommendation = (
            "採購清單照 Part 2 走;從 supercap_results 中挑通過 UVLO + 成本最低者"
        )
    elif ratio_power >= 2.0 and ratio_voltage >= 1.5:
        gate_decision = "MARGINAL"
        gate_supercap_recommendation = (
            "升 3× 或 4× Maxwell(BoM +NT$ 4,500–9,000),預算挪用 buffer"
        )
    else:
        gate_decision = "FAIL"
        gate_supercap_recommendation = (
            "暫停採購,sweep τ ∈ [0.1, 2.0] 與 supercap 配置找 Pareto-optimal"
        )

    # --- Save ---
    out_dir = Path(__file__).resolve().parent.parent / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "scaled_8s_sim.json"

    payload = {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/generate_scaled_8s_sim.py",
            "pybamm_version": pybamm.__version__,
            "purpose": "W1 Day 1 gate per docs/BBU_IMPLEMENTATION_PLAN.md §1.3",
        },
        "demonstrator_params": {
            "n_series": N_SERIES,
            "v_pack_nominal_v": LFP_PACK_NOMINAL_V,
            "pack_kwh": LFP_PACK_KWH,
            "baseline_kw": BASELINE_KW,
            "transient_amplitude": TRANSIENT_AMPLITUDE,
            "transient_period_s": TRANSIENT_PERIOD_S,
            "split_tau_s": SPLIT_FILTER_TAU_S,
            "target_peak_c_rate": TARGET_PEAK_C_RATE,
            "i_peak_pack_a": I_PEAK_PACK_A,
        },
        "lfp_receive_power": {
            "std_pure_kw": std_pure_kw,
            "std_hybrid_kw": std_hybrid_kw,
            "ratio": ratio_power,
            "spec_target": 5.7,
        },
        "cell_voltage_swing_stable_window": {
            "pp_pure_v": pp_pure_v,
            "pp_hybrid_v": pp_hybrid_v,
            "ratio": ratio_voltage,
            "spec_target": 3.5,
        },
        "supercap_configs": supercap_results,
        "gate_decision": gate_decision,
        "gate_recommendation": gate_supercap_recommendation,
        "note": (
            "削峰 ratio 是 LPF 數學特性(τ vs signal period),不依賴 supercap "
            "physical params;supercap 配置只影響 UVLO droop 是否撐得住。"
            "因此 ratio 通常通過;真正的 gate 是 supercap droop 表中至少 1 "
            "個配置 passes_uvlo=true 且 cost 落在預算內。"
        ),
    }

    out_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=lambda o: float(o) if hasattr(o, "__float__") else str(o)),
        encoding="utf-8",
    )
    logger.success(f"Written {out_path}")
    logger.info(f"=== Gate decision: {gate_decision} ===")
    logger.info(f"    {gate_supercap_recommendation}")


if __name__ == "__main__":
    main()
