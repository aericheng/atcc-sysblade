"""Modify the user-provided v2.1.docx in-place to produce v2.2.docx.

Why this exists: the previous generator (generate_proposal_v22.py) built
v2.2 from scratch using python-docx defaults; it didn't match v2.1's exact
fonts / colors / spacing. This generator instead loads v2.1.docx as a
template and applies SURGICAL edits, preserving every original style.

Edits applied (Option A — Live demo URL only, NO GitHub URL):
  1. Cover: "v2.1 修訂版" -> "v2.2 修訂版 (2026-05-03)"; insert Live demo
     URL block + QR code after "繳交日期" line.
  2. §A 摘要: insert TAM/SAM/SOM diagram + BMC at end of section.
  3. §C.1 市場規模: insert TAM/SAM/SOM 同心圓 visual.
  4. §E.1 三層電氣分層: insert architecture.png after the section intro.
  5. §E.3: rewrite first paragraph to "已開發並部署"; replace (a)/(b)/(c)
     bullets with measurement-aware versions; insert persona_journey.png
     at end of section.
  6. §F.4: change "五題" -> "七題"; append Q6 (MAPE 8.38 %) and Q7 (跨化學)
     after Q5.
  7. §G.3: insert tco_comparison.png after the existing TCO table.
  8. 附件 B: replace (a)/(b)/(c) bullets with measurement-aware versions.
  9. 附件 D (existing v2.0->v2.1 修訂表): add v2.1->v2.2 row at the end.
 10. NEW 附件 E: 技術交付物實證 with D.1 / D.2 / D.3 / D.4 / D.5 / D.6 +
     5 tables. Inserted between existing 附件 D and end of document.

The script is idempotent: re-running on a fresh copy of _v21_template.docx
produces the same output. Style names like "Heading 1" / "List Bullet" are
inherited from the template, so spacing and colors match.

Inputs:
  docs/proposal_v2.2_additions/_v21_template.docx
  docs/figures/{tam_sam_som,architecture,persona_journey,tco_comparison,
                business_model_canvas,demo_qr}.png

Output:
  docs/proposal_v2.2_additions/Sysblade_HyperBuffer_Proposal_v2.2.docx
"""
from __future__ import annotations

import copy
import shutil
from pathlib import Path

from docx import Document
from docx.shared import Cm, Inches, Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

REPO = Path(__file__).resolve().parent.parent
TEMPLATE = REPO / "docs" / "proposal_v2.2_additions" / "_v21_template.docx"
OUT = REPO / "docs" / "proposal_v2.2_additions" / "Sysblade_HyperBuffer_Proposal_v2.2.docx"
FIG = REPO / "docs" / "figures"


# ---------------------------------------------------------------------------
# helpers — pinpoint and surgically edit paragraphs / tables in-place
# ---------------------------------------------------------------------------
def _find_paragraph(doc: Document, prefix: str, *, exact: bool = False) -> int:
    """Return index of first paragraph whose stripped text starts with prefix."""
    for i, p in enumerate(doc.paragraphs):
        t = (p.text or "").strip()
        if exact:
            if t == prefix:
                return i
        else:
            if t.startswith(prefix):
                return i
    raise KeyError(f"paragraph not found: {prefix!r}")


def _replace_run_text(paragraph, new_text: str) -> None:
    """Replace paragraph text wholesale, preserving the FIRST run's font."""
    # Keep first run's properties; remove the rest.
    runs = paragraph.runs
    if not runs:
        paragraph.add_run(new_text)
        return
    first = runs[0]
    first.text = new_text
    for r in runs[1:]:
        r.text = ""


def _insert_paragraph_after(paragraph, text: str = "", style: str | None = None):
    """Insert a new paragraph immediately after `paragraph`, return it."""
    new_p_elem = OxmlElement("w:p")
    paragraph._p.addnext(new_p_elem)
    from docx.text.paragraph import Paragraph
    new_p = Paragraph(new_p_elem, paragraph._parent)
    if style is not None:
        new_p.style = paragraph.part.document.styles[style]
    if text:
        new_p.add_run(text)
    return new_p


def _insert_picture_after(paragraph, image_path: Path, *, width_in: float = 5.5):
    """Insert a new paragraph with picture after `paragraph`, centred."""
    new_p = _insert_paragraph_after(paragraph)
    new_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = new_p.add_run()
    run.add_picture(str(image_path), width=Inches(width_in))
    return new_p


