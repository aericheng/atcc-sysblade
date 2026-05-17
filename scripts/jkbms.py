"""Minimal JK-BMS RS485 protocol reader (pack-level fields).

Wraps the "read-all" command (op 0x06) and parses pack voltage / current
/ SOC / 3 temperature sensors out of the response. Cell-level voltages
are *not* parsed — for the LIVE demonstrator card we only need pack-level
state; cell-level can be added when M3 closed-loop bench testing needs it.

⚠️ **Not bench-verified** — protocol fields and sign conventions are taken
from public references; some JK-BMS firmware variants use different
sign-bit positions for pack current. The first bench session should:

  1. Hook a known load (~5 A discharge) to the pack
  2. Run ``python -m scripts.jkbms --port COM3 --once`` and verify sign
  3. Pass ``--invert-current`` to the bridge if the sign is flipped

References used to build this parser:
- https://gist.github.com/alferz/528b6027800aa89328d4663aff83efb4
- https://github.com/PurpleAlien/jk-bms_grafana/blob/main/data_bms.py
- http://www.jk-bms.com/Upload/2022-05-19/1621104621.pdf
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import Optional

# 21-byte "read all" request frame.
# Layout: 4E 57 | 00 13 (len=19 body) | 4×00 terminal# | 06 cmd | 03 src |
#         6×00 data | 68 end | 4-byte checksum (BE sum of preceding bytes).
# Checksum verification: 0x4E+0x57+0x00+0x13+0x06+0x03+0x68 = 0x129 → 00 00 01 29.
READ_ALL_FRAME = bytes.fromhex("4E5700130000000006030000000000006800000129")
assert len(READ_ALL_FRAME) == 21, f"request frame must be 21 bytes, got {len(READ_ALL_FRAME)}"
assert (sum(READ_ALL_FRAME[:-4]) == int.from_bytes(READ_ALL_FRAME[-4:], "big")), \
    "checksum self-test failed"

FRAME_HEADER = b"\x4E\x57"


@dataclass
class JKBMSReading:
    """Pack-level snapshot from one JK-BMS read.

    ``raw`` keeps the full response bytes so callers can re-parse if a
    field turns out wrong on a particular firmware version.
    """

    pack_voltage_v: float
    pack_current_a: float
    soc_pct: int
    temp_fet_c: float
    temp_sensor_1_c: float
    temp_sensor_2_c: float
    n_cells_assumed: int
    raw: bytes

    @property
    def temp_max_c(self) -> float:
        return max(self.temp_fet_c, self.temp_sensor_1_c, self.temp_sensor_2_c)


def _temp_signed(raw: int) -> float:
    """Per protocol, a raw value > 100 means negative — subtract 100 again
    (so 105 → -5°C, etc). This is the convention used by the upstream
    Grafana parser; verify on bench."""
    return float(raw - 100) if raw > 100 else float(raw)


def parse_response(
    response: bytes,
    *,
    n_cells: int = 8,
    invert_current: bool = False,
) -> JKBMSReading:
    """Parse a JK-BMS read-all response.

    Parameters
    ----------
    response
        Raw bytes from the serial port. Must start with the 4E 57 header.
        Caller is responsible for framing (reading until length is satisfied).
    n_cells
        Number of cells the pack reports. Demonstrator is 8S → 8.
    invert_current
        Some JK-BMS firmware reports current with the opposite sign
        (positive = charging vs positive = discharging). Pass True to
        flip the sign.

    Returns
    -------
    JKBMSReading
    """
    if len(response) < 4 or response[:2] != FRAME_HEADER:
        raise ValueError(
            f"bad frame header: expected 4E 57, got {response[:2].hex(' ').upper()}"
        )
    length = struct.unpack_from(">H", response, 2)[0]
    if len(response) < 4 + length:
        raise ValueError(
            f"frame truncated: header claims {length} body bytes, got {len(response) - 4}"
        )

    # Cell voltage block: per-cell 3 bytes (1 marker + 2 BE mV), starts at
    # offset 14 (after 4E 57 + len + 8 padding + ... — see upstream parser).
    # We skip cell-level data and compute bytecount = end of cell block.
    cells_start = 14
    bytecount = cells_start + n_cells * 3

    # Pack-level fields, offsets from bytecount per upstream protocol notes
    temp_fet_raw = struct.unpack_from(">H", response, bytecount + 3)[0]
    temp_s1_raw = struct.unpack_from(">H", response, bytecount + 6)[0]
    temp_s2_raw = struct.unpack_from(">H", response, bytecount + 9)[0]
    pack_v_raw = struct.unpack_from(">H", response, bytecount + 12)[0]
    pack_i_raw = struct.unpack_from(">H", response, bytecount + 15)[0]
    soc = struct.unpack_from(">B", response, bytecount + 18)[0]

    # Current: high bit is sign on most firmware (set = charging or
    # discharging depending on variant). 0x8000 mask + invert option.
    sign = -1 if (pack_i_raw & 0x8000) else 1
    if invert_current:
        sign *= -1
    pack_current_a = (pack_i_raw & 0x7FFF) / 100.0 * sign

    return JKBMSReading(
        pack_voltage_v=pack_v_raw / 100.0,
        pack_current_a=pack_current_a,
        soc_pct=int(soc),
        temp_fet_c=_temp_signed(temp_fet_raw),
        temp_sensor_1_c=_temp_signed(temp_s1_raw),
        temp_sensor_2_c=_temp_signed(temp_s2_raw),
        n_cells_assumed=n_cells,
        raw=bytes(response),
    )


class JKBMSReader:
    """Thin pyserial wrapper around the read-all command.

    Usage::

        reader = JKBMSReader(port="COM3", baud=115200, n_cells=8)
        reading = reader.read()      # raises on timeout / bad frame
        print(reading.pack_voltage_v)
    """

    def __init__(
        self,
        port: str,
        baud: int = 115200,
        *,
        n_cells: int = 8,
        invert_current: bool = False,
        read_timeout_s: float = 2.0,
    ) -> None:
        # pyserial is intentionally imported here (not at module top) so
        # ``--mock`` mode does not require pyserial installation on the
        # demo laptop. The bridge can be tested end-to-end without
        # touching ``pip install pyserial``.
        try:
            import serial  # type: ignore
        except ImportError as e:
            raise ImportError(
                "pyserial is required for bench mode — "
                "install with `pip install pyserial` (or use --mock)."
            ) from e
        self._ser = serial.Serial(
            port=port, baudrate=baud, timeout=read_timeout_s,
            bytesize=8, parity="N", stopbits=1,
        )
        self.n_cells = n_cells
        self.invert_current = invert_current
        self.read_timeout_s = read_timeout_s

    def close(self) -> None:
        try:
            self._ser.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def read(self) -> JKBMSReading:
        """Send read-all command, await response, parse.

        Frame-sync strategy: read up to a generous timeout, scan for the
        4E 57 header, then read length-determined remainder. Robust to
        line noise + late device boot.
        """
        # Flush stale input — important when this is called periodically and
        # the previous response might still be in the OS buffer.
        self._ser.reset_input_buffer()
        self._ser.write(READ_ALL_FRAME)
        self._ser.flush()

        # Pyserial returns bytes when timeout expires or N bytes received.
        # We don't know length until we see the header + 2 byte length
        # field, so do a 2-stage read: prefix + body.
        prefix = self._read_until_header()
        len_bytes = self._ser.read(2)
        if len(len_bytes) < 2:
            raise TimeoutError("timed out reading length field after header")
        body_len = struct.unpack(">H", len_bytes)[0]
        body = self._ser.read(body_len)
        if len(body) < body_len:
            raise TimeoutError(
                f"frame truncated: expected {body_len} body bytes, got {len(body)}"
            )
        full = prefix + len_bytes + body
        return parse_response(
            full, n_cells=self.n_cells, invert_current=self.invert_current,
        )

    def _read_until_header(self) -> bytes:
        """Slide a window until we see 4E 57. Returns the header bytes."""
        buf = bytearray()
        deadline_bytes = 64  # generous — discard up to 64 noise bytes
        while len(buf) < deadline_bytes:
            b = self._ser.read(1)
            if not b:
                raise TimeoutError("timed out searching for 4E 57 header")
            buf.append(b[0])
            if len(buf) >= 2 and buf[-2:] == FRAME_HEADER:
                return bytes(FRAME_HEADER)
        raise ValueError(
            f"no JK-BMS header in first {deadline_bytes} bytes — wrong port?"
        )


def _cli() -> int:
    """Standalone smoke test: read once, print, exit. Useful for verifying
    sign convention on first bench connection."""
    import argparse

    ap = argparse.ArgumentParser(description="JK-BMS one-shot reader (smoke test).")
    ap.add_argument("--port", required=True, help="Serial port (e.g. COM3, /dev/ttyUSB0)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--n-cells", type=int, default=8)
    ap.add_argument("--invert-current", action="store_true",
                    help="Flip pack current sign (try if charging shows negative)")
    args = ap.parse_args()

    with JKBMSReader(
        port=args.port, baud=args.baud,
        n_cells=args.n_cells, invert_current=args.invert_current,
    ) as reader:
        r = reader.read()
    print(f"pack_voltage  = {r.pack_voltage_v:7.3f} V")
    print(f"pack_current  = {r.pack_current_a:+7.3f} A  (positive = discharging by convention)")
    print(f"soc           = {r.soc_pct:3d} %")
    print(f"temp_fet      = {r.temp_fet_c:5.1f} °C")
    print(f"temp_sensor_1 = {r.temp_sensor_1_c:5.1f} °C")
    print(f"temp_sensor_2 = {r.temp_sensor_2_c:5.1f} °C")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
