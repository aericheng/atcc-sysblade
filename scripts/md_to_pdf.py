"""Convert a Markdown file to PDF via python-markdown + Microsoft Edge headless.

Usage:
    .venv/Scripts/python scripts/md_to_pdf.py docs/BBU_IMPLEMENTATION_PLAN.md
    .venv/Scripts/python scripts/md_to_pdf.py docs/archive_v1.x/PURCHASE_LIST.md --out out_pdf/

No system install required — only `pip install markdown` in the project venv
plus the Microsoft Edge that ships with Windows 11. Outputs handle CJK
(Microsoft JhengHei) + emoji (Segoe UI Emoji) via system fonts.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import pathname2url

import markdown

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

CSS = """
@page { size: A4; margin: 1.6cm 1.5cm 1.8cm 1.5cm; }
body {
    font-family: "Microsoft JhengHei", "Segoe UI", "Segoe UI Emoji",
                 "Apple Color Emoji", sans-serif;
    line-height: 1.55;
    color: #1f1f1f;
    max-width: 880px;
    margin: 0 auto;
    padding: 0 0.4em;
    font-size: 11pt;
}
h1 { font-size: 1.7em; border-bottom: 2px solid #333; padding-bottom: 0.25em; margin-top: 0; }
h2 { font-size: 1.35em; border-bottom: 1px solid #aaa; padding-bottom: 0.2em;
     margin-top: 1.8em; page-break-after: avoid; }
h3 { font-size: 1.15em; margin-top: 1.4em; page-break-after: avoid; }
h4 { font-size: 1.05em; page-break-after: avoid; }
p, li, td, th { font-size: 11pt; }
table {
    border-collapse: collapse; width: 100%;
    margin: 0.8em 0; font-size: 10pt;
    page-break-inside: avoid;
}
th, td { border: 1px solid #c4c4c4; padding: 0.35em 0.55em; text-align: left;
         vertical-align: top; }
th { background: #f4f4f4; font-weight: 600; }
code {
    background: #f0f0f0; padding: 0.08em 0.32em; border-radius: 3px;
    font-family: "Cascadia Mono", Consolas, monospace; font-size: 0.92em;
}
pre {
    background: #f6f6f6; padding: 0.7em 0.9em; border-radius: 4px;
    overflow-x: auto; page-break-inside: avoid; font-size: 9.5pt;
    border: 1px solid #e2e2e2;
}
pre code { background: none; padding: 0; font-size: inherit; }
blockquote {
    border-left: 4px solid #d0d0d0; padding: 0.3em 1em;
    color: #4a4a4a; margin: 0.8em 0; background: #fafafa;
}
hr { border: none; border-top: 1px solid #c8c8c8; margin: 1.8em 0; }
a { color: #0366d6; text-decoration: none; }
strong { color: #111; }
ul, ol { padding-left: 1.6em; }
li { margin: 0.2em 0; }
img { max-width: 100%; }
"""


def find_edge() -> str:
    for p in EDGE_PATHS:
        if Path(p).exists():
            return p
    sys.exit("error: msedge.exe not found in the standard install locations")


def md_to_html(md_path: Path, title: str) -> str:
    md_text = md_path.read_text(encoding="utf-8")
    html_body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "toc", "sane_lists"],
        output_format="html5",
    )
    return (
        '<!doctype html>\n<html lang="zh-Hant"><head>'
        f'<meta charset="utf-8"><title>{title}</title>'
        f"<style>{CSS}</style></head><body>{html_body}</body></html>"
    )


def html_to_pdf(html_path: Path, pdf_path: Path, edge: str) -> None:
    file_url = "file:///" + pathname2url(str(html_path.resolve())).lstrip("/")
    pdf_abs = pdf_path.resolve()
    cmd = [
        edge,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_abs}",
        file_url,
    ]
    # Edge prints CJK to stderr; force UTF-8 + lossy decode so the parent
    # subprocess doesn't crash on Windows cp950 default console codec.
    result = subprocess.run(
        cmd, capture_output=True, timeout=120,
        text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0 or not pdf_abs.exists():
        sys.exit(
            f"edge headless failed (returncode={result.returncode})\n"
            f"stderr:\n{result.stderr or '(empty)'}"
        )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("md", type=Path, nargs="+", help="markdown file(s)")
    ap.add_argument("--out", type=Path, default=Path("out_pdf"),
                    help="output directory (default: out_pdf/)")
    args = ap.parse_args()

    edge = find_edge()
    args.out.mkdir(parents=True, exist_ok=True)

    for md in args.md:
        if not md.exists():
            print(f"[skip] {md} not found")
            continue
        pdf = args.out / (md.stem + ".pdf")
        title = md.stem.replace("_", " ")
        html_str = md_to_html(md, title)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".html", delete=False,
            dir=args.out
        ) as f:
            f.write(html_str)
            html_path = Path(f.name)
        try:
            html_to_pdf(html_path, pdf, edge)
        finally:
            html_path.unlink(missing_ok=True)
        size_kb = pdf.stat().st_size / 1024
        print(f"[ok] {md} → {pdf}  ({size_kb:.1f} KiB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
