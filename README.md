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
| [`/twin`](https://sysblade-atcc.vercel.app/twin) | Battery Digital Twin | PyBaMM DFN(Prada2013 LFP)+ LSTM RUL + 90 % MC-Dropout PI + 示波器掃描動畫 |
| [`/tco`](https://sysblade-atcc.vercel.app/tco) | 10 年 TCO 計算器 | 4 個 slider × 3 個 preset · 純 HTML/Tailwind bar chart(避開 recharts loop) |
| [`/dashboard`](https://sysblade-atcc.vercel.app/dashboard) | 1000 台機隊 Fleet Dashboard | US fleet map + Tier-1/2/3 服務分層 · 全頁標 SIMULATED DATA 浮水印 |

---

## 模型卡

兩條 RUL 預測管線並行,各自有強項。**「one model, two views」** 政策:`/twin` Inference Walkthrough
與 `/dashboard` 1000 台 fleet RUL 共用同一個 LSTM 推論輸出,確保兩頁面數字一致。

### OLS baseline(隨機 split,10-seed median)

| 模型 | 特徵數 | Random split MAPE | Cross-batch MAPE | R² | 備註 |
|---|---:|---:|---:|---:|---|
| Variance | 1 | 16.4 % | 15.8 % | 0.66 | 重現 Severson 2019 paper 頭條 |
| Discharge | 5 | 17.6 % | 19.9 % | 0.70 | paper Table 1 5-feat |
| Full(無 IR) | 9 | 12.6 % | 19.9 % | 0.73 | 加 thermal + late-fade slope |
| **Full + IR** | **13** | **14.5 %** | **14.5 %** | **+0.08** | 加 internal-resistance feature,**cross-batch R² 由負轉正** |

加 IR(protocol-invariant feature)後 cross-batch 準度大幅改善 — 這是跨 batch 部署
最重要的訊號。**未達 v2.1 < 10 % 承諾(差約 4–5 pp)**,W3 計畫補:更嚴 cell filter + ensemble。

### LSTM(augmented,跨兩個 regime)

| 項目 | 值 | 備註 |
|---|---:|---|
| 訓練 cell 數 | **188** | 138 Severson 2019 fast-charge + 50 PyBaMM-calibrated BBU-duty |
| Test MAPE(隨機 split) | 22.5 % | Severson-only baseline 16 % → augment 後因 BBU regime 加入而上升 |
| Test R² | 0.93 | 加入 BBU regime 後從 0.70 跳上來(覆蓋變廣是主要收益) |
| ONNX 模型大小 | 8.2 KiB | 對齊 STM32N6 Flash 預算 |
| ONNX 延遲 (laptop CPU p99) | **0.27 ms** | 50 ms 規格達標 ~185×;STM32N6 NPU 推估 ≈5 ms |
| 不確定性方法 | MC Dropout | 100 forward passes · 90 % PI · test coverage 100 %(over-cover,W3 conformal 校準) |

LSTM 是 production 推論用(/twin walkthrough + /dashboard fleet),OLS 13-feat 是
**「跨 batch 可遷移性」的證據**。MAPE 的 16→22 % 上升是 **regime gap closure trade-off**,
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
│   ├── export_lstm_onnx.py                       訓練 LSTM + ONNX export + MC Dropout
│   ├── run_severson_baselines.py                 OLS 1/5/9-feature 三段比較
│   └── eval_cross_dataset.py                     Severson → NASA NMC 跨化學測試
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

# 4. OLS baselines(可選,跑出 §3.3.3 那張表)
python scripts/run_severson_baselines.py

# 5. Web app
cd apps/web && pnpm install
pnpm dev                                      # → http://localhost:3000
pnpm typecheck && pnpm lint && pnpm build     # 推 main 之前先跑這條
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
