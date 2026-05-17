"""GB200-emulator power profile driver for Atorch / RIDEN DL24-family loads.

M3 critical path #2 — drives the DL24M (or DL24P) over USB serial to alternate
between two constant-current setpoints every 100 ms, producing the
±30 % @ 100 ms square wave the bench demonstrator's hybrid control law sees
(per §1.3 sim + §5.3 headline experiment).

Default load profile (matches §1.3 sim @ baseline 500 W on 25.6 V bus):
  • baseline 500 W → I_lo = 350 W / V_bus ≈ 13.7 A
  • peak     650 W → I_hi = 650 W / V_bus ≈ 25.4 A
  • period 100 ms (50 ms at lo, 50 ms at hi)
  • amplitude ±30 % of baseline

Protocol
--------
DL24-family devices use one of two protocols:
  • **PX100** (older, well-documented, fixed prefix B1 B2 + suffix B6)
  • **Atorch** (newer, checksum-based)

This script defaults to **PX100** because (a) docs are clear, (b) tshaddack's
``dl24.py`` reference verifies it on DL24P. DL24M *may* require ``--protocol
atorch`` — verify on first bench connection with ``--once --amps 1`` (small
discharge, easy to confirm by ammeter).

Refs:
  - https://github.com/tshaddack/dl24 (PX100 reference impl)
  - https://flaviutamas.com/2022/dl24m-electronics (DL24M analysis)
  - https://github.com/dimas/DL24-python (alt PX100 impl)
"""

from __future__ import annotations

import argparse
import io
import signal
import sys
import time
from pathlib import Path

# Force UTF-8 console on Windows so µ / ✅ render.
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# PX100 protocol — fixed prefix / suffix, no checksum
# ---------------------------------------------------------------------------
PX100_PREFIX = b"\xB1\xB2"
PX100_SUFFIX = b"\xB6"


def _px100_set_current(amps: float) -> bytes:
    """B1 B2 02 INT DEC B6 — INT and DEC are 1-byte integers (0-99 dec range)."""
    if amps < 0 or amps > 99.99:
        raise ValueError(f"current {amps} A out of PX100 range (0–99.99)")
    integer = int(amps)
    # Decimal is encoded as 0-99 (centi-amps). 1.50 A → INT=1, DEC=50.
    decimal = int(round((amps - integer) * 100))
    if decimal == 100:
        integer += 1
        decimal = 0
    return PX100_PREFIX + bytes([0x02, integer, decimal]) + PX100_SUFFIX


def _px100_on() -> bytes:
    return PX100_PREFIX + bytes([0x01, 0x01, 0x00]) + PX100_SUFFIX


def _px100_off() -> bytes:
    return PX100_PREFIX + bytes([0x01, 0x00, 0x00]) + PX100_SUFFIX


# ---------------------------------------------------------------------------
# Atorch protocol stub — checksum, newer firmware
# ---------------------------------------------------------------------------
# Atorch frame: FF 55 11 <cmd> <data...> <checksum>
# Checksum = sum(data) & 0xFF
# Set-current cmd is 0x01, with 4-byte big-endian centi-amps.
# Not yet bench-verified; raise NotImplementedError until W2 testing.
def _atorch_set_current(amps: float) -> bytes:
    raise NotImplementedError(
        "Atorch protocol not implemented yet — verify DL24M actually needs it "
        "(default PX100 works on most DL24 family). If PX100 has no effect, "
        "open an issue in scripts/eload_gb200_profile.py."
    )


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
_STOP = False


