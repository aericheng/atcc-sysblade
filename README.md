# Sysblade HyperBuffer — SaaS Platform

ATCC 第二十三屆全國大專院校行銷企劃競賽 · 議題 C13(系統電/電統能源)
Sysblade HyperBuffer™ — AI 機房混合能量緩衝 BBU × 智能維運平台

**Live demo**: <https://sysblade-atcc.vercel.app>

## 倉儲結構

```
atcc/
├── docs/                         企劃書 PDF + 衍生資料
├── apps/
│   └── web/                      Next.js 14 三件套整合 SaaS demo
│        └── src/app/
│             ├── (landing)/      首頁
│             ├── twin/           Battery Digital Twin
│             ├── tco/            TCO Calculator
│             └── dashboard/      Fleet Health Dashboard
├── packages/
│   ├── battery-twin/             Python pkg: PyBaMM + LSTM + data loaders
│   │   ├── pybamm_sim/
│   │   ├── lstm_rul/
│   │   └── data_loaders/
│   └── shared/                   PyBaMM 預跑場景 JSON(/twin/dashboard 讀)
├── notebooks/                    訓練、評估、視覺化
├── data/                         raw/ + processed/(.gitignore)
└── scripts/                      場景生成、資料下載
```

> 企劃書原本提的 `apps/twin-api`、`apps/dashboard` 等多 app 拆分,實作上合併成單一
> `apps/web` Next.js 應用。預先計算的場景 JSON 取代了即時 FastAPI 後端 —
> 簡化部署,符合 W1-W2 demo 範圍。

## 軟體三件套

| 路由 | 內容 | 狀態 |
|---|---|---|
| `/` | 首頁 + 4 張頭條卡 | ✅ 已部署 |
| `/twin` | LFP+LIC 物理模擬 + SOH 退化曲線 | ✅ 已部署 |
| `/tco` | 互動式 10 年 TCO Calculator | ✅ 已部署 |
| `/dashboard` | 1000 台機隊 + 美國地圖 + 三層服務 | ✅ 已部署 |

## Quick start

```bash
# 1. Python 環境(PyBaMM + LSTM + parser)
python -m uv venv .venv --python 3.11
.venv/Scripts/activate                       # Windows bash
python -m uv pip install -e "packages/battery-twin[dev,api]"

# 2. 重生 4 個場景 JSON
python scripts/generate_twin_scenarios.py

# 3. Web app(Node 20+, pnpm)
cd apps/web
pnpm install
pnpm dev                                     # → http://localhost:3000
```

Severson 訓練資料下載見 `docs/severson_download.md`(~6 GB,需要手動點)。

## 部署

`apps/web/` 由 Vercel 自動部署(`main` push 觸發 build)。詳細 SOP 見 `DEPLOY.md`。

## 關鍵約束(v2.1 企劃書承諾,不可違反)

- Battery Twin MAPE 目標 < 10%(對標 Severson 2019 9.1%);**未上實機資料前不承諾 < 5%**
- Dashboard 必須標註「Simulated Data」浮水印
- LFP 配置 15S(3.2V × 15 = 48V),非 13S
- LIC 配置 2× Eaton XLR 200F/48V(過配為刻意設計)
- 雲端訓練、邊緣推論(STM32N6 ONNX 路徑)、OTA 權重更新

## 競賽時程

- 初賽企劃書繳交:2026/05/05
- 決賽演示:約 7 月底(待官方公告)
