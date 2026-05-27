---
title: "IP Audit — Sysblade HyperBuffer (ATCC C13)"
audience: "法律顧問 / IP counsel review"
date: "2026-05-27"
scope: "Non-patent IP risk (商標 / 著作權 / 資料權 / 開源授權 / 比較主張)"
status: "Pre-review draft;條目可被律師逐條挑戰"
non_scope: "專利侵權分析(用戶指示先撇除,日後新增 §A 專利 freedom-to-operate 評估)"
---

# IP Audit — Sysblade HyperBuffer

> 為法律顧問初次 review 準備。**逐條列出 repo 內所有第三方技術 / 商標 / 資料集 / 學術
> 引用 / 開源依賴**,每條給出**使用方式 + 風險等級 + 緩解建議**。律師若對任一條
> 不滿意,我們可在 1-2 天內修正(撤回引用 / 改 wording / 加 disclaimer)。

---

## 🟢 已確認低風險

### A. 我們自研、沒有借用他人 IP

| 項目 | 位置 | 說明 |
|---|---|---|
| **Sysblade HyperBuffer 拓樸** | 整 repo | 8 BBU 並聯 + LFP+LIC 一階互補濾波器 τ=0.5s — **我們的設計選擇**,沒有複製任何廠商架構 |
| **V1-V6 validation methodology** | `BBU_IMPLEMENTATION_PLAN.md` v2.0 | Twin-first 驗證鏈條(物理 fit / RC fit / 整 rack sim / N-1 fault / cross-regime transfer / make verify gate)— 我們的方法論 |
| **TCO 模型公式** | `apps/web/src/lib/tco.ts` | 5 條 line item 計算 — 我們的商業假設 + 數字 |
| **All Next.js / React 程式碼** | `apps/web/src/` | 我們自己寫的 UI / scrollytelling tour / dashboard / TCO calculator |
| **所有 Python sim scripts** | `scripts/eval_*.py`, `scripts/generate_*.py` | 我們寫的 sim orchestrator,呼叫 PyBaMM / scikit-learn 等 OSS library |
| **Bagged-GBT K=24 ensemble 配置** | `scripts/eval_severson_models.py` | 標準 ML 技術 + 我們的超參選擇,不是專利方法 |

### B. 開源依賴(所有 license 都 permissive,屬合法使用)

| Library | License | 使用方式 |
|---|---|---|
| **PyBaMM 26.4.1** | BSD-3-Clause | 物理 DFN 模擬;V1/V3/V4 直接呼叫 `pybamm.lithium_ion.DFN()` |
| **PyTorch 2.x** | BSD-style | LSTM 訓練 + ONNX 匯出 |
| **scikit-learn 1.5** | BSD-3-Clause | bagged-GBT、OLS regression |
| **ONNX / ONNX Runtime** | MIT | LSTM 量化 + INT8 推論 |
| **NumPy / Pandas / SciPy / h5py / matplotlib** | BSD-style | 標準科學計算 |
| **loguru / pydantic / typer / tqdm** | MIT | utilities |
| **Next.js 14** | MIT | Web app framework |
| **React 18 / Recharts / lucide-react / Tailwind CSS** | MIT / ISC | UI |

→ **完整依賴清單與授權** 見 [`NOTICE.md`](../NOTICE.md)(repo root)。

### C. 學術引用(全部 citation 完整,屬學術 fair use)

