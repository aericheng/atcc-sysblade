---
title: "Sysblade HyperBuffer · 單顆 BBU Demonstrator 實作企劃"
team: "ATCC 第 23 屆 C13 系統電工業菁英賽 學生競賽團隊"
date: "2026-05-19 · 複賽繳交版 v1.8"
deadline: "2026-06-11(複賽日)"
upstream: "商業企劃書 v2.2 · 技術白皮書 v1.1"
detail_doc: "docs/BBU_IMPLEMENTATION_PLAN.md v1.8(完整技術細節 + 14 章節 + Annex)"
budget: "NT$ 50,000 上限 · BoM v1.8 鎖定 NT$ 44,234 · Buffer NT$ 5,766(借 PSU+萬用表 → 8,066)"
sponsor: "Sysgration 贊助金 + 元件採購通路(無 EE 顧問 / BMS reference design / 韌體工程師指導)"
commit_baseline: "GitHub aericheng/atcc-sysblade,本提案對應 commit `9a6314a`(2026-05-19)"
---

# Sysblade HyperBuffer 單顆 BBU Demonstrator 實作企劃

> 26 天 · NT$ 5 萬 · 4 件可驗證證據 · 證實 v2.2 spec 可實現

---

## 一頁定位

**問題**:初賽 SaaS 證明了 Sysblade 軟體故事(4 大頭條:**3.5× 電壓震盪降 / 5.7× LFP RMS 削峰 / 10 yr BBU 服役 / 33% 10 yr TCO 節省**);複賽需證明 **hybrid LFP + supercap 拓樸、邊緣 LSTM 推論、Fleet Dashboard 三件套在實機上可運作,不只是模擬**。

**約束**:26 天 / NT$ 5 萬 / **Sysgration 限於贊助金 + 元件採購通路,無 EE 顧問 / BMS reference design / 韌體工程師指導**。完整 spec 2.5 kWh / 15 kW BBU 在此預算與時程下物理上不可能(車規 LFP 樣品 lead time 6-12 週、Eaton XLR LIC 4-8 週、15S × 360 A 安全風險)。

**Scale 對焦(GB200 NVL72)**:demonstrator 是 **per-GPU pulse profile scaled-down**(0.5 kW ±30% / 100 ms 對應 1 顆 GB200 GPU ~50% 工作點),**非 NVL72 整 rack scale**(整 rack ~72 kW)。整 rack BBU 對應 v2.2 §E.1 完整 spec 15S × 360 A,屬 W3+ EVT(2026 Q3)路線圖。

**解法**:交付 **8S LFP scaled-down demonstrator**,容量縮 10×、串數縮 1/2,但 **per-cell 工作點 + 控制律 + 拓樸與 spec 完全一致**;產出 **4 件可被評審 challenge 的可行性證據**,證明 spec 的核心技術主張可落地。

**價值**:評審看到的不是 1000 台模擬數字,是**真實 bench demonstrator 餵到 dashboard 的即時 telemetry + scope 量到的削峰波形 + 邊緣 INT8 推論 latency histogram + Severson MAPE 8.38% bagged-GBT(達 v2.2 < 10% 承諾)**。從「紙上提案」變「實機驗證」。

---

## 4 件 Critical-path 證據(M1–M4)

| # | Milestone | 證據 artifact | 對應 spec | 狀態 |
|---:|---|---|---|:--:|
| **M1** | **8S scaled simulation gate** | `scaled_8s_sim.json`:**power ratio 5.72× / voltage ratio 3.52×** | spec 5.7× / 3.5×,**對齊到小數位** | ✅ **2026-05-17 PASS** |
| **M2** | **邊緣推論 latency histogram** | `lstm_latency_*.{json,png}`:笔电 baseline **p99 245 µs INT8** | **白皮書 §C 靜態圖估算 27-109 µs(STM32N6 NPU,non-measured)**;Pi 5 為 measured stand-in | 🟡 partial(Pi 5 到貨後 swap)|
| **M3** | **Hybrid 削峰實機波形** | Oscilloscope 2 張波形圖 + 量測 JSON | **bench 削峰因子 ≥ 3×(LFP RMS 降至 ≤ 1/3)+ V_cell pp ≥ 2×(降至 ≤ 1/2)**,寬鬆於 sim 5.7× / 3.5×(預留實機損耗 budget) | 📋 **soft target 6/2 Tue / hard 6/3 Wed**(1 天 buffer 給 τ tuning)|
| **M4** | **Dashboard LIVE row E2E** | dashboard 截圖 + 5 秒影片 LIVE row 隨 e-load 變化 | spec §2.6.3 fleet dashboard 可接真實設備 | ✅ **軟體 stack 完成**(mock 已 E2E),W3 Wed 接真實 BMS |

