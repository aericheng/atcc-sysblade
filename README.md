# Sysblade HyperBuffer — SaaS Platform

ATCC 第二十三屆全國大專院校行銷企劃競賽 · 議題 C13(系統電/電統能源)
Sysblade HyperBuffer™ — AI 機房混合能量緩衝 BBU × 智能維運平台

軟體層三件套(對應企劃書 v2.1 附件 B):

| App | 路徑 | 技術棧 | 狀態 |
|---|---|---|---|
| TCO Calculator | `apps/tco-calculator/` | Next.js 14 + Vercel + Tailwind | 規劃中 |
| Battery Digital Twin | `apps/twin-api/` + `packages/battery-twin/` | FastAPI + PyBaMM + PyTorch LSTM | 開發中 |
| Fleet Health Dashboard | `apps/dashboard/` | Grafana + InfluxDB | 規劃中 |

## 倉儲結構

```
atcc/
├── docs/                         企劃書 PDF + 衍生資料
├── apps/
│   ├── tco-calculator/           Next.js B2B lead-gen
│   ├── twin-api/                 FastAPI 推論服務
│   └── dashboard/                Grafana 機隊視覺化
├── packages/
│   ├── battery-twin/             PyBaMM 模擬 + LSTM RUL
│   │   ├── pybamm_sim/
│   │   ├── lstm_rul/
│   │   └── data_loaders/
│   └── shared/                   BOM/ASP/TCO 常數
├── notebooks/                    訓練、評估、視覺化 notebook
├── data/                         raw/ + processed/(.gitignore)
└── scripts/                      開發腳本
```

## Quick start

```bash
# Python 環境
uv venv .venv --python 3.11
.venv\Scripts\activate           # Windows
uv pip install -e packages/battery-twin

# 下載資料(背景跑,~10 GB)
python scripts/download_data.py --all

# Smoke test PyBaMM
jupyter lab notebooks/00_pybamm_smoke_test.ipynb
```

## 關鍵約束(來自 v2.1 企劃書,不可違反)

- Battery Twin MAPE < 10%(對標 Severson 9.1%);**未上實機資料前不承諾 < 5%**
- Dashboard 必須標註「Simulated Data」浮水印
- LFP 配置 15S(3.2V × 15 = 48V),非 13S
- LIC 配置 2× Eaton XLR 200F/48V(過配為刻意設計)
- 雲端訓練、邊緣推論(STM32N6 ONNX 路徑)、OTA 權重更新

## 競賽時程

- 初賽企劃書繳交:2026/05/05
- 決賽演示:約 7 月底(待官方公告)
