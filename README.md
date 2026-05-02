# Sysblade HyperBuffer — AI 機房混合 BBU + 數位孿生 SaaS

> ATCC 第二十三屆全國大專院校行銷企劃競賽 · 議題 C13(系統電 / 電統能源)

LFP + 鋰離子電容(LIC)混合電池備援單元(BBU),搭配嵌入式電池數位孿生 + 邊緣 RUL 推論,
鎖定北美 Tier-2/3 AI 機房面臨的**毫秒級電壓瞬態 + 48 V→±400 V HVDC 過渡 + 維運可視化**
三個沒被整合過的痛點。

**Live demo**: <https://sysblade-atcc.vercel.app>
**企劃書**: [`docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf`](docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf)
**技術白皮書**: [`docs/whitepaper.md`](docs/whitepaper.md)
**簡報導覽**: [`PRESENTATION_GUIDE.md`](PRESENTATION_GUIDE.md)

---

## 軟體三件套

| 路由 | 內容 | 突出技術 |
|---|---|---|
| `/` | 首頁 — 5 張頭條卡 + 板塊導引 | 從場景 JSON 動態取真實量測值 |
| [`/twin`](https://sysblade-atcc.vercel.app/twin) | Battery Digital Twin | PyBaMM DFN(Prada2013 LFP)+ LSTM RUL + 90 % MC-Dropout PI 經 split conformal 縮窄 44 % + 示波器掃描動畫 |
| [`/tco`](https://sysblade-atcc.vercel.app/tco) | 10 年 TCO 計算器 | 4 個 slider × 3 個 preset · 純 HTML/Tailwind bar chart(避開 recharts loop) |
| [`/dashboard`](https://sysblade-atcc.vercel.app/dashboard) | 1000 台機隊 Fleet Dashboard | US fleet map + Tier-1/2/3 服務分層 · 全頁標 SIMULATED DATA 浮水印 |

---

## 模型卡

兩條 RUL 預測管線並行,各自有強項。**「one model, two views」** 政策:`/twin` Inference Walkthrough
與 `/dashboard` 1000 台 fleet RUL 共用同一個 LSTM 推論輸出,確保兩頁面數字一致。

### Severson cycle-life regression(隨機 split,10-seed median)

| 模型 | 特徵數 / Filter | Random split MAPE | Cross-batch MAPE | R² | 備註 |
|---|---|---:|---:|---:|---|
| Variance OLS | 1-feat / unfilt | 17.9 % | 15.8 % | 0.57 | 重現 Severson 2019 paper 頭條 |
| Discharge OLS | 5-feat / unfilt | 17.5 % | 19.9 % | 0.53 | paper Table 1 5-feat |
| Full + IR OLS | 13-feat / unfilt | 14.5 % | 14.5 % | +0.08 | 加 internal-resistance,**cross-batch R² 由負轉正** |
| **Full + IR bagged-GBT (K=24)** | **13-feat / xstrict (≥400, n=134)** | **8.4 %** | 17.9 %(GBT 退化) | **0.89** | **首次達 v2.1 §B 的 < 10 % 承諾**;per-seed [5.93, 12.91],6/10 < 10 % |
| **Full + IR bagged-OLS** | **13-feat / xstrict** | 12.4 % | **13.9 %** | +0.21 | cross-batch generalisation 最佳 |

**達標**:bagged-GBT + xstrict cell filter 把 random-split median MAPE 從 14.51 % 拉到 **8.38 %**。
跨 protocol 部署改用 bagged-OLS(13.87 %),GBT 在 cross-batch 因 protocol-specific 過擬合退化。

### LSTM(augmented,跨兩個 regime)

| 項目 | 值 | 備註 |
|---|---:|---|
| 訓練 cell 數 | **188** | 138 Severson 2019 fast-charge + 50 PyBaMM-calibrated BBU-duty |
| Test MAPE(隨機 split) | **19.1 %** | Severson-only baseline → augment 後 span 雙 regime |
| Test R² | **0.86** | 跨 regime trade-off 後仍維持高解釋度 |
| ONNX 模型大小 | FP32 219 KiB → **INT8 63 KiB(3.49× 壓縮 measured)** | 遠小於 STM32N6 1.6 MB ML FLASH;`scripts/quantize_lstm_onnx.py` 量測 |
| INT8 量化精度退化 | **ΔMAPE +0.10 pp**(19.10 → 19.20 %),R² 不變 | 平均預測偏移 0.57 %,STM32N6 部署的 go/no-go 證據 |
| ONNX 延遲 (laptop CPU p99) | FP32 **0.44 ms** / INT8 **0.40 ms** | 50 ms 規格達標 ~125×;STM32N6 NPU 推估 ≤5 ms(SOP `docs/x_cube_ai_install_sop.md` 待真機 trace) |
| 不確定性方法 | MC Dropout + split conformal | 100 forward passes,共形 q_factor 0.56,**raw 1910 → conformal 1075 cycles 的中位數 PI(縮窄 44 %)**,test coverage 100 % ≥ 90 % 保證 · 校準集 37 cells held-out |

LSTM 是 production 推論用(/twin walkthrough + /dashboard fleet),bagged-GBT 13-feat 是
**「Severson paper 對齊」的學術 baseline**(< 10 % 承諾達標)。MAPE 上升是 **regime gap closure trade-off**,
詳見白皮書 §3.3.5。

---

## 倉儲結構

```
atcc/
├── docs/
│   ├── Sysblade_HyperBuffer_Proposal_v2.1.pdf   競賽繳交文件(spec)
│   ├── whitepaper.md                            技術白皮書 v1.0
│   └── severson_download.md                     Severson 2019 .mat v7.3 下載 SOP
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
│   │   ├── pybamm_sim/                           PyBaMM DFN 封裝
│   │   ├── lstm_rul/                             PyTorch LSTM + linear baseline
│   │   └── data_loaders/                         Severson + NASA + CALCE 解析器
│   └── shared/scenarios/                         JSON 雙寫 sink #2
├── notebooks/                                    EDA + 訓練 + cross-dataset eval
├── scripts/
│   ├── generate_twin_scenarios.py                4 個 PyBaMM 場景 + 1000-device fleet
│   ├── generate_bbu_duty_cells.py                50 顆 PyBaMM-calibrated BBU duty 合成 cell
│   ├── export_lstm_onnx.py                       訓練 LSTM + ONNX export + MC Dropout + split conformal
│   ├── eval_severson_models.py                   OLS / bagged-OLS / GBT / bagged-GBT / HistGBT / stack 全 sweep,§3.3.3 結果 → JSON
│   ├── eval_cross_dataset.py                     Severson → NASA NMC 跨化學測試
│   ├── quantize_lstm_onnx.py                     INT8 動態量化 + accuracy 退化 + CPU latency 量測
│   ├── onnx_static_analysis.py                   STM32N6 NPU 靜態 graph 分析(自動 merge INT8 量測報告)
│   └── check_whitepaper_numbers.py               whitepaper / README / PRESENTATION_GUIDE 數字 cross-check gate
├── data/raw/  data/processed/                    .gitignore(>8 GB)
└── project guidance  DEPLOY.md  PRESENTATION_GUIDE.md
```

---

## 資料流(關鍵架構決策)

這是 **「Python 物理引擎離線預跑 → JSON → Next.js build-time fs.readFile → static export → Vercel CDN」**。
不是 live SaaS,是 ATCC 競賽 demo 的最佳化路徑。

```
PyBaMM DFN simulation (Python)            scenario JSONs in two sinks:
scripts/generate_twin_scenarios.py    ─►  ├ packages/shared/scenarios/
scripts/export_lstm_onnx.py               └ apps/web/public/scenarios/
                                                      │
                                                      │ fs.readFile (build time only)
                                                      ▼
                                          apps/web Server Components
                                            → next build (static export)
                                              → out/  → Vercel CDN
```

**為什麼不放 FastAPI 後端**?競賽 demo 優先穩定 + 低延遲;PyBaMM 體積大不適合 client side。
W3+ 路線圖(白皮書 §8)會把 FastAPI 接回來做即時推論。

---

## Quick start

```bash
# 1. Python 環境(uv 推薦,Python 3.11 pinned)
python -m uv venv .venv --python 3.11
.venv/Scripts/activate                        # Windows bash
python -m uv pip install -e "packages/battery-twin[dev,api]"

# 2. 重生 4 個場景 JSON(改 physics constants 後跑;雙寫到兩個 sink)
pnpm scenarios                                # = python scripts/generate_twin_scenarios.py

# 3. 重訓 LSTM + 匯出 ONNX(可選;~3 min CPU)
python scripts/export_lstm_onnx.py            # → apps/web/public/scenarios/model_validation.json

# 4. OLS / GBT 全 sweep(可選,跑出 §3.3.3 那張表)
python scripts/eval_severson_models.py        # → data/processed/severson_model_eval.json

# 4b. INT8 量化驗證(附錄 C.5 那張表,~ 30 s)
python scripts/quantize_lstm_onnx.py          # → data/processed/lstm_quantization_report.json

# 5. Whitepaper / docs 數字 cross-check gate
pnpm check:numbers                            # = python scripts/check_whitepaper_numbers.py

# 6. Web app
cd apps/web && pnpm install
pnpm dev                                      # → http://localhost:3000
pnpm check                                    # typecheck + lint + check:numbers
pnpm build                                    # 推 main 之前先跑這條
```

Severson .mat v7.3 訓練資料(8.3 GB)需要手動下載,流程見 [`docs/severson_download.md`](docs/severson_download.md)。
資料夾在 `data/raw/` 跟 `data/processed/`,均 `.gitignore`(只 commit `.gitkeep`)。

---

## 部署

`apps/web/` 由 Vercel 自動部署(`main` push 觸發 build)。

- **build command**:`npm install --legacy-peer-deps && next build`(避開 pnpm 9 + Node 22 的 fetch bug,見 `vercel.json`)
- **output**:`output: "export"` 純靜態,丟 Vercel CDN
- **rollback**:Vercel dashboard 一鍵退回上一個 commit

詳細 SOP 見 [`DEPLOY.md`](DEPLOY.md)。

---

## 競賽硬規定(v2.1 企劃書承諾,不可違反)

- ✅ Battery Twin MAPE 目標 < 10 %,**未上實機資料前不承諾 < 5 %**(v2.1 附件 B 明文)
- ✅ Dashboard 必須標註「**Simulated Data**」浮水印(見 `globals.css` `.simulated-watermark`)
- ✅ LFP 配置 **15S**(3.2 V × 15 = 48 V),非 13S
- ✅ LIC 配置 2× Eaton XLR 200F / 48 V(過配 69× 是刻意設計,白皮書 §2 說明)
- ✅ 雲端訓練、邊緣推論(STM32N6 ONNX 路徑)、OTA 權重更新
- ✅ Tier-3 入隊規則:`status === "early_aging"`(`SOH < 0.85` 或 `RUL < 800`)— 全 UI / fleet generator 共用同一條規則

---

## 文件連結

| 文件 | 用途 |
|---|---|
| [`docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf`](docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf) | **競賽繳交版本(spec)**,所有 demo 的數字必須對齊 |
| [`docs/whitepaper.md`](docs/whitepaper.md) | 技術白皮書 v1.0 — 完整證據 + 局限討論 |
| [`PRESENTATION_GUIDE.md`](PRESENTATION_GUIDE.md) | 5 分鐘 demo 腳本 + 業師可能問的問題 |
| [`project guidance`](project guidance) | 給 AI assistant 的工作指引(架構約束 + house rules) |
| [`DEPLOY.md`](DEPLOY.md) | Vercel CLI + GitHub-import 部署 SOP |
| [`docs/severson_download.md`](docs/severson_download.md) | Severson 2019 三層下載備援 SOP |

---

## 競賽時程

- **初賽企劃書 + 簡報繳交**:2026/05/05
- **初賽結果公告**:2026/06 中
- **決賽演示**:約 2026/07 末(待官方公告)

---

## 致謝

- **Severson, K.A. et al. (2019)** *Nature Energy* 4, 383–391 — 124-cell LFP fast-charge 公開資料集
- **PyBaMM** — Doyle-Fuller-Newman PDE 求解器
- **Microsoft Azure (arXiv 2508.14318)** — GB200 ±30 % power transient 量測公開
- **JLL Year-End 2025** — 北美 colo 機房地理權重(Texas 49 %、Virginia 27 %)
- 系統電股份有限公司(Sysgration) — ATCC C13 議題出題單位