**4 件全到位 = 完整可行性論述閉環**。M1 證明設計縮放可行,M2 證明邊緣推論可部署,M3 證明硬體可運作,M4 證明軟體可整合。

### KPI Pass criteria(複賽 review 用)

| # | Bench Pass 判準 | sim 對照 | 為何寬鬆於 sim |
|:--:|---|---|---|
| M1 | power ratio ≥ 5× / voltage ratio ≥ 3× | 5.72× / 3.52× ✅ | (已 PASS,無寬鬆需求)|
| M2 | **Pi 5 p99 < 500 µs** + **INT8 vs FP32 ΔMAPE < 0.5%** | 笔电 INT8 p99 245 µs | INT8 量化 measured ΔMAPE +0.10 pp;500 µs 為實機保守上界 |
| M3 | **bench LFP RMS ratio ≥ 3×** + **V_cell pp ratio ≥ 2×** | sim 5.7× / 3.5× | MOSFET Rds(on) + shunt 量測延遲 + firmware tick rate + 寄生電感 + PCB layout 損耗 budget |
| M4 | DL24M 增載 → dashboard **30 秒內**看到 V 微降 / 溫度升 | (純整合,無 sim 對照)| 5 秒 polling × 6 cycles 容差 |

---

## 系統規格(對應 v2.2 spec 縮放)

| 層 | demonstrator | v2.2 spec | 對位邏輯 |
|---|---|---|---|
| 主電池 | **8S1P LFP × 5 Ah pack**(25.6 V / 128 Wh;**採購 12 顆 = 8 主用 + 4 cell-matching 備品**)| 15S × 2.5 kWh(48 V) | 容量縮 10×,**per-cell C-rate 5C peak / 1C 連續對應 spec 6C / 1.5C 都落在車規 LFP datasheet 同條目允許區**(§2.1.1 答辯);§4.2.1 SOP 從 12 顆挑 OCV 偏差 ≤ 30 mV 的 8 顆組 8S1P |
| 輔助 | **2× Maxwell BMOD0058-E016-C02 串聯**(32 V / 29 F / 44 mΩ ESR) | 2× Eaton XLR-48-166(48 V / 332 F / 2.5 mΩ) | LIC stand-in,RC anchor model 在白皮書 §2.3.0 已揭露 |
| 控制律 | **STM32F411 / 一階互補濾波器 τ=0.5 s / 1 kHz 控制環** | 完全相同公式 | `scripts/hybrid_control_emulator.py` 對齊 §1.3 sim 5.72× |
| 邊緣推論 | **Raspberry Pi 5 + onnxruntime + INT8 LSTM**(63 KB ONNX,FP32 219 KB → 3.49× 壓縮 measured)| STM32N6 Neural-ART NPU(EVT 階段) | INT8 model 同 ONNX,Pi 5 是 STM32N6 stand-in;**STM32N6 NPU 27-109 µs 為白皮書 §C 靜態圖估算(non-measured),實機 trace 待 W3+ EVT 2026 Q3**;Pi 5 latency 為 measured stand-in target |
| Dashboard | **既有 SaaS + LIVE row**(client polling JSON,Python bridge atomic write) | spec §2.6.3 fleet dashboard | M4 證明非純模擬,可接真實 device telemetry |

---

## 帳目

| 項目 | NT$ |
|---|---:|
| 預算上限 | 50,000 |
| **BoM 鎖定(v1.8)** | **44,234** |
| 主要支出:Maxwell × 2 + INA228 × 2 + IRFB4115 × 5 + Pi 5(DigiKey 同單)| 17,824 |
| DL24M 電子負載(Amazon)| 4,500 |
| JK-BMS JK-B 8S 100A + GX12 cable + USB-RS485 FT232 | 4,400 |
| **LFP cell × 12**(8 主用 + 4 備品)+ holder + 主電池配件 | 3,800 |
| 安全(fuses / 接觸器 / E-stop / PPE / Lith-Ex 滅火噴罐 / pre-charge 套件) | 4,550 |
| 機構 + 散熱 + 線材 + 雜耗 | 4,160 |
| Pi 5 配件 + SD card + 周邊 | 2,300 |
| UCC27282 + IRLZ44N + 5Ω 預充電阻 + USB hub | 2,700 |
| 借設備(學校 EE 系:bench PSU / 萬用表 / 示波器 / 差動探棒)| (借)|
| **Buffer** | **5,766**(借 PSU+萬用表 → 8,066)|

