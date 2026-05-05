# Sysblade HyperBuffer

> **AI 機房混合 BBU + 嵌入式電池數位孿生 SaaS** · ATCC 第二十三屆全國大專院校行銷企劃競賽 · 議題 C13(系統電 Sysgration)

[**🎬 Live demo**](https://sysblade-atcc.vercel.app) · [**📄 企劃書 v2.1**](docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf) · [**📘 技術白皮書**](docs/whitepaper.md) · [**📕 精煉版**](docs/whitepaper_restructured.md)

---

## TL;DR

針對**北美 Tier-2/3 AI 機房 BBU 市場**的軟硬整合方案 ——
**LFP + 鋰離子電容(LIC)混合 BBU** 搭配 **Battery Digital Twin SaaS**,一次解掉:

- 🔋 **GB200 毫秒級電壓瞬態** — 純電池 BBU 撐不住 50–200 ms 壓降造成下游 PSU 重啟
- 🔌 **48 V → ±400 V HVDC 過渡** — Vertiv 等只賣 48 V,客戶 2027 後須 forklift 換代
- 📊 **1000+ 節 fleet 維運** — 人工巡檢 hit-rate 低,業界無公開 SaaS 提供 BBU-level RUL

**6 個關鍵數字**:5.7× 功率波動下降 · ~25 % LFP 壽命延長 · 33 % 客戶 10 年 TCO 下降 · 60 sec graceful @ 120 kW peak · 8.38 % RUL 預測 MAPE · 3.49× INT8 量化壓縮(完整推導見[白皮書](docs/whitepaper.md))。

> **Status**:ATCC 2026 初賽提交版。本 repo 公開展示供競賽評審與學術透明
> 使用,授權詳見 [LICENSE](LICENSE)。儀表板與孿生情境中的客戶 / 機房名稱
> **全為示意 persona**,非實際部署資料(`fleet_devices.json` 的 disclaimer
> 欄位 + UI 上 SIMULATED DATA 浮水印雙重標註)。

---

## 軟體三件套

| 路由 | 功能 | 突出技術 |
|---|---|---|
| [`/`](https://sysblade-atcc.vercel.app/) | 首頁 — 5 張頭條卡 + 板塊導引 | 從 scenario JSON 動態取真實量測值 |
| [`/twin`](https://sysblade-atcc.vercel.app/twin) | Battery Digital Twin | PyBaMM DFN(Prada2013 LFP)+ LSTM RUL + 90 % MC-Dropout PI 經 split conformal 縮窄 44 % + 示波器掃描動畫 |
| [`/tco`](https://sysblade-atcc.vercel.app/tco) | 10 年 TCO 計算器 | 4 個 slider × 3 個 preset · 純 HTML/Tailwind bar chart |
| [`/dashboard`](https://sysblade-atcc.vercel.app/dashboard) | 1000 台機隊 Fleet Dashboard | US fleet map + 三層服務分層 + per-device drilldown(SOH / RUL / 熱 / 操作層 metrics)· 全頁 SIMULATED DATA 浮水印 |

![Sysblade architecture](docs/figures/architecture.png)

---

## 架構(關鍵設計決策)

**Python 物理引擎離線預跑 → JSON → Next.js build-time `fs.readFile` → static export → Vercel CDN**。

```
PyBaMM DFN simulation (Python)            scenario JSONs in two sinks:
scripts/generate_twin_scenarios.py    ─►  ├ packages/shared/scenarios/
scripts/export_lstm_onnx.py               └ apps/web/public/scenarios/
                                                      │
                                                      │ fs.readFile (build time only)
                                                      ▼
                                          apps/web Server Components
                                            → next build (static export)
                                              → out/ → Vercel CDN
```

---

## Quick start

```bash
# 1. Web app
cd apps/web && pnpm install
pnpm dev                                      # → http://localhost:3000

# 2. Python 環境(可選 — 跑 PyBaMM / LSTM 訓練才需要)
python -m uv venv .venv --python 3.11
.venv/Scripts/activate                        # Windows bash
python -m uv pip install -e "packages/battery-twin[dev,api]"

# 3. 重生 4 個場景 JSON(改 physics constants 後;雙寫到兩個 sink)
pnpm scenarios                                # = scripts/generate_twin_scenarios.py

# 4. 數字 cross-check gate(CI 上自動跑)
pnpm check:numbers                            # = scripts/check_whitepaper_numbers.py

# 5. Web app 完整檢查 + build
cd apps/web && pnpm check                     # typecheck + lint + check:numbers
pnpm build                                    # 推 main 之前先跑這條
```

Severson .mat v7.3 訓練資料(8.3 GB)需手動下載,流程見 [`docs/severson_download.md`](docs/severson_download.md);
資料夾 `data/raw/` 與 `data/processed/` 均 `.gitignore`(只 commit `.gitkeep` 與 4 個 derived JSON 給 number-checker 驗證)。

<details>
<summary><b>更多 reproducibility commands</b>(LSTM 重訓 / 全 sweep / INT8 量化 / cross-dataset / NPU 靜態分析)</summary>

```bash
# 重訓 LSTM + 匯出 ONNX(~3 min CPU)
python scripts/export_lstm_onnx.py            # → apps/web/public/scenarios/model_validation.json

# OLS / GBT / bagged-* 全 sweep(模型卡那張表)
python scripts/eval_severson_models.py        # → data/processed/severson_model_eval.json

# INT8 動態量化驗證(白皮書附錄 C.5,~ 30 s)
python scripts/quantize_lstm_onnx.py          # → data/processed/lstm_quantization_report.json

# Cross-dataset(Severson → NASA NMC)跨化學測試
python scripts/eval_cross_dataset.py          # → data/processed/cross_dataset_mape.json

# STM32N6 NPU 靜態 graph 分析
python scripts/onnx_static_analysis.py        # → data/processed/x_cube_ai_static_analysis.json
```

</details>

---

## 模型卡

兩條 RUL 預測管線並行,**「one model, two views」**:`/twin` Inference Walkthrough
與 `/dashboard` 1000 台 fleet RUL 共用同一個 LSTM 推論輸出,確保兩頁面數字一致。

### Severson cycle-life regression(隨機 split,10-seed median)

| 模型 | Random split MAPE | Cross-batch MAPE | R² | 備註 |
|---|---:|---:|---:|---|
| Variance OLS(1-feat / unfilt) | 17.9 % | 15.8 % | 0.57 | 重現 Severson 2019 paper 頭條 |
| Discharge OLS(5-feat) | 17.5 % | 19.9 % | 0.53 | paper Table 1 5-feat |
| Full + IR OLS(13-feat) | 14.5 % | 14.5 % | +0.08 | 加 internal-resistance,**cross-batch R² 由負轉正** |
| **Full + IR bagged-GBT(K=24, xstrict ≥400, n=134)** | **8.38 %** | 17.9 %(GBT 退化) | **0.89** | **首次達 v2.1 附件 B 軟體技術棧 < 10 % 承諾**;per-seed [5.93, 12.91],7/10 seeds < 10 % |
| **Full + IR bagged-OLS(13-feat / xstrict)** | 12.4 % | **13.9 %** | +0.21 | cross-batch generalisation 最佳 |

**達標**:bagged-GBT + xstrict cell filter 把 random-split median MAPE 從 14.51 % 拉到 **8.38 %**。
跨 protocol 部署改用 bagged-OLS(13.87 %),GBT 在 cross-batch 因 protocol-specific 過擬合退化。

### LSTM(augmented,跨兩個 regime)

| 項目 | 值 | 備註 |
|---|---:|---|
| 訓練 cell 數 | **188** | 138 Severson 2019 fast-charge + 50 PyBaMM-calibrated BBU-duty |
| Test MAPE(隨機 split) | **19.1 %** | Severson-only baseline → augment 後 span 雙 regime |
| Test R² | **0.86** | 跨 regime trade-off 後仍維持高解釋度 |
| ONNX size | FP32 219 KiB → **INT8 63 KiB(3.49× 壓縮 measured)** | 遠小於 STM32N6 1.6 MB ML FLASH;`scripts/quantize_lstm_onnx.py` 量測 |
| INT8 精度退化 | **ΔMAPE +0.10 pp**(19.10 → 19.20 %),R² 不變 | 平均預測偏移 0.57 %,STM32N6 部署的 go/no-go 證據 |
| ONNX 延遲(laptop CPU p99) | FP32 0.44 ms / INT8 0.40 ms | 50 ms 規格達標 ~125×;STM32N6 NPU 推估 27–109 µs(靜態 graph 分析,`scripts/onnx_static_analysis.py`)|
| 不確定性方法 | MC Dropout + split conformal | 100 forward passes,**raw 1910 → conformal 1075 cycles**(縮窄 44 %),test coverage 100 %、≥ 90 % 保證,校準集 37 cells held-out |

LSTM 為 production 推論主力;bagged-GBT 13-feat 為「Severson paper 對齊」的學術 baseline(< 10 % 承諾達標)。
**MAPE 上升是 regime gap closure 的取捨**,完整論述見白皮書 [§3.3.5](docs/whitepaper.md)。

---

## 倉儲結構

<details>
<summary><b>展開檔案樹</b></summary>

```
atcc/
├── docs/
│   ├── Sysblade_HyperBuffer_Proposal_v2.1.pdf   競賽繳交文件(spec)
│   ├── whitepaper.md                            技術白皮書 v1.0(完整版)
│   ├── whitepaper_restructured.md               精煉版(三段式)
│   ├── severson_download.md                     Severson 2019 .mat v7.3 下載 SOP
│   ├── x_cube_ai_install_sop.md                 STM32N6 X-CUBE-AI 安裝 SOP
│   └── figures/                                 架構圖 + 截圖 + 業務模型 canvas
├── apps/
│   └── web/                                     Next.js 14 三件套(static export)
│       ├── src/app/
│       │   ├── page.tsx                          /
│       │   ├── twin/page.tsx + twin-client.tsx   /twin
│       │   ├── tco/page.tsx + tco-client.tsx     /tco
│       │   └── dashboard/page.tsx + ...          /dashboard
│       ├── public/scenarios/                     PyBaMM 預跑 JSON(build-time 讀)
│       └── src/lib/{tco.ts, types.ts}            TCO 公式 + Device 型別
├── packages/
│   ├── battery-twin/                             Python: physics + ML
│   │   ├── lstm_rul/                             PyTorch LSTM + linear baseline
│   │   └── data_loaders/                         Severson + NASA + CALCE 解析器
│   └── shared/scenarios/                         JSON 雙寫 sink #2
├── notebooks/                                    EDA + 訓練 smoke test
├── scripts/
│   ├── generate_twin_scenarios.py                4 個 PyBaMM 場景 + 1000-device fleet
│   ├── generate_bbu_duty_cells.py                50 顆 PyBaMM-calibrated BBU duty 合成 cell
│   ├── export_lstm_onnx.py                       訓練 LSTM + ONNX export + MC Dropout + split conformal
│   ├── eval_severson_models.py                   OLS / bagged-OLS / GBT / bagged-GBT / HistGBT / stack 全 sweep
│   ├── eval_cross_dataset.py                     Severson → NASA NMC 跨化學測試
│   ├── quantize_lstm_onnx.py                     INT8 動態量化 + accuracy 退化 + CPU latency 量測
│   ├── onnx_static_analysis.py                   STM32N6 NPU 靜態 graph 分析
│   └── check_whitepaper_numbers.py               whitepaper / README 數字 cross-check gate
├── data/raw/  data/processed/                    .gitignore(>8 GB;只 commit derived JSON 給 CI)
└── DEPLOY.md
```

</details>

---

## 部署

`apps/web/` 由 Vercel 自動部署(`main` push 觸發 build)。

- **build command**:`npm install --legacy-peer-deps && next build`(避開 pnpm 9 + Node 22 的 `ERR_INVALID_THIS` URLSearchParams bug,見 `vercel.json`)
- **output**:`output: "export"` 純靜態,丟 Vercel CDN
- **rollback**:Vercel dashboard 一鍵退回上一個 commit

完整 SOP 見 [`DEPLOY.md`](DEPLOY.md)。

---

## 文件

| 文件 | 用途 |
|---|---|
| [`docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf`](docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf) | **競賽企劃書 v2.1** — 所有 demo 數字必須對齊的 spec |
| [`docs/whitepaper.md`](docs/whitepaper.md) | 技術白皮書 v1.0 — 完整證據 + 局限討論 |
| [`docs/whitepaper_restructured.md`](docs/whitepaper_restructured.md) | 精煉版(Part 1 速覽 / Part 2 細節 / Part 3 競品)|
| [`DEPLOY.md`](DEPLOY.md) | Vercel CLI + GitHub-import 部署 SOP |
| [`docs/severson_download.md`](docs/severson_download.md) | Severson 2019 三層下載備援 SOP |
| [`docs/x_cube_ai_install_sop.md`](docs/x_cube_ai_install_sop.md) | STM32N6 X-CUBE-AI 安裝 SOP |

---

## 競賽硬規定(v2.1 企劃書承諾,不可違反)

- ✅ Battery Twin MAPE 目標 < 10 %,**未上實機資料前不承諾 < 5 %**(v2.1 附件 B 明文)
- ✅ Dashboard 必標 **SIMULATED DATA** 浮水印(`globals.css` `.simulated-watermark`)
- ✅ LFP 配置 **15S**(3.2 V × 15 = 48 V),非 13S
- ✅ LIC 配置 **2× Eaton XLR-48-166 並聯**(48.6 V / 166 F / 54 Wh / ESR 5 mΩ,per Eaton XLR-48R6167-R datasheet)
- ✅ Tier-3 入隊規則:`status === "early_aging"`(`SOH < 0.85` OR `RUL < 800`)— UI / fleet generator 共用同一條規則
- ✅ 雲端訓練、邊緣推論(STM32N6 ONNX 路徑)、OTA 權重更新

---

## 致謝

- **Severson, K.A. et al. (2019)** *Nature Energy* **4**, 383–391 — 124-cell LFP fast-charge 公開資料集
- **Sulzer, V. et al. (2021)** *Journal of Open Research Software* **9**, 14 — PyBaMM(Doyle-Fuller-Newman PDE 求解器)
- **Prada, E. et al. (2013)** *J. Electrochem. Soc.* **160**, A616–A628 — 本案採用之 LFP-graphite DFN 參數集
- **Choukse, E., Buck, I., Alben, J. et al.** (Microsoft + NVIDIA, 2025), arXiv:2508.14318 — Power Stabilization for AI Training Datacenters(GB200 power-swing context;§2.3.2 worst-case 10 C × 30 ms 脈衝為團隊依本文 per-cell 下尺度推導)
- **JLL Research, Year-End 2025 Report** — 北美 colo 機房在建容量基準(v2.1 §C.1 引述 Texas 18.6 % / Virginia 15 %;本 fleet 1000 台模擬以 AI 機房密度加權放大為 Texas 49 % / Virginia 27 %,**模擬假設,非 JLL 直接數字**)
- **系統電股份有限公司(Sysgration TWSE 6312)** — ATCC C13 議題出題單位

---

## 競賽時程

- **初賽企劃書 + 簡報繳交**:2026-05-05
- **初賽結果公告**:2026-06 中
- **決賽演示**:約 2026-07 末(待官方公告)
