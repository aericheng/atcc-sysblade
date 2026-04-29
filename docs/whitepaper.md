---
title: "Sysblade HyperBuffer 技術白皮書"
subtitle: "ATCC 第 23 屆 · C13 系統電 · 學生組"
version: "v1.0"
date: "2026-04-29"
authors:
  - 系統電 ATCC C13 學生競賽團隊
abstract: |
  本白皮書是商業企劃書 v2.1 的技術版伴讀文件。商業 PDF 回答「為什麼客戶會買」,
  本文回答「為什麼技術做得到」。Sysblade HyperBuffer 鎖定北美 Tier-2/3 AI 機房
  BBU(電池備援單元)市場,以 LFP 15S × 3.2 V 主電 + 鋰離子電容(LIC)輔助的
  混合拓撲解決三個目前市場上沒有整合方案的痛點:毫秒級電壓瞬態、48 V → ±400 V
  HVDC 過渡、雲端化維運可視化。在演算法側,我們完整重現 Severson 2019 的循環壽命
  資料庫驅動預測,將 9-feature Full-model OLS 在隨機 split 上的測試 MAPE 從
  5-feature Discharge baseline 的 17.64 % 降到 12.60 %,並在跨資料集(Severson →
  NASA NMC)上以 z-distance 量化證明跨化學部署需要 per-chemistry 校準。所有
  資料、程式碼、實驗結果可在 GitHub `aericheng/atcc-sysblade` 完整追溯。
---

# Sysblade HyperBuffer 技術白皮書

> ATCC 第 23 屆 · 系統電工業大學企業菁英賽 C13 · 學生組
> 文件版本 v1.0 / 2026-04-29
> Github: <https://github.com/aericheng/atcc-sysblade>
> Live demo: <https://sysblade-atcc.vercel.app>

---

## 目錄

