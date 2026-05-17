"""Live demonstrator → dashboard telemetry bridge (M4).

Reads electrical/thermal state from the bench demonstrator and writes a
JSON snapshot to ``apps/web/public/scenarios/live_demonstrator.json`` every
N seconds, using atomic write so the dashboard's 5-second polling cannot
read a half-written file.

Two modes
---------
``--mock``         : generate plausible telemetry without hardware (random
                     walk over realistic ranges). Use this for W1 stub work
                     + demo dry-run when bench is not powered up.
``--port COM3``    : read pack voltage / current / SOC / temps from JK-BMS
                     over RS485 (USB-to-485 dongle). Adds pyserial
                     dependency — install with `pip install pyserial`.
                     ``--n-cells`` defaults to 8 for the demonstrator;
                     ``--invert-current`` flips sign if charging shows
                     negative on first bench connection.

Stop with Ctrl-C.

Note on Next.js dev server interaction (v1.3 review M4)
-------------------------------------------------------
This writes to `apps/web/public/scenarios/live_demonstrator.json` which sits
inside Next.js's watched `public/` directory. In `pnpm dev` mode each write
will trigger a public-asset reload (NOT a full page HMR — Next.js distinguishes
asset reloads from code reloads). Asset reloads are <50 ms and invisible to
the user.

If you see UI flickering anyway, drop ``--interval`` from 2 s default to 5 s
(matches dashboard polling, no information loss). Production deploy on Vercel
serves the file statically with the no-cache header from `apps/web/vercel.json`
so dev-server watching is moot.

Refs: docs/BBU_IMPLEMENTATION_PLAN.md §4.4 (atomic write), §5.4 (M4 E2E),
§7 W1 (软件 stub).
"""

from __future__ import annotations

import argparse
import math
import random
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

# Reuse the atomic writer from the sibling script. We deliberately keep
# atomic_json.py at script scope (not as a battery-twin package import)
# so the bridge has zero non-stdlib dependencies in --mock mode — the lab
# laptop only needs Python 3.11 to run the W1 stub.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from atomic_json import atomic_write_json
from jkbms import JKBMSReader, JKBMSReading

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / "apps" / "web" / "public" / "scenarios" / "live_demonstrator.json"


# ---------------------------------------------------------------------------
# Telemetry state (mock mode)
# ---------------------------------------------------------------------------
@dataclass
class MockState:
    """Random-walk state for plausible demonstrator telemetry."""

    t_start: float
    soh_lfp: float = 0.972        # close to fresh
    soh_lic: float = 0.991
    temp_lfp_c: float = 30.0      # room-temp baseline
    temp_lic_c: float = 28.0
    rul_cycles: int = 12500       # synthetic — close to BBU duty Severson tail
    hybrid_mode: bool = True

    def step(self, p_load_w: float) -> None:
        """Advance one tick. p_load_w drives thermal rise + SOH drift sign."""
        # Thermal: 1st-order toward (room + load coupling), τ ~ 30 s
        target_lfp = 30.0 + p_load_w * 0.018      # 18 °C per kW heating
        target_lic = 28.0 + p_load_w * 0.008      # LIC heats less (lower ESR loss)
        alpha = 0.05                              # τ ~ 20 s at 1 Hz tick
        self.temp_lfp_c += (target_lfp - self.temp_lfp_c) * alpha
        self.temp_lic_c += (target_lic - self.temp_lic_c) * alpha
        # SOH: tiny downward drift + random walk (within rounding noise),
        # purely cosmetic so the dashboard shows non-static values
        self.soh_lfp = max(0.5, self.soh_lfp - 1e-7 + random.gauss(0, 1e-5))
        self.soh_lic = max(0.5, self.soh_lic - 5e-8 + random.gauss(0, 1e-6))


def mock_load_profile(elapsed_s: float) -> float:
    """Drive the GB200-emulator profile: 500 W baseline ± 30 % @ 100 ms.

    For the dashboard we want a smoother envelope (the dashboard refreshes
    every 5 s, not every 100 ms), so return the *mean absolute load* over
    the recent window — that's what the user perceives moving on screen.
    Use a slow sinusoid superimposed on baseline to fake "user adjusts
    e-load" interactions during the demo.
    """
    baseline_w = 500.0
    # Slow operator-controlled sweep: oscillates ~60 s period, ±200 W.
    slow = 200.0 * math.sin(elapsed_s * 2 * math.pi / 60.0)
    # Fast component RMS (the 100 ms swing averaged over polling window)
    fast_rms = 500.0 * 0.30 / math.sqrt(2)        # ~106 W
    return baseline_w + slow + random.gauss(0, fast_rms * 0.1)