⚠️ **Warning line NT$ 5,000,目前餘 NT$ 766** — 後續任何升級需明確「不可省」理由。完整 34 SKU 明細見 `docs/PURCHASE_LIST.md` v1.8。

---

## 4 週時程

| 週 | 日期 | 主產出 | 死線 |
|---|---|---|:--:|
| **W1** | 5/16-22 | M1 ✅ 模擬 gate PASS;採購全部到貨;軟體 stub(M4 mock + M2 笔电 baseline)全部 ✅ | 5/22 W1 review |
| **W2** | 5/23-29 | 組裝 8S LFP pack + supercap bank + STM32 控制板 + Pi 5;cell 首充 + burn-in;**M2 final**(Pi 5 latency)| 5/29 W2 review |
| **W3** | 5/30-6/5 | 整機接電;hybrid OFF/ON 對照;**M3 削峰實機波形(soft target 6/2 Tue / hard 6/3 Wed,1 天 buffer)**;**M4 LIVE row E2E(6/4 Thu)** | 6/5 W3 review |
| **W4** | 6/6-11 | 4 件證據整合進簡報;**dry-run × 3 + 備援 artifact**(任一次失敗 → 預錄影片 + screenshot pack `docs/figures/demo_backup/`);Q1-Q10 答辯練習;**複賽日 6/11 demo + 答辯** | 6/11 複賽日 |

---

## 風險與 Fall-back

**Plan A → Plan E 階梯**(任一週 review 不達標立即降階,避免 W4 才發現崩):

| Plan | 規格 | 觸發條件 |
|---|---|---|
| **A**(目標)| 完整 demonstrator:LFP pack + supercap + STM32 + Pi 5 + LIVE row | 預設執行路徑 |
| A+(stretch)| 同 A,Pi 5 換 STM32N6 dev kit | W2 結束時 NPU 板取得 + 預算 buffer 仍夠 |
| **C**(降階)| 4S LFP + 1 顆 supercap PoC,只 prove 控制律 + Pi 5 latency,不接 dashboard | M3 削峰 ratio < 3× / 6/3 hard deadline 拿不到 headline 波形 |
| D | 元件單獨展示 + 既有 SaaS | LIVE row 接不通 / 整機整合失敗 |
| E | 純 SaaS demo(等於初賽)| 絕對最後路徑 |

> **Plan B 跳號說明**:v1.3 重新框定時將「Plan B(原 Pi 5 stand-in 路線)」併入 Plan A(因 Pi 5 已是預設,B 失去獨立意義);C/D/E 編號維持避免內部 churn。完整 fall-back 邏輯見 `BBU_IMPLEMENTATION_PLAN.md` §9。

**Top 5 風險與緩解**:

| 風險 | 機率 | 衝擊 | 緩解 |
|---|:--:|:--:|---|
| Supercap pre-charge SOP 違反 → 200+A inrush 燒 MOSFET | 中 | 極高 | §4.5.5 三層防線(L1 手動 / L2 硬體 / L3 韌體)強制 SOP;BoM 含 NT$ 250 預充電路 |
| STM32 韌體 oscillation / 不穩 | 中 | 高 | W1 已完成 Python 控制律 emulator 對照(`hybrid_control_emulator.py` 對齊 §1.3 sim);W2 用信號發生器 bench dry-run 後才接電 |
| LFP cell 假貨 / 容量縮水 → 韌體模型失準 | 中 | 中 | §4.2.1 收貨 OCV 粗篩 + pre-balance + 1hr burn-in;cell IR > 20 mΩ 退貨 |
| JK-BMS 買到非 JK-B series → parser offset 不對 | 中 | 中 | 採購防呆:checkout 必勾 JK-B + RS485 customization;到貨 `python scripts/jkbms.py --port COM3` 驗 |
| 複賽當日 demo 卡 | 低 | 高 | localhost dev server 為預設 demo path;備案錄影 + screenshot |

---

## 安全配備 + SOP(學生團隊 800 W bench 工作)

**為什麼必列**:8S LFP × 5 Ah(128 Wh)× peak 25 A + 32 V supercap bank(29 F,儲能 ~15 kJ)= 學生團隊在 32 V × 25 A 工作點下接電;**任一 SOP 違反 = 起火 / 燒件 / 人員傷害風險**。Sysgration 不提供實驗室與 EE 顧問,SOP 嚴格度自主強化。