def _on_sigint(_signum, _frame):
    global _STOP
    _STOP = True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", required=True,
                    help="Serial port (e.g. COM4, /dev/ttyUSB1)")
    ap.add_argument("--baud", type=int, default=9600,
                    help="Default 9600 for PX100 / Atorch DL24 family")
    ap.add_argument("--protocol", choices=["px100", "atorch"], default="px100")
    ap.add_argument("--bus-voltage", type=float, default=25.6,
                    help="DC bus voltage assumed for W→A conversion (default 25.6 V = 8S LFP nominal)")
    ap.add_argument("--baseline-w", type=float, default=500.0,
                    help="Baseline power (W). Default 500 W per §1.3 v1.3 demonstrator.")
    ap.add_argument("--amplitude", type=float, default=0.30,
                    help="amplitude as fraction of baseline (default 0.30 = +/- 30 percent)")
    ap.add_argument("--period-ms", type=float, default=100.0,
                    help="Full square-wave period in ms (default 100 ms)")
    ap.add_argument("--duration-s", type=float, default=60.0,
                    help="How long to run before auto-stop (default 60 s; safety bound)")
    ap.add_argument("--once", action="store_true",
                    help="Send one set-current command (= baseline) and exit — for protocol verification")
    ap.add_argument("--amps", type=float, default=None,
                    help="With --once: override current setpoint in amps")
    args = ap.parse_args()

    # Late pyserial import so --help works without it installed.
    try:
        import serial
    except ImportError:
        print("[eload] ERROR: pyserial required — pip install pyserial", file=sys.stderr)
        return 2

    if args.protocol == "atorch":
        print("[eload] WARN: Atorch protocol stub raises NotImplementedError. "
              "Switch to --protocol px100 unless you know DL24M needs Atorch.",
              file=sys.stderr)

    set_current_fn = _px100_set_current if args.protocol == "px100" else _atorch_set_current
    on_fn = _px100_on
    off_fn = _px100_off

    p_low_w = args.baseline_w * (1.0 - args.amplitude)
    p_high_w = args.baseline_w * (1.0 + args.amplitude)
    i_low_a = p_low_w / args.bus_voltage
    i_high_a = p_high_w / args.bus_voltage
    half_period_s = args.period_ms / 1000.0 / 2.0

    if i_high_a > 30.0:
        print(f"[eload] ERROR: i_high={i_high_a:.1f} A > 30 A DL24M soft-limit "
              f"(8S × 5Ah × 6C). Lower baseline or amplitude.", file=sys.stderr)
        return 2

    print(f"[eload] port={args.port}@{args.baud}  protocol={args.protocol}")
    print(f"[eload] profile: baseline {args.baseline_w:.0f} W ±{args.amplitude*100:.0f} % @ {args.period_ms:.0f} ms")
    print(f"[eload]   → I_lo {i_low_a:.2f} A, I_hi {i_high_a:.2f} A, half-period {half_period_s*1000:.0f} ms")
    print(f"[eload]   → duration {args.duration_s:.0f} s, auto-OFF on exit / Ctrl-C")

    ser = serial.Serial(args.port, args.baud, timeout=1.0)

    signal.signal(signal.SIGINT, _on_sigint)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _on_sigint)

    try:
        if args.once:
            amps = args.amps if args.amps is not None else args.baseline_w / args.bus_voltage
            print(f"[eload] one-shot: set {amps:.2f} A, load ON for 2 s")
            ser.write(set_current_fn(amps))
            time.sleep(0.05)
            ser.write(on_fn())
            time.sleep(2.0)
            ser.write(off_fn())
            return 0

        # Profile loop. Pattern: SET I_lo, ON, sleep half, SET I_hi, sleep half, repeat
        # We don't toggle ON/OFF every half-period (relay click); instead we
        # update setpoint while load stays enabled. The DL24 firmware switches
        # the constant-current setpoint without re-enabling the relay.
        ser.write(set_current_fn(i_low_a))
        time.sleep(0.05)
        ser.write(on_fn())
        t_start = time.monotonic()
        next_toggle = t_start + half_period_s
        is_high = False
        cycles = 0

        while not _STOP and (time.monotonic() - t_start) < args.duration_s:
            now = time.monotonic()
            if now >= next_toggle:
                is_high = not is_high
                cmd = set_current_fn(i_high_a if is_high else i_low_a)
                ser.write(cmd)
                next_toggle += half_period_s
                cycles += 1
                if cycles % 100 == 0:
                    print(f"[eload] cycle {cycles}  elapsed {now - t_start:.1f}s  "
                          f"now={'HI' if is_high else 'LO'}")
            # Short sleep — 1 ms granularity is fine for 50 ms half-period
            time.sleep(0.001)

        print(f"[eload] finished {cycles} toggles in {time.monotonic() - t_start:.1f}s")
        return 0
    finally:
        try:
            ser.write(off_fn())
            time.sleep(0.05)
        except Exception:
            pass
        ser.close()
        print("[eload] load OFF, port closed")


if __name__ == "__main__":
    raise SystemExit(main())