def status_from(soh_lfp: float, rul: int, temp_lfp: float) -> str:
    """Match Device.status logic in apps/web/src/lib/types.ts."""
    if temp_lfp > 50.0:
        return "thermal_warn"
    if soh_lfp < 0.85 or rul < 800:
        return "early_aging"
    return "healthy"


def build_mock_snapshot(state: MockState, t_start: float) -> dict:
    """Compose mock-mode snapshot — same shape as bench mode but synthesised."""
    now = time.monotonic()
    elapsed_s = now - t_start
    p_load_w = mock_load_profile(elapsed_s)
    state.step(p_load_w)

    # Pack-level voltage: 8S nominal 25.6 V, droop with current via 50 mΩ
    # pack equivalent resistance (rough — real measurement replaces this in
    # bench mode)
    v_pack_nominal = 25.6
    i_pack_a = p_load_w / v_pack_nominal
    v_pack_v = v_pack_nominal - i_pack_a * 0.050

    status = status_from(state.soh_lfp, state.rul_cycles, state.temp_lfp_c)
    return _wrap_snapshot(
        mode="mock", elapsed_s=elapsed_s,
        v_pack_v=v_pack_v, i_pack_a=i_pack_a, p_load_w=p_load_w,
        soh_lfp=state.soh_lfp, soh_lic=state.soh_lic,
        rul_cycles=state.rul_cycles,
        temp_lfp_c=state.temp_lfp_c, temp_lic_c=state.temp_lic_c,
        status=status, hybrid_mode=state.hybrid_mode,
    )


def build_bench_snapshot(reading: JKBMSReading, state: MockState, t_start: float) -> dict:
    """Compose bench-mode snapshot from a real JK-BMS reading.

    SOH / RUL are still synthesised — JK-BMS doesn't predict RUL and SOH
    derived from coulomb counting requires a full discharge cycle. The
    LIVE card disclaims this honestly: V/I/T are real, SOH/RUL are model
    estimates from /twin (per the dashboard 'Where rul_cycles comes from'
    disclosure).
    """
    elapsed_s = time.monotonic() - t_start
    v_pack_v = reading.pack_voltage_v
    i_pack_a = reading.pack_current_a
    # p_load_w convention: positive = discharging into load (matches mock).
    # If reading.pack_current_a sign is wrong, --invert-current flips it.
    p_load_w = v_pack_v * abs(i_pack_a)
    # Use the max of FET / sensor temps as LFP-side proxy; LIC temp from
    # sensor_2 if wired separately on the bench, else mirror sensor_1.
    temp_lfp_c = reading.temp_max_c
    temp_lic_c = reading.temp_sensor_2_c

    # Cosmetic SOH drift only (real SOH needs a separate estimator).
    state.step(p_load_w)
    status = status_from(state.soh_lfp, state.rul_cycles, temp_lfp_c)
    return _wrap_snapshot(
        mode="bench", elapsed_s=elapsed_s,
        v_pack_v=v_pack_v, i_pack_a=i_pack_a, p_load_w=p_load_w,
        soh_lfp=state.soh_lfp, soh_lic=state.soh_lic,
        rul_cycles=state.rul_cycles,
        temp_lfp_c=temp_lfp_c, temp_lic_c=temp_lic_c,
        status=status, hybrid_mode=state.hybrid_mode,
    )


def _wrap_snapshot(
    *, mode: str, elapsed_s: float,
    v_pack_v: float, i_pack_a: float, p_load_w: float,
    soh_lfp: float, soh_lic: float, rul_cycles: int,
    temp_lfp_c: float, temp_lic_c: float,
    status: str, hybrid_mode: bool,
) -> dict:
    return {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/live_demonstrator_bridge.py",
            "mode": mode,
            "uptime_s": round(elapsed_s, 1),
        },
        "live": True,
        "device": {
            "id": "DEMO-BENCH-01",
            "site": "Bench Demonstrator (ATCC C13)",
            "location": "Lab · ATCC C13",
            "lat": 25.0330,
            "lng": 121.5654,
            "soh_lfp": round(soh_lfp, 4),
            "soh_lic": round(soh_lic, 4),
            "rul_cycles": rul_cycles,
            "age_months": round(elapsed_s / (30 * 86400), 3),
            "transient_events_24h": 0,
            "temp_lfp_c": round(temp_lfp_c, 1),
            "temp_lic_c": round(temp_lic_c, 1),
            "status": status,
            # Live-only extras (not in Device type, dashboard renders separately)
            "v_pack_v": round(v_pack_v, 3),
            "i_pack_a": round(i_pack_a, 2),
            "p_load_w": round(p_load_w, 1),
            "hybrid_mode": hybrid_mode,
        },
    }