### 3 層 SOP(完整流程見 `BBU_IMPLEMENTATION_PLAN.md`)

| 層 | SOP | 觸發場景 | 違反後果 |
|---|---|---|---|
| **§4.5.5 Supercap pre-charge 三層防線** | L1 手動 PSU 拉 supercap → bus 距 < 0.5 V → L2 5 Ω/40 A relay 旁路電阻 → L3 STM32 state machine 鎖序 | 主接觸器合閘前 | **200+ A inrush → MOSFET 炸 / 主匯流排熔斷 → 起火** |
| **§4.2.1 LFP 首充 CC/CV SOP** | 萬用表逐顆量 OCV → ≤ 30 mV 偏差篩選 → 0.5 C / 2.5 A CC → 3.65 V CV → 30 mV 收斂 → 1 hr burn-in | cell 收貨 → 組 8S1P pack 前 | **SOC 散布 > 50 mV → BMS 首充 5 min trip → cell 退貨** |
| **§6 安全配備** | 1.5 kV PPE 手套 + 側護目鏡 + **Lith-Ex 鋰電池滅火噴罐**(ABC 一般滅火器**不能用**)+ E-stop + **Class T fast-blow 100 A fuse**(ANL 擋不住 supercap 5 kA 短路)+ DC 100 A 接觸器 | 整個 bench 操作期間 | **熱失控時 ABC 滅火器無效 → 火勢蔓延** |

### Demonstrator 開機檢查 SOP(每次 demo / dry-run 前必跑)

```
[ ] 萬用表量 v_supercap(datasheet WARNING:可能 bounce back 至 2 V)
[ ] 萬用表逐顆量 cell V,8 顆都在 3.0-3.4 V 範圍
[ ] §4.5.5 L1 三層 SOP 跑完(手動 pre-charge + 5 Ω relay + state machine)
[ ] E-stop 按鈕測試:按下 → 主接觸器斷開 → 確認 V_bus 歸 0
[ ] Lith-Ex 噴罐 + PPE 在 1 公尺內可拿取
[ ] 示波器接 GND → V_bus + V_supercap 顯示穩定
[ ] DL24M 設 5 A × 1 sec 試拉,觀察 V_bus droop < 200 mV
```

---

## 商業敘事(SaaS + TCO 落地價值)

**為什麼 ATCC 要看**:ATCC 是 marketing-strategy 比賽,**4 件實機證據是技術骨架,商業敘事是肌肉**。Sysgration 進入 BBU 市場的策略價值 = Tier-2/3 colo 縫隙 + 軟硬整合差異化 + 18-24 個月先發空窗。

### 4 大頭條落地(初賽提出,複賽 demonstrator 證實)

| 頭條 | 模擬出處 | 複賽證據 | 客戶價值 |
|---|---|---|---|
| **5.7× LFP RMS 削峰** | PyBaMM DFN sim ✅ | **M3 實機波形對照** | LFP 壽命延長 → 換電池週期從 6 yr → 10 yr |
| **3.5× cell 電壓震盪降** | PyBaMM DFN sim ✅ | **M3 scope V_cell pp** | PSU 不誤觸 OVP/UVP,Tier-2/3 SLA 達標 |
| **10 yr BBU 服役壽命** | Severson aging fit + BBU duty | 跨化學 cross-dataset 證據 | 客戶 CapEx 攤提期延長 |
| **33 % 10 yr TCO 節省** | v2.2 §G.3 elasticity model | `/tco` Calculator client side | 業務談 USD 25 k/site/yr SaaS 訂閱依據 |

### RUL 預測落地證據(對應白皮書 §B)

- **Severson 13-feature bagged-GBT(K=24)+ xstrict cell filter**:random split 10-seed median **MAPE 8.38 %**(R² = 0.89),**首次達 v2.2 < 10 % 承諾**(原 plain-OLS 14.51 %)
- Cross-batch 用 bagged-OLS 達 **MAPE 13.87 %**(R² = +0.21);GBT 跨 protocol 過擬合退化到 17–22 %,**部署 SOP**:同 protocol 用 GBT,新 protocol fall back bagged-OLS
- INT8 量化 measured:size 219 KiB → 63 KiB(**3.49× 壓縮**),**ΔMAPE +0.10 pp,R² 不變**,CPU INT8 vs FP32 1.12× 加速