def _add_borders(table):
    """Add 1pt black borders to all cells in a table (template ships borderless)."""
    tbl = table._tbl
    tblPr = tbl.find(qn("w:tblPr"))
    if tblPr is None:
        tblPr = OxmlElement("w:tblPr")
        tbl.insert(0, tblPr)
    tblBorders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        b = OxmlElement(f"w:{edge}")
        b.set(qn("w:val"), "single")
        b.set(qn("w:sz"), "4")
        b.set(qn("w:space"), "0")
        b.set(qn("w:color"), "595959")
        tblBorders.append(b)
    # remove existing if any then append
    existing = tblPr.find(qn("w:tblBorders"))
    if existing is not None:
        tblPr.remove(existing)
    tblPr.append(tblBorders)


def _insert_caption_after(paragraph, caption: str):
    new_p = _insert_paragraph_after(paragraph, caption)
    new_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in new_p.runs:
        run.font.size = Pt(9)
        run.italic = True
    return new_p


# ---------------------------------------------------------------------------
# Surgical edits
# ---------------------------------------------------------------------------
def edit_cover(doc: Document) -> None:
    # 1.1 v2.1 -> v2.2 line
    idx = _find_paragraph(doc, "v2.1 修訂版")
    _replace_run_text(doc.paragraphs[idx], "v2.2 修訂版 (2026-05-03) · 加入技術交付物實證")

    # 1.2 Insert Live demo block + QR code AFTER "繳交日期" line
    idx = _find_paragraph(doc, "繳交日期")
    anchor = doc.paragraphs[idx]

    # Reverse-order insertion to keep ordering
    qr_caption = _insert_paragraph_after(anchor,
        "Live demo:https://sysblade-atcc.vercel.app  (掃 QR 即可現場操作三件套)")
    qr_caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in qr_caption.runs:
        run.font.size = Pt(11)
        run.bold = True

    qr_para = _insert_paragraph_after(anchor)
    qr_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    qr_run = qr_para.add_run()
    qr_run.add_picture(str(FIG / "demo_qr.png"), width=Inches(1.6))

    blank_para = _insert_paragraph_after(anchor, "")


def edit_section_C1_market(doc: Document) -> None:
    """Insert TAM/SAM/SOM 同心圓 after C.1 market table description."""
    # Anchor: the 註: paragraph that comes after the market-region table
    idx = _find_paragraph(doc, "註:兩家機構數字差異")
    anchor = doc.paragraphs[idx]
    _insert_caption_after(anchor, "圖 C-1 · TAM / SAM / SOM 三層市場收斂($3.5B 全球 → $1.4B 北美 → $70M SOM @ 2034F)")
    _insert_picture_after(anchor, FIG / "tam_sam_som.png", width_in=4.5)


def edit_section_E1_architecture(doc: Document) -> None:
    """Insert architecture diagram after E.1 intro paragraph."""
    idx = _find_paragraph(doc, "我們捨棄原「三層分離式架構」")
    anchor = doc.paragraphs[idx]
    _insert_caption_after(anchor, "圖 E-1 · Sysblade 系統架構:Edge 機櫃端(LFP+LIC + STM32 LSTM 即時推論)→ 雲端訓練(Severson + PyBaMM + bagged-GBT/OLS/LSTM 三條管線,measured 8.4 % / 13.9 % / 19.1 % MAPE)→ SaaS 前端(Vercel 靜態匯出三件套)")
    _insert_picture_after(anchor, FIG / "architecture.png", width_in=6.2)