1. [問題陳述](#第一章-問題陳述)
2. [系統架構](#第二章-系統架構)
3. [Battery Digital Twin](#第三章-battery-digital-twin)
4. [Fleet 售後管理](#第四章-fleet-售後管理)
5. [TCO 模型](#第五章-tco-模型)
6. [驗證與限制](#第六章-驗證與限制)
7. [風險分析](#第七章-風險分析)
8. [路線圖](#第八章-路線圖)
9. [參考文獻](#第九章-參考文獻)

附錄 A — 9-feature 工程詳述
附錄 B — Cross-dataset z-distance 表
附錄 C — STM32N6 X-CUBE-AI trace(W3 補)
附錄 D — Source code repository 結構

---

## 第一章 問題陳述

### 1.1 北美 Tier-2/3 AI 機房 BBU 市場規模

依 JLL 2025《Global Data Center Outlook》,2025–2027 北美 colo 機房新增
容量在地理上集中於 **Texas (49 %) 與 Virginia (27 %)**(本文 `dashboard`
頁面之地理權重即由此引述)。Tier-1 hyperscale(AWS、Azure、Meta)多以
自研架構消化內需,而 Tier-2 / Tier-3 colo 為對外服務 AI 推論工作負載,
仍依賴外採 BBU。對單體儲能元件(電容、LFP 模組)的廠商,客戶議價力
有限;且目前市場上**無一家現成廠商提供「軟體 + 硬體 + 維運」整合方案**
—— 這是我們鎖定的市場縫隙。

> 完整市場數字(年增容量 GW、年 BBU 出貨量、ASP)詳商業企劃書 v2.1 §A,
> 本白皮書不重複論證商業面。

### 1.2 三個目前市場上沒有整合方案的 gap

| Gap | 表現 | 現狀 |
|-----|------|------|
| **毫秒級電壓瞬態** | AI inference 突發負載 dV/dt > 50 V/s,純電池 BBU 在 50–200 ms 區段壓降明顯,造成下游 PSU 重啟 | Eaton XLR 等廠商賣鋰離子電容單體,但客戶要自己整合控制律 |
| **HVDC 過渡** | 北美機房 2025–2028 將從 48 V 漸進到 ±400 V,業界缺「同時相容兩階段」的 BBU | Vertiv 等傳統廠商賣 48 V 單一規格,客戶 2027 後要全部換掉 |
| **維運可視化** | 1000 + 節 fleet 故障多為非同步,人工巡檢 hit-rate 低 | 無公開 SaaS 提供 BBU-level RUL 與三層替換隊列 |

### 1.3 競品比較

| 廠商 | 賣什麼 | 與 Sysblade 差異 |
|------|--------|------------------|
| **Eaton XLR** | LIC 單體 + 開發包 | 我們把 LIC + LFP + 數位孿生整合,客戶不需自寫控制律 |
| **Vertiv Liebert** | 傳統 48 V VRLA / NMC BBU | 我們同時相容 48 V / ±400 V HVDC,規避客戶 2027 換代風險 |
| **Schneider Galaxy VS** | 集中式 UPS | 我們是 rack-level BBU,部署粒度更細,沒有單點故障 |

---

## 第二章 系統架構

### 2.1 硬體拓撲

主電池:**15 串 LFP × 3.2 V = 48 V** 標稱(對齊 v2.1 §修訂 #4)。LFP 化學
選擇有三個原因:

1. **熱安全**:LFP 在過充情境下分解溫度 > 250 °C,對比 NMC 約 150 °C,
   消防 NFPA 855 認證較容易過。
2. **循環壽命**:LFP 在 BBU duty(每年 < 50 等效完整循環)下壽命模型
   外推到 8–12 年,對應客戶折舊年限。
3. **成本曲線**:2024–2026 LFP 電芯價格從 USD 95/kWh 跌到 USD 65/kWh,
   優於 NMC,且供應集中於亞洲產能,北美客戶有「去 China-NMC」需求。

輔助元件:**鋰離子電容(LIC)** 並聯。LIC 比能量低(~ 30 Wh/kg)但功率密度
高(~ 5 kW/kg),負責吸收 < 100 ms 的瞬態尖峰,把 LFP 的負載拉平。

### 2.2 軟體三件套

| 模組 | 路徑 | 角色 |
|------|------|------|
| **Battery Digital Twin** | `/twin` | 物理引擎(PyBaMM)+ 機器學習 RUL 預測 + LSTM 推論視覺化 |
| **TCO Calculator** | `/tco` | 客戶業務談判工具,US$25k/site/yr SaaS 訂閱可帶走 |
| **Fleet Dashboard** | `/dashboard` | 三層售後(Tier-1/2/3)即時監控,標註 SIMULATED DATA |

### 2.3 資料流程(離線預算 / 線上呈現)

```
PyBaMM DFN (Python, offline)
    └─→ scripts/generate_twin_scenarios.py
        ├─→ packages/shared/scenarios/*.json
        └─→ apps/web/public/scenarios/*.json
                └─→ Server Components (build time, fs.readFile)
                    └─→ Static export (out/)
                        └─→ Vercel CDN
```

> 設計取捨:本展示為靜態匯出(Next.js `output: "export"`),所有 RUL 預測值
> 在 build time 預先算好,不在瀏覽器即時跑 PyBaMM。原因有二:
> (a) PyBaMM 體積過大不適合 client side;
> (b) 競賽展示版優先穩定性與低延遲,即時推論留待 W3 的 FastAPI 後端整合。

---

## 第三章 Battery Digital Twin

本章是技術核心。整個數位孿生由四個子系統組成:

1. **物理引擎** — PyBaMM Doyle-Fuller-Newman (DFN) PDE 求解器
2. **混合控制律** — LFP / LIC 頻譜分頻負載分配
3. **RUL 預測** — Severson 2019 重現 + 9-feature Full model 改進 + LSTM
4. **邊緣端佈署** — ONNX 匯出 + STM32N6 NPU 推論

### 3.1 物理引擎 — PyBaMM DFN

採用 PyBaMM 26.4.1 的 `DFN` 模型 + `Prada2013` LFP-graphite 參數集。
DFN 是業界標準的單顆電芯 1-D 偏微分方程組,描述電解液離子濃度
$c_e(x,t)$、固相鋰濃度 $c_s(x,r,t)$、與固液相電位 $\phi_e(x,t)$ /
$\phi_s(x,t)$ 的耦合演化。

**為什麼選 DFN 不選 SPM?**
單顆粒模型(SPM)在低 C-rate(< 1 C)準度足夠且求解快 5–10 ×,但 BBU
duty 在 10–30 ms 內可能瞬間吃 5–10 C,SPM 會低估 solid-phase
擴散 gradient 引發的電壓震盪,把 hybrid 拓撲的「為什麼要 LIC」這件事
解錯。實機要驗證的是「最壞情境」,所以付得起 DFN 的計算成本。

`scripts/generate_twin_scenarios.py` 為以下四個情境逐一求解 PDE,
時間網格 0–600 s,每節點 1 ms:

| 情境 | 內容 | 輸出 JSON |
|------|------|-----------|
| `transient_lfp_only.json` | 50 kW 突發負載,純 LFP 應對 | 電壓震盪 ΔV ≈ 62 mV (steady-state pp) |
| `transient_hybrid.json` | 同負載,LFP+LIC 混合應對 | ΔV ≈ 18 mV (steady-state pp,3.5× 改善) |
| `aging_lfp.json` | 3000 cycle BBU duty 下 SOH 衰減 | 80 % SOH @ ~3000 cycles |
| `model_validation.json` | LSTM 推論逐 cycle trajectory + actual | 9 個 curated cells |

> 這四個 JSON 是 `/twin` 與 `/dashboard` 所有數字的單一資料源,SHA-256
> 雙寫一致(generator 同一時間戳寫到 `packages/shared/` 與
> `apps/web/public/`)。

### 3.2 混合控制律 — LFP / LIC 頻譜分頻

控制目標:LIC 吃 > 1 Hz 高頻分量,LFP 吃 < 1 Hz 穩態,聯合輸出滿足負載。

設計推導以一階 high-pass / low-pass 互補濾波器為基礎:

$$
P_{\text{LIC}}(t) = P_{\text{load}}(t) - \mathrm{LPF}_{\tau}(P_{\text{load}}(t))
\\
P_{\text{LFP}}(t) = \mathrm{LPF}_{\tau}(P_{\text{load}}(t))
$$

時間常數 $\tau = 0.5$ s,在 PyBaMM 模擬下:

* **LFP 接收功率** RMS:純電池 8.7 kW → 混合 1.5 kW → **5.7× 降低**
* **電池電壓震盪** peak-to-peak (steady-state window):純電池 ~62 mV → 混合 ~18 mV → **3.5× 降低**

兩個數字直接對應首頁的 `5.7×` 與 `3.5×` 頭條。

### 3.3 RUL 預測 — Severson 重現 + Full model 改進

#### 3.3.1 資料集

Severson 等(2019,*Nature Energy*)公開了 124 顆 LFP 18650 cell(分 3 個
batch:b1, b2, b3)的快充壽命實驗資料,fast-charge 政策從 3.6 C 到 8 C
不等。資料總量 6 GB MAT v7.3 格式,經我們的 HDF5 解析路徑
(`packages/battery-twin/data_loaders/severson_parser.py`)解出 138 顆有
完整 ≥ 100 cycle 觀測的 cell(略多於 paper 的 124 — paper 套用較嚴格的
cycle_life > 200 篩選)。

#### 3.3.2 三個漸進的特徵集

| 模型 | 特徵數 | 意義 |
|------|------:|------|
| **Variance** | 1 | $\log_{10} \mathrm{Var}(\Delta Q_{100-10}(V))$,paper 頭條單變數 |
| **Discharge** | 5 | + min, slope, intercept, Q-at-cycle-2 — paper Table 1 |
| **Full** | 9 | + max temp, temp integral, charge time, late-cycle slope — paper Table S2 |

完整 9 個 feature 的數學定義見 **附錄 A**。

#### 3.3.3 Severson 隨機 split 結果(in-distribution)

依 paper 70/30 隨機 split(seed=0,3 batch 混合),OLS 在 log-log 空間
(target: $\log_{10}$ cycle_life)的測試集 MAPE:

| 模型 | feat 數 | Train MAPE | Test MAPE | RMSE (cycles) | R² |
|------|---:|---:|---:|---:|---:|
| Variance | 1 | 17.91 % | **16.40 %** | — | 0.661 |
| Discharge | 5 | 13.64 % | 17.64 % | — | 0.701 |
| **Full** | **9** | **12.67 %** | **12.60 %** | — | **0.729** |

> **結論**:9-feature Full model 相對 5-feature Discharge baseline 帶來
> **28 % 相對 MAPE 降低**(17.64 % → 12.60 %)。Variance 單變數重現
> paper 約 15 % 的數字差距 1.4 pp,可歸因於我們 138 vs paper 124 的
> filter 差異。

#### 3.3.4 Severson 跨 batch 結果(誠實討論)

更困難的設定:用 b1 + b2 訓練,b3 測試(b3 採用 b1/b2 沒看過的快充政策):

| 模型 | feat 數 | Train MAPE | Test MAPE | R² |
|------|---:|---:|---:|---:|
| Variance | 1 | 17.73 % | 15.81 % | 0.167 |
| Discharge | 5 | 14.05 % | **19.88 %** | -0.164 |
| Full | 9 | 11.42 % | **19.93 %** | -0.191 |

**5-feat → 9-feat 在 cross-batch 上沒有改善**。原因:9-feat 新加的 4 個
feature(charge time + max temp + temp integral + slope_91_100)
都是 protocol-specific(快充政策決定 charge time 與 thermal
envelope),b1/b2 訓出來的係數套到 b3 時 over-fit 政策而非物理。

> 這個結果是我們**不敢隱瞞**的負面發現。它說明:同一化學、不同政策
> 之間,額外 thermal/charge feature 帶來的訊息有限;這也是我們將
> Full model 標稱為「**within-protocol** 改進」而非泛用改進的原因。

#### 3.3.5 跨資料集驗證(Severson → NASA NMC)

最殘酷的測試:用 Severson 全部 138 顆 LFP cell 訓練 5-feat Discharge
OLS,套到 NASA PCoE 的 4 顆 18650 NMC cell(B0005、B0006、B0007、
B0018)。NMC 標稱容量 2.0 Ah(對 LFP 1.1 Ah)、放電截止 2.5 V
(對 LFP 2.0 V)、化學物性完全不同。

直接 MAPE 數字無意義(線性外插炸開):

| Cell | 真實 cycle_life | 預測 cycle_life | 絕對誤差 (%) |
|------|---:|---:|---:|
| nasa_B0005 | 106 | 8589.5 | 8003.3 |
| nasa_B0006 | 62 | 22540.7 | 36256.0 |
| nasa_B0007 | 126 | 10589.4 | 8304.3 |
| nasa_B0018 | 79 | 10484.8 | 13171.8 |

但**真正的洞察在 feature distribution check**(完整表見 **附錄 B**):

| Feature | Severson 範圍 | NASA 範圍 | OOD? | z-distance |
|---------|---:|---:|:--:|---:|
| log_var_delta_q | [-5.21, -2.73] | [-2.07, -1.54] | ✗ | **5.3 σ** |
| log_min_delta_q | [-2.30, -0.86] | [-0.51, -0.26] | ✗ | **5.1 σ** |
| slope_q_2_100 | [-0.001, 0] | [-0.006, -0.004] | ✗ | **54 σ** |
| intercept_q_2_100 | [0.97, 1.10] | [1.86, 2.04] | ✗ | **61 σ** |
| q_at_cycle_2 | [0.97, 1.09] | [1.85, 2.04] | ✗ | **65 σ** |

**5/5 feature 全部超出訓練分布**,z-distance 5–65 σ。其中
intercept_q_2_100 與 q_at_cycle_2 的 65 σ 偏移幾乎完全來自
NMC 2.0 Ah 對 LFP 1.1 Ah 的容量 scale 差。

> **可寫進客戶交付物的結論**:**Severson-trained 模型不能直接部署到不同
> 化學的 cell;必須用該化學的少量 cell 做 per-chemistry 校準**。
> 這不是「補資料就能解決」的問題,而是 OLS 線性外插到 5–65 σ 之外
> 沒有意義。對 Sysblade 客戶而言,這意味著:每一批新採購的 LFP 模組
> (即使同 vendor 不同 batch)都應跑一遍 calibration cycle 再部署。

#### 3.3.6 LSTM PyTorch model

5-feature OLS 是線性 baseline。為了捕捉 cycle 序列的非線性 pattern,
我們訓了一個 2-layer LSTM(hidden = 64,input shape = (99, 7),參考
proposal §E.1 Tier-C 規格)。輸入是每 cycle 的 7 維摘要向量
(cycle_norm, qd_max, qd_range, v_mean, v_std, t_max, duration_s),
輸出是 $\log_{10}$ cycle_life 的純量。

訓練細節:
* Optimizer: Adam, lr = 1e-3, weight_decay = 1e-4
* Batch size 16,最多 200 epochs,early stop patience = 30
* Train / Val 70/30 同 batch 隨機 split
* Per-feature z-score normalisation(`FeatureScaler` 物件持久化進 ONNX)

`/twin` 頁面下半段的 **Inference Walkthrough** 從 9 顆精選 cell 中
讓使用者選一顆,顯示 LSTM 的 4 個 stage:

1. **Input** — 99 × 7 z-scored heatmap(diverging colour, 0 為訓練平均)
2. **Hidden state** — LSTM 第二層 99 timestep × 64 dim 輸出 heatmap
3. **Cumulative prediction** — 在 cycle k 截斷時的預測值 vs 真實循環壽命
4. **Dense head** — 64 → 32 → 1 全連接層的逐步運算說明

> 業師可在簡報現場點任一 cell 觀察推論過程,9 顆 cell 涵蓋從健康主流到
> 故障早夭的完整 fleet 狀態空間。

#### 3.3.7 機率輸出 — Monte Carlo Dropout 預測區間

**為什麼加這個**:Severson 訓練資料的 cycle-life 尾部稀疏(`cycle_life < 200`
只有 1/138 顆 cell),點預測模型對這類 cell 系統性高估(b2c1 真實 148,
deterministic 預測 332,**+124 % 點誤差**)。直接呈現點誤差會讓觀眾以為
「模型壞了」,實際是「模型不知道自己不知道」。

**做法**:Gal & Ghahramani (2016) 的 Monte Carlo Dropout —— 推論時保留
LSTM 兩處 dropout 開啟(`lstm.train()` + `head.Dropout`),做 100 次
forward pass 得到後驗預測分布。中位數作為點估計,5–95 percentile
作為 90 % 預測區間 (PI)。**不需重訓**,套在已 export 的 checkpoint 上。

**結果**(`scripts/export_lstm_onnx.py` `--mc-dropout` 路徑):

| 指標 | 值 | 解讀 |
|------|---:|------|
| Test set 90 % PI coverage | **100 %** (42/42 cells in PI) | 過度覆蓋(實際應 ≤ 90 %),代表 PIs 偏寬保守,但**沒有 under-cover 風險** |
| 中位數 PI 寬度 | ~1660 cycles | 反映訓練資料訊號相對於目標尺度的雜訊 |
| b2c1 critical 真值 148 | PI [113, 783] ✓ 包含 | 模型誠實說「我不確定,但你的真值在區間裡」 |
| b3c38 healthy 真值 1934 | PI [370, 2312] ✓ 包含 | 同上,wide PI 反映訓練 healthy 尾部稀疏 |

**已知限制**:
* MC Dropout 僅捕捉 **epistemic** uncertainty(模型不確定性),不含
  aleatoric(資料雜訊)。
* 100 % 覆蓋表示 PIs 比理論值寬;這雖避免 under-cover 但犧牲 sharpness
  (預測區間越寬越沒實際決策價值)。
* W3 計畫:**conformal calibration** post-hoc 縮窄 PIs,目標把 90 %
  PI coverage 拉回 ~90 %、median width 縮短 ~ 30 %。

**與 deterministic 點 MAPE 的關係**:點 MAPE(在中位數上算)約 16 %,
**跟 deterministic 模型差不多** —— Probabilistic 不會自動降低點誤差。
它解決的是「報告誠實度」,不是「準確度」。要再降 MAPE 需要更多 LFP
資料 + 特徵工程(W3 規劃)。

### 3.4 邊緣端佈署 — ONNX + STM32N6 NPU

LSTM 已透過 `scripts/export_lstm_onnx.py` 匯出為 `models/lstm_rul.onnx`
(IR opset 17),配合外部資料 `lstm_rul.onnx.data`。檔案大小 約 50 KB,
遠小於 STM32N6 的 4 MB 內建 RAM。

筆電 CPU(Apple M3 / x86 ddr5 同級)推論延遲 benchmark:**< 1 ms / 樣本**
(commit `be001c0`,完整數字見 onnxruntime profiling 報告)。

**STM32N6 NPU 預估延遲**:依 ST datasheet,Neural-ART 加速器在
INT8 LSTM 上典型 latency 0.3 ms。實際靜態 trace 透過 X-CUBE-AI 9.x
工具鏈(W3 待辦)可進一步驗證,結果將補進**附錄 C**。

> **誠實聲明**:目前的 0.3 ms 數字來源是 ST datasheet,本團隊尚未在
> 實機開發板上量過。`apps/web/src/app/twin/twin-client.tsx` 與首頁均
> 標註此值為「STM32N6 estimate」(commit `8312517`)。

---

## 第四章 Fleet 售後管理

對應 v2.1 §F「三層售後服務」,Fleet Dashboard(`/dashboard`)是把該節
變成可看可點的儀表板。1000 台機台是 seeded RNG 模擬,所有 panel
明標 **SIMULATED DATA** watermark(`apps/web/src/app/globals.css`
`.simulated-watermark`),**這是業界標準作法,不可移除**(對齊 v2.1 §B 條款)。

### 4.1 Tier-1 即時監控

* 1000 台 fleet 的 SOH / RUL / status 即時表
* 健康狀態總計、預警燈號、地理散布快速摘要
* SaaS pricing 上對應 USD 25k/site/yr 訂閱中「日常監控」項目

### 4.2 Tier-2 地理分布

依 JLL 2025 報告:
* Texas 49 %(德州 colo 集中區,主要為 Dallas + Austin)
* Virginia 27 %(NoVA Ashburn 走廊)
* California 11 %、Oregon 7 %、其他 6 %

地圖呈現使用 `apps/web/src/components/us-fleet-map.tsx`,SVG 純向量。

### 4.3 Tier-3 替換隊列

**Tier-3 admission rule**:`status === "early_aging"`,即
**SOH < 0.85 OR RUL < 800 cycles**。此規則定義於
`scripts/generate_twin_scenarios.py`,**全 UI 只此一處**。

> **RUL → BBU 年數換算(重要)**:模型的 `rul_cycles` 是「Severson 等效循環」
> 而非「BBU 年數」。BBU duty 平均年循環 ~ 50,因此換算係數約為:
>
> $$\text{BBU 年數} \approx \frac{\text{rul\_cycles}}{50}$$
>
> 具體閾值:
> * `RUL < 800` ≈ **未來 16 年內 BBU duty 估計會跨 EOL** → Tier-3 admission
> * `RUL < 200` ≈ **未來 4 年內** → critical / 立即替換
> * `RUL ≥ 1500` ≈ **未來 30 年以上** → healthy 主流族群
>
> 這個 50 cycles/yr 的換算係數來自 v2.1 §B.2 的 BBU duty 假設(年停電
> 事件 ~ 30,加上日常 LIC 動作 ~ 20)。客戶現場若 duty 不同,需在
> commissioning 階段重校準。模型在 dashboard 端顯示「16 年」這類人類
> 可讀數字、機器內部仍以 cycle 為單位的雙軌設計,避免重訓但保留可解讀性。

商業流程:
1. RUL 引擎每日 batch 預測 → 推到客戶 ServiceNow ticketing
2. Sysblade 工程隊 7-day SLA 派工到現場
3. 替換完成後,該 cell 進入 calibration cycle,RUL 重置

---

## 第五章 TCO 模型

`apps/web/src/lib/tco.ts` 把 v2.1 §G.3 的成本表寫成 elasticity model,
讓客戶能拉動 rack 數量、電價、PUE、carbon intensity 即時看 10 年成本差。

### 5.1 變數定義

| 輸入 | 來源 | 預設值 |
|------|------|------|
| `racks` | 客戶機房規模 | 50 (mid-tier preset) |
| `electricityPriceUsdPerKwh` | 區域電價 | $0.10 (Texas), $0.13 (Virginia) |
| `pue` | Power Usage Effectiveness | 1.4 |
| `gridCarbonKgPerKwh` | 區域 grid 排放係數 | 0.40 |

### 5.2 33 % 節省的推導

每 rack 10 年成本(USD,對齊 v2.1 §G.3):

| 項目 | Traditional NMC | Sysblade LFP+LIC | 差距 |
|------|---:|---:|---:|
| 初次採購 | 5,760 | 8,640 | +2,880(LFP+LIC ASP 較高) |
| 10 年內替換 | 8,640 | 5,760 | -2,880(NMC 1.5×, LFP 1×) |
| 瞬態損失 | 4,800 | 1,200 | -3,600(LIC 吸收 ms 級事件) |
| 維運人力 | 5,000 | 2,000 | -3,000(predictive ops) |
| HVDC 過渡 | 4,800 | 1,800 | -3,000(ORV3 + HVDC-ready interface) |
| **合計** | **29,000** | **19,400** | **-9,600** |

$$
\text{Saving} = \frac{29{,}000 - 19{,}400}{29{,}000} = 33.1\,\%
$$

頁首頭條 **33 %** 來源即此。

### 5.3 敏感度分析(rack 數量、電價)

直接用 `tco.ts` 公式於三個 preset 計算:

| Preset | racks | 電價 | per-rack saving | 整 fleet 年節省 | Payback |
|--------|---:|---:|---:|---:|---:|
| Mid-tier · Texas | 50 | 0.10 USD/kWh | $9,600 / 10y | **$48k** | **2.3 y** |
| Hyperscale · Virginia | 500 | 0.13 USD/kWh | $10,950 / 10y | **$548k** | **2.1 y** |
| Edge · Texas | 10 | 0.10 USD/kWh | $9,600 / 10y | $9.6k | 2.3 y |

> **觀察**:本模型中 payback 對 rack 數量不敏感(extra capex 與 annual
> saving 都隨 racks 線性 scale,比例不變),但對電價敏感 —— Virginia
> 較貴電價放大瞬態損失差距,使 payback 縮短 ~ 0.2 年。
> 若客戶有「每站固定維運成本」這類非線性項,需在 §G.3 表外加列;
> 目前 v2.1 商業 PDF 與本實作均未涵蓋。

完整 elasticity 邏輯見 `apps/web/src/lib/tco.ts`,UI 在 `/tco`。

---

## 第六章 驗證與限制

本章按聲稱 → 證據 → 局限的格式列出。**這是業師問倒風險最高的章節,
我們把所有 caveat 一次寫清楚**。

### 6.1 物理層聲稱

| 聲稱 | 證據 | 局限 |
|------|------|------|
| 3.5× 電壓震盪降低 | `transient_hybrid.json` vs `transient_lfp_only.json`,PyBaMM DFN 模擬 | DFN 模擬,非實機;依賴 `Prada2013` 參數集適用性 |
| 5.7× LFP 接收功率波動降低 | 同上 | 同上 |
| 8–12 yr 服役壽命 | `aging_lfp.json` 對齊 Severson 衰減模型,3000 cycle 達 80 % SOH | BBU duty 假設(每年 < 50 等效完整循環);若客戶 duty 不同需重做 |
| LFP 熱安全優於 NMC | 公開文獻(NFPA 855 認證歷史) | 模組級熱失控傳播仍須 abuse 測試,W4–Q3 計畫進行 |

### 6.2 ML 模型層聲稱

| 聲稱 | 證據 | 局限 |
|------|------|------|
| 重現 Severson Variance baseline | 16.40 % MAPE(paper 15.0 %) | 138 vs 124 cells;feature filter 差異 |
| 9-feat 改進 28 % | 17.64 % → 12.60 % MAPE 隨機 split | 同 chemistry 同 batch 訓 / 測 |
| **訓練情境 ≠ 產品情境(regime gap)** | Severson cell 在 3.6C–8C 快充壓力測試;我們產品 BBU duty 是 0.05C float + 偶爾深放電,年循環 ~50 而非 lab 的 ~365 | LSTM 預測對 BBU duty **偏保守上界**;真實衰減率預計低於 model 預測。沒有公開 LFP-BBU-duty 資料集是業界共同問題;W3+ 計畫用 PyBaMM 生成 BBU duty 模擬 cell 補訓練資料(§3.1 + §8) |
| **不**承諾 < 5 % MAPE | v2.1 附錄 B 明文 | 即使模型達到也不在白皮書聲明 |
| **承諾** < 13 % MAPE 達到 | 12.60 % 隨機 split | 跨 batch / 跨化學不適用 |
| Cross-batch 沒改善 | 19.88 % → 19.93 %,R² 為負 | 已誠實寫入 §3.3.4,protocol-specific 為原因 |
| 跨化學需 per-chemistry calibration | 5/5 feature OOD,z = 5–65 σ | **不可一般化**到任意電池 |
| **MC Dropout 90 % PI 涵蓋率** | 100 % (42/42 test cells in PI) | **過寬保守**,W3 conformal calibration 縮窄至 ~ 90 % 目標 |
| **PI 中位數寬度** | ~1660 cycles | 反映訓練尾部稀疏;sharp PI 需更多 LFP 早夭資料 |
| LSTM 推論 < 1 ms 筆電 CPU | onnxruntime profiling | 非 STM32N6 實機;X-CUBE-AI trace 待補 |
| STM32N6 NPU < 1 ms 預估 | ST datasheet | **未實機驗證**;0.3 ms 為廠商 spec |

### 6.3 商業層聲稱

| 聲稱 | 證據 | 局限 |
|------|------|------|
| 33 % TCO 節省 | `tco.ts` 公式對齊 v2.1 §G.3 | 默認 mid-tier preset;rack 數 / 電價變化會偏移 |
| 1000 台 fleet | seeded RNG 模擬 | **明標 SIMULATED DATA**,絕非真客戶資料 |
| Texas 49 % / Virginia 27 % | JLL 2025 報告 | 為 colo 容量加權,與 BBU 實際出貨可能偏差 |
| **未** 部署到 OCP | v2.1 §I 時間軸 | W4–Q3 才送認證 |
| **未** 簽約 Tier-1 客戶 | v2.1 §I | 2027 Q1–Q2 才開始 PoC |

> **這張表的存在本身就是答辯彈藥**。業師問哪一行,我們都有答案,且
> 答案不會與 v2.1 PDF 衝突。每一行如果業師深挖 → repo 對應檔案路徑
> 都查得到。

---

## 第七章 風險分析

### 7.1 技術風險

| 風險 | 影響 | 應對 |
|------|------|------|
| LIC vendor lock-in | 高(目前只 Eaton + JM Energy 兩家有規格) | W3–W4 並行 qualify Maxwell + Ningbo CRRC 替代品 |
| LFP 模組熱失控傳播 | 高(NFPA 855 認證需要) | W4–Q3 abuse 測試:單體穿刺、過充、外短路 |
| STM32N6 NPU op 不支援度 | 中(LSTM 在某些 X-CUBE-AI 版本部分 op fallback CPU) | W3 X-CUBE-AI trace 量化後備案 |
| 跨化學模型遷移 | 中(已知 5/5 feature OOD) | per-chemistry calibration 流程列入產品 SOP |

### 7.2 排程風險

| 風險 | 影響 | 應對 |
|------|------|------|
| W4–Q3 OCP 認證延滯 | 高(2027 Q1 PoC 依賴此) | 提早 6 個月送件,留 buffer |
| Severson 大資料集 6 GB 下載 throttle | 中 | 已建本地鏡像(`docs/severson_download.md`) |

### 7.3 客戶採用風險

| 風險 | 應對 |
|------|------|
| Tier-1 玩家 ⊃ Sysblade 自研 | 鎖定 Tier-2/3 colo,避免直接競爭 |
| Tier-2/3 對「軟體訂閱」買單意願 | 第一年免費試用 + USD 25k/site/yr 訂閱可隨時取消 |

### 7.4 法規 / ESG 風險

| 風險 | 應對 |
|------|------|
| EU Battery Passport 2027 上路 | 規格已預留 RUL 可匯出標準格式 |
| 美國 IRA 補貼變動 | LFP 國產率規劃已對齊 IRA 30D Sec. 30D |

---

## 第八章 路線圖

對齊 v2.1 §I 時間軸,本白皮書定稿時(2026-04-29)的進度:

| Week | 任務 | 狀態 |
|:--:|------|:--:|
| W1 | PyBaMM smoke test、商業企劃 v2.1 凍結 | ✅ |
| W1 | Severson 6 GB 下載、解析、5-feat baseline | ✅ |
| W2 (本週) | LSTM 訓練、ONNX 匯出、CPU latency benchmark | ✅ |
| W2 (本週) | 9-feat Full model 改進(本白皮書 §3.3.3) | ✅ |
| W2 (本週) | NASA cross-dataset 驗證(本白皮書 §3.3.5) | ✅ |
| W2 (本週) | MC Dropout 機率輸出 + 90 % PI(§3.3.7) | ✅ |
| W2 (本週) | 學生競賽簡報(D-1) | ⏳ |
| W3 | STM32N6 X-CUBE-AI 靜態 trace(附錄 C) | ⏳ |
| W3 | FastAPI 後端整合 | ⏳ |
| W3 | Conformal calibration:把 PI 從 100 % 過寬縮回 ~ 90 % 目標(§3.3.7) | ⏳ |
| W3 | 本白皮書 v1.0 提交(2026-05-05 初賽繳交) | ⏳ |
| W4–Q3 | NFPA 855 abuse 測試、OCP 認證送件 | 規劃 |
| 2027 Q1–Q2 | 第一個 Tier-2 colo 客戶 PoC | 規劃 |

---

## 第九章 參考文獻

### 電池物理與資料集

1. **Severson, K.A., Attia, P.M., Jin, N., Perkins, N., Jiang, B., Yang, Z.,
   Chen, M.H., Aykol, M., Herring, P.K., Fraggedakis, D., Bazant, M.Z.,
   Harris, S.J., Chueh, W.C., Braatz, R.D.** (2019). "Data-driven prediction
   of battery cycle life before capacity degradation." *Nature Energy* **4**,
   383-391.
2. **Doyle, M., Fuller, T.F., Newman, J.** (1993). "Modeling of galvanostatic
   charge and discharge of the lithium/polymer/insertion cell." *J.
   Electrochem. Soc.* **140** (6), 1526-1533. (DFN 原始論文)
3. **Prada, E., Di Domenico, D., Creff, Y., Bernard, J., Sauvant-Moynot, V.,
   Huet, F.** (2013). "A simplified electrochemical and thermal aging model
   of LiFePO4-graphite Li-ion batteries." *J. Electrochem. Soc.* **160** (4),
   A616-A628. (本白皮書採用之 LFP 參數集)
4. **Sulzer, V., Marquis, S.G., Timms, R., Robinson, M., Chapman, S.J.**
   (2021). "Python Battery Mathematical Modelling (PyBaMM)." *Journal of Open
   Research Software* **9**, 14. (我們的物理引擎)
5. **Saha, B., Goebel, K.** (2007). "Battery Data Set." *NASA Ames
   Prognostics Data Repository*, NASA Ames Research Center, Moffett Field, CA.
   (本白皮書 §3.3.5 cross-dataset 來源)
6. **Attia, P.M., Grover, A., Jin, N., Severson, K.A., Markov, T.M., Liao,
   Y.-H., Chen, M.H., Cheong, B., Perkins, N., Yang, Z., Herring, P.K.,
   Aykol, M., Harris, S.J., Braatz, R.D., Ermon, S., Chueh, W.C.** (2020).
   "Closed-loop optimization of fast-charging protocols for batteries with
   machine learning." *Nature* **578**, 397-402. (Severson 後續 fast-charge
   policy 工作)

### 系統與標準

7. **NFPA 855: Standard for the Installation of Stationary Energy Storage
   Systems** (2023 ed.). National Fire Protection Association. (LFP 模組
   熱安全認證標準)
8. **Open Compute Project (OCP) ORV3 Specification** v0.92 (2024).
   (機房級 BBU rack 機械 / 電氣介面)
9. **JLL Research** (2025). *Global Data Center Outlook* 年度報告。
   (北美機房地理分布 Texas 49% / Virginia 27% 引述來源,確切標題與分頁
   見商業企劃書 v2.1 §A 引註)

### 工具鏈

10. **STMicroelectronics** (2024). *STM32N6 Series Reference Manual + Neural-ART
    NPU Application Note*.(NPU spec、INT8 LSTM 典型 latency 引述來源;
    具體文件編號隨 ST 改版調整,以 ST 官網最新版為準)
11. **STMicroelectronics** (2024). *X-CUBE-AI 9.x User Manual*.
    (W3 靜態 trace 工具)
12. **ONNX Working Group** (2024). *ONNX Runtime documentation*. (本白皮書
    使用之模型互換格式)

### 企劃書與專案

13. 系統電 ATCC C13 學生競賽團隊 (2026).
    *Sysblade HyperBuffer Proposal v2.1*. 商業企劃書,本白皮書之上游文件。
14. 系統電 ATCC C13 學生競賽團隊 (2026).
    *atcc-sysblade* GitHub repository.
    <https://github.com/aericheng/atcc-sysblade>
15. 系統電 ATCC C13 學生競賽團隊 (2026).
    *Sysblade ATCC live demo*. <https://sysblade-atcc.vercel.app>

### 相關產品 / 競品(資料來源)

16. **Eaton Corporation** (2024). *XLR Supercapacitor Module datasheet*.
17. **Vertiv Group** (2024). *Liebert Edge Lithium-Ion UPS product brief*.
18. **Schneider Electric** (2024). *Galaxy VS three-phase UPS specification*.

---

## 附錄 A — 9-feature 工程詳述

依 Severson 2019 Table S2 Full model 對應關係。所有特徵的提取程式碼在
`packages/battery-twin/data_loaders/severson_parser.py`,以下是公式定義:

### 5-feature Discharge model(Severson Table 1,paper ~9.1 % MAPE)

1. **`log_var_delta_q`**
   $\log_{10} \mathrm{Var}\bigl(\Delta Q_{100-10}(V)\bigr)$
   其中 $\Delta Q_{100-10}(V) = Q_{100}(V) - Q_{10}(V)$,在 1000 點電壓
   網格(LFP: 2.0–3.5 V)上插值,Severson .mat 已預先提供 `Qdlin` 即可
   直接相減。
2. **`log_min_delta_q`**
   $\log_{10} \bigl|\min \Delta Q_{100-10}(V)\bigr|$
   ΔQ 曲線最深負值點,代表最大早期容量損失區段。
3. **`slope_q_2_100`**
   per-cycle 峰值 $Q_d$ 對 cycle 編號的線性回歸斜率(cycles 2–100)。
4. **`intercept_q_2_100`**
   同回歸的截距(外推到 cycle 0 的容量)。
5. **`q_at_cycle_2`**
   cycle 2 的峰值 $Q_d$。

### 4 個延伸 feature(Severson Table S2 Full model)

6. **`log_max_temp_2_100`**
   $\log_{10}\bigl(\max_{i=2..100} \max_t T_i(t)\bigr)$
   cycles 2–100 中所有時刻的溫度極大值。
7. **`log_temp_integral_2_100`**
   $\log_{10}\Bigl(\sum_{i=2}^{100} \int_{t \in i} T_i(t)\,dt\Bigr)$
   累積熱應力代理量,用 trapezoidal integration。
8. **`log_charge_time_avg_2_6`**
   $\log_{10}\bigl(\frac{1}{5}\sum_{i=2}^{6} (\arg\max_t V_i(t) - t_{i,0})\bigr)$
   cycle 2–6 充電相時間平均(用 argmax(V) 找充放電界限)。
9. **`slope_q_91_100`**
   per-cycle 峰值 $Q_d$ 對 cycle 編號的線性回歸斜率(cycles 91–100)。
   局部後段衰減速率,比 2–100 全程斜率對 SEI 形成後的 fade rate 更敏感。

### 我們未使用的 paper feature

Severson Table S2 Full model 包含兩個內阻(IR)相關 feature。我們解析的
v7.3 .mat 走 HDF5 路徑跳過 `summary` 欄位(IR 即在此欄),以
`slope_q_91_100` 替代,捕捉同樣的「late-formation 衰減速率」訊號。

---

## 附錄 B — Cross-dataset z-distance 表

完整 JSON 來源:`data/processed/cross_dataset_mape.json`,生成腳本
`scripts/eval_cross_dataset.py`。

### 每個 feature 的 Severson 訓練分布 vs NASA 測試分布

| Feature | Sev μ | Sev σ | Sev [min, max] | NASA [min, max] | OOD | z-dist |
|---|---:|---:|:---:|:---:|:--:|---:|
| log_var_delta_q | -3.878 | 0.441 | [-5.21, -2.73] | [-2.07, -1.54] | ✗ | **5.31** |
| log_min_delta_q | -1.462 | 0.238 | [-2.30, -0.86] | [-0.51, -0.26] | ✗ | **5.06** |
| slope_q_2_100 | -0.000 | 0.000 | [-0.001, 0] | [-0.006, -0.004] | ✗ | **54.00** |
| intercept_q_2_100 | 1.073 | 0.016 | [0.97, 1.10] | [1.86, 2.04] | ✗ | **61.41** |
| q_at_cycle_2 | 1.069 | 0.015 | [0.97, 1.09] | [1.85, 2.04] | ✗ | **64.55** |

z-distance 計算:$z = \max(|x_{\text{NASA,min}} - \mu_{\text{Sev}}|,\ |x_{\text{NASA,max}} - \mu_{\text{Sev}}|) / \sigma_{\text{Sev}}$

### NASA 4 顆 cell 的真實 vs 預測 cycle life

| Cell | Cycle life (80 % SOH) | OLS 預測 | 絕對誤差 |
|---|---:|---:|---:|
| nasa_B0005 | 106 | 8,589.5 | 8003 % |
| nasa_B0006 | 62 | 22,540.7 | 36256 % |
| nasa_B0007 | 126 | 10,589.4 | 8304 % |
| nasa_B0018 | 79 | 10,484.8 | 13172 % |

**這些絕對誤差數字本身不該被引用為「模型差度」量化指標** — 它們是 OLS
線性外插到訓練分布外 65 σ 的計算結果,意義是「Severson-trained 模型對
NASA NMC 的預測沒有意義」,而非「模型可改進到 X %」。**真正可引用的
量化指標是 z-distance 表**。

---

## 附錄 C — STM32N6 X-CUBE-AI trace(W3 補)

W3 任務,將更新此附錄。預計內容:

1. 工具鏈版本:X-CUBE-AI 9.x(2024 release)+ STM32CubeMX
2. 目標晶片:STM32N657
3. 輸入模型:`models/lstm_rul.onnx` (~50 KB)
4. 報告截圖:
   * Network mapping(NPU vs CPU op breakdown)
   * Per-layer cycle count
   * Total latency estimate
   * RAM / FLASH 佔用
5. 對比 ST datasheet 廠商聲稱(0.3 ms)的差距分析

> 截至本白皮書 v1.0 凍結時,此附錄為占位章節。**v2.1 商業 PDF 中的
> 「STM32N6 NPU 0.3 ms 推論」聲稱依賴此附錄完成後始可背書**。

---

## 附錄 D — Source code repository 結構

GitHub: <https://github.com/aericheng/atcc-sysblade>

```
atcc-sysblade/
├── docs/
│   ├── Sysblade_HyperBuffer_Proposal_v2.1.pdf  # 商業企劃,規格凍結
│   ├── whitepaper.md                            # 本文件
│   └── severson_download.md                     # 6 GB 資料集下載 SOP
│
├── apps/
│   └── web/                                     # Next.js 三件套
│       ├── public/scenarios/*.json              # 4 個 PyBaMM 模擬產出 + 1 個 LSTM 軌跡
│       └── src/
│           ├── app/{twin,tco,dashboard}/        # 三個頁面
│           ├── components/heatmap.tsx           # /twin Inference Walkthrough
│           └── lib/{tco,types}.ts               # 業務邏輯
│
├── packages/
│   ├── battery-twin/                            # Python ML 套件
│   │   ├── data_loaders/
│   │   │   ├── severson_parser.py               # §3.3.3 9 個 feature
│   │   │   ├── nasa_parser.py                   # §3.3.5 NASA 解析
│   │   │   └── _http.py                         # 共用下載器
│   │   └── lstm_rul/
│   │       ├── baseline.py                      # OLS DISCHARGE/FULL_FEATURES
│   │       └── model.py                         # 2-layer LSTM PyTorch
│   └── shared/scenarios/*.json                  # 與 apps/web/public 雙寫
│
├── scripts/
│   ├── generate_twin_scenarios.py               # PyBaMM 4 個情境離線跑
│   ├── eval_severson_models.py                  # §3.3.3 OLS 結果 → JSON
│   ├── eval_cross_dataset.py                    # §3.3.5 + 附錄 B 結果 → JSON
│   └── export_lstm_onnx.py                      # §3.4 ONNX 匯出
│
├── models/
│   ├── lstm_rul.onnx                            # ONNX IR opset 17
│   ├── lstm_rul.onnx.data                       # external data sidecar
│   └── lstm_rul.pt                              # PyTorch checkpoint
│
├── data/
│   ├── raw/severson/    *.mat                   # 6 GB,gitignored
│   ├── raw/nasa/        *.zip + extracted/      # 210 MB,gitignored
│   └── processed/       *.parquet, *.json       # 衍生產物,gitignored
│
├── notebooks/
│   ├── 00_pybamm_smoke_test.ipynb
│   └── 01_severson_eda.ipynb
│
├── PRESENTATION_GUIDE.md                        # 5 分鐘 demo 腳本
├── DEPLOY.md                                    # Vercel 部署 SOP
└── project guidance                                    # AI 協作者規則(house rules)
```

---

> **文件版本歷史**
>
> * v1.0 — 2026-04-29 初版(W2 末)。涵蓋 §1–§9 + 附錄 A/B/D;附錄 C
>   為占位章節,W3 補。
> * 後續更新將以 git commit 形式追蹤,每次更動含 changelog。

> **End of document**
