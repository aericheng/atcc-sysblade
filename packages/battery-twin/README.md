# battery-twin

Sysblade Battery Digital Twin 核心 Python 套件 — 物理引擎 + ML + 資料載入。

```
battery-twin/
├── lstm_rul/          PyTorch LSTM RUL + linear baseline(1/5/9/13-feat OLS)
└── data_loaders/      Severson 2019 + NASA PCoE + CALCE CS2 載入器
```

PyBaMM DFN 模擬與 BBU duty 合成腳本直接收在 `scripts/generate_twin_scenarios.py`
與 `scripts/generate_bbu_duty_cells.py`,使用 PyBaMM upstream API,不另作 wrapper。

## 安裝

```bash
# 從 repo 根目錄
uv venv .venv --python 3.11
.venv/Scripts/activate                       # Windows bash
uv pip install -e packages/battery-twin[dev,api]
```

`numpy>=1.26,<2.0` 是 hard pin — 其他 deps(尤其 PyBaMM 26.x)還沒全部 numpy 2.0 ready。

`np.trapz` 在 numpy 2.0 被刪,程式裡一律寫成 `np.trapezoid if hasattr(np, "trapezoid") else np.trapz`。**不要**改回 `getattr(np, "trapezoid", np.trapz)`:Python 會先把第三個參數求值,所以那個寫法在 numpy 2.x 上會先拋 `AttributeError`,正好在它想相容的版本上失效。2026-07-23 的 CI 就是這樣掛的。

pin 也必須在**同一道** `pip install` 裡下完。拆成兩道時第二道會自己重新解析相依、把 numpy 升到 2.x,第一道的上限完全管不到(見 `.github/workflows/verify.yml`)。

## 模組責任

| 模組 | 輸入 | 輸出 |
|---|---|---|
| `lstm_rul.model` | (N, 99, 7) per-cycle features | log10(cycle_life) 點預測 + MC Dropout PI(post-processed by split conformal in `scripts/export_lstm_onnx.py`,縮窄 44 %)|
| `lstm_rul.baseline` | (N, k) feature matrix | OLS 線性回歸 + MAPE / RMSE / R² |
| `data_loaders.severson_parser` | `.mat` v7.3 (HDF5) | `Cell` dataclass list,138 顆 LFP |
| `data_loaders.nasa_parser` | NASA PCoE TXT/MAT | `Cell` dataclass list(NMC,化學跨界測試用) |

## 資料來源 + 訓練資料

- **Severson 2019** *Nature Energy* 4, 383–391 — 124-cell LFP 公開資料(`b1` + `b2` + `b3` 三批),
  我們解出 138 顆有完整 ≥ 100 cycle 觀測的 cell。下載 SOP 在 `docs/severson_download.md`
- **Severson-anchored synthetic BBU duty cells** — 50 顆合成,**analytic Severson-fit SOH curve + per-cell noise**(**不是 PyBaMM 跑出來的物理 aging**;100 cells × 10k cycles 全 PyBaMM aging 計算成本過高,見 `scripts/generate_bbu_duty_cells.py` 16-17 行 docstring 自述)。參數對齊 Severson 平均 + 0.05C float duty + 25 °C 環境,
  cycle_life 5,000–13,000(填 Severson 沒覆蓋到的 BBU 操作 regime,作為 *regime augmentation* 用,不獨立作為物理證據)
- **NASA PCoE B0005-7** — 4 顆 NMC,跨化學測試專用(5/5 feature 全部 OOD,證明跨化學部署需 per-chemistry 校準)

## 模型 + 誤差目標

| 模型 | 配置 | Random split MAPE | Cross-batch MAPE |
|---|---|---:|---:|
| OLS Variance | 1-feat | 17.9 % | 15.8 % |
| OLS Discharge | 5-feat | 17.5 % | 19.9 % |
| OLS Full + IR | 13-feat | 14.5 % | 14.5 %(R² 由負轉正) |
| **bagged-GBT (K=24) + xstrict cell filter** | **13-feat,n=134** | **8.4 %**(R² 0.89,7/10 seeds < 10 %)| 17.9 %(GBT 退化)|
| **bagged-OLS + xstrict cell filter** | **13-feat,n=134** | 12.4 % | **13.9 %**(R² +0.21)|
| **LSTM augmented** | 188 cells, MC Dropout + split conformal(q_factor 0.56)| 19.1 %(R² 0.86)| — |

**v2.2 附件 B 軟體技術棧承諾**:< 10 % MAPE。**已達標**:bagged-GBT + xstrict cell filter random split 10-seed median **8.38 %**(per-seed [5.93, 12.91])。Cross-batch 部署用 bagged-OLS(13.87 %)。**未上實機資料前不承諾 < 5 %**(同來源明文)。

## 為什麼有三條管線

1. **bagged-GBT + xstrict cell filter** — paper 學術 baseline,提供 random split 8.38 % 的 in-distribution 上界,證明 13-feat 設計確實能達 v2.2 < 10 % 承諾。
2. **bagged-OLS + xstrict cell filter** — cross-batch / cross-protocol fall-back,GBT 在跨 protocol 退化(17–22 %),bagged-OLS 在 cross-batch 反而最強(13.9 %)。
3. **序列模型(188 cells augmented)** — production 推論引擎為 **TCN / dilated 1D-CNN**(NPU-native,test MAPE 18.15 % / R² 0.892,見白皮書 §3.4.1;LSTM 19.10 % 保留為文件化 baseline),給 /twin walkthrough 和 /dashboard 1000 台 fleet RUL 共用(one model, two views)。MC Dropout + split conformal calibrated PI 縮窄 44 %,coverage 仍 ≥ 90 %。

三條共存 — GBT 證 paper 對齊、bagged-OLS 證 cross-batch 穩健、序列模型(production TCN,LSTM baseline)提供 calibrated PI 與 BBU regime 涵蓋。
