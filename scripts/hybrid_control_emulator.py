"""Python emulator for the STM32 hybrid control law.

Same first-order complementary-filter math the STM32 firmware will run
(see firmware/stm32_hybrid_control/Core/Src/main.c). Lets the team:

  1. Validate the control loop on the laptop before STM32 board arrives
  2. Sweep tau values offline to confirm the 5.7× / 3.5× headline
  3. Compare against the §1.3 sim output (`scaled_8s_sim.json`) as a
     cross-check of the firmware vs the offline PyBaMM split.

This is a *simulator* of the control loop, not an inference path on
real telemetry. Real bench measurement comes from M3 with scope + DL24M
profile (see §5.3).

Usage::

    .venv/Scripts/python scripts/hybrid_control_emulator.py
    .venv/Scripts/python scripts/hybrid_control_emulator.py --tau 1.0 --plot

Outputs:
  • data/processed/hybrid_control_emulator.json — ratio numbers + summary
  • data/processed/hybrid_control_emulator.png  — 3-panel: p_total / p_lfp / p_sc + duty
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "data" / "processed"


# ---------------------------------------------------------------------------
# Control loop — mirrors STM32 1 kHz inner loop
# ---------------------------------------------------------------------------
@dataclass
class ControlState:
    """Mirrors STM32 RAM state across loop iterations."""

    p_lfp_filt: float = 0.0    # IIR low-pass running output
    duty_lfp: float = 1.0       # current PWM duty for LFP path
    duty_sc: float = 0.0        # current PWM duty for supercap path
    ramp_progress: float = 0.0  # 0..1, advanced once per tick during L3 ramp


def control_tick(
    p_total_w: float, state: ControlState, *,
    dt_s: float = 1e-3,        # 1 kHz STM32 loop
    tau_s: float = 0.5,        # complementary filter — same as §1.3 sim
    ramp_tau_s: float = 10.0,  # L3 ramp duration (precharge → running)
    ramp_active: bool = False,
    min_duty: float = 0.05,    # IR2110 fallback wants 5–95 % duty
    max_duty: float = 0.95,
) -> ControlState:
    """One STM32 tick.

    Returns updated state (also mutates the input). Computes:
      • p_lfp = LPF(p_total, tau)          ← LFP target power
      • p_sc  = p_total − p_lfp            ← supercap residual
      • duty_lfp = p_lfp / p_total          ← clipped to [min_duty, max_duty]
      • duty_sc  = 1 − duty_lfp
      • If ramp_active: duty multiplied by ramp_progress (0→1 over ramp_tau_s)
    """
    alpha = dt_s / (tau_s + dt_s)
    state.p_lfp_filt = alpha * p_total_w + (1.0 - alpha) * state.p_lfp_filt
    p_lfp = state.p_lfp_filt
    p_sc = p_total_w - p_lfp

    # Power-share → duty (assumes both paths feed the same V_bus → duty ratio
    # equals power ratio). Real STM32 code can use the same equation OR a
    # direct current-share scheme if INA226 readings are available.
    if abs(p_total_w) > 1.0:
        duty_lfp_raw = max(0.0, p_lfp) / abs(p_total_w)
    else:
        duty_lfp_raw = 1.0
    duty_lfp_raw = max(min_duty, min(max_duty, duty_lfp_raw))

    if ramp_active:
        state.ramp_progress = min(1.0, state.ramp_progress + dt_s / ramp_tau_s)
        scale = state.ramp_progress
    else:
        state.ramp_progress = 1.0
        scale = 1.0

    state.duty_lfp = duty_lfp_raw * scale
    state.duty_sc = (1.0 - duty_lfp_raw) * scale
    return state


# ---------------------------------------------------------------------------
# Simulation harness — drive the loop with a GB200-like square wave
# ---------------------------------------------------------------------------
def run_emulator(
    duration_s: float = 10.0,
    dt_s: float = 1e-3,
    baseline_w: float = 500.0,
    amplitude: float = 0.30,
    period_s: float = 0.10,
    tau_s: float = 0.5,
) -> dict:
    """Drive control loop with a 500 W ±30 % @ 100 ms square wave for
    `duration_s` seconds and report the削峰 ratio achieved."""
    t = np.arange(0.0, duration_s + dt_s, dt_s)
    pulse = (np.floor(t / period_s).astype(int) % 2) * 2 - 1
    p_total = baseline_w * (1.0 + amplitude * pulse)

    # Seeding: MATCH scripts/generate_scaled_8s_sim.py methodology — lfp[0]
    # starts at p_total[0] (NOT pre-seeded to baseline), so startup transient
    # is included in std. This keeps emulator ratio internally consistent
    # with the §1.3 sim 5.72× headline. Pre-seeding to baseline would skip
    # ~5τ of warmup variance and inflate the ratio to ~17× — defensible but
    # inconsistent with the whitepaper claim.
    state = ControlState(p_lfp_filt=float(p_total[0]))
    p_lfp_log = np.empty_like(p_total)
    p_sc_log = np.empty_like(p_total)
    duty_lfp_log = np.empty_like(p_total)

    for i, p in enumerate(p_total):
        control_tick(float(p), state, dt_s=dt_s, tau_s=tau_s)
        p_lfp_log[i] = state.p_lfp_filt
        p_sc_log[i] = p - state.p_lfp_filt
        duty_lfp_log[i] = state.duty_lfp

    # std over FULL window (matching scaled_8s_sim) — includes startup transient
    std_pure = float(np.std(p_total))
    std_hybrid = float(np.std(p_lfp_log))
    ratio_full = std_pure / max(std_hybrid, 1e-9)

    # Also report steady-state ratio (post 5τ warmup) as upper bound — this
    # is what the bench scope will likely show when triggered on steady state.
    warmup_idx = int(5 * tau_s / dt_s)
    std_hybrid_steady = float(np.std(p_lfp_log[warmup_idx:]))
    ratio_steady = std_pure / max(std_hybrid_steady, 1e-9)

    return {
        "params": {
            "duration_s": duration_s,
            "dt_s": dt_s,
            "baseline_w": baseline_w,
            "amplitude": amplitude,
            "period_s": period_s,
            "tau_s": tau_s,
        },
        "ratio_power": ratio_full,
        "ratio_power_steady_state": ratio_steady,
        "std_pure_w": std_pure,
        "std_hybrid_w": std_hybrid,
        "std_hybrid_steady_w": std_hybrid_steady,
        "spec_target_ratio": 5.7,
        "method_note": (
            "ratio_power matches scripts/generate_scaled_8s_sim.py methodology "
            "(lfp[0] = p_total[0], std over full window). "
            "ratio_power_steady_state skips first 5τ warmup; this is what the "
            "bench scope likely shows when triggered on steady-state window."
        ),
        "series": {
            "t": t.tolist(),
            "p_total_w": p_total.tolist(),
            "p_lfp_w": p_lfp_log.tolist(),
            "p_sc_w": p_sc_log.tolist(),
            "duty_lfp": duty_lfp_log.tolist(),
        },
    }


def plot_result(result: dict, out_path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    s = result["series"]
    t = np.asarray(s["t"])
    fig, axes = plt.subplots(3, 1, figsize=(10, 7), sharex=True)

    # Show only first 3 seconds for readability
    win = (t >= 0) & (t <= 3.0)

    axes[0].plot(t[win], np.asarray(s["p_total_w"])[win], color="#94a3b8", lw=1.2, label="p_total (load)")
    axes[0].plot(t[win], np.asarray(s["p_lfp_w"])[win], color="#34d399", lw=1.6, label="p_LFP (after LPF)")
    axes[0].set_ylabel("Power (W)")
    axes[0].legend(loc="upper right", fontsize=9)
    axes[0].grid(True, alpha=0.25, linestyle=":")
    axes[0].set_title(
        f"Python emulator · τ={result['params']['tau_s']} s · "
        f"baseline {result['params']['baseline_w']:.0f} W ±{result['params']['amplitude']*100:.0f} %  "
        f"→ p_LFP std reduction {result['ratio_power']:.2f}×"
    )

    axes[1].plot(t[win], np.asarray(s["p_sc_w"])[win], color="#22d3ee", lw=1.2, label="p_supercap (residual)")
    axes[1].axhline(0, color="#475569", lw=0.5)
    axes[1].set_ylabel("Power (W)")
    axes[1].legend(loc="upper right", fontsize=9)
    axes[1].grid(True, alpha=0.25, linestyle=":")

    axes[2].plot(t[win], np.asarray(s["duty_lfp"])[win], color="#f59e0b", lw=1.2, label="duty_LFP")
    axes[2].plot(t[win], 1.0 - np.asarray(s["duty_lfp"])[win], color="#a78bfa", lw=1.2, label="duty_SC")
    axes[2].set_ylabel("PWM duty")
    axes[2].set_xlabel("Time (s)")
    axes[2].set_ylim(-0.05, 1.05)
    axes[2].legend(loc="upper right", fontsize=9)
    axes[2].grid(True, alpha=0.25, linestyle=":")

    fig.tight_layout()
    fig.savefig(out_path, dpi=140, bbox_inches="tight")
    plt.close(fig)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--tau", type=float, default=0.5, help="LPF τ in seconds (spec 0.5)")
    ap.add_argument("--baseline-w", type=float, default=500.0)
    ap.add_argument("--amplitude", type=float, default=0.30)
    ap.add_argument("--duration-s", type=float, default=10.0)
    ap.add_argument("--plot", action="store_true", help="Render histogram PNG")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    result = run_emulator(
        duration_s=args.duration_s,
        baseline_w=args.baseline_w,
        amplitude=args.amplitude,
        tau_s=args.tau,
    )
    print(f"[ctl-em] τ={args.tau}s  std_pure={result['std_pure_w']:.2f}W")
    print(f"[ctl-em]   ratio (full window, matches §1.3 sim) = {result['ratio_power']:.2f}×")
    print(f"[ctl-em]   ratio (steady state, post 5τ warmup)  = {result['ratio_power_steady_state']:.2f}×")
    print(f"[ctl-em] spec target = 5.7× (whitepaper)")
    if result["ratio_power"] >= 5.0:
        print("[ctl-em] [v] control law math reproduces spec headline")
    elif result["ratio_power"] >= 3.0:
        print("[ctl-em] (黃) marginal — check τ")
    else:
        print("[ctl-em] [x] control law fails to reproduce spec headline")
        return 1

    # Drop the heavy series before saving to keep JSON small
    out_payload = {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/hybrid_control_emulator.py",
            "purpose": "B3 §4.1 control loop validation pre-STM32 (M3 precursor)",
        },
        **{k: v for k, v in result.items() if k != "series"},
    }
    json_path = OUT_DIR / "hybrid_control_emulator.json"
    json_path.write_text(json.dumps(out_payload, indent=2), encoding="utf-8")
    print(f"[ctl-em] wrote {json_path.relative_to(REPO)}")

    if args.plot:
        png_path = OUT_DIR / "hybrid_control_emulator.png"
        plot_result(result, png_path)
        print(f"[ctl-em] wrote {png_path.relative_to(REPO)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