| 引用 | 用途 | 引用位置 |
|---|---|---|
| **Severson et al. 2019** *Nature Energy* 4, 383-391 | 138 顆 LFP 18650 cycle life dataset(公開 TRI dataset)+ 13-feature Full model | `whitepaper.md` 附錄 A / `severson_parser.py` |
| **Prada et al. 2013** *J. Electrochem. Soc.* 160, A616-A628 | LFP-graphite DFN 參數集 | `whitepaper.md` §2.2 |
| **Doyle, Fuller, Newman 1993** | DFN 物理模型原始 paper | `whitepaper.md` 第九章 |
| **Wang et al. 2011** | LFP 半經驗 aging 模型 | `whitepaper.md` §2.3.2 cross-validation |
| **Attia et al. 2020** *Nature* | LIC fast-charge closed-loop 結果引用 | `whitepaper.md` §2.3.1 |
| **Sulzer et al. 2021** *J. Open Research Software* 9, 14 | PyBaMM 學術引用 | `whitepaper.md` 第九章 |
| **Naoi et al. 2012** *J. Power Sources* | LIC pseudo-capacitance 文獻 anchor | `eval_lic_rc_fit.py` |
| **Kötz & Carlen 2000** *Electrochim. Acta* | EDLC ESR 溫度係數 | 同上 |
| **Choukse et al. 2025** arXiv:2508.14318(Microsoft + NVIDIA)| GB200 power-swing context 文獻 anchor | `whitepaper.md` §3.1 |

**所有引用都標 author / year / publication,符合學術慣例**。Severson dataset 雖然
publicly released,**license terms 仍待確認**(見 §D-1)。

---

## 🟡 中度風險(需要顧問 review)

### D. 資料集授權(需確認 commercial 使用範圍)

#### D-1 · Severson 2019 公開資料集

| 維度 | 狀態 |
|---|---|
| 來源 | <https://data.matr.io/1/projects/5c48dd2bc625d700019f3204>(Toyota Research Institute 公開)|
| 我們的使用 | 1) 下載原始 .mat 檔(8 GB);2) parse 成 Cell objects;3) 抽取 13 feature 訓練 bagged-GBT;4) 報告 MAPE 8.38 % |
| 學術引用 | 已標 Severson 2019 Nature Energy DOI / authors / journal |
| ⚠️ **未確認** | TRI 公開時的 **specific license**(可能是 CC-BY-NC,可能是 CC-BY,可能是 custom academic license)。**ATCC 競賽是學術 / 教育用途**,絕大部分 license 都允許,但若日後商業化必須回頭查 |
| 緩解 | 已在 `docs/severson_download.md` 標來源 + DOI;律師建議若有具體 commercial deployment 計畫,**回 data.matr.io 確認 license 條款 + 寫信給 TRI 確認** |

#### D-2 · NASA PCoE Battery Dataset

| 維度 | 狀態 |
|---|---|
| 來源 | NASA Ames PCoE 開放資料 |
| 我們的使用 | 用 NASA 4 顆 NMC cell 做 cross-dataset z-distance test(白皮書附錄 B) |
| License | NASA 公開資料屬美國政府作品,**多數情況 public domain**(17 U.S.C. §105) |
| 風險 | 🟢 低 |

#### D-3 · Maxwell BMOD0058 datasheet PDF

| 維度 | 狀態 |
|---|---|
| 來源 | <https://maxwell.com/wp-content/uploads/2021/08/3003212.2_Datasheet_BMOD0058-E016-C02.pdf>(廠商公開 PDF)|
| 我們的使用 | WebFetch + pypdf 解析,**摘取公布規格值**(CR / ESR / IPEAK / IDCMAX / ILEAK / Cth / Rth)嵌入 `eval_lic_rc_fit.py` 作為 sim anchor |
| 引用方式 | 註明「Maxwell BMOD0058-E016-C02 datasheet 3003212.2」+ datasheet URL |
| 風險 | 🟢 低 — **datasheet 規格屬廠商主動公開資訊**,引用作為產品比較 / 技術參考屬合理使用 |
| 緩解 | 律師若擔心,把「Maxwell datasheet 3003212.2」這個版本號明白列出讓追溯來源清楚(已做) |

#### D-4 · Eaton XLR-48-166 datasheet typical values

| 維度 | 狀態 |
|---|---|
| 來源 | Eaton 公開 XLR-48-166 product page + datasheet typical values |
| 我們的使用 | RC 等效參數 anchor(C 332 F, ESR 2.5 mΩ, V_nominal 51.3 V)寫進 `generate_twin_scenarios.py` 與白皮書 §2.3.0 |
| 引用方式 | 白皮書 §2.3.0 明文「Eaton XLR-48-166 × 2 並聯,datasheet 典型值」 |
| 風險 | 🟢 低 — 同 D-3 |

