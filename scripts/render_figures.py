"""Render docs/figures/*.svg → .png so they can be embedded into v2.2 docx
without needing Word 365's native SVG support.

Why aspose-svg-net (commercial trial): Cairo / pycairo / svglib all fail to
load on this Windows venv (no libcairo binary). aspose-svg-net is pure
managed code, runs offline, and is the only Python SVG renderer that
worked here for these particular SVG files.

Output: docs/figures/<name>.png alongside the .svg sources.
"""
from __future__ import annotations

from pathlib import Path

from aspose.svg import SVGDocument
from aspose.svg.converters import Converter
from aspose.svg.saving import ImageSaveOptions

REPO = Path(__file__).resolve().parent.parent
FIG_DIR = REPO / "docs" / "figures"


def render(svg_path: Path) -> Path:
    out = svg_path.with_suffix(".png")
    doc = SVGDocument(str(svg_path))
    Converter.convert_svg(doc, ImageSaveOptions(), str(out))
    print(f"  {svg_path.name} -> {out.name}  ({out.stat().st_size / 1024:.1f} KiB)")
    return out


def main() -> int:
    svgs = sorted(FIG_DIR.glob("*.svg"))
    if not svgs:
        print("no .svg in docs/figures/")
        return 1
    for s in svgs:
        render(s)
    print(f"\nrendered {len(svgs)} svg files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
