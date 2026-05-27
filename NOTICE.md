# Sysblade HyperBuffer — Third-Party Notices

> 列出本 repo 所使用的所有第三方 software / dataset / 商標,以及其授權條款。
> 對應 [`docs/IP_AUDIT.md`](docs/IP_AUDIT.md) §B(開源依賴)、§C(學術引用)、
> §D(資料集)、§E(商標)的詳細風險評估。

**本檔最後更新**:2026-05-27(隨 v1.x 硬體採購全數退貨 + LiveDemonstratorCard
刪除後,移除了 JK-BMS / jkbms.py / atomic_json.py / eload_gb200_profile.py /
live_demonstrator_bridge.py 等檔對應的 3rd-party 依賴條目)

---

## 1 · Open-Source Software Dependencies(全部 permissive license)

### 1.1 · Python / packages/battery-twin

| Package | License | 用途 | 引用方式 |
|---|---|---|---|
| **PyBaMM** ≥ 24.5 | BSD-3-Clause | DFN 物理電池模擬;V1 / V3 / V4 sim core | `import pybamm` ; cited Sulzer 2021 JOSS 9, 14 |
| **CasADi** ≥ 3.6 | LGPL-3.0 | PyBaMM 的 nonlinear solver 後端 | transient dep via PyBaMM |
| **NumPy** ≥ 1.26, < 2.0 | BSD-3-Clause | 全 sim / ML pipeline | `import numpy` |
| **SciPy** ≥ 1.13 | BSD-3-Clause | `loadmat` for Severson v5 .mat | `import scipy.io` |
| **h5py** ≥ 3.11 | BSD-3-Clause | Severson v7.3 .mat HDF5 解析 | `import h5py` |
| **Pandas** ≥ 2.2 | BSD-3-Clause | feature engineering / parquet IO | `import pandas` |
| **PyArrow** ≥ 16.0 | Apache-2.0 | parquet write for severson_cells_features | dep of pandas |
| **PyTorch** ≥ 2.3 | BSD-style + custom | LSTM 訓練 + ONNX export | `import torch` |
| **scikit-learn** ≥ 1.5 | BSD-3-Clause | OLS / GradientBoostingRegressor / bagged-GBT | `from sklearn.*` |
| **ONNX** ≥ 1.16 | MIT | model export format | `import onnx` |
| **ONNX Runtime** ≥ 1.18 | MIT | INT8 量化推論 | `import onnxruntime` |
| **matplotlib** ≥ 3.9 | matplotlib license (BSD-style) | sim plot PNG | `import matplotlib` |
| **plotly** ≥ 5.22 | MIT | (notebook only) | `import plotly` (optional) |
| **requests / tqdm / typer / pydantic / loguru** | Apache / MIT | utilities | various |
| **pypdf** | BSD-3-Clause | 解析 Maxwell datasheet PDF for V2 anchor values | `from pypdf import PdfReader` |

### 1.2 · Web / apps/web

| Package | License | 用途 |
|---|---|---|
| **Next.js** 14.x | MIT | Web app framework (static export) |
| **React** 18.x | MIT | UI |
| **Recharts** 3.x | MIT | 圖表 (V3/V4 sim 視覺化、TwoBar / BoxComparison 等) |
| **lucide-react** 1.x | ISC | Icons |
| **Tailwind CSS** | MIT | Utility CSS |
| **TypeScript** 5.x | Apache-2.0 | 編譯 |
| **react-simple-maps** 3.x | MIT | `/dashboard` US fleet 地圖 |

### 1.3 · CI / Build

| Tool | License | 用途 |
|---|---|---|
| **GitHub Actions** | (platform) | `.github/workflows/check.yml` + `verify.yml` CI gates |
| **actions/checkout@v5** | MIT | repo fetch |
| **actions/setup-node@v5** | MIT | Node.js 環境 |
| **actions/setup-python@v6** | MIT | Python 環境 |

**全部 license 都允許 commercial use + redistribution + modification + private use**,
本 repo 對所有 dependency 的使用方式(`import` / `<script>` / `npm install`)都
在各自 license 範圍內。

---

## 2 · Datasets

### 2.1 · Severson 2019 LFP Cycle Life Dataset

- **來源**:Toyota Research Institute (TRI), <https://data.matr.io/1/projects/5c48dd2bc625d700019f3204>
- **學術 reference**:Severson, K.A., Attia, P.M., et al. *Data-driven prediction of battery cycle life before capacity degradation.* **Nature Energy** 4, 383-391 (2019). DOI:10.1038/s41560-019-0356-8
- **使用方式**:下載 3 batch .mat 檔(2017-05-12 / 2017-06-30 / 2018-04-12,共 ~8 GB,**gitignored**)→ parse 成 Cell objects → 抽取 13-feature Full model → bagged-GBT 訓練得 MAPE 8.38 %
- **License**:**待確認**。TRI 公開時的 specific license terms(可能是 CC-BY-NC / academic / custom)需另行查 data.matr.io 頁面或聯絡 TRI。ATCC 學術競賽用途**多數 license 允許**;**commercial deployment 前需另外取得授權確認**。
- **參考實作**:`packages/battery-twin/data_loaders/severson_parser.py`(我們自寫的 parser,**不是**抄自任何既有 implementation;protocol field name mapping 參考 published documentation in rdbraatz/data-driven-prediction-of-battery-cycle-life on GitHub)