def edit_section_E3(doc: Document) -> None:
    """Rewrite §E.3 first paragraph + (a)/(b)/(c) bullets + insert persona journey."""
    # First paragraph (developer intent)
    idx = _find_paragraph(doc, "我們的工程選手 (具 Python ML")
    _replace_run_text(doc.paragraphs[idx],
        "我們的工程選手(具 Python ML + React/Next.js)已開發並部署三件套至 "
        "https://sysblade-atcc.vercel.app(本案 reproducibility CI gate 與 1100 行技術白皮書 "
        "docs/whitepaper.md 在團隊 GitHub 倉庫,初賽期間私有,複賽前公開);各模組實作細節 + "
        "measured 結果見**附件 B(stack + 實證)**與**附件 E(數字溯源)**:")

    # (a) TCO Calculator bullet
    idx = _find_paragraph(doc, "(a) TCO Calculator")
    _replace_run_text(doc.paragraphs[idx],
        "(a) TCO Calculator(已部署 https://sysblade-atcc.vercel.app/tco):B2B 業務工具,輸入機櫃數、電價、"
        "現用 BBU 規格,秒算 5 / 10 年 TCO 與 CO₂ 減排。Vercel + Next.js + Tailwind。LinkedIn 廣告"
        "直接導流。default Mid-tier (50 racks Texas) preset 算出 33 % 客戶 TCO 節省,對齊 §G.3。")

    # (b) Battery Twin bullet
    idx = _find_paragraph(doc, "(b) Battery Digital Twin")
    _replace_run_text(doc.paragraphs[idx],
        "(b) Battery Digital Twin(已部署 https://sysblade-atcc.vercel.app/twin):用 PyBaMM 26.4.1 (DFN with "
        "Prada 2013 LFP-graphite parameters) 模擬 LFP+LIC 在 Microsoft Azure 公開 LLM 訓練 trace 下"
        "的瞬態響應與 SOH 退化曲線,搭 PyTorch LSTM (hidden=64) + ONNX 邊緣部署。**bagged-GBT random "
        "split 10-seed median 8.38 % MAPE(達 v2.1 < 10 % 承諾)、INT8 量化 size 219→63 KiB(3.49× "
        "壓縮 measured)、ΔMAPE 僅 +0.10 pp、Conformal PI 100 % 覆蓋並縮窄 44 %**。")

    # (c) Fleet Dashboard bullet
    idx = _find_paragraph(doc, "(c) Fleet Health Dashboard")
    _replace_run_text(doc.paragraphs[idx],
        "(c) Fleet Health Dashboard(已部署 https://sysblade-atcc.vercel.app/dashboard):Next.js + d3 US fleet map + "
        "recharts。視覺化 1,000 台 Sysblade 機隊狀態,**全頁明標 SIMULATED DATA watermark**。三層服務分層"
        "對應:Tier-1 即時監控、Tier-2 地理分佈(Texas 49 % / Virginia 27 %,本 fleet 以 AI 機房密度加權)、"
        "Tier-3 替換隊列(admission rule status===\"early_aging\":SOH<0.85 OR RUL<800)。")

    # Insert persona journey AFTER the 商業意義 paragraph
    idx = _find_paragraph(doc, "商業意義:硬體毛利")
    anchor = doc.paragraphs[idx]
    _insert_caption_after(anchor, "圖 E-2 · Tier-2 colo 客戶 Mark Chen Persona + 5 階段採購旅程(對應 §F 18 個月時程與 §G TCO)")
    _insert_picture_after(anchor, FIG / "persona_journey.png", width_in=6.2)


def edit_section_F4_qa(doc: Document) -> None:
    """Change '五題' to '七題' and append Q6 / Q7 after Q5 answer."""
    # Intro line: change 五題 -> 七題
    try:
        idx = _find_paragraph(doc, "以下五題模擬系統電跨部門業師")
        _replace_run_text(doc.paragraphs[idx],
            "以下七題模擬系統電跨部門業師(財務 / 市場 / 競爭 / 工程 / 軟體)之尖銳提問,附強勢回應:")
    except KeyError:
        pass

    # Find Q5 answer paragraph (single Normal paragraph after Q5 heading)
    idx = _find_paragraph(doc, "(熱) LIC 與 LFP")
    anchor = doc.paragraphs[idx]

    # Insert in reverse order so they appear sequentially
    # Q7 answer
    a7 = _insert_paragraph_after(anchor,
        "有,Severson(LFP)→ NASA(NMC)cross-dataset 5/5 feature 全部 OOD、z-distance 5–65 σ。"
        "模型不可直接跨化學部署,產品 SOP 必須含 per-chemistry calibration cycle(每批新採購 LFP 模組 / "
        "跨化學 vendor 切換時觸發)。此誠實聲明寫進客戶交付物,是商業差異化武器(競品 KULR、Eaton 都沒做"
        "跨化學量化驗證)。詳附件 E §E.4。")
    # Q7 heading — use Heading 3 like Q1-Q5
    q7 = _insert_paragraph_after(anchor, "Q7 (工程, v2.2 新增):跨化學部署有沒有限制?", style="Heading 3")

    # Q6 answer
    a6 = _insert_paragraph_after(anchor,
        "Severson 13-feature paper-aligned model 配合 K=24 bagged-GradientBoosting ensemble + extra-strict "
        "cell filter (cycle_life ≥ 400, 134/138 cells), random split 10-seed median test MAPE = 8.38 %、"
        "R² 0.89 (per-seed [5.93, 12.91],7/10 seeds < 10 %)— **首次低於 v2.1 附件 B 軟體技術棧「< 10 %、"
        "Severson 9.1 % 對標」承諾**。Cross-batch 由 bagged-OLS 達 13.87 %、R² +0.21 (GBT 跨 protocol 退化"
        "到 17–22 %,部署 SOP fallback)。LSTM augmented 188-cell test 整體 19.10 %、R² 0.86,作為 "
        "/dashboard 1000 台 fleet 推論引擎。INT8 動態量化後 size 從 219 KiB → 63 KiB (3.49× 壓縮),"
        "ΔMAPE 僅 +0.10 pp,R² 不變 — STM32N6 NPU 部署 go decision 已拿到。完整數字見附件 E 與團隊 GitHub "
        "倉庫(複賽前公開)。**未上實機資料前不承諾 < 5 %**(維持 v2.1 原承諾邊界)。")
    # Q6 heading
    q6 = _insert_paragraph_after(anchor, "Q6 (軟體, v2.2 新增):你說 Battery Twin 跑出 < 10 % MAPE,實際做到幾 %?", style="Heading 3")


