# 修訂:附件 B 軟體技術棧(v2.1 → v2.2)

v2.1 原本只列 stack 名稱,沒有實作結果。本修訂為**每條補上 measured 數字**
讓業師讀完附件 B 即知三件套真正做到什麼。建議直接取代 v2.1 附件 B 內容。

---

## 附件 B. 軟體技術棧(程式選手實作清單)

* **(a) TCO Calculator**:Next.js 14 + Vercel + Tailwind。輸入欄:機櫃數、
  電價、現用 BBU 規格 → 輸出:5 / 10 年 TCO、ROI、CO₂ 節省。**已部署:
  <https://sysblade-atcc.vercel.app/tco>**;default Mid-tier(50 racks,
  Texas)preset 算出 **每櫃 10 年節省 USD 9,600,33 % 客戶總持有成本下降**
  (對齊 §G.3 表)。Slider 實時更新四個輸入。

* **(b) Battery Digital Twin**:Python 3.11 + PyBaMM 26.4.1 (DFN with
  Prada 2013 LFP-graphite parameter set) + PyTorch 2-layer LSTM (hidden=64,
  input shape (99,7)) + onnxruntime INT8 deployment. 資料源:
  Severson 2019 TRI dataset (138 cells parsed from 124-paper subset, 主訓練)
  [12] + NASA Prognostics PCoE [15] + 50 PyBaMM-calibrated BBU-duty 合成
  cell (regime-gap closure)。**已部署:<https://sysblade-atcc.vercel.app/twin>**。
  輸出 SOH/RUL with 90 % MC Dropout + split conformal PI。
  **誤差實證(達 v2.1 < 10 % 承諾)**:
  - **bagged-GBT + xstrict cell filter `cycle_life ≥ 400`(n=134),
    Severson random split 10-seed median MAPE = 8.38 %、R² 0.89**
    (per-seed [5.93, 12.91],7/10 seeds < 10 %)— **paper 學術 baseline,
    首次達 v2.1 「< 10 %、Severson 9.1 % 對標」承諾**
  - bagged-OLS + xstrict cross-batch median MAPE = 13.87 %、R² +0.21
    — cross-protocol fall-back
  - LSTM augmented(188 cells)整體 test MAPE 19.10 %、R² 0.86 —
    `/dashboard` 1000 台 fleet 推論引擎(`one model, two views`)
  - INT8 ONNX size 219 KiB → 63 KiB(3.49× compression measured),
    ΔMAPE 僅 +0.10 pp、R² 不變 — STM32N6 部署 ready
  - 90 % Conformal PI:test coverage 100 %(≥ 90 % 保證),中位數 PI
    寬度 1910 → 1075 cycles(縮窄 44 %)
  - **Cross-chemistry transfer**(Severson LFP → NASA NMC)5/5 feature
    全部 OOD、z-distance 5–65 σ;**模型不可直接跨化學部署,須
    per-chemistry calibration cycle**(誠實寫進產品 SOP)
  - **未上實機資料前不承諾 < 5 %**(維持 v2.1 原承諾邊界)

* **(c) Fleet Health Dashboard**:Next.js + d3 US fleet map + recharts。
  視覺化 1,000 台 Sysblade 機隊狀態。**已部署:
  <https://sysblade-atcc.vercel.app/dashboard>**;**全頁明標 SIMULATED DATA
  watermark**。三層服務分層對應 v2.1 §E.3:
  - **Tier-1 即時監控**:1000 台 SOH / RUL / status table,健康狀態總計
  - **Tier-2 地理分佈**:US fleet map(本 fleet 模擬權重 Texas 49 % /
    Virginia 27 %,為 AI 機房密度加權後本文假設;v2.1 §C.1 引 JLL 真實
    全美在建容量為 18.6 % / 15 %)
  - **Tier-3 替換隊列**:admission rule `status === "early_aging"`(SOH < 0.85
    OR RUL < 800 cycles),依 RUL 升序顯示最緊急 8 台,演算法主動推到客戶
    ServiceNow ticketing

> **Reproducibility gate**:`.github/workflows/check.yml` 在每次 push 跑
> `scripts/check_whitepaper_numbers.py`(19 條數字 cross-check 對齊
> JSON ground truth),任一 doc 數字漂移 0.05 pp 即 CI 紅燈。完整方法論
> 與限制見 GitHub `aericheng/atcc-sysblade · docs/whitepaper.md`(技術
> 白皮書,1100 行)+ 本文件附件 D 摘要。