### 2.2 · NASA PCoE Battery Aging Dataset

- **來源**:NASA Ames Prognostics Center of Excellence
- **使用方式**:4 顆 NMC 18650 cell 做 cross-dataset z-distance test
- **License**:NASA 公開資料,屬美國政府作品(17 U.S.C. §105 public domain)
- **參考實作**:`packages/battery-twin/data_loaders/nasa_parser.py`

---

## 3 · Datasheet & 廠商 Technical Documentation(descriptive 引用)

| 文件 | 來源 | 用途 |
|---|---|---|
| **Maxwell BMOD0058-E016-C02 datasheet 3003212.2** | <https://maxwell.com/wp-content/uploads/2021/08/3003212.2_Datasheet_BMOD0058-E016-C02.pdf>(廠商公開 PDF) | V2 LIC RC model 對齊 IPEAK 190 A pulse formula;datasheet 公布規格(CR 58 F / ESR 22 mΩ / IPEAK 190 A / IDCMAX 14-23 ARMS / ILEAK 25 mA / Cth 470 J/°C / Rth 3 °C/W)嵌入 `scripts/eval_lic_rc_fit.py` |
| **Eaton XLR-48-166 LIC Module** | Eaton public product page + datasheet typical | LIC bank anchor (C 332 F / ESR 2.5 mΩ / V_nominal 51.3 V / UVLO 38 V) for `whitepaper.md` §2.3.0 closed-form RC model |
| **STM32F411 / STM32N6 datasheet** | STMicroelectronics public datasheets | descriptive 引用控制板 / NPU 規格 |
| **A123 ANR26650M1-B datasheet** | <https://www.batteryspace.com/prod-specs/6610.pdf>(公開)| LFP cell 化學參考(已退貨,僅 v1.x archive 文件提及) |

引用方式都明文標 datasheet 文件編號 / URL;**屬廠商主動公開資訊的合理使用**。

---

## 4 · Academic Citations(白皮書第九章參考文獻完整列表)

### 4.1 · 電池物理與資料集

| # | Citation |
|---|---|
| 1 | Severson, K.A., Attia, P.M., Jin, N., Perkins, N., Jiang, B., Yang, Z., Chen, M.H., Aykol, M., Herring, P.K., Fraggedakis, D., Bazant, M.Z., Harris, S.J., Chueh, W.C., Braatz, R.D. (2019). *Data-driven prediction of battery cycle life before capacity degradation.* **Nature Energy** 4, 383-391. |
| 2 | Doyle, M., Fuller, T.F., Newman, J. (1993). *Modeling of galvanostatic charge and discharge of the lithium/polymer/insertion cell.* J. Electrochem. Soc. 140 (6), 1526-1533. |
| 3 | Prada, E., Di Domenico, D., Creff, Y., Bernard, J., Sauvant-Moynot, V., Huet, F. (2013). *A simplified electrochemical and thermal aging model of LiFePO4-graphite Li-ion batteries.* J. Electrochem. Soc. 160 (4), A616-A628. |
| 4 | Wang, J., Liu, P., Hicks-Garner, J., et al. (2011). *Cycle-life model for graphite-LiFePO4 cells.* J. Power Sources 196, 3942-3948. |
| 5 | Attia, P.M., Grover, A., Jin, N., et al. (2020). *Closed-loop optimization of fast-charging protocols for batteries with machine learning.* **Nature** 578, 397-402. |

### 4.2 · LIC / Supercapacitor physics

| # | Citation |
|---|---|
| 6 | Naoi, K., Naoi, W., Aoyagi, S., Miyamoto, J., Kamino, T. (2012). *New generation "nanohybrid supercapacitor."* J. Power Sources 196, 3886-3898. |
| 7 | Kötz, R., Carlen, M. (2000). *Principles and applications of electrochemical capacitors.* Electrochim. Acta 45 (15-16), 2483-2498. |
| 8 | Yu, X., et al. (2016). *Pseudocapacitive behavior in lithium-ion capacitors.* Adv. Energy Mater. (relevant volume — see whitepaper.md §2.3.0 for specific issue/page) |

### 4.3 · 機器學習與不確定性量化

| # | Citation |
|---|---|
| 9 | Standard academic references for bagged-GBT (Breiman 1996), MC Dropout (Gal & Ghahramani 2016), Split Conformal (Romano et al. 2019) — listed in whitepaper.md §3.3 |