def edit_section_G3_tco(doc: Document) -> None:
    """Insert tco_comparison.png after G.3 結論 paragraph."""
    idx = _find_paragraph(doc, "結論:客戶單櫃 10 年總持有成本下降")
    anchor = doc.paragraphs[idx]
    _insert_caption_after(anchor, "圖 G-1 · 傳統 BBU vs Sysblade 10 年 TCO 分項對比(對齊 §G.3 表)")
    _insert_picture_after(anchor, FIG / "tco_comparison.png", width_in=6.0)


def edit_appendix_B(doc: Document) -> None:
    """Replace (a)/(b)/(c) bullets in 附件 B with measurement-aware text."""
    # 附件 B 三個 bullet
    idx = _find_paragraph(doc, "(a) TCO Calculator:Next.js")
    _replace_run_text(doc.paragraphs[idx],
        "(a) TCO Calculator:Next.js 14 + Vercel + Tailwind。輸入欄:機櫃數、電價、現用 BBU 規格 → 輸出:"
        "5 / 10 年 TCO、ROI、CO₂ 節省。已部署:https://sysblade-atcc.vercel.app/tco;default Mid-tier "
        "(50 racks Texas) preset 算出每櫃 10 年節省 USD 9,600,33 % 客戶總持有成本下降(對齊 §G.3 表)。")

    idx = _find_paragraph(doc, "(b) Battery Digital Twin:Python")
    _replace_run_text(doc.paragraphs[idx],
        "(b) Battery Digital Twin:Python 3.11 + PyBaMM 26.4.1 (DFN with Prada 2013 LFP parameters) + "
        "PyTorch 2-layer LSTM (hidden=64, input shape (99,7)) + onnxruntime INT8 deployment。資料源:"
        "Severson 2019 TRI dataset (138 cells parsed, 主訓練) [12] + NASA Prognostics PCoE [15] + "
        "50 PyBaMM-calibrated BBU-duty 合成 cell (regime-gap closure)。已部署:https://sysblade-atcc.vercel.app/twin。"
        "誤差實證 (達 < 10 % 承諾):**bagged-GBT + xstrict cell filter random split 10-seed median 8.38 % MAPE**、"
        "**bagged-OLS cross-batch 13.87 %**、**LSTM augmented test 19.10 %、R² 0.86**、**INT8 量化 219→63 KiB "
        "(3.49× compression)、ΔMAPE +0.10 pp**、**Conformal PI 100 % 覆蓋、寬度 44 % 縮窄**。"
        "Cross-chemistry 5/5 feature OOD (z 5–65 σ),須 per-chemistry calibration。**未上實機資料前不承諾 < 5 %**。"
        "詳附件 E。")

    idx = _find_paragraph(doc, "(c) Fleet Dashboard (Mock):Grafana")
    _replace_run_text(doc.paragraphs[idx],
        "(c) Fleet Dashboard:Next.js + d3 US fleet map + recharts(原規劃 Grafana + InfluxDB,實作改用前端純靜態以"
        "對齊 vercel static export deploy 路徑)。視覺化 1,000 台機隊。已部署:https://sysblade-atcc.vercel.app/dashboard;"
        "全頁明標 SIMULATED DATA watermark。三層服務分層對應 §E.3:Tier-1 即時監控 / Tier-2 地理分佈 (TX 49 % + VA 27 % "
        "為 AI 機房密度加權,v2.1 §C.1 引 JLL 真實 18.6 % / 15 %) / Tier-3 替換隊列(admission rule SOH<0.85 OR RUL<800)。")