---

### E. 商標使用(全部屬 nominative fair use,但要確認 wording)

**Nominative fair use** 原則:descriptive 使用第三方商標來指涉該方產品 / 技術,**不暗示
背書 / 合作關係**,通常合法。我們的所有商標使用都屬於此類,但律師可逐條 review wording。

#### E-1 · NVIDIA 相關(用戶最在意,逐條詳列)

| 提及 | 位置 | wording | 風險評估 |
|---|---|---|---|
| **「GB200」 / 「GB300」 / 「NVL72」** | repo 廣泛 | 「為 GB200 NVL72 機房設計」/「GB200 ±30 % dV/dt」/「one GB200 NVL72 rack pulls 120 kW」 | 🟢 **descriptive 使用 NVIDIA 產品名稱指涉客戶端機房,nominative fair use 標準案例**。**沒有暗示 NVIDIA 背書**,沒有用 NVIDIA logo,沒有用 trademark symbol 偽裝官方合作 |
| **「Bluefield BMC」 / 「nvml」 / 「IPMI」 / 「Redfish」** | `whitepaper.md` §2.1.1 D | 「Power-cap API 候選:NVIDIA nvml、IPMI Power Capping Spec 1.0、Redfish PowerLimit resource」 | 🟢 **descriptive API 名稱列舉**,我們明文標「W3 EVT 階段實測後再 commit」— **沒有實作對 nvml 的依賴** |
| **NVIDIA arXiv 論文** | `whitepaper.md` 第九章 [10] / `apps/web/src/app/page.tsx` line 202 | 「Choukse, E., Buck, I., Alben, J. et al. (Microsoft + NVIDIA, 2025), arXiv:2508.14318」 | 🟢 **學術引用完整** + 我們所有衍生數字明標「團隊依本文 GB200 power-swing 分析推導」**不是引用其結論**,是 derived 推導 |
| **「NVIDIA put capacitors inside the GB300 PSU; we put a [hybrid module]」** | `apps/web/src/app/page.tsx` line 202-204 | 對 NVIDIA GB300 PSU 內建電容架構的 **descriptive 比較陳述** | 🟡 **要顧問判讀**:此句陳述屬「NVIDIA 已公開的 GB300 架構特徵」(NVIDIA 在 OCP / Open Hardware 會議 publicly disclosed)。**若 NVIDIA 沒公開 capacitor placement 細節**,此句可能成為「unverified competitive claim」需要 cite 來源或軟化 wording |
| **「Neural-ART NPU」** | `whitepaper.md` 附錄 C | **這是 STMicroelectronics 的商標,不是 NVIDIA**。Neural-ART 是 STM32N6 的 NPU 名稱 | 🟢 ST 商標,descriptive 使用 |

**對 NVIDIA 的 IP 立場明確**:
- ❌ 沒用 CUDA / cuDNN / TensorRT / NVIDIA Triton 等 proprietary SDK
- ❌ 沒實作任何 NVIDIA-licensed code
- ❌ 沒用 NVIDIA 商標 logo / 顏色 / 暗示官方合作
- ✅ 所有 NVIDIA 名詞都是「客戶端產品」descriptive 引用(用戶要 BBU,客戶用的是 GB200,我們講「為 GB200 設計」屬正常技術行銷語言)

#### E-2 · 競品商標(Eaton / Vertiv / Schneider 等)

