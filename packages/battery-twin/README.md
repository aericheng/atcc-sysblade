# battery-twin

Sysblade Battery Digital Twin 核心套件。

```
battery-twin/
├── pybamm_sim/     # PyBaMM DFN 物理模型封裝(LFP + LIC 雙模)
├── lstm_rul/       # PyTorch LSTM RUL 預測器
└── data_loaders/   # Severson / NASA / CALCE 載入器與下載器
```

## 安裝

```bash
# 從倉儲根目錄
uv venv .venv --python 3.11
.venv\Scripts\activate
uv pip install -e packages/battery-twin[dev,api]
```

## 模組責任

- `pybamm_sim`:給定電流剖面 → 輸出 cell 電壓/SOC/溫度/老化指標(時間序列)
- `lstm_rul`:給定 cycle data(ΔQ-V variance 等特徵) → 輸出 RUL(剩餘循環數)、SOH
- `data_loaders`:三大公開資料集的 download / parse / 統一 schema

## 誤差目標

MAPE < 10%(對標 Severson 2019 9.1%、Attia 2020 9.0%)
**未上實機資料前不承諾 < 5%**(企劃書 v2.1 附件 B 明文限制)