### 4.4 · 系統與標準(industry context)

| # | Citation |
|---|---|
| 10 | Choukse, E., Buck, I., Alben, J., et al. (Microsoft + NVIDIA, 2025). *Power Stabilization for AI Training Datacenters.* arXiv:2508.14318. — § III utility-level MW/s ramp + 0.1-200 Hz 頻域規範,§ IV-B GB200 GPU-level power smoothing |
| 11 | JLL Year-End 2025 Data Center Report (公開 real estate research)— Texas + Virginia 在建容量數字 |
| 12 | Open Compute Project (OCP) ORV3 spec — 公開機構 spec |

### 4.5 · 工具鏈

| # | Citation |
|---|---|
| 13 | Sulzer, V., Marquis, S.G., Timms, R., Robinson, M., Chapman, S.J. (2021). *Python Battery Mathematical Modelling (PyBaMM).* **J. Open Research Software** 9, 14. (引用 PyBaMM 學術形式) |

---

## 5 · Trademarks(descriptive nominative fair use)

本 repo 提及以下商標,皆屬 **nominative fair use**(指涉該方產品 / 技術 / 文獻,
不暗示背書 / 合作 / 官方授權):

### 5.1 · 客戶端 / 應用情境

- **NVIDIA®, GB200™, GB300™, NVL72™, CUDA®, Bluefield®, Neural-ART™** —
  屬 NVIDIA Corporation 商標。本 repo 為 BBU 產品概念,**對 NVIDIA 產品的提及純為
  client-side 機房應用情境描述**,沒實作 NVIDIA proprietary SDK,沒用 NVIDIA logo,
  沒暗示官方合作。
- **GB200 NVL72 / GB300** — NVIDIA 公開的 rack-scale GPU 系統名稱

### 5.2 · 競品(BBU / UPS 廠商)

- **Eaton®, XLR-48-166™** — Eaton Corporation 商標
- **Vertiv®, Liebert®** — Vertiv Holdings 商標
- **Schneider Electric®, Galaxy VS™, EcoStruxure®** — Schneider Electric S.E. 商標
- **Maxwell Technologies®, BMOD0058®** — Maxwell Technologies / UCAP Power 商標
- **Lithium Werks®, A123®, ANR26650™** — Lithium Werks / 原 A123 Systems 商標

### 5.3 · 元件 / 工具

- **STMicroelectronics®, STM32®, STM32F411™, STM32N6™, X-CUBE-AI®, Neural-ART™** — STMicroelectronics 商標
- **Raspberry Pi®** — Raspberry Pi Foundation 商標
- **Infineon®, IRFB4115™** — Infineon Technologies 商標
- **Texas Instruments®, UCC27282™, INA228™** — Texas Instruments 商標
- **Adafruit®** — Adafruit Industries 商標

### 5.4 · 機構 / 競賽 / 贊助

- **ATCC**(全國大專院校行銷企劃競賽)— 主辦單位商標
- **Sysgration® / 系統電工業** — Sysgration Ltd. 商標,本 repo 是 ATCC 第 23 屆 C13
  系統電 議題的學生參賽作品,使用 Sysgration 名稱屬競賽 sponsor context
- **Toyota Research Institute (TRI)** — Severson 公開資料集贊助方
- **NASA® / NASA Ames PCoE** — NASA 公開資料集

**所有商標屬其各自所有人**。本 repo 為 ATCC 學生競賽作品,所有商標使用均為
descriptive nominative use,**不暗示任何官方背書、認證、合作關係**。

---

## 6 · 不在 NOTICE 範圍

| 項目 | 為什麼不列 |
|---|---|
| ~~`scripts/jkbms.py`~~ | 2026-05-27 隨硬體退貨同步刪除;原為 community-reverse-engineered JK-BMS RS485 protocol,**已不在 repo** |
| ~~`scripts/live_demonstrator_bridge.py`~~ | 同上;只 import deleted jkbms.py + atomic_json.py |
| ~~`scripts/eload_gb200_profile.py`~~ | 同上;ATORCH DL24M PX100 protocol implementation 已刪 |
| ~~`scripts/atomic_json.py`~~ | 同上;只被已刪 bridge 用 |

---

## 7 · 對律師 review 的請求

本檔列出本 repo 涉及第三方 IP / 商標 / 開源依賴的**全部清單**。

請優先 review:
1. § 1 開源依賴 license 是否漏列(尤其 transitive dependencies via `pnpm-lock.yaml` 與 `pyproject.toml` 的 lock 變化)
2. § 2.1 Severson dataset 的 specific license 條款(需要顧問建議是否要寫信給 TRI)
3. § 5.1 NVIDIA 商標使用 wording 是否需要進一步保守化

對應**詳細風險評估 + 緩解建議**見 [`docs/IP_AUDIT.md`](docs/IP_AUDIT.md)。