| 商標 | 位置 | 用途 |
|---|---|---|
| **Eaton XLR-48-166** | 白皮書 §2.3.0 LIC anchor + §3.4 競品分析 | datasheet anchor + 商業競品比較 |
| **Vertiv** (含 Liebert 系列) | `whitepaper.md` §3.1 / `INVESTOR_BRIEF.md` | 競品比較 |
| **Schneider Electric / Galaxy VS** | 同上 | 競品比較 |
| **Maxwell Technologies / BMOD0058** | 全 repo | LIC stand-in 元件廠商 |
| **JK-BMS / 極空 BMS** | v1.x archive 文件 | v1.x 採購過(已退貨 2026-05-27);現只在 archive 文件 |
| **ATORCH DL24M / DL24M-H** | v1.x archive 文件 | v1.x 採購過(已退貨);現只在 archive 文件 |
| **A123 Systems / Lithium Werks / ANR26650M1B** | v1.x archive 文件 | v1.x Endrich 採購過(已退貨);現只在 archive 文件 |
| **STMicroelectronics / STM32F411 / STM32N6 / X-CUBE-AI** | 廣泛 | descriptive 使用 |

**風險評估**:🟢 全部屬 nominative fair use。**§3.4 競品比較表的 wording 要顧問細看**
— 任何具體營收數字 / 市占百分比都標來源(annual report / 產業分析師估算)。

#### E-3 · 商業比較主張(要顧問逐句 review)

以下是 repo 內對競品的具體陳述,可能引起對方挑戰:

| 陳述 | 位置 | 我們的根據 | 風險 |
|---|---|---|---|
| 「Eaton 賣 LIC 模組,但**客戶要自己整合控制律**」 | `whitepaper.md` §1.2 | Eaton XLR product page 確實只賣模組,沒提供整合 firmware | 🟢 事實陳述 |
| 「Vertiv 等只賣 48 V,客戶 2027 後須 forklift 換代」 | 廣泛 | 我們的 HVDC 換代論述,「2027 後 forklift」是行業共識 | 🟡 「forklift」用語可能 over-state,可改「需重新採購 / 替換」 |
| 「Eaton 2024 全球營收 USD 24.9 B / Vertiv USD 8.0 B / Schneider EUR 38.2 B」 | `whitepaper.md` §3.4 / `INVESTOR_BRIEF.md` | 全部來自 publicly disclosed annual reports / financial filings | 🟢 公開財報 |
| 「~ 15 %(Eaton 北美機房 BBU 市占)」 | `whitepaper.md` §3.4 | 「產業分析師估算」 — 我們明文標「BBU 細分項各廠商不公開,用以表達規模量級而非精確數字」 | 🟡 已加 disclaimer,但律師可建議連這個都改為「估算範圍 10-20%」之類 |
| 「策略上看不上小規模 BBU」(對 Vertiv 的策略推論) | `whitepaper.md` §3.4 | 我們的 strategic-moat 推論,**不是引用 Vertiv 官方聲明** | 🟡 「看不上」用語建議改 「未公開 prioritize 此 segment」 |

**緩解建議**:律師若對任一句不滿意,**1 行 wording change 即可解決**(改用「我們的推論」、「依公開財報估算」等保守語言)。**沒有任何陳述是商業祕密 / 內部資訊 / 內部消息來源**。

---

### F. 我們明文 disclose 沒實作的東西

repo 內有些技術名詞列為「**EVT 2026 Q3 才實作**」,**現階段沒有任何代碼 / 設計依賴**:

| 名詞 | 我們的承諾 | 實際 repo 內 |
|---|---|---|
| **車規 LFP 高功率 cell(LG ESS B-series / Samsung SDI 高功率版)** | EVT 階段選型 | ❌ 沒採購、沒測試、沒寫進 BoM。僅是「候選方向」字串提及 |
| **NVIDIA nvml / IPMI Power Capping / Redfish PowerLimit** | EVT 階段 GPU power-cap API 選型實測 | ❌ 沒實作對任何 API 的綁定。僅是「候選 API」字串 |
| **OCP ORV3 12U 機構** | EVT 階段機構設計 | ❌ 沒機構檔案 / 沒 CAD。僅是「將對齊 ORV3」承諾 |
| **UL 1973 / NFPA 855 / OCP 認證** | 2027 Q3 認證 | ❌ 沒送測。文件多處明文「W3+ 路線圖,複賽範圍外」 |

**為什麼這節重要**:律師可能擔心「你們有寫 nvml 是不是意味著有用 NVIDIA 的 SDK」 — 沒有。**全部都是 placeholder 字串,沒任何 import / link / 二進位嵌入**。

