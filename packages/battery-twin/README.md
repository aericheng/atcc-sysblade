# battery-twin

Sysblade Battery Digital Twin 核心 Python 套件 — 物理引擎 + ML + 資料載入。

```
battery-twin/
├── pybamm_sim/        PyBaMM DFN 物理模型封裝(LFP + LIC 雙模 + BBU duty 合成)
├── lstm_rul/          PyTorch LSTM RUL + linear baseline(1/5/9/13-feat OLS)
└── data_loaders/      Severson 2019 + NASA PCoE + CALCE CS2 載入器
```

## 安裝

```bash
# 從 repo 根目錄
uv venv .venv --python 3.11
.venv/Scripts/activate                       # Windows bash
uv pip install -e packages/battery-twin[dev,api]
```

`numpy>=1.26,<2.0` 是 hard pin — `np.trapz` 在 numpy 2.0 被刪,我們用 `getattr(np, "trapezoid", np.trapz)` 兼容,但其他 deps(尤其 PyBaMM 26.x)還沒全部 numpy 2.0 ready。

## 模組責任

| 模組 | 輸入 | 輸出 |
|---|---|---|
| `pybamm_sim` | 電流剖面 + cell parameter set | 電壓 / SOC / 溫度時間序列 |
| `lstm_rul.model` | (N, 99, 7) per-cycle features | log10(cycle_life) 點預測 + MC Dropout PI |
| `lstm_rul.baseline` | (N, k) feature matrix | OLS 線性回歸 + MAPE / RMSE / R² |
| `data_loaders.severson_parser` | `.mat` v7.3 (HDF5) | `Cell` dataclass list,138 顆 LFP |
| `data_loaders.nasa_parser` | NASA PCoE TXT/MAT | `Cell` dataclass list(NMC,化學跨界測試用) |

## 資料來源 + 訓練資料

- **Severson 2019** *Nature Energy* 4, 383–391 — 124-cell LFP 公開資料(`b1` + `b2` + `b3` 三批),
  我們解出 138 顆有完整 ≥ 100 cycle 觀測的 cell。下載 SOP 在 `docs/severson_download.md`
- **PyBaMM-calibrated BBU duty cells** — 50 顆合成,參數對齊 Severson 平均行為 + 0.05C float duty + 25 °C 環境,
  cycle_life 5,000–13,000(填 Severson 沒覆蓋到的 BBU 操作 regime)
- **NASA PCoE B0005-7** — 4 顆 NMC,跨化學測試專用(5/5 feature 全部 OOD,證明跨化學部署需 per-chemistry 校準)

## 模型 + 誤差目標

| 模型 | 配置 | Random split MAPE | Cross-batch MAPE |
|---|---|---:|---:|
| OLS Variance | 1-feat | 16.4 % | 15.8 % |
| OLS Discharge | 5-feat | 17.6 % | 19.9 % |
| OLS Full(無 IR) | 9-feat | 12.6 % | 19.9 % |
| **OLS Full + IR** | **13-feat** | **14.5 %** | **14.5 %**(R² 由負轉正) |
| **LSTM augmented** | 188 cells, MC Dropout | 22.5 % | — |

**v2.1 §B 承諾**:< 10 % MAPE。OLS 13-feat 14.5 % 跟承諾差約 4–5 pp。**未上實機資料前不承諾 < 5 %。**

## 為什麼有兩條管線

OLS 13-feat 是「**跨 batch 可遷移性的證據**」(Severson b1+b2 → b3 cross-batch R² 由負轉正);
LSTM 是「**production 推論引擎**」,給 /twin walkthrough 和 /dashboard 1000 台 fleet RUL 共用
(one model, two views)。兩條共存 — OLS 證明 feature 設計合理,LSTM 提供 calibrated PI。