def offline_snapshot() -> dict:
    """Placeholder written at startup + on Ctrl-C so the build never sees
    a missing file or a stale 'live=true' state."""
    return {
        "_meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "generator": "scripts/live_demonstrator_bridge.py",
            "mode": "offline",
        },
        "live": False,
        "device": None,
    }


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
_STOP = False


def _on_sigint(_signum, _frame):
    global _STOP
    _STOP = True
    print("\n[bridge] Ctrl-C — writing offline snapshot and exiting", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--mock", action="store_true",
        help="Generate fake telemetry (no hardware required). W1 stub mode.",
    )
    parser.add_argument(
        "--port", type=str, default=None,
        help="Serial port for JK-BMS RS485 (e.g. COM3, /dev/ttyUSB0). Bench mode.",
    )
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--n-cells", type=int, default=8,
                        help="JK-BMS cell count (8 for demonstrator's 8S pack).")
    parser.add_argument("--invert-current", action="store_true",
                        help="Flip JK-BMS pack current sign (try if discharging shows negative).")
    parser.add_argument(
        "--interval", type=float, default=2.0,
        help="Write period in seconds (default 2.0).",
    )
    parser.add_argument(
        "--out", type=Path, default=OUT_PATH,
        help=f"Output JSON path (default {OUT_PATH.relative_to(REPO)}).",
    )
    args = parser.parse_args()

    if args.mock and args.port:
        print("[bridge] ERROR: --mock and --port are mutually exclusive.", file=sys.stderr)
        return 2
    if not args.mock and not args.port:
        print(
            "[bridge] ERROR: pick one mode — --mock (no hardware) or "
            "--port <COM> (JK-BMS bench).", file=sys.stderr,
        )
        return 2

    if not args.out.parent.exists():
        print(f"[bridge] ERROR: parent dir does not exist: {args.out.parent}", file=sys.stderr)
        return 2

    signal.signal(signal.SIGINT, _on_sigint)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _on_sigint)

    t_start = time.monotonic()
    state = MockState(t_start=t_start)
    reader: JKBMSReader | None = None
    if args.port:
        try:
            reader = JKBMSReader(
                port=args.port, baud=args.baud,
                n_cells=args.n_cells, invert_current=args.invert_current,
            )
        except Exception as e:
            print(f"[bridge] ERROR opening {args.port}: {e}", file=sys.stderr)
            return 2

    mode_label = "mock" if args.mock else f"bench ({args.port})"
    print(f"[bridge] writing {args.out} every {args.interval}s ({mode_label}); Ctrl-C to stop")

    consecutive_errors = 0
    tick = 0
    try:
        while not _STOP:
            try:
                if reader is not None:
                    reading = reader.read()
                    snap = build_bench_snapshot(reading, state, t_start)
                else:
                    snap = build_mock_snapshot(state, t_start)
                atomic_write_json(args.out, snap)
                consecutive_errors = 0
                tick += 1
                if tick % 10 == 1:
                    d = snap["device"]
                    print(
                        f"[bridge] tick {tick}: P={d['p_load_w']:.0f}W "
                        f"V={d['v_pack_v']:.2f}V I={d['i_pack_a']:+.2f}A "
                        f"T_lfp={d['temp_lfp_c']:.1f}°C status={d['status']}",
                        file=sys.stderr,
                    )
            except (TimeoutError, ValueError, OSError) as e:
                consecutive_errors += 1
                print(
                    f"[bridge] BMS read failed ({type(e).__name__}): {e} "
                    f"(consecutive={consecutive_errors})",
                    file=sys.stderr,
                )
                if consecutive_errors >= 5:
                    print(
                        f"[bridge] {consecutive_errors} consecutive failures — "
                        f"writing offline snapshot, continuing to retry",
                        file=sys.stderr,
                    )
                    atomic_write_json(args.out, offline_snapshot())
            # Sleep in small chunks so SIGINT is responsive
            slept = 0.0
            while slept < args.interval and not _STOP:
                step = min(0.2, args.interval - slept)
                time.sleep(step)
                slept += step
    finally:
        atomic_write_json(args.out, offline_snapshot())
        if reader is not None:
            reader.close()
        print("[bridge] wrote offline snapshot, bye", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