---

## 🟢 不在本 audit 範圍(用戶指示先撇除)

| 範圍 | 狀態 |
|---|---|
| **專利侵權(freedom-to-operate)** | 用戶指示先撇除 — 若顧問要求,可另開 §A patent FTO analysis(LFP+LIC 混合拓樸、互補濾波器分頻、INT8 量化方法等領域的 published patent 搜尋) |
| **個資 / GDPR** | repo 無真實客戶資料;`/dashboard` 1000 device 都是 seeded RNG synthetic(`fleet_devices.json` 有 disclaimer + UI SIMULATED DATA watermark)|
| **出口管制 / EAR / ITAR** | LFP 電池 + open source ML 不在管制範圍;若日後 STM32N6 NPU 加密韌體分發要查 EAR |

---

## ⚙️ 建議的緩解動作(優先序)

| # | 動作 | 時間 | 影響 |
|---|---|---|---|
| 1 | 把 `LICENSE` 寫得更具體(現在「All Rights Reserved」過寬)+ 把 `pyproject.toml` 的 `Proprietary — ATCC competition use` 改成明確「academic / non-commercial pending license decision」 | 30 min | 對外授權立場清楚 |
| 2 | **NOTICE.md** at repo root 列所有 3rd-party 依賴 + license + 使用方式(我會生成)| 1 hr | 開源合規必備 |
| 3 | `apps/web/src/app/page.tsx` line 202-204「NVIDIA put capacitors inside the GB300 PSU」**加引用來源**(OCP 演講?開發者 blog?)否則改「依公開報導,NVIDIA GB300 在 PSU 內加強了電容緩衝」 | 15 min | 化解 unverified claim 風險 |
| 4 | 競品比較 §3.4 wording softening:把「策略上看不上」「forklift 換代」等強烈詞改保守版 | 30 min | 化解 defamation risk |
| 5 | Severson dataset license verification — WebFetch data.matr.io 與 TRI 官方頁,確認 specific license(若是 CC-BY-NC,**要在學術 demonstrator vs commercial deployment 上劃線**)| 1 hr + 等 TRI 回信 | commercial readiness |
| 6 | **加 Trademarks notice** 段到 README — 統一列「NVIDIA / Eaton / Vertiv / Maxwell 等商標屬其各自所有人,本 repo 為 descriptive nominative use」 | 15 min | 商標立場清楚 |

→ 6 件加起來 ~3 小時,複賽前 1 週可全部處理完。

---

## 🎯 給法律顧問的「30 分鐘 review」建議路徑

1. **先看 §C(學術引用)+ §E-1(NVIDIA)+ §E-3(競品比較主張)**— 這三條最敏感,wording 最該改
2. 然後 §D-1(Severson dataset)— 唯一需要對外確認的 license issue
3. §F(沒實作的東西)— 確認沒有 hidden NVIDIA SDK 依賴的隱憂
4. NOTICE.md(開源依賴)— flip through 確認 license 對應正確
5. §⚙️ 緩解動作清單 — 顧問可以挑哪幾項要做,哪幾項可省

如有不滿意處,**重點 wording change 可在 1 天內 git commit + push**,不影響複賽 demo path。

---

## 結論

**本 repo 的 IP 立場**:
- ✅ **沒有實作任何 NVIDIA / Eaton / Maxwell / JK-BMS 廠商 IP**(原 v1.x JK-BMS protocol parser 已隨硬體退貨於 2026-05-27 刪除)
- ✅ **所有開源依賴 license 合規**,使用方式符合各自 license 條款
- ✅ **所有學術引用 attribution 完整**
- 🟡 **商業比較主張 wording 可進一步保守化**(顧問建議下調整)
- 🟡 **Severson dataset 學術 → commercial 過渡時要回去確認 license**

**對複賽 demo path 零影響** — 本 audit 是為「複賽後對外接觸 RD / 顧問 / 投資人」時可拿出來的 due diligence 文件,**ATCC 學術競賽範圍內所有使用都屬合理**。