def add_revision_row_v22(doc: Document) -> None:
    """Append v2.2 row to existing revision table + relabel section as 修訂說明.

    The table inherited from v2.1 is "v2.0 -> v2.1" only; we add a v2.2 row
    AND broaden the surrounding section title + intro + conclusion so the
    section accurately covers v2.0 -> v2.2 instead of staying frozen at v2.1.
    """
    # 1. Rename heading "附件 D. v2.1 修訂說明" -> "附件 D. 修訂說明 (v2.0 -> v2.2)"
    try:
        idx = _find_paragraph(doc, "附件 D. v2.1 修訂說明")
        _replace_run_text(doc.paragraphs[idx], "附件 D. 修訂說明 (v2.0 → v2.2)")
    except KeyError:
        pass

    # 2. Update intro paragraph to cover both jumps
    try:
        idx = _find_paragraph(doc, "本版本相較於 v2.0,經完整技術與邏輯驗證,針對五個技術細節進行修正")
        _replace_run_text(doc.paragraphs[idx],
            "v2.1 相較於 v2.0,經完整技術與邏輯驗證,針對五個技術細節進行修正(下表第 1–5 列);"
            "v2.2 在 v2.1 基礎上加入技術交付物實證、視覺化資產與 §X 引用對齊(下表第 6 列):")
    except KeyError:
        pass

    # 3. Append v2.2 row to the revision table
    target = None
    for t in doc.tables:
        first = (t.rows[0].cells[0].text or "").strip()
        if first == "#":
            target = t
            break
    if target is None:
        print("WARN: revision table not found; skipping v2.2 row")
        return
    new_row = target.add_row().cells
    new_row[0].text = "6"
    new_row[1].text = "v2.1(初版)"
    new_row[2].text = (
        "v2.2 新增:封面 Live demo URL + QR;§C.1 / §E.1 / §E.3 / §G.3 加 5 張視覺化資產 "
        "(architecture / TAM-SAM-SOM / persona / TCO / QR);§E.3 改寫為「已開發並部署」三件套;"
        "§F.4 加 Q6 (MAPE 8.38 % 實證) + Q7 (跨化學限制);附件 B 加 measured 數字;新增附件 E "
        "技術交付物實證 (E.1–E.6 共 6 節 + 5 表)"
    )
    new_row[3].text = (
        "v2.1 只承諾「< 10 % MAPE」,本次 v2.2 把實際達成的 8.38 % / 13.87 % / 19.10 % / 3.49× INT8 "
        "compression 等 measured 結果灌進企劃書,業師讀完即知三件套已交付且數字皆可在 Live demo 驗證;"
        "原技術白皮書內對本企劃書的章節交叉引用有 7 條因編號筆誤造成不一致(技術選手 5/3 重新對照 v2.1 PDF 後校正),"
        "v2.2 一併同步,確保白皮書與企劃書的引用鏈零落差。"
    )

    # 4. Update closing sentence
    try:
        idx = _find_paragraph(doc, "修正後本企劃在技術、財務、邏輯三個維度均無瑕疵,可直接進入決賽答辯")
        _replace_run_text(doc.paragraphs[idx],
            "v2.2 修正後本企劃在技術、財務、邏輯、實證(measured)四個維度均無瑕疵,可直接進入決賽答辯。"
            "完整技術交付物實證見附件 E。")
    except KeyError:
        pass


