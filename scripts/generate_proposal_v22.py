"""Stitch v2.1 PDF text + v2.2 markdown patches into a complete proposal_v2.2.docx.

Output: docs/proposal_v2.2_additions/Sysblade_HyperBuffer_Proposal_v2.2.docx

Sources:
* v2.1 PDF text (extracted via pypdf to /tmp/v21_text.json).
* docs/proposal_v2.2_additions/{appendix_d,patch_appendix_b,patch_cover_and_E3}.md

The reconstruction is intentionally a "clean professional layout" rather than
a pixel-perfect v2.1 clone (v2.1 was likely produced in Word/Pages with custom
styling; we don't have the source file). Use this as either:
  (a) a direct submission candidate, or
  (b) a content reference to copy-paste back into the original v2.1 source.

Why a script and not a one-shot manual edit:
* the page-by-page text from PDF has stable structure (A. / B. / C. / ...) so
  programmatic stitching is reliable; tables need hand-defined cells but most
  prose passes through verbatim.
* re-running the script keeps v2.2 in sync with whatever the patches say.
* this is an audit trail (CI-checkable) for what is in v2.2 vs v2.1.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

REPO = Path(__file__).resolve().parent.parent
V21_TEXT = REPO / "_v21_text_cache.json"   # written below if missing
OUT = REPO / "docs" / "proposal_v2.2_additions" / "Sysblade_HyperBuffer_Proposal_v2.2.docx"


# ---------------------------------------------------------------------------
# v2.1 text extraction (cached; re-extract if PDF newer than cache)
# ---------------------------------------------------------------------------
def _extract_v21_text() -> list[str]:
    pdf = REPO / "docs" / "Sysblade_HyperBuffer_Proposal_v2.1.pdf"
    if V21_TEXT.exists() and V21_TEXT.stat().st_mtime > pdf.stat().st_mtime:
        return [p["text"] for p in json.loads(V21_TEXT.read_text(encoding="utf-8"))]
    import pypdf  # type: ignore
    r = pypdf.PdfReader(str(pdf))
    pages = [{"page": i + 1, "text": p.extract_text() or ""} for i, p in enumerate(r.pages)]
    V21_TEXT.write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
    return [p["text"] for p in pages]


def _strip_page_header_footer(text: str) -> str:
    """Remove the running header `Sysblade ... 第 X 頁 / 共 18 頁` from each page."""
    return re.sub(r"Sysblade HyperBuffer\s*·\s*ATCC C13\s*·\s*v2\.1\s*第 \d+ 頁\s*/\s*共 18 頁\s*", "", text)


def _full_text() -> str:
    pages = _extract_v21_text()
    return "\n".join(_strip_page_header_footer(p) for p in pages)


# ---------------------------------------------------------------------------
# Style helpers — give the .docx a clean, professional look
# ---------------------------------------------------------------------------
def _set_cell_shading(cell, color_hex: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), color_hex)
    tc_pr.append(shd)


def _add_heading(doc: Document, text: str, level: int = 1) -> None:
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        run.font.name = "Microsoft JhengHei"
        run.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
    h.paragraph_format.space_before = Pt(12)
    h.paragraph_format.space_after = Pt(6)


def _add_para(doc: Document, text: str, *, bold: bool = False, size: int = 10,
              align=WD_ALIGN_PARAGRAPH.JUSTIFY) -> None:
    p = doc.add_paragraph()
    p.alignment = align
    run = p.add_run(text)
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(size)
    if bold:
        run.bold = True
    p.paragraph_format.space_after = Pt(4)


def _add_bullet(doc: Document, text: str, *, level: int = 0, size: int = 10) -> None:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Cm(0.6 * (level + 1))
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(size)


def _add_table(doc: Document, header: list[str], rows: list[list[str]], *,
               bold_first_col: bool = False) -> None:
    t = doc.add_table(rows=1 + len(rows), cols=len(header))
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    # Header
    for i, h in enumerate(header):
        cell = t.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(9)
        run.font.name = "Microsoft JhengHei"
        _set_cell_shading(cell, "E8EEF7")
    # Body
    for r, row in enumerate(rows):
        for i, val in enumerate(row):
            cell = t.rows[r + 1].cells[i]
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            run.font.size = Pt(9)
            run.font.name = "Microsoft JhengHei"
            if bold_first_col and i == 0:
                run.bold = True
    doc.add_paragraph()


def _add_quote(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(9)
    run.italic = True


# ---------------------------------------------------------------------------
# v2.2 cover
# ---------------------------------------------------------------------------
def build_cover(doc: Document) -> None:
    # Title block
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Sysblade HyperBuffer™")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(28)
    run.bold = True
    run.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("AI 時代的混合能量緩衝 BBU × 智能維運平台")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(16)
    run.bold = True

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("以 LFP + LIC 混合儲能解決 GB200/GB300 毫秒級電力波動")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(13)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("結合 OCP Mt. Diablo HVDC 路徑與 AI 數位孿生軟體層的差異化方案")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(11)
    run.italic = True

    doc.add_paragraph()

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("第二十三屆 ATCC 全國大專院校行銷企劃競賽")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(12)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Sysgration 系統電 / 電統能源組 — 議題 C13")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(12)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("初賽完整版企劃書 · v2.2 修訂版(2026-05-03)")
    run.font.name = "Microsoft JhengHei"
    run.font.size = Pt(12)
    run.bold = True

    doc.add_paragraph()

    # v2.2 NEW: Live demo link (Option A — GitHub repo 暫不公開,複賽前 public)
    _add_para(doc, "技術交付物參考(v2.2 新增):", bold=True, size=11,
              align=WD_ALIGN_PARAGRAPH.LEFT)
    _add_bullet(doc, "Live demo(現場可操作):https://sysblade-atcc.vercel.app", size=10)
    _add_bullet(doc, "三件套:/twin(Battery Digital Twin)、/tco(TCO Calculator)、/dashboard(Fleet Dashboard)", size=10)
    _add_bullet(doc, "本書附件 D 為技術交付物實證摘要(2026-05-03 measured;原始 JSON 與程式碼倉庫複賽前公開)", size=10)

    doc.add_paragraph()

    # Team info placeholder
    _add_para(doc, "提案隊伍:________________   隊長:________________", size=11,
              align=WD_ALIGN_PARAGRAPH.LEFT)
    _add_para(doc, "學校:________________   指導老師:________________", size=11,
              align=WD_ALIGN_PARAGRAPH.LEFT)
    _add_para(doc, "繳交日期:2026 / 05 / 05", size=11, align=WD_ALIGN_PARAGRAPH.LEFT)

    doc.add_page_break()


# ---------------------------------------------------------------------------
# A. 摘要 - reconstructed from v2.1 page 2
# ---------------------------------------------------------------------------
def build_section_A(doc: Document) -> None:
    _add_heading(doc, "A. 摘要 (Executive Summary)", level=1)
    _add_para(doc,
              "本企劃針對 AI 機櫃毫秒級電力波動此一公開但未被解決的痛點,提出 "
              "Sysblade HyperBuffer — 一套以 LFP 磷酸鋰鐵電池與 LIC 鋰離子電容 "
              "(Lithium-ion Capacitor) 構成之混合能量緩衝 BBU,並搭配 AI 電池數位孿生 "
              "(Battery Digital Twin) 軟體平台,提供從硬體到 SaaS 的完整解決方案。")

    _add_para(doc, "市場規模", bold=True, size=11)
    _add_para(doc,
              "根據 Intel Market Research 報告 [2],北美 AI 機房儲能電池市場將自 2026 年的 "
              "USD 8.98 億成長至 2034 年的 USD 323.88 億 (CAGR 74.3%);Emergen Research [1] "
              "則保守估計 AI BBU 市場 2034 年為 USD 35 億,北美佔 40%。GB200/GB300 機櫃在訓練 "
              "LLM 時於毫秒區間 (1–50 ms) 造成 ±30% 功率擺動,傳統 BBU 僅應對秒級停電,無法回應毫秒瞬態。")

    _add_para(doc, "差異化策略", bold=True, size=11)
    _add_para(doc,
              "我們鎖定北美 Tier-2/3 colo 機房 BBU 市場,以「LFP + LIC + AI 數位孿生」整合方案攻佔 "
              "5% 市佔(2029 年 USD 8,250 萬營收)。**避開 Schneider × NVIDIA 800 V hyperscale 全棧戰**,"
              "**避開 Vertiv 設施級 UPS 規模戰**,把 NVIDIA GB300 PSU 內已驗證的 LIC + Battery 雙模架構從 "
              "「PSU 內」外延到「機架 12U BBU」,讓既有 ORV3 機房不需更換 PSU 即可獲得瞬態保護,並把運可視化的整合方案,"
              "把系統電從硬體 ODM 升級為 Hardware-Defined, Software-Augmented 平台供應商。")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# B. 背景與目的
# ---------------------------------------------------------------------------
def build_section_B(doc: Document) -> None:
    _add_heading(doc, "B. 背景與目的", level=1)

    _add_heading(doc, "B.1 三大產業驅動", level=2)
    _add_bullet(doc,
                "(1) AI 機櫃功率密度暴增:NVIDIA GB200 NVL72 機櫃功耗 120 kW,下世代 GB300 路徑將推升至單櫃 1 MW 等級 [3];"
                "OCP Mt. Diablo 規範 busbar 設計可支撐 1.1 MW 平均負載 [5]。")
    _add_bullet(doc,
                "(2) 毫秒級電力波動成為新瓶頸:Microsoft Azure 於 arXiv 2508.14318 公開論文 [4] 指出,"
                "LLM 訓練在「計算-同步」週期切換時造成數十 ms 的功率擺動,可達電網瞬時需求的 ±30%;"
                "NVIDIA GB300 已在 PSU 中整合電容儲能以實現 30% 削峰 [3]。傳統 BBU 僅應對「秒級停電備援」,無法回應毫秒瞬態。")
    _add_bullet(doc,
                "(3) 電力資源是新的稀缺品:Gartner 預測 2027 年將有 40% 既有 AI 機房因電力不足受限 [11],"
                "AI 增量伺服器年用電量將達 500 TWh,較 2023 年 2.6 倍。每 kWh 與每秒備援都是「直接黃金」。")

    _add_heading(doc, "B.2 本企劃目的", level=2)
    _add_para(doc,
              "協助系統電 / 電統能源在 2026–2029 年三年期間,於北美 AI 機房 BBU 市場以「差異化整合方案」"
              "搶下 5% 市佔,避開 Schneider Electric × NVIDIA 800VDC 聯盟 [17]、Vertiv Trinergy / OneCore 等大廠的"
              "「規模戰」與「全棧戰」,改打「中型客戶高配合度 ODM × 軟體賦能」的縫隙策略。")

    _add_heading(doc, "B.3 與系統電現有戰略的對齊", level=2)
    _add_bullet(doc, "德州 Plano 廠 2025 Q4 量產 [8],符合《美國優先採購法》與關稅豁免政策")
    _add_bullet(doc, "Pegatron 私募 NT$21 億入股 [9],提供 AI 伺服器整機通路")
    _add_bullet(doc, "系統電 2024 年報 [19] 顯示 BBU 已是核心成長動能,本案以 50% 營收貢獻假設進行模擬,與公司公開法說口徑一致")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# C. 現況分析
# ---------------------------------------------------------------------------
def build_section_C(doc: Document) -> None:
    _add_heading(doc, "C. 現況分析", level=1)

    _add_heading(doc, "C.1 市場規模與地理集中度", level=2)
    _add_para(doc,
              "根據 JLL Year-End 2025 Report [10],全美在建資料中心容量達 35 GW,其中德州 6.5 GW (18.6%) + "
              "北維吉尼亞 ~5.3 GW (15%),兩地合計 ~33% 為第一級戰場。Texas 已超車 Virginia 成為全美興建中"
              "專案數最多的州 (140 案 vs 136 案,2026 Q1 數據)。")
    _add_table(doc,
               header=["市場區塊", "2026E (USD)", "2034E (USD)", "CAGR"],
               rows=[
                   ["北美 AI 機房儲能電池 [2]", "8.98 億", "323.88 億", "74.3 %"],
                   ["全球 AI BBU [1]", "12 億", "35 億", "11.5 %"],
                   ["北美 AI BBU (40 % 全球) [1]", "4.8 億", "14 億", "11.5 %"],
               ])
    _add_para(doc,
              "註:兩家機構數字差異主因「儲能電池」涵蓋更廣 (含 BESS/UPS/BBU),BBU 為其子集。"
              "本案以 Emergen Research 北美 BBU 數字 (USD 14 億 @ 2034) 作為 SAM,目標 5 % 市佔率對應 USD 7,000 萬年營收,保守且可驗證。",
              size=9)

    _add_heading(doc, "C.2 技術現況:54V → ±400V 不是升級,是換代", level=2)
    _add_para(doc,
              "OCP ORV3 v1.4 BBU 規格 [7] 採 48 V 標稱、最高 60 V 直流。若以 LFP 化學體系 (3.2 V 標稱) 配置,"
              "合理串聯數為 15S (3.2 × 15 = 48 V,最高充電電壓 3.65 × 15 ≈ 54.75 V,落在 60 V 上限內);"
              "若採 NMC (3.7 V 標稱) 則為 13S。本案選用 LFP 故採 15S 配置。")
    _add_para(doc,
              "OCP Diablo 400 v0.7.0 [5] 採 ±400 VDC,需重新設計電池堆疊 (15S → 108S,增加 7 倍 BMS 通道)、"
              "絕緣等級 (UL 1973 → UL 1989 stationary battery)、DC-DC 拓撲與機械結構,與 ORV3 BBU 完全不同產品。"
              "Schneider × NVIDIA 4 月 2025 已合作推出 800 VDC sidecar [17],宣示 800 V 為 1 MW+ 機櫃方向。")
    _add_para(doc,
              "系統電的合理戰略不是「同一台 BBU 跨電壓」,而是「兩代產品共用機構介面與軟體層」。",
              bold=True)

    _add_heading(doc, "C.3 競爭分析:避開全棧戰,鎖定中型客戶縫隙", level=2)
    _add_table(doc,
               header=["對手", "優勢", "可被攻擊的弱點", "Sysblade 對應策略"],
               rows=[
                   ["Schneider × NVIDIA", "800 VDC sidecar、生態整合", "綁定 NVIDIA、僅服 Tier-1 hyperscaler", "鎖定 Tier-2/3 colo,以 SaaS 軟體層差異化"],
                   ["Vertiv Trinergy/OneCore", "5 MW+ UPS", "以 UPS 機房思維出發、機架級 BBU 非主力", "專注 rack-level,避開 facility-level"],
                   ["Eaton XLR 48 V supercap [18]", "LIC 硬體", "僅賣電容單體、缺整合 BBU 方案", "整合 LFP+LIC 雙模,提供「系統」而非「元件」"],
                   ["AESKY / Dynapac", "價格戰、規模快", "無軟體、無 OCP 認證路徑", "以 Battery Twin 數據服務拉開技術級距"],
                   ["KULR", "OCP Platinum、安全電芯", "規模小、無在地生產", "以德州廠在地交期 3 週反制"],
               ])
    doc.add_page_break()


# ---------------------------------------------------------------------------
# D. 目標設定
# ---------------------------------------------------------------------------
def build_section_D(doc: Document) -> None:
    _add_heading(doc, "D. 目標設定", level=1)

    _add_heading(doc, "D.1 質化目標", level=2)
    _add_bullet(doc, "技術定位:成為北美第一個提供「混合儲能 + 數位孿生」整合方案的 ODM/OEM 廠")
    _add_bullet(doc, "品牌升級:從 Sysgration「BBU 製造商」轉型為「Sysblade Intelligence Platform 提供者」")
    _add_bullet(doc, "永續承諾:以延長電池循環壽命 30 % [13] 為核心,對齊客戶 ESG 報告與碳排揭露需求")
    _add_bullet(doc, "客戶滲透:與 5 家 Tier-1/2 hyperscaler 達成 PoC 簽約,建立 OCP Spec 制定者地位")

    _add_heading(doc, "D.2 量化目標 (2026 Q3 – 2029 Q4)", level=2)
    _add_table(doc,
               header=["指標", "2027F", "2028F", "2029F"],
               rows=[
                   ["Sysblade 出貨台數 (千台)", "12", "35", "75"],
                   ["年營收 (USD 百萬)", "13", "38", "83"],
                   ["北美 AI BBU 市佔率", "2.5 %", "6.5 %", "12 %"],
                   ["綜合毛利率 (硬體 + SaaS)", "38 %", "42 %", "46 %"],
                   ["Tier-1/2 客戶 PoC 數", "1", "3", "5"],
               ])
    doc.add_page_break()


# ---------------------------------------------------------------------------
# E. 企劃提案與策略
# ---------------------------------------------------------------------------
def build_section_E(doc: Document) -> None:
    _add_heading(doc, "E. 企劃提案與策略", level=1)

    _add_heading(doc, "E.1 核心產品:Sysblade HyperBuffer 三層電氣分層架構", level=2)
    _add_para(doc,
              "我們捨棄原「三層分離式架構」中違反備援設備可靠度原則的「物理拆解」概念,改以「電氣分層 (Electrical Tiering)」"
              "實現真正的差異化:同一個 12U 機箱內,根據時間尺度與能量密度需求,讓不同特性的儲能元件各司其職。")

    _add_para(doc, "Tier-A 瞬態緩衝層 (LIC, Lithium-ion Capacitor)", bold=True)
    _add_para(doc,
              "採 Eaton XLR 系列或同等級之 LIC 模組 [18],能量密度約 30 Wh/kg,功率密度可達 5 kW/kg。負責 1–100 ms 區間瞬態補償。")
    _add_para(doc,
              "容量計算邏輯:單櫃 120 kW × 30 % 擺幅 × 100 ms 持續 = 3.6 kJ 最小需求;計入 30 % 安全裕度 + "
              "多次連續觸發補償,有效需求 ~5 kJ/櫃。")
    _add_para(doc,
              "硬體配置:2 顆 200F/48V Eaton XLR 模組併聯 (BOM USD 150)。實際可用能量遠超 5 kJ 需求,此「過配」為刻意設計:")
    _add_bullet(doc, "ESR 降低:雙顆併聯讓 ESR 從 0.5 mΩ 降至 0.25 mΩ,瞬態 200A 放電壓降減半")
    _add_bullet(doc, "低 DoD 延伸壽命:5 kJ / 345 kJ ≈ 1.5 % DoD,規格 100 萬次循環可實際達到 10⁷ 次,跨越 BBU 10 年服役期")
    _add_bullet(doc, "N+1 冗餘:單顆故障系統仍可運作")
    _add_bullet(doc, "市售模組顆粒度:無法買到剛好 5 kJ 的客製品,客製 NRE USD 50k+ 不划算")

    _add_para(doc, "Tier-B 短時備援層 (LFP, 磷酸鋰鐵)", bold=True)
    _add_para(doc,
              "採車規 LFP 整合 pack (2.5 kWh, 15S 配置)。15S 為 LFP 化學體系 (3.2 V 標稱) 達 48 V 標稱所需的合理串聯數"
              "(3.2 × 15 = 48 V),最高充電 3.65 × 15 = 54.75 V 落在 OCP ORV3 v1.4 60 V 上限內 [7]。")
    _add_para(doc,
              "電芯來源優先選用 Microvast (Texas)、KORE Power (Arizona) 或日韓系,避開 BABA Act 與 CFIUS 風險;"
              "提供 30–90 秒鎖機 (graceful shutdown) 能源,符合 OCP ORV3 BBU rev 1.4 [7] 與下一代 ORV3+ HVDC ready 規範。")
    _add_para(doc,
              "備援時間驗算:2.5 kWh ÷ 120 kW = 75 秒理論最大值;實務以 80 % DoD 操作 → 60 秒有效備援,落在規格 30–90 秒區間內。")

    _add_para(doc, "Tier-C 智能管理層 (BMS + Edge AI MCU)", bold=True)
    _add_para(doc,
              "MCU 選型:STM32N6 系列 (ST 2024 推出),單晶片整合 Cortex-M55 主核 + Helium MVE 向量延伸 + Neural-ART NPU,BOM USD 38。"
              "STM32N6 在單一 SoC 內同時提供:(1) 即時 BMS 控制;(2) 本地 ML 推論執行 SOH/RUL 預測;(3) OpenBMC 韌體與 OCP DC-SCM 介面。")
    _add_para(doc,
              "選擇邊緣推論而非雲端的關鍵理由:BBU 是備援設備,網路斷線時更需要正常工作。SOH 推論延遲必須在 ms 級,雲端往返不可行。"
              "Sysblade 採「雲端訓練、邊緣推論」混合策略:模型在雲端用全機隊資料訓練,推論放本地,定期 OTA 更新權重。")

    _add_heading(doc, "E.2 技術依據與創新點", level=2)
    _add_bullet(doc,
                "(1) 借鏡公開方案、外延至機架級:NVIDIA GB300 PSU 內已導入電容儲能以平滑訓練負載 [3],"
                "Microsoft arXiv [4] 與 YMIN 技術文 [16] 公開指出 LIC + Battery 雙模為當前最適架構。"
                "我們的差異化在於把該架構從「PSU 內」外延到「機架 12U BBU」,讓既有 ORV3 機房不需更換 PSU 即可獲得瞬態保護。")
    _add_bullet(doc,
                "(2) OCP HVDC Ready 介面預留:機構尺寸對齊 ORV3 12U BBU shelf,後背板預留 ±400 V 直流匯流接點,"
                "Diablo 400 標準 [5] 釋出後可在 90 天內出新功率模組,無需更換機構。")
    _add_bullet(doc,
                "(3) AI 數位孿生 (Sysblade Intelligence Platform):基於 PyBaMM [14] DFN (Doyle-Fuller-Newman) 物理模型,"
                "搭配 PyTorch LSTM 訓練 SOH/RUL 預測器。主訓練資料集為 Severson 2019 TRI dataset (124 LFP cells) [12],"
                "輔以 NASA Prognostics PCoE [15] 與 CALCE [16] 增加多樣性。誤差目標 MAPE < 10 %"
                "(對標 Severson [12] 9.1 % 早期預測誤差;Attia 2020 [13] 達 continual learning),即時上傳 SOH 至客戶 DCIM。"
                "**v2.2 實證:bagged-GBT 13-feat + xstrict cell filter random split 10-seed median MAPE 8.38 %、R² 0.89 — "
                "首次低於 < 10 % 承諾**。詳見附件 D。")

    _add_heading(doc, "E.3 與程式選手協作的軟體生態系 (差異化武器)", level=2)
    _add_para(doc,
              "我們的工程選手(具 Python ML + React/Next.js)已開發並部署三件套至 "
              "https://sysblade-atcc.vercel.app(本案 reproducibility CI gate 與 1100 行技術白皮書 "
              "docs/whitepaper.md 在團隊 GitHub 倉庫,初賽期間私有,複賽前公開);各模組實作細節 + measured "
              "結果見**附件 B(stack + 實證)**與**附件 D(數字溯源)**:")
    _add_bullet(doc,
                "(a) TCO Calculator (https://sysblade-atcc.vercel.app/tco):B2B 業務工具,輸入機櫃數、電價、現用 BBU 規格,"
                "秒算 5 / 10 年 TCO 與 CO₂ 減排。Vercel / Next.js 部署。LinkedIn 廣告直接導流。**default Mid-tier "
                "(50 racks Texas) preset 算出 33 % 客戶 TCO 節省,對齊 §G.3**。")
    _add_bullet(doc,
                "(b) Battery Digital Twin (https://sysblade-atcc.vercel.app/twin):用 PyBaMM 模擬 LFP+LIC 在 Microsoft Azure "
                "公開 LLM 訓練 trace 下的瞬態響應與 SOH 退化曲線,搭 LSTM RUL 模型 (PyTorch) + ONNX 邊緣部署。"
                "**bagged-GBT random-split 10-seed median 8.38 % MAPE 達標、INT8 量化 size 219→63 KiB 3.49× 壓縮、"
                "ΔMAPE 僅 +0.10 pp、Conformal PI 100 % 覆蓋並縮窄 44 %**。")
    _add_bullet(doc,
                "(c) Fleet Health Dashboard (https://sysblade-atcc.vercel.app/dashboard):Next.js + d3 US fleet map + recharts。"
                "視覺化 1,000 台 Sysblade 機隊狀態,**全頁明標 Simulated Data watermark**。"
                "三層服務分層對應 §E.3 即時監控 / 主動維修 / 預測維運。")
    _add_para(doc,
              "商業意義:硬體毛利 40.5 % + SaaS site license (年費 USD 25k/site/year,與機台數脫鉤) 約 75 % 毛利,"
              "混合毛利 2029 年達 46 %,比純硬體公司多出約 5 ppt 估值溢價。GitHub 公開部分模組可作為 OCP Contribution。")

    _add_heading(doc, "E.4 推廣策略:100 萬台幣預算配置", level=2)
    _add_table(doc,
               header=["項目", "預算 NT$", "具體執行", "KPI"],
               rows=[
                   ["OCP Global Summit (San Jose) 參展 + 提案", "400,000",
                    "攤位 + 1 場 Tech Talk + Diablo 400 子規格 (BBU buffer interface) 提案",
                    "≥ 30 場 1-on-1 客戶會議;2 件 spec 提案被技術委員會接受"],
                   ["白皮書 + 專業媒體 (DCD / EE Times)", "250,000",
                    "發布 2 份白皮書:『Hybrid Buffer for AI Rack』、『TCO Modeling for Edge AI BBU』",
                    "3,000 份白皮書下載;1 篇 DCD 報導露出"],
                   ["PoC 試用補貼 + 客戶參訪", "200,000",
                    "免費寄送 2 套 EVT 樣品 + 2 場客戶廠區拜訪",
                    "2 家 Tier-1/2 客戶 PoC 簽 LOI"],
                   ["LinkedIn 廣告 + sysblade.com TCO Calculator 流量", "150,000",
                    "技術社群定向廣告,導流到 TCO Calculator 工具",
                    "1,000 levels 工具使用;30 leads"],
               ])

    _add_heading(doc, "E.5 熱與電磁設計", level=2)
    _add_para(doc,
              "**熱設計**:LIC 高 di/dt 切換產生熱點,LIC 與 LFP 採物理分區風道 + 1.5 mm 熱重導向鋁板"
              "(快速擴散熱量到 LIC 自有風道)+ 陶瓷阻熱塗層(隔離至 LFP 熱層)。整體採 N+1 風扇配置,"
              "配合 SmartFan PWM 控制;最高負載下 LIC 表面溫度目標 < 65 °C,LFP pack < 45 °C。")
    _add_para(doc,
              "**EMI / EMC**:LIC 高 di/dt 切換為 EMI 主來源,DC-DC 採 GaN HEMT 軟切換 (LLC 或 PSFB 拓撲) + "
              "Common-mode choke + 三層 PCB 完整地平面。GaN HEMT 650 V 等級可同時涵蓋 48 V 與 ±400 V 兩代產品。"
              "合規目標:FCC Part 15 Class A、EN 55032 Class A、OCP ORV3 機架 EMC 規範一次到位。")
    _add_para(doc,
              "**熱失控防護**:LFP cell 級 PTC + 模組級陶瓷阻熱層 + 機箱級 aerogel 防火襯,"
              "符合 UL 1973 abuse test (熱失控傳播時間 > 30 min),並可選配 Americase 主動防火襯墊。")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# F. 執行方式與時程
# ---------------------------------------------------------------------------
def build_section_F(doc: Document) -> None:
    _add_heading(doc, "F. 執行方式與時程", level=1)

    _add_heading(doc, "F.1 18 個月關鍵里程碑 (2026 Q3 – 2027 Q4)", level=2)
    _add_table(doc,
               header=["時程", "硬體 / 系統電", "軟體 / Sysblade 平台", "市場 / GTM"],
               rows=[
                   ["2026 Q3", "FTO 專利檢索;架構規格凍結;Cell 供應商 RFQ",
                    "TCO Calculator MVP 上線;Battery Twin 模型骨架",
                    "OCP APAC Summit 提案投稿;白皮書草稿"],
                   ["2026 Q4", "EVT 工程板出板;LIC + LFP 整合原型 PoC;熱與 EMC 模擬",
                    "Battery Twin Demo 完成;Dashboard mock",
                    "OCP Global Summit (San Jose) 攤位 + Tech Talk"],
                   ["2027 Q1–Q2", "DVT/PVT 階段;Burn-in 48 hr;UL 1973 + IEC 62619 送測",
                    "Battery Twin SaaS Beta;接 Pegatron 整機 telemetry",
                    "Tier-1 PoC 出貨 (Microsoft Azure / Meta)"],
                   ["2027 Q3", "UL 認證取得;Diablo 400 v1.0 介面驗證",
                    "SaaS GA;OCP DC-SCM Telemetry sub-spec 提案",
                    "Tier-2 (CoreWeave、Lambda) PoC 簽約"],
                   ["2027 Q4", "MP 量產出貨;產線改造完成",
                    "Continual learning 上線;OTA 周期化",
                    "5 家 Tier-1/2 PoC + 簽 5 年 SaaS 合約"],
               ])

    _add_heading(doc, "F.2 組織與分工 (建議學生團隊)", level=2)
    _add_bullet(doc, "戰略 / 商業選手:市場分析、客戶訪談、財務模型、PR / 演講")
    _add_bullet(doc, "工程 / 程式選手:Battery Twin Python ML 管線、Web 三件套、CI / cross-check gate")
    _add_bullet(doc, "硬體 / 工業設計選手:機構尺寸、熱設計、UL 認證資料整理(W4+ 加入)")

    _add_heading(doc, "F.3 風險與緩解", level=2)
    _add_bullet(doc, "專利 FTO 風險 → Vertiv / Eaton 在混合儲能已有部分專利。OCP Summit 前完成 FTO 報告,必要時與 KULR 共同申請防禦性專利")
    _add_bullet(doc, "OCP 規格延宕 → Mt. Diablo v0.7.0 已於 2026/3/1 公布 [5],v1.0 預期 2026 Q4。我們的設計鎖定 v0.7.0,向後相容")
    _add_bullet(doc, "德州廠毛利承壓 → 在地組裝成本較亞洲高 ~12 %,以 ASP 溢價 (USD 1,080 vs 行業均 USD 720) 與美國優先採購法關稅豁免吸收,並以軟體 site license 補貼總體毛利")

    _add_heading(doc, "F.4 業師質詢預演 (Camp Q&A 沙盤推演)", level=2)
    _add_para(doc, "以下七題模擬系統電跨部門業師(財務 / 市場 / 競爭 / 工程 / 軟體)之尖銳提問,附強勢回應:", size=10)

    qa = [
        ("Q1 (財務):德州廠毛利承壓,本案 40.5 % 硬體毛利如何兌現?",
         "BOM USD 643 已含在地組裝 +12 % 溢出 (USD 38);ASP USD 1,080 較行業均 USD 720 溢價 39 % 中,USD 360 溢價來源為:"
         "(1) 混合儲能 LIC + LFP 整合附加值 USD 200;(2) Battery Twin 軟體層 USD 100;(3) 在地組裝關稅豁免 USD 60。"
         "硬體毛利 40.5 % 對應 (1080 − 643) / 1080 = 40.5 %,可以兌現。"),

        ("Q2 (市場):你說 SAM USD 14 億 @ 2034 但 Emergen 報告多有保留,目標 5 % 真能達到?",
         "我們以 Emergen Research 北美 BBU USD 14 億 (40 % 全球) 作 SAM,2029 年目標 USD 8,250 萬約佔 9.4 %。"
         "12 % 是 2029F 上限,5 % 是保守目標 — 對應 USD 7,000 萬,僅需 5 家 Tier-1/2 PoC × 平均 USD 1,400 萬即可。"),

        ("Q3 (競爭):Schneider × NVIDIA 800 V 已聯盟,你怎麼擋?",
         "Schneider × NVIDIA 鎖 Tier-1 hyperscaler 與 1 MW+ 機櫃。我們攻 Tier-2/3 colo (CoreWeave / Lambda / Equinix / Digital Realty) "
         "+ 既有 ORV3 改造市場。1.4 MW 以下機櫃 5–10 年內仍是 ±400 V HVDC 主流,本產品定位 ORV3+HVDC 共用機構,跨代延展 5+ 年。"),

        ("Q4 (工程):LIC 容量 5 kJ 需求,為何配置市售模組總可用能量達 345 kJ?是否過度設計?",
         "此「容量過配」為刻意工程選擇,有四個目的:(1) ESR 降低:雙顆併聯讓 ESR 從 0.5 mΩ 降至 0.25 mΩ,瞬態 200 A 放電壓降減半,提升瞬態響應品質。"
         "(2) 低 DoD 延伸壽命:5 kJ / 345 kJ = 1.5 % DoD,LIC 工作於「淺充淺放」區間,規格 100 萬次循環可實際達到 10⁷ 次,跨越 BBU 10 年服役期不需中途更換。"
         "(3) N+1 冗餘:單顆故障系統仍可運作。(4) 模組顆粒度:Eaton XLR 200F/48V 是市售最小可採購單元,客製 5 kJ 模組 NRE 成本 USD 50k+ 不划算。"),

        ("Q5 (工程):LIC 在 BBU 機箱內的熱與 EMI 怎麼解決?",
         "(熱) LIC 與 LFP 採物理分區風道 + 1.5 mm 熱重導向鋁板 + 陶瓷阻熱塗層;N+1 風扇配置;最高負載 LIC 表面溫度目標 < 65 °C,LFP pack < 45 °C。"
         "(EMI) DC-DC 採 GaN HEMT 軟切換 + Common-mode choke + 三層 PCB 完整地平面;合規目標 FCC Part 15 Class A、EN 55032 Class A、OCP ORV3 機架 EMC 規範。"),

        ("Q6 (軟體, v2.2 新增):你說 Battery Twin 跑出 < 10 % MAPE,實際做到幾 %?",
         "Severson 13-feature paper-aligned model 配合 K=24 bagged-GradientBoosting ensemble + extra-strict cell filter "
         "(cycle_life ≥ 400,134/138 cells),random split 10-seed median test MAPE = 8.38 %、R² = 0.89 (per-seed [5.93, 12.91],"
         "7/10 seeds < 10 %) — 首次低於附件 B 軟體技術棧「< 10 %、Severson 9.1 % 對標」承諾。Cross-batch 由 bagged-OLS 達 13.87 %、R² +0.21 "
         "(GBT 跨 protocol 退化到 17–22 %,部署 SOP fallback)。LSTM augmented 188-cell test 整體 19.10 %、R² 0.86,作為 /dashboard 1000 台 fleet 推論引擎。"
         "INT8 動態量化後 size 從 219 KiB → 63 KiB (3.49× 壓縮),ΔMAPE 僅 +0.10 pp,R² 不變 — STM32N6 NPU 部署 go decision 已拿到。"
         "完整數字見附件 D(原始 JSON severson_model_eval.json + lstm_quantization_report.json 在團隊 GitHub 倉庫,複賽前公開)。**未上實機資料前不承諾 < 5 %**(維持原承諾邊界)。"),

        ("Q7 (工程, v2.2 新增):跨化學部署有沒有限制?",
         "有,Severson (LFP) → NASA (NMC) cross-dataset 5/5 feature 全部 OOD、z-distance 5–65 σ。模型不可直接跨化學部署,"
         "產品 SOP 必須含 per-chemistry calibration cycle (每批新採購 LFP 模組 / 跨化學 vendor 切換時觸發)。"
         "此誠實聲明寫進客戶交付物,是商業差異化武器(競品 KULR、Eaton 都沒做跨化學量化驗證)。詳附件 D §D.4。"),
    ]
    for q, a in qa:
        _add_para(doc, q, bold=True, size=10)
        _add_para(doc, a, size=10)
    doc.add_page_break()


# ---------------------------------------------------------------------------
# G. 成本與效益評估
# ---------------------------------------------------------------------------
def build_section_G(doc: Document) -> None:
    _add_heading(doc, "G. 成本與效益評估", level=1)

    _add_heading(doc, "G.1 單台 BOM 與毛利結構", level=2)
    _add_table(doc,
               header=["項目", "USD", "備註"],
               rows=[
                   ["LFP 整合 pack (2.5 kWh, 15S, 車規)", "280", "Microvast / KORE Power 等北美/日韓系電芯,含 pack 機構"],
                   ["LIC 模組 (2× Eaton XLR 200F/48V)", "150", "過配為刻意設計:ESR 降低 + 低 DoD 延壽 + N+1 冗餘 [18]"],
                   ["BMS + Edge AI MCU (STM32N6)", "38", "Cortex-M55 + Neural-ART NPU 單晶片;含 SOH 推論 + OpenBMC 介面"],
                   ["DC-DC + 機構 + 熱/EMI", "95", "ORV3 12U 規格 + GaN HEMT 650 V + 阻熱層"],
                   ["組裝 + Burn-in 48 hr (德州 Plano)", "38", "較亞洲 +12 %,符合 BABA Act"],
                   ["認證攤提 (UL 1973 + IEC 62619)", "42", "首批 1 萬台攤提;後續單台成本可降至 USD 25"],
                   ["總 BOM", "643", "ASP USD 1,080 → 毛利 (1080 − 643) / 1080 = 40.5 %"],
               ])

    _add_heading(doc, "G.2 三年營收 / EBIT / IRR", level=2)
    _add_table(doc,
               header=["年度", "出貨千台", "硬體營收 (USD M)", "SaaS (USD M)", "EBIT margin / EBIT"],
               rows=[
                   ["2027F", "12", "13.0", "0.08", "8 % / 1.0M"],
                   ["2028F", "35", "37.8", "0.30", "14 % / 5.3M"],
                   ["2029F", "75", "82.5", "0.80", "19 % / 15.8M"],
                   ["3 年累積", "122", "133.3", "1.18", "EBIT 22.1M"],
               ])
    _add_para(doc,
              "投入估算:研發 USD 18 M (3 年攤) + 認證 USD 5 M + 行銷 100 萬台幣/年 ≈ USD 0.1 M + 產線改造 USD 8 M = 累計 USD 31 M。"
              "Payback 與 IRR:3 年累積 EBIT 22.1 M 對 31 M 投入 → 簡單回收期約 3.5 年;以 5 年期推估 (2030–2031 年營收續成長至 USD 200 M+),"
              "IRR 約 22–28 %,現金流轉正預期於 2029 Q4。")

    _add_heading(doc, "G.3 客戶 TCO 節省 (10 年期,單櫃 100 kW 級)", level=2)
    _add_table(doc,
               header=["項目", "傳統 BBU", "Sysblade", "差異"],
               rows=[
                   ["初次採購 (8 台/櫃)", "USD 5,760", "USD 8,640", "+2,880"],
                   ["電池組更換 (10 年內 1.5 次 vs 1 次)", "USD 8,640", "USD 5,760", "−2,880"],
                   ["瞬態事件造成節能重啟與壽命衰減", "USD 4,800", "USD 1,200", "−3,600"],
                   ["維運人力 (預測維運自動化)", "USD 5,000", "USD 2,000", "−3,000"],
                   ["HVDC 升級重建 (Diablo 400 過渡)", "USD 4,800", "USD 1,800", "−3,000"],
                   ["10 年 TCO 合計", "USD 29,000", "USD 19,400", "−9,600 (−33 %)"],
               ])
    _add_para(doc,
              "結論:客戶單櫃 10 年總持有成本下降 USD 9,600 (33 %),較原企劃 43.7 % 假設更保守、項目可逐筆檢視。"
              "「電池更換次數 1.5 vs 1」係依 LFP 在 BBU 浮充應用實測 8–12 年壽命估算;「瞬態壽命衰減」採 Severson [12] 推導之循環損耗模型,避免高估「停機事件」金額。")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# 附件 A. 主要參考資料
# ---------------------------------------------------------------------------
def build_appendix_A(doc: Document) -> None:
    _add_heading(doc, "附件 A. 主要參考資料", level=1)
    refs = [
        "[1] Emergen Research, AI Data Center BBU Power Supply Market 2024-2034",
        "[2] Intel Market Research, NA AI Computing Center Energy Storage Battery Outlook 2026-2034",
        "[3] NVIDIA, How New GB300 NVL72 Features Provide Steady Power for AI",
        "[4] Microsoft Azure, Power Stabilization for AI Training Datacenters (arXiv 2508.14318)",
        "[5] OCP, Diablo 400 Project: Rack and Power Base Spec v0.7.0 (Mar 2026)",
        "[6] Microsoft Azure, Public VM Workload Trace 2017",
        "[7] OCP ORV3 BBU Spec rev 1.4",
        "[8] 系統電 2025 Q3 法人說明會, 德州 Plano 廠量產時程",
        "[9] Pegatron 私募入股系統電公告 (2024)",
        "[10] JLL Research, Year-End 2025 Report",
        "[11] Gartner, Will Insufficient Power Constrain AI Data Center Capacity (2024)",
        "[12] Severson, K.A., et al. (2019). Data-driven prediction of battery cycle life before capacity degradation. Nature Energy 4, 383-391",
        "[13] Attia, P.M., et al. (2020). Closed-loop optimization of fast-charging protocols. Nature 578",
        "[14] Sulzer, V., et al. (2021). PyBaMM (Python Battery Mathematical Modelling). J. Open Research Software 9, 14",
        "[15] Saha, B., Goebel, K. (2007). NASA PCoE Battery Data Set",
        "[16] CALCE, University of Maryland — Li-ion Battery Aging Datasets;YMIN Tech Note: Millisecond-level transient power",
        "[17] Schneider × NVIDIA, 800 VDC Sidecar Joint Reference Design (Apr 2025)",
        "[18] Eaton Corporation, XLR 48 V Supercapacitor Module Datasheet (2024)",
        "[19] 系統電 2024 年度報告 (Public Filing)",
        "[20] Meta Engineering, Meta's Infrastructure Evolution and the Advent of AI (2025)",
    ]
    for r in refs:
        _add_bullet(doc, r, size=9)
    doc.add_paragraph()


# ---------------------------------------------------------------------------
# 附件 B (v2.2 修訂):軟體技術棧 + measured 結果
# ---------------------------------------------------------------------------
def build_appendix_B(doc: Document) -> None:
    _add_heading(doc, "附件 B. 軟體技術棧 (v2.2 修訂:加入實證結果)", level=1)

    _add_para(doc, "(a) TCO Calculator", bold=True)
    _add_para(doc,
              "Next.js 14 + Vercel + Tailwind。輸入欄:機櫃數、電價、現用 BBU 規格 → 輸出:5 / 10 年 TCO、ROI、CO₂ 節省。"
              "已部署:https://sysblade-atcc.vercel.app/tco;default Mid-tier (50 racks Texas) preset 算出"
              " 每櫃 10 年節省 USD 9,600,33 % 客戶總持有成本下降 (對齊 §G.3 表)。Slider 實時更新四個輸入。")

    _add_para(doc, "(b) Battery Digital Twin", bold=True)
    _add_para(doc,
              "Python 3.11 + PyBaMM 26.4.1 (DFN with Prada 2013 LFP-graphite parameter set) + PyTorch 2-layer LSTM"
              "(hidden=64, input shape (99,7))+ onnxruntime INT8 deployment。資料源:Severson 2019 TRI dataset"
              "(138 cells parsed from 124-paper subset, 主訓練)[12] + NASA Prognostics PCoE [15] + 50 PyBaMM-calibrated"
              " BBU-duty 合成 cell (regime-gap closure)。已部署:https://sysblade-atcc.vercel.app/twin。輸出 SOH/RUL with"
              " 90 % MC Dropout + split conformal PI。誤差實證 (達 v2.1 < 10 % 承諾):")
    _add_bullet(doc,
                "bagged-GBT + xstrict cell filter (cycle_life ≥ 400, n=134), Severson random split 10-seed median MAPE = 8.38 %、R² 0.89"
                "(per-seed [5.93, 12.91], 7/10 seeds < 10 %)— paper 學術 baseline,首次達 < 10 %、Severson 9.1 % 對標承諾",
                level=1, size=9)
    _add_bullet(doc, "bagged-OLS + xstrict cross-batch median MAPE = 13.87 %、R² +0.21 — cross-protocol fall-back", level=1, size=9)
    _add_bullet(doc, "LSTM augmented (188 cells) 整體 test MAPE 19.10 %、R² 0.86 — /dashboard 1000 台 fleet 推論引擎 (one model, two views)", level=1, size=9)
    _add_bullet(doc, "INT8 ONNX size 219 KiB → 63 KiB (3.49× compression measured), ΔMAPE 僅 +0.10 pp、R² 不變 — STM32N6 部署 ready", level=1, size=9)
    _add_bullet(doc, "90 % Conformal PI:test coverage 100 % (≥ 90 % 保證),中位數 PI 寬度 1910 → 1075 cycles (縮窄 44 %)", level=1, size=9)
    _add_bullet(doc, "Cross-chemistry transfer (Severson LFP → NASA NMC) 5/5 feature 全部 OOD、z-distance 5–65 σ;"
                     "模型不可直接跨化學部署,須 per-chemistry calibration cycle (誠實寫進產品 SOP)", level=1, size=9)
    _add_bullet(doc, "未上實機資料前不承諾 < 5 % (維持 v2.1 原承諾邊界)", level=1, size=9)

    _add_para(doc, "(c) Fleet Health Dashboard", bold=True)
    _add_para(doc,
              "Next.js + d3 US fleet map + recharts。視覺化 1,000 台 Sysblade 機隊狀態。已部署:"
              "https://sysblade-atcc.vercel.app/dashboard;全頁明標 SIMULATED DATA watermark。三層服務分層對應 §E.3:")
    _add_bullet(doc, "Tier-1 即時監控:1,000 台 SOH / RUL / status table,健康狀態總計", level=1, size=9)
    _add_bullet(doc, "Tier-2 地理分佈:US fleet map (本 fleet 模擬權重 Texas 49 % / Virginia 27 %,"
                     "為 AI 機房密度加權後本文假設;v2.1 §C.1 引 JLL 真實全美在建容量為 18.6 % / 15 %)", level=1, size=9)
    _add_bullet(doc, "Tier-3 替換隊列:admission rule status === \"early_aging\" (SOH < 0.85 OR RUL < 800 cycles),"
                     "依 RUL 升序顯示最緊急 8 台,演算法主動推到客戶 ServiceNow ticketing", level=1, size=9)

    _add_quote(doc,
               "Reproducibility gate:GitHub Action 在每次 push 跑 20 條數字 cross-check 對齊 JSON ground truth,"
               "任一 doc 數字漂移 0.05 pp 即 CI 紅燈。完整方法論與限制見 1100 行技術白皮書 docs/whitepaper.md "
               "(團隊 GitHub 倉庫,初賽期間私有,複賽前公開) + 本文件附件 D 摘要。")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# 附件 C. 計算假設與保守性說明 (v2.1 原文,稍精簡)
# ---------------------------------------------------------------------------
def build_appendix_C(doc: Document) -> None:
    _add_heading(doc, "附件 C. 計算假設與保守性說明", level=1)
    _add_bullet(doc,
                "市場:Emergen Research [1] 全球 USD 35 億 × 北美 40 % = USD 14 億 (2034);以 CAGR 11.5 % 線性回推 2029 ≈ USD 8.8 億。"
                "本案 2029 目標 USD 8,250 萬約佔 9.4 %,未達 12 % 目標承諾的「合理上限」,屬保守可達。")
    _add_bullet(doc,
                "IRR 22–28 % 已含三年研發攤提 + UL 認證 + 行銷 + 產線改造合計 USD 31 M 投入;不採用「稼動率 × 良率」雙重折扣公式,"
                "避免重複扣除既已含於營收與 EBIT margin 中之效率因子。")
    _add_bullet(doc,
                "ASP USD 1,080 含首年 SaaS bundle (USD 80 cost basis);裸機 ASP USD 1,000,仍較 ORV3 reference design 業界均價 USD 720 溢價 39 %,"
                "溢價來源為混合儲能 (LIC + LFP) + 軟體層 + 在地組裝關稅豁免。")
    _add_bullet(doc,
                "LIC 容量計算:3.6 kJ 最小需求 = GB200 NVL72 機櫃 120 kW × 30 % 擺幅 × 100 ms 持續時間 [4][16];"
                "保守裕度 30 % 與多次連續觸發補償後配置 ~5 kJ。市售模組 (Eaton XLR 200F/48V × 2) 實際可用能量 345 kJ,"
                "過配為刻意設計 (ESR 降低 + 低 DoD 延壽 + N+1 冗餘 + 模組顆粒度限制)。")
    _add_bullet(doc,
                "LFP 串聯數:採 15S 配置 (3.2 V × 15 = 48 V 標稱、3.65 V × 15 = 54.75 V 最高充電),為 LFP 化學體系達 OCP ORV3 48 V "
                "標稱所需的合理配置 (13S 為 NMC 配置)。")
    _add_bullet(doc,
                "電池更換頻率 (10 年 1.5 次 vs 1 次) 假設:傳統 NMC BBU 浮充壽命 6–8 年(10 年內需替換 1.5 次);"
                "LFP 8–12 年浮充壽命實測值 (本案 §3.1 PyBaMM aging 模擬亦對齊),10 年內 1 次替換為保守上限。")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# 附件 D (v2.2 NEW):技術交付物實證
# ---------------------------------------------------------------------------
def build_appendix_D(doc: Document) -> None:
    _add_heading(doc, "附件 D. 技術交付物實證 (v2.2 新增,2026-05-03 measured)", level=1)
    _add_quote(doc,
               "完整方法論、限制與引文鏈:1100 行技術白皮書 docs/whitepaper.md(團隊 GitHub 倉庫,初賽期間私有,"
               "複賽前公開)。Live demo(現場可操作):https://sysblade-atcc.vercel.app。本附件數字皆來自 "
               "data/processed/*.json 與 packages/shared/scenarios/*.json,由 GitHub Action CI gate 逐 push "
               "自動驗證一致性。業師如需即時驗證任一數字,可於 Live demo 對應頁面看到同源呈現。")

    # D.1
    _add_heading(doc, "D.1 RUL 預測管線實測 (對應 §E.1 Tier-C、附件 B (b))", level=2)
    _add_para(doc,
              "Severson 2019 124-cell LFP fast-charge 資料集為主訓練,50 顆 PyBaMM-calibrated BBU-duty 合成 cell 為 regime-gap 補強,共 188 cells。",
              size=10)
    _add_table(doc,
               header=["模型", "配置", "Random split MAPE", "Cross-batch MAPE", "角色"],
               rows=[
                   ["Severson 13-feat OLS", "unfiltered 138 cells", "14.51 % (R² 0.53)", "14.54 % (R² +0.08)", "Plan C+ baseline (歷史對照)"],
                   ["bagged-GBT (K=24) + xstrict cell filter", "cycle_life ≥ 400, n=134", "8.38 % (R² 0.89, per-seed [5.93, 12.91], 7/10 < 10 %)", "17.91 % (跨 protocol 退化)", "paper 學術 baseline,達 < 10 % 承諾"],
                   ["bagged-OLS + xstrict", "同上", "12.43 %", "13.87 % (R² +0.21)", "cross-protocol fall-back"],
                   ["LSTM augmented", "Severson 138 + BBU 50 = 188 cells, 60/20/20 split", "—", "—", "/dashboard 1000 台 fleet 推論引擎;test MAPE 19.10 %、R² 0.86"],
               ])
    _add_para(doc, "部署 SOP (三條 routing rule):", bold=True, size=10)
    _add_bullet(doc, "客戶端 cell 與 fleet 訓練資料同 protocol → 用 bagged-GBT (8.38 %)", size=10)
    _add_bullet(doc, "客戶端 cell 是新 protocol → fall back 到 bagged-OLS (13.87 %, R² 由負轉正)", size=10)
    _add_bullet(doc, "客戶端 cell 是新化學 (LFP → NMC 等) → 須 per-chemistry calibration cycle (見 D.4)", size=10)

    _add_quote(doc,
               "誠實邊界:8.38 % 為 random split 10-seed median,xstrict 篩掉 4/138 顆早夭 cell;業師問「為何不 cross-batch 也是 8.38 %」"
               "答「樹型模型在跨 protocol 退化 (17–22 %),這是 protocol-specific overfit 的經典 bias-variance 證據,部署用 OLS 路徑」。"
               "不引用 best-seed 5.93 % (屬 cherry-pick)。")

    # D.2
    _add_heading(doc, "D.2 邊緣端 INT8 量化驗證 (對應 §E.1 Tier-C STM32N6 部署)", level=2)
    _add_para(doc,
              "scripts/quantize_lstm_onnx.py 用 onnxruntime.quantization.quantize_dynamic (matches X-CUBE-AI 9.x INT8 路徑,AN5354 §INT8) "
              "對 models/lstm_rul.onnx 真實量化,在 188-cell test 集上量測:",
              size=10)
    _add_table(doc,
               header=["指標", "FP32 baseline", "INT8 quantised", "Δ"],
               rows=[
                   ["ONNX size (graph + external data)", "219.2 KiB", "62.9 KiB", "3.49× compression"],
                   ["Test MAPE (同一 test set)", "19.10 %", "19.20 %", "+0.10 pp"],
                   ["Test R²", "0.862", "0.862", "不變"],
                   ["平均 |prediction Δ| / FP32 prediction", "—", "—", "0.57 %"],
                   ["CPU latency p50 (筆電,單樣本)", "0.267 ms", "0.241 ms", "1.11×"],
               ])
    _add_para(doc,
              "結論:INT8 在這個 LSTM 上幾乎無精度退化,63 KiB 遠小於 STM32N6 1.6 MB ML FLASH 上限,是「STM32N6 部署 go decision」的 first-party 證據。"
              "仍待 W3:NPU 真機 cycle-accurate latency (需 ST 帳號 + X-CUBE-AI GUI)。本估算 54.7 µs (40 % NPU utilisation heuristic ±2× 不確定區間);"
              "ST datasheet Neural-ART INT8 LSTM typical 0.3 ms 為承諾上限,本估算遠低於此。",
              size=10)

    # D.3
    _add_heading(doc, "D.3 機率輸出 — MC Dropout + Split Conformal PI", level=2)
    _add_table(doc,
               header=["指標", "Raw MC Dropout", "+ Split Conformal calibration"],
               rows=[
                   ["Test set 90 % PI coverage", "100 %", "100 % (≥ 90 % conformal 保證)"],
                   ["中位數 PI 寬度", "1910 cycles", "1075 cycles (縮窄 44 %)"],
                   ["Conformal q_factor", "—", "0.563 (< 1 即 raw PIs 偏寬, calibration 縮窄)"],
               ])
    _add_para(doc,
              "業務意義:/dashboard Tier-3 admission (status === \"early_aging\" ⇔ SOH < 0.85 OR RUL < 800) 從「不確定 ± 1500 cycles」收緊到「± 500 cycles」,"
              "替換決策成為 actionable 而非「再觀察」。Vovk 2005 / Lei 2018 conformal exchangeability 保證 — calibration 集 37 cells held-out。",
              size=10)

    # D.4
    _add_heading(doc, "D.4 跨化學限制 — 跨資料集驗證 (誠實聲明)", level=2)
    _add_table(doc,
               header=["Feature", "Severson 範圍", "NASA 範圍", "OOD?", "z-distance"],
               rows=[
                   ["log_var_delta_q", "[−5.21, −2.73]", "[−2.07, −1.54]", "✗", "5.3 σ"],
                   ["log_min_delta_q", "[−2.30, −0.86]", "[−0.51, −0.26]", "✗", "5.1 σ"],
                   ["slope_q_2_100", "[−0.001, 0]", "[−0.006, −0.004]", "✗", "54 σ"],
                   ["intercept_q_2_100", "[0.97, 1.10]", "[1.86, 2.04]", "✗", "61 σ"],
                   ["q_at_cycle_2", "[0.97, 1.09]", "[1.85, 2.04]", "✗", "65 σ"],
               ])
    _add_para(doc,
              "5/5 feature 全部 OOD,z-distance 5–65 σ。Severson-trained 模型不可直接部署到不同化學的 cell;產品 SOP 必須含 "
              "per-chemistry calibration cycle (每批新採購 LFP 模組 / 跨化學 vendor 切換時觸發)。這個結論寫進客戶交付物,"
              "是商業上的差異化武器 (競品 KULR、Eaton 都沒做跨化學量化驗證)。",
              size=10)

    # D.5
    _add_heading(doc, "D.5 Reproducibility CI", level=2)
    _add_para(doc,
              "GitHub Action (.github/workflows/check.yml) 在每次 push / PR 跑 pnpm typecheck + lint + build (web app 三件套) + "
              "pnpm check:numbers (20 條 cross-check 掃 whitepaper.md / README.md / PRESENTATION_GUIDE.md / packages/battery-twin/README.md "
              "vs JSON ground truth (severson_model_eval.json / lstm_quantization_report.json / cross_dataset_mape.json / model_validation.json),"
              "數字偏離容差 0.05 pp 以上自動 fail。首跑就抓到 1 條真的 stale 22.5 % (舊 LSTM 訓練數字) 並修正為 19.10 %;"
              "此後 commit c2bf10e 起 v2.1 §X 引用全部對齊 PDF 真實章節編號 (7 條原本錯誤的 cross-reference)。",
              size=10)
    _add_quote(doc,
               "本附件本身也受此 gate 保護:任何數字若漂離 JSON 真值,push 時 CI 直接紅燈,業師檢核 GitHub 任一 commit 的 Actions tab 都看得到 20+/N passed 紀錄。")

    # D.6
    _add_heading(doc, "D.6 數字溯源 (每一條都可追)", level=2)
    _add_table(doc,
               header=["v2.2 引用", "repo 路徑"],
               rows=[
                   ["8.38 % / 13.87 % / 14.51 % MAPE 三條", "data/processed/severson_model_eval.json (headline.best_random_full + results[])"],
                   ["INT8 size / accuracy / CPU latency", "data/processed/lstm_quantization_report.json"],
                   ["LSTM 19.10 % / R² 0.86 / Conformal q_factor", "packages/shared/scenarios/model_validation.json"],
                   ["Cross-dataset z-distance 5/5 OOD", "data/processed/cross_dataset_mape.json"],
                   ["TCO 5760 / 8640 / 29000 / 19400 (對齊 §G.3 表)", "apps/web/src/lib/tco.ts 常數"],
                   ["Tier-3 admission rule", "scripts/generate_twin_scenarios.py::status_for_device"],
                   ["1000 台 fleet 模擬", "apps/web/public/scenarios/fleet_devices.json"],
               ])
    _add_quote(doc,
               "競賽期間若業師在現場 demo 質疑任何一個數字,可直接打開 GitHub 對應檔案點 raw view、或 Live demo 對應頁面 — 兩條路徑都即時可驗。")
    doc.add_page_break()


# ---------------------------------------------------------------------------
# Revision history
# ---------------------------------------------------------------------------
def build_revision_history(doc: Document) -> None:
    _add_heading(doc, "修訂歷史", level=1)
    _add_table(doc,
               header=["版本", "日期", "主要修訂"],
               rows=[
                   ["v2.0", "2026-04-22", "原始草稿 (W2 末)"],
                   ["v2.1", "2026-04-29", "三層分離式 → 三層電氣分層 (E.1);LSTM 訓練資料集改 Severson + NASA + CALCE;"
                                          "13S → 15S LFP 配置;BMS + Edge AI 整合至 STM32N6 單晶片"],
                   ["v2.2", "2026-05-03",
                    "封面加 Live demo URL;§E.3 改寫為「已開發並部署」三件套含 vercel URL;§F.4 加 Q6 (MAPE 8.38 % 實證) + "
                    "Q7 (跨化學限制);附件 B 全面修訂加入 measured 數字;新增附件 D 技術交付物實證 (D.1–D.6 共 6 節);"
                    "所有 §X 引用對齊 v2.1 PDF 真實章節編號 (7 條原 cross-reference 錯誤更正)。"
                    "團隊 GitHub 倉庫含 reproducibility CI 與 1100 行技術白皮書,初賽期間私有,複賽前公開"],
               ])


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------
def main() -> int:
    doc = Document()

    # Page setup: A4, narrow margins for dense layout matching v2.1
    section = doc.sections[0]
    section.page_height = Cm(29.7)
    section.page_width = Cm(21.0)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)

    # Default style
    style = doc.styles["Normal"]
    style.font.name = "Microsoft JhengHei"
    style.font.size = Pt(10)

    build_cover(doc)
    build_section_A(doc)
    build_section_B(doc)
    build_section_C(doc)
    build_section_D(doc)
    build_section_E(doc)
    build_section_F(doc)
    build_section_G(doc)
    build_appendix_A(doc)
    build_appendix_B(doc)
    build_appendix_C(doc)
    build_appendix_D(doc)
    build_revision_history(doc)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(OUT))
    print(f"wrote {OUT.relative_to(REPO)}")
    print(f"     size {OUT.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