### SaaS 商業模式

- **USD 25 k / site / year**:dashboard + Twin API + 三層服務(Tier-1 即時 / Tier-2 地理 / Tier-3 替換隊列)
- **與機台數脫鉤**:site license 比 per-rack 訂閱對 Tier-2/3 colo 更友善
- **本地推論不收 per-inference billing**:NPU 本地推論一次買斷,降低客戶訂閱抗拒
- **Sysgration 切入點**:無 cannibalization 包袱(無現有旗艦 UPS)+ 母公司 TWSE 6312 在地化通路 + 軟硬整合是新世代差異化(Eaton 沒軟體 DNA / Vertiv 押 Tier-1 大型 UPS / Schneider 不自我蠶食 Galaxy VS)

---

## 已落地證據(2026-05-18 截止)

### 軟體交付(11 項已完成 / 1 項 skeleton)

| 路徑 | 角色 | 狀態 |
|---|---|:--:|
| `scripts/generate_scaled_8s_sim.py` | M1 sim gate | ✅ PASS |
| `scripts/measure_lstm_latency.py` | M2 device-agnostic latency 量測 | ✅(laptop baseline 已測)|
| `scripts/hybrid_control_emulator.py` | STM32 控制律 Python 鏡像 | ✅(對齊 §1.3 sim 5.72×)|
| `scripts/jkbms.py` | JK-BMS RS485 parser | ✅(checksum + 8S 自測 PASS)|
| `scripts/live_demonstrator_bridge.py` | bench telemetry bridge | ✅(mock + bench 雙模式)|
| `scripts/eload_gb200_profile.py` | ATORCH DL24M 控制 | ✅(PX100 protocol,4 編碼測例驗證)|
| `scripts/atomic_json.py` | atomic write helper | ✅ |
| `apps/web/src/components/live-demonstrator-card.tsx` | dashboard LIVE 卡 | ✅ |
| `apps/web/src/lib/types.ts` | `LiveDemonstratorSnapshot` 型別 | ✅ |
| `apps/web/vercel.json` | LIVE JSON no-cache header | ✅ |
| `firmware/stm32_hybrid_control/{main.c, pin_map.md, README.md}` | STM32F411 韌體 skeleton | ✅ skeleton |
| `data/processed/scaled_8s_sim.json` | M1 證據 artifact | ✅ |
| `data/processed/lstm_latency_laptop_cpu.{json,png}` | M2 笔电 baseline 證據 | ✅ |

### 文件交付

| 文件 | 行數 | 用途 |
|---|---:|---|
| **本企劃(精簡 1 頁版)** | 此檔 | 評審 5 分鐘讀懂 |
| `docs/BBU_IMPLEMENTATION_PLAN.md` v1.8 | ~1,100 | 完整技術細節 + 14 章節 + Annex(v1.8 對齊本提案)|
| `docs/PURCHASE_LIST.md` v1.8 | 166 | 34 SKU 採購清單分波 + 防呆 + 收貨 SOP |
| `docs/TODO_v1.7.md` | 217 | 77 項代辦清單 + checkbox(v1.7-era artifact)|
| `PRESENTATION_GUIDE.md` | 227 | 5 分鐘 demo + Q1-Q10 答辯 |

### Reproducibility — GitHub baseline

本提案所引腳本 / 數據 / artifact 對應 **GitHub `aericheng/atcc-sysblade` commit `9a6314a`**(2026-05-19 baseline)。複賽前若有腳本 / 數據 / 文件更新,以 `git log --since=2026-05-19` 為對照基準。

---

## 一句話結論

**26 天內,4 件 critical-path 證據已 2 件完整 + 1 件 partial + 1 件硬體就緒**,Plan A 執行路徑風險可控、Plan C/D 降階階梯齊全;**安全 SOP 三層防線 + 4 大頭條商業敘事(5.7× / 3.5× / 10 yr / 33 % TCO)+ Severson MAPE 8.38 % 跨領域證據完整**。**繳交此計畫 = 證明團隊在資源受限下能交付可驗證的工程成果與商業敘事,非紙上談兵**。

技術深度、採購防呆、安全 SOP、答辯腳本所有細節:**`docs/BBU_IMPLEMENTATION_PLAN.md` v1.8(14 章節 + Annex A/B)**;每日代辦進度:**`docs/TODO_v1.7.md`**;5 分鐘 demo 腳本 + Q1-Q10 答辯:**`PRESENTATION_GUIDE.md`**。