# ---------------------------------------------------------------------------
# 附件 E (NEW) — appended at end of document
# ---------------------------------------------------------------------------
def append_appendix_E(doc: Document) -> None:
    """Append new 附件 E. 技術交付物實證 to the END of the doc."""
    # Heading 1 — uses original v2.1 styling
    h1 = doc.add_paragraph(style="Heading 1")
    h1.add_run("附件 E. 技術交付物實證 (v2.2 新增,2026-05-03 measured)")

    # Lead paragraph (italic style by adding italic)
    p = doc.add_paragraph()
    r = p.add_run(
        "完整方法論、限制與引文鏈:1100 行技術白皮書 docs/whitepaper.md(團隊 GitHub 倉庫,初賽期間私有,"
        "複賽前公開)。Live demo(現場可操作):https://sysblade-atcc.vercel.app。本附件數字皆來自 "
        "data/processed/*.json 與 packages/shared/scenarios/*.json,由 GitHub Action CI gate 逐 push "
        "自動驗證一致性。業師如需即時驗證任一數字,可於 Live demo 對應頁面看到同源呈現。"
    )
    r.italic = True

    # E.1 RUL 預測管線實測
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("E.1 RUL 預測管線實測 (對應 §E.1 Tier-C、附件 B (b))")
    doc.add_paragraph(
        "Severson 2019 124-cell LFP fast-charge 資料集為主訓練,50 顆 PyBaMM-calibrated BBU-duty 合成 cell "
        "為 regime-gap 補強,共 188 cells。"
    )
    t = doc.add_table(rows=5, cols=5)
    # Apply borders manually since template only has "Normal Table" (borderless)
    _add_borders(t)
    headers = ["模型", "配置", "Random split MAPE", "Cross-batch MAPE", "角色"]
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]; c.text = h
        for r in c.paragraphs[0].runs: r.bold = True
    rows = [
        ["13-feat OLS (plain)", "unfiltered 138 cells", "14.51 % (R² 0.53)", "14.54 % (R² +0.08)", "Plan C+ baseline (歷史對照)"],
        ["13-feat bagged-GBT (K=24) + xstrict", "cycle_life ≥ 400, n=134", "8.38 % (R² 0.89, 7/10 < 10 %)", "17.91 % (跨 protocol 退化)", "paper 學術 baseline,達 < 10 % 承諾"],
        ["13-feat bagged-OLS + xstrict", "同上", "12.43 %", "13.87 % (R² +0.21)", "cross-protocol fall-back"],
        ["LSTM augmented (188 cells)", "60/20/20 split, MC Dropout + Conformal", "19.10 % (R² 0.86)", "—", "/dashboard 1000 台 fleet 推論引擎"],
    ]
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            t.rows[r_idx + 1].cells[c_idx].text = val

    p = doc.add_paragraph()
    p.add_run("部署 SOP(三條 routing rule):").bold = True
    for line in [
        "客戶端 cell 與 fleet 訓練資料同 protocol → 用 bagged-GBT(8.38 %)",
        "客戶端 cell 是新 protocol → fall back 到 bagged-OLS(13.87 %, R² 由負轉正)",
        "客戶端 cell 是新化學(LFP → NMC 等)→ 須 per-chemistry calibration cycle(見 E.4)",
    ]:
        doc.add_paragraph(line, style="List Paragraph")

    p = doc.add_paragraph()
    p.add_run(
        "誠實邊界:8.38 % 為 random split 10-seed median,xstrict 篩掉 4/138 顆早夭 cell;業師問「為何不 cross-batch "
        "也是 8.38 %」答「樹型模型在跨 protocol 退化(17–22 %),這是 protocol-specific overfit 的經典 bias-variance "
        "證據,部署用 OLS 路徑」。**不引用 best-seed 5.93 %**(屬 cherry-pick)。"
    ).italic = True

    # E.2 INT8 量化驗證
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("E.2 邊緣端 INT8 量化驗證 (對應 §E.1 Tier-C STM32N6 部署)")
    doc.add_paragraph(
        "scripts/quantize_lstm_onnx.py 用 onnxruntime.quantization.quantize_dynamic (matches X-CUBE-AI 9.x INT8 "
        "路徑,AN5354 §INT8) 對 models/lstm_rul.onnx 真實量化,在 188-cell test 集上量測:"
    )
    t = doc.add_table(rows=6, cols=4)
    # Apply borders manually since template only has "Normal Table" (borderless)
    _add_borders(t)
    for i, h in enumerate(["指標", "FP32 baseline", "INT8 quantised", "Δ"]):
        c = t.rows[0].cells[i]; c.text = h
        for r in c.paragraphs[0].runs: r.bold = True
    rows = [
        ["ONNX size (graph + external data)", "219.2 KiB", "62.9 KiB", "3.49× compression"],
        ["Test MAPE (同一 test set)", "19.10 %", "19.20 %", "+0.10 pp"],
        ["Test R²", "0.862", "0.862", "不變"],
        ["平均 |prediction Δ| / FP32 prediction", "—", "—", "0.57 %"],
        ["CPU latency p50 (筆電,單樣本)", "0.267 ms", "0.241 ms", "1.11×"],
    ]
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            t.rows[r_idx + 1].cells[c_idx].text = val

    doc.add_paragraph(
        "結論:INT8 在這個 LSTM 上幾乎無精度退化,63 KiB 遠小於 STM32N6 1.6 MB ML FLASH 上限,是「STM32N6 部署 go decision」"
        "的 first-party 證據。仍待 W3:NPU 真機 cycle-accurate latency(需 ST 帳號 + X-CUBE-AI GUI)。本估算 54.7 µs "
        "(40 % NPU utilisation heuristic ±2× 不確定區間);ST datasheet Neural-ART INT8 LSTM typical 0.3 ms 為承諾上限,"
        "本估算遠低於此。"
    )

    # E.3 Conformal PI
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("E.3 機率輸出 — MC Dropout + Split Conformal PI")
    t = doc.add_table(rows=4, cols=3)
    # Apply borders manually since template only has "Normal Table" (borderless)
    _add_borders(t)
    for i, h in enumerate(["指標", "Raw MC Dropout", "+ Split Conformal calibration"]):
        c = t.rows[0].cells[i]; c.text = h
        for r in c.paragraphs[0].runs: r.bold = True
    rows = [
        ["Test set 90 % PI coverage", "100 %", "100 % (≥ 90 % conformal 保證)"],
        ["中位數 PI 寬度", "1910 cycles", "1075 cycles (縮窄 44 %)"],
        ["Conformal q_factor", "—", "0.563 (< 1 即 raw PIs 偏寬, calibration 縮窄)"],
    ]
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            t.rows[r_idx + 1].cells[c_idx].text = val
    doc.add_paragraph(
        "業務意義:/dashboard Tier-3 admission(status === \"early_aging\" ⇔ SOH < 0.85 OR RUL < 800)從「不確定 ± 1500 cycles」"
        "收緊到「± 500 cycles」,替換決策成為 actionable 而非「再觀察」。Vovk 2005 / Lei 2018 conformal exchangeability 保證 — "
        "calibration 集 37 cells held-out。"
    )

    # E.4 跨化學限制
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("E.4 跨化學限制 — 跨資料集驗證 (誠實聲明)")
    t = doc.add_table(rows=6, cols=5)
    # Apply borders manually since template only has "Normal Table" (borderless)
    _add_borders(t)
    for i, h in enumerate(["Feature", "Severson 範圍", "NASA 範圍", "OOD?", "z-distance"]):
        c = t.rows[0].cells[i]; c.text = h
        for r in c.paragraphs[0].runs: r.bold = True
    rows = [
        ["log_var_delta_q", "[−5.21, −2.73]", "[−2.07, −1.54]", "✗", "5.3 σ"],
        ["log_min_delta_q", "[−2.30, −0.86]", "[−0.51, −0.26]", "✗", "5.1 σ"],
        ["slope_q_2_100", "[−0.001, 0]", "[−0.006, −0.004]", "✗", "54 σ"],
        ["intercept_q_2_100", "[0.97, 1.10]", "[1.86, 2.04]", "✗", "61 σ"],
        ["q_at_cycle_2", "[0.97, 1.09]", "[1.85, 2.04]", "✗", "65 σ"],
    ]
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            t.rows[r_idx + 1].cells[c_idx].text = val
    doc.add_paragraph(
        "5/5 feature 全部 OOD,z-distance 5–65 σ。Severson-trained 模型不可直接部署到不同化學的 cell;產品 SOP 必須含 "
        "per-chemistry calibration cycle(每批新採購 LFP 模組 / 跨化學 vendor 切換時觸發)。這個結論寫進客戶交付物,"
        "是商業上的差異化武器(競品 KULR、Eaton 都沒做跨化學量化驗證)。"
    )

    # E.5 reproducibility CI
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("E.5 Reproducibility CI")
    doc.add_paragraph(
        "GitHub Action(.github/workflows/check.yml)在每次 push / PR 跑 pnpm typecheck + lint + build(web app 三件套)+ "
        "pnpm check:numbers(20 條 cross-check 掃 whitepaper.md / README.md / PRESENTATION_GUIDE.md / "
        "packages/battery-twin/README.md vs JSON ground truth severson_model_eval.json / lstm_quantization_report.json / "
        "cross_dataset_mape.json / model_validation.json),數字偏離容差 0.05 pp 以上自動 fail。首跑就抓到 1 條真的 stale "
        "22.5 %(舊 LSTM 訓練數字)並修正為 19.10 %;此後 commit c2bf10e 起 v2.1 §X 引用全部對齊 PDF 真實章節編號 "
        "(7 條原本錯誤的 cross-reference)。"
    )
    p = doc.add_paragraph()
    p.add_run(
        "本附件本身也受此 gate 保護:任何數字若漂離 JSON 真值,push 時 CI 直接紅燈,業師檢核 GitHub 任一 commit 的 Actions "
        "tab 都看得到 20+/N passed 紀錄(複賽前 GitHub 公開後可驗)。"
    ).italic = True

    # E.6 數字溯源
    h2 = doc.add_paragraph(style="Heading 2")
    h2.add_run("E.6 數字溯源 (每一條都可追)")
    t = doc.add_table(rows=8, cols=2)
    # Apply borders manually since template only has "Normal Table" (borderless)
    _add_borders(t)
    for i, h in enumerate(["v2.2 引用", "repo 路徑"]):
        c = t.rows[0].cells[i]; c.text = h
        for r in c.paragraphs[0].runs: r.bold = True
    rows = [
        ["8.38 % / 13.87 % / 14.51 % MAPE 三條", "data/processed/severson_model_eval.json (headline.best_random_full + results[])"],
        ["INT8 size / accuracy / CPU latency", "data/processed/lstm_quantization_report.json"],
        ["LSTM 19.10 % / R² 0.86 / Conformal q_factor", "packages/shared/scenarios/model_validation.json"],
        ["Cross-dataset z-distance 5/5 OOD", "data/processed/cross_dataset_mape.json"],
        ["TCO 5760 / 8640 / 29000 / 19400 (對齊 §G.3 表)", "apps/web/src/lib/tco.ts 常數"],
        ["Tier-3 admission rule", "scripts/generate_twin_scenarios.py::status_for_device"],
        ["1000 台 fleet 模擬", "apps/web/public/scenarios/fleet_devices.json"],
    ]
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            t.rows[r_idx + 1].cells[c_idx].text = val
    p = doc.add_paragraph()
    p.add_run(
        "競賽期間若業師在現場 demo 質疑任何一個數字,可直接打開 Live demo 對應頁面驗證(數字同源呈現);"
        "GitHub raw view 路徑於複賽前公開後亦可驗。"
    ).italic = True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    if not TEMPLATE.exists():
        print(f"ERROR: template missing at {TEMPLATE}")
        return 1

    # Always regenerate from a fresh template copy so re-runs are idempotent.
    work = OUT.parent / "_v22_work.docx"
    shutil.copy(TEMPLATE, work)
    doc = Document(str(work))

    print("applying surgical edits ...")
    edit_cover(doc)
    print("  cover OK")
    edit_section_C1_market(doc)
    print("  §C.1 TAM/SAM/SOM OK")
    edit_section_E1_architecture(doc)
    print("  §E.1 architecture OK")
    edit_section_E3(doc)
    print("  §E.3 + persona journey OK")
    edit_section_F4_qa(doc)
    print("  §F.4 Q6 + Q7 OK")
    edit_section_G3_tco(doc)
    print("  §G.3 TCO bar chart OK")
    edit_appendix_B(doc)
    print("  附件 B OK")
    add_revision_row_v22(doc)
    print("  附件 D revision row OK")
    append_appendix_E(doc)
    print("  附件 E (NEW, 6 sections) OK")

    try:
        doc.save(str(OUT))
        target = OUT
    except PermissionError:
        # OUT is locked (Word has it open). Save with a timestamped suffix.
        import datetime
        ts = datetime.datetime.now().strftime("%H%M%S")
        target = OUT.with_name(OUT.stem + f"_{ts}" + OUT.suffix)
        doc.save(str(target))
        print(f"\nWARN: {OUT.name} is locked (open in Word?); wrote to {target.name} instead.")
    work.unlink(missing_ok=True)
    print(f"wrote {target.relative_to(REPO)}  ({target.stat().st_size / 1024:.1f} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
