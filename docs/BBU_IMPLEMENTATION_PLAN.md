---
title: "Sysblade HyperBuffer 單顆 BBU 實作計畫 — 複賽階段(2026 Q2)"
version: "v1.3"
date: "2026-05-16"
deadline: "2026-06-11(複賽日)"
scope: "scope Tier B — 8S LFP demonstrator(per-cell 工作點對齊 v2.2 §E.1,容量/串數縮放)"
budget: "NT$ 5 萬以內(Sysgration 純贊助金,無技術支援)"
team: "ATCC C13 學生競賽團隊(4 人)"
---

# Sysblade HyperBuffer 單顆 BBU 實作計畫

> 對應 ATCC 第 23 屆 C13 系統電 複賽 階段。本文件補上初賽僅有 SaaS demo
> 的不足,提交實機 demonstrator 與 bench validation。

---

# Part 0 · 現實檢查(必讀)

## 0.1 spec-grade 單顆 BBU 為何 26 天 5 萬做不出來

| 阻擋點 | 數字 | 後果 |
|---|---|---|
| **Eaton XLR-48-166 單模組** | 約 USD 600–800 / pcs(Mouser/Digi-Key list),lead time 4–8 週 | 兩顆就吃掉 NT$ 36k–50k,沒裝到貨已經超預算且超時 |
| **車規 LFP 高功率 cell**(LG ESS B-series / Samsung SDI 高功率版) | 樣品需 NDA + Tier-2 採購量,lead time 6–12 週,單顆 USD 30–80 × 15 = NT$ 14k–35k | 拿不到貨 |
| **15 kW 雙向 DC-DC + BMS for 15S × 6C peak (~360 A 瞬間)** | 工業級 BMS chip(BQ76952 family)+ MOSFET 矩陣 + 電源板自製,即使 dev kit 也要 6–10 週 layout/build/test | 韌體沒時間調機 |
| **OCP ORV3 12U 機箱** | 訂製機械、busbar、connector,lead time 8–12 週 | 連設計圖都來不及 |
| **NFPA 855 abuse + UL 1973** | 認證費用 USD 數萬起、lead time 6–12 個月 | v2.2 §F.1 也只承諾 2027 Q3,本來就不在 26 天範圍 |
| **學生團隊 15S × 360 A 安全經驗** | 48 V × 360 A = 17 kW 短路能量,電弧傷害嚴重 | 不在工業級防護下不應做這個瓦數 |

→ **要在 26 天內交出「真的有東西可以拍照、現場 demo」的單顆 BBU,只能走縮放版。**
這對複賽其實是好事:評審看的是「你們的 hybrid 拓樸 + 邊緣推論 + 數位孿生在實機上可運作」,
不是「你們做了 hyperscale 等級的硬體」。

## 0.2 三層 scope 對照(挑一個再開計畫)

| Tier | 規格 | 預算 | 26 天可行性 | 對複賽說服力 |
|---|---|---|---|---|
| A. 完整 spec 縮放版 | 15S LFP × 1 Ah cell(~0.5 kWh / 2 kW peak),1× Eaton XLR-48-166,STM32N6 | NT$ 4.5–6 萬(會超) | ⚠️ Eaton lead time 是死穴,LFP 15S BMS 不易 | 高(對齊 spec 拓樸),但做不完的風險高 |
| **B. ⭐ 推薦:8S LFP demonstrator(scaled-down topology)** | 8S LFP(~25 V)× 5–10 Ah,2–4× 商用 supercap 模組(替代 LIC,匹配 ESR/τ),STM32 + 邊緣推論(Pi 5 / Jetson Nano stand-in)| NT$ 3.5–4.8 萬 | ✅ 可達 | 中高 — 證明「混合控制律 + 邊緣推論 + dashboard 閉環」端到端 |
| C. Bench-top PoC 純拓樸驗證 | 4S LFP(~13 V)+ supercap × 1–2 + STM32 控制板 + 電子負載當 GB200 emulator | NT$ 1.5–2.5 萬 | ✅ 容易達成 | 中 — 適合當「W3+ EVT roadmap 的 W2 階段成果」說 |

下面的計畫主體針對 **Tier B** 寫;A 跟 C 的差異在各節旁註備存。

## 0.3 為什麼推薦 B 而不是 A

1. Eaton XLR-48-166 在 26 天內到貨機率低(Mouser 顯示常 NRND / 大長 lead time)。Sysgration 純贊助金不能變出元件,只能照 Tier-2 商用通路採購。
2. 8S 不需要 isolated DC-DC 即可 buck 到 12 V / 24 V 的常見實驗負載,降低電力電子複雜度。
3. 5–10 Ah cell 用單體 18650/26650 LFP 即可,Taobao/淘寶/中華電池通路 1–2 週可到,單顆 NT$ 200–500。
4. 2–4× 商用 supercap 模組(Maxwell BMOD0058 16V/58F 或 SkelCap 16V/63F 二手,或 EDLC × 多串)可在功率密度與時間常數上與 LIC datasheet 同階,白皮書 §2.3.0 已揭露 LIC 是 RC anchor model — demonstrator 用 EDLC 替代不違背 spec 故事,只要簡報誠實標註「PoC supercap stand-in for LIC,EVT 階段切回 LIC」。
5. 8S LFP 短路電流上限可以靠選用較小 Ah cell + 80–100 A 級 fuse 控制在學生實驗室可接受範圍(對比 15S × 6C × 大 Ah 的 200+ A)。

---

## 0.4 ⭐ Critical-path-only mode(v1.3 reframe)

**重新框定問題**:複賽不需要「做出一顆可量產的 BBU」,需要的是「**4 張可被評審 challenge 的可行性證據**」。其餘所有元件都是「執行這 4 件事的 infrastructure」,不是 critical path。

### 4 件 critical-path 證據(缺一論述就有洞)

| # | 證據 | 產出 | 對齊白皮書 |
|---|---|---|---|
| 🎯 1 | **8S scaled simulation gate** | `data/processed/scaled_8s_sim.json` 數字表 | §3.1 / §3.2 縮放後 5.7× / 3.5× 仍守得住 |
| 🎯 2 | **混合拓樸閉環削峰波形** | scope 抓 hybrid vs LFP-only 兩條曲線(2 張圖) | §3.2 控制律實機可運作 |
| 🎯 3 | **邊緣推論 latency 實測** | Pi 5 / STM32N6 跑 1000 次 INT8 LSTM 的 µs histogram | §3.4 / 附錄 C NPU 部署可行 |
| 🎯 4 | **Dashboard LIVE row** | dashboard 截圖 + 5 秒影片顯示 row 隨負載變化 | §2.6.3 fleet dashboard 可接真實 device |

### 三層標記法(本文 v1.3 起套用)

| 標記 | 意義 | 例 |
|---|---|---|
| 🎯 | **Critical path** — 4 件證據之一或必要前置 | MOSFET switch matrix、控制板、e-load、Pi 5/STM32N6 |
| 🛡️ | **Safety enabler** — 不證明任何事,但讓 critical path 可以「在不冒煙的情況下執行」 | BMS、fuse、E-stop、PPE、Lith-Ex 噴罐 |
| ⏭️ | **Skippable** — 加分但不影響可行性論述,時間壓力下先砍 | 24 h 燒機、cell 精密配對、機械商品照、白皮書文件更新 |

**讀者使用法**:每個 Part 5(驗證流程)/ Part 7(時程)的工作項目旁邊都會帶這三個 marker;若時程吃緊,⏭️ 全砍、🛡️ 維持、🎯 不動。

### Lean BoM vs Full BoM 兩版本

- **§2.1 Lean BoM** — 僅留 critical path + safety enabler,NT$ ~39,858,推薦
- **§2.2 Full BoM (v1.2 凍結)** — 含完整 demonstrator 配備,NT$ ~47,900,作為 stretch / 比較

省下的 buffer 不是用來買新東西,而是吸收採購意外、補耗材、覆蓋失敗重做(LFP 點焊失敗、MOSFET 燒掉等)。

---

# Part 1 · 推薦 scope(Tier B)技術規格

## 1.1 系統 spec(向 v2.2 對齊但縮放)

| 項目 | demonstrator 值 | 對齊 spec 的關係 |
|---|---|---|
| 主電池串數 | **8S LFP**(25.6 V 標稱) | spec 15S × 48 V → demo 走 8S × 25.6 V,比例 ~1/2;簡報明標「scaled-down」 |
| 主電池容量 | **5–10 Ah** per parallel,1P 或 2P → 0.13–0.5 kWh | spec 2.5 kWh → demo ~5–20 倍小 |
| 主電池峰值 | **~650 W peak**(baseline 500 W ±30 %),per-cell C-rate ~**5C** × <2 s pulse,**~1C 連續** | spec 是 6C peak;v1.2 因 Maxwell BMOD0058 Ioper 19A 限制,demonstrator 功率下調保留 51% supercap 電流餘量;5C / 1C 仍落在車規 LFP datasheet 不同條目允許區內(§2.1.1 答辯邏輯不變)|
| LIC 替代 | **2× Maxwell BMOD0058-E016-B02 串聯**(32 V bank,29 F equivalent,44 mΩ ESR;v1.2 §1.3 gate 鎖定)| RC 等效模型參數 anchor 到 datasheet(22 mΩ × 模組)+ demonstrator 量測校驗,**不再** anchor 到 Eaton XLR datasheet(誠實 caveat) |
| 控制律 | 一階互補濾波器,τ = 0.5 s,在 STM32 上實作 | 與 `generate_twin_scenarios.py::SPLIT_FILTER_TAU_S` 完全同一條公式 |
| 邊緣推論 | STM32N6 開發板(若可取得)或 Pi 5 + ONNX Runtime stand-in | INT8 LSTM 已 export(`scripts/quantize_lstm_onnx.py`)直接 deploy |
| Telemetry | UART/USB → 筆電 Python bridge → 既有 `/dashboard` | 從 demonstrator 餵真實 device 進 1000-台 fleet 中當 1 個 row,證明 dashboard 不是純模擬 |
| 機械 | DIN rail / acrylic open-frame,加防護罩 | 不做 OCP ORV3,但要看得出「rack-mountable 規劃」(尺寸標註對齊 12U) |

## 1.2 demonstrator 要 prove 的 4 件 critical-path 證據

> v1.3 reframe:原 v1.0–v1.2 列「3 件事」,實際拆解後是 **4 件**(把 §1.3 模擬 gate 從 W1 工作項升格為獨立證據)。每件都對應一張可被評審 challenge 的 artifact。

1. 🎯 **§1.3 8S scaled simulation gate** — `data/processed/scaled_8s_sim.json`。**已完成 2026-05-17 PASS**(5.72× / 3.52×)。沒有這條,實機數字「預期值」沒有 baseline 對照,評審問「8S 縮放怎麼知道 work」答不上來。
2. 🎯 **5.7× / 3.5× 削峰在實機上重現** — 用電子負載打 ±30 % @ 100 ms profile,scope 量純 LFP vs hybrid 兩條曲線。**這 2 張波形圖是複賽最有說服力的 slide**,直接證明「混合拓樸不是理論」。沒有這張圖,你們跟初賽純 SaaS demo 沒本質差別。
3. 🎯 **邊緣推論 latency 實測** — Pi 5 + ONNX runtime 或 STM32N6(後者 stretch);跑 1000 次 INT8 LSTM 取平均 µs。把白皮書附錄 C 的「靜態圖估算 27–109 µs」升級為「實機量測」。半天可完成。
4. 🎯 **Dashboard LIVE row** — 1000 台模擬 fleet 中插 1 row 真實 demonstrator,Python bridge 寫 atomic JSON,dashboard 5 秒 polling。**改動量小,展示效果是質的飛躍**。

**四件加起來**:#1 證明設計縮放可行、#2 證明硬體可運作、#3 證明邊緣推論可部署、#4 證明軟體可整合。**論述閉環**。

## 1.3 ⭐ W1 Day 1 模擬驗證 gate — **2026-05-17 已執行,PASS**

**結果**(`data/processed/scaled_8s_sim.json`,腳本 `scripts/generate_scaled_8s_sim.py`):

| 指標 | 值 | spec 目標 | 達標 |
|---|---:|---:|:--:|
| Power ratio(LFP-only std / hybrid std)| **5.72×** | 5.7× | ✅ |
| Cell voltage pp ratio(stable window)| **3.52×** | 3.5× | ✅ |

**Supercap 4 配置 sweep**(全部通過 UVLO + 電流 spec):

| 配置 | i_peak / 模組 | Ioper 餘量 | UVLO 餘量 | 成本 | 採用 |
|---|---:|---:|---:|---:|:--:|
| **2× Maxwell BMOD0058 串聯 (32 V bank)** | **9.3 A** | **51 %** | 15.59 V | NT$ 9,000 | ⭐ |
| 2× 並聯 (16 V bank, 需 DC-DC) | 18.6 A | 2 % | 7.80 V | NT$ 9,000 | ❌ 沒餘量 |
| 4× 2S2P | 4.7 A | 75 % | 15.80 V | NT$ 18,000 | ❌ 過度投資 |
| 2× 串聯,ESR 悲觀 2× | 9.3 A | 51 % | 15.18 V | NT$ 9,000 | ✅ robust |

**鎖定決策**:
- **Demonstrator baseline 500 W ±30 % @ 100 ms**(從 v1.1 1 kW 降載,因 Maxwell Ioper 19 A 限制)
- **Supercap = 2× Maxwell BMOD0058-E016-B02 串聯**(32 V bank,29 F equivalent,44 mΩ ESR)
- **Per-cell C-rate = 5C peak / ~1C 連續**(spec 6C / 1.5C → demonstrator 5C / 1C,差距落在 datasheet 同條目允許區)
- **電子負載升級 ATORCH DL24M 600W**(原 DL24P 150W 帶不動 650 W peak;v1.4 修正品牌 — RIDEN 是雙向電源品牌,DL24 家族屬 ATORCH;BoM 對應 +NT$ 2,000)

**過程文獻**:
- v1.1 推 1 kW baseline + 「2× Maxwell」是 BoM 草案;v1.2 web search 發現 Maxwell BMOD0058 Ioper = 19 A,串聯 1 kW baseline 時 i_peak = 18.6 A 沒餘量
- 重跑 0.5 kW baseline → i_peak 9.3 A,51 % 餘量,gate PASS
- LS Mtron / CSI 同 form-factor 也是 19 A 級,Skeleton 超預算 → 走「降載 + 維持 2× Maxwell」最划算

**為什麼這是 gate 而不是建議**:supercap 選型一旦下單就回不去(eBay 二手不退換),且 lead time 是 W2 整個工期的前提。把 W1 第一天投資在 1 小時 Python sim + 半小時 web search 查 Ioper,避開 W3 重做硬體的災難。

**重跑方法**(若改 cell 規格或 baseline 要 re-validate):
```bash
.venv/Scripts/python scripts/generate_scaled_8s_sim.py
```
改 `BASELINE_KW`(降載)或 `CONFIGS` 列表(換 cap 品牌)後重跑,看新 gate 結果。

**v1.4 datasheet 嚴謹化(2026-05-17)**:Heisener listing 引用的「Ioper 19 A」是業界折衷標式;Maxwell BMOD0058-E016-C02 / B02 datasheet 實際定義為 **ΔT-based** IDCMAX:

| 溫升 ΔT | IDCMAX | 9.3 A 工作點餘量 |
|---|---:|---:|
| 15 °C(保守條件) | 14 A | **34 %** |
| (中間,Heisener 標式)| 19 A | 51 % |
| 40 °C(可接受)| 23 A | 60 % |

9.3 A 在**最保守 ΔT = 15°C 條件**下仍 > 20 % safety margin,加上 IPEAK 190 A(<2 s pulse)— gate 結論不變。Datasheet PDF:`https://maxwell.com/wp-content/uploads/2021/08/3003212.2_Datasheet_BMOD0058-E016-C02.pdf`。

---

# Part 2 · BoM 與採購計畫

> v1.3:拆成兩版 — **§2.1 Lean BoM(推薦,critical-path-only)** 與 **§2.2 Full BoM(v1.2 凍結版,留作對照)**。預算 NT$ 5 萬上限。

## 2.1 ⭐ Lean BoM(推薦,NT$ ~39,858)

只留 critical path(🎯)+ safety enabler(🛡️),刪掉 v1.2 為「完整 demonstrator」加的 ⏭️ 元件。

| 對應 | 類別 | 品項 | 數量 | 單價(NT$) | 小計 | 備註 |
|:--:|---|---|---:|---:|---:|---|
| 🎯 #1 | (純軟體) | §1.3 sim,已完成 | — | 0 | 0 | `data/processed/scaled_8s_sim.json` |
| 🎯 #2 | 主電池 | LFP 26650 3.2V/5Ah | **8**(降為 8S1P,不做 2P,不買備品) | 250 | 2,000 | 蝦皮 / 露天;**v1.2 16 顆 → v1.3 8 顆** |
| 🎯 #2 | 電池座 | 26650 holder + 端子 | 1 套 | 800 | 800 | **預設彈片座**(不假設借到點焊) |
| 🛡️ | BMS | JK-BMS 8S 100A active balance | 1 | 2,800 | 2,800 | cell-level OVP/UVP/balancing 一條解 |
| 🎯 #2 | 超級電容 | **Maxwell BMOD0058-E016-C02 × 2**(串聯 32V)| 2 | 5,304 | 10,608 | **v1.4 更新**:Heisener B02 通路缺貨(2026-05-17 查證),改 DigiKey 台 stock 26 pcs(part 11673898),隔日到貨;C02 datasheet 與 B02 同 family — 16V/58F/22mΩ ESR/IPEAK 190A/IDCMAX 14A(ΔT=15°C)或 23A(ΔT=40°C),M5 螺絲端子 4 Nm,9.3 A 工作點全條件下 ≥ 34 % 餘量;§1.3 gate 仍 PASS |
| 🎯 #2 | 控制板 | STM32 Black Pill F411 | **1**(v1.2 是 2 顆) | 600 | 600 | Pi 5 兼 telemetry bridge,不需第 2 顆 |
| 🎯 #2 | 功率切換 | IRFB4115 × 4 + 5°C/W 鰭片 + 矽脂 | 1 套 | 900 | 900 | hybrid 控制律的物理執行單元 |
| 🎯 #2 | Gate driver | UCC27282 × 2 + bootstrap + carrier | 1 套 | 900 | 900 | (Fallback IR2110 NT$ 50/顆) |
| 🎯 #2 | 電流量測 | INA226 模組 × 2 | 2 | 100 | 200 | **降階**:取代 LEM Hall sensor NT$ 3,000,30 A 工作點 INA226 夠 |
| 🎯 #2 | GB200 emulator | **ATORCH DL24M 600 W**(單機)USB 可程式 | 1 | 4,500 | 4,500 | **v1.4 修正**:品牌 RIDEN → ATORCH;**買單機 600 W 版**(jumper cap + 軟體切 150/300/450/600 W mode);避開賣家標「150 W × 4 並聯到 600 W」— 那是 DL24 (150W) 冒充 DL24M;**peak 650 W 略超 600 W cap ~8 %**,100 ms pulse 在 IPEAK 容差內可接受,簡報若見頂部削平標明 cap 限制不影響削峰 ratio |
| 🎯 #3 | 邊緣推論板 | Raspberry Pi 5 8GB + 電源 | 1 | 4,500 | 4,500 | **取代 STM32N6570-DK NT$ 9,000**;ONNX runtime INT8 LSTM 直接跑 |
| 🎯 #4 | 溫度感測 | DS18B20 × 4 | 1 套 | 200 | 200 | LIVE row 給 dashboard 用,4 顆夠 |
| 🛡️ | LFP 側保護 | 80A blade fuse + 100A 接觸器 + E-stop | 1 套 | 1,500 | 1,500 | |
| 🛡️ | Supercap 側保護 | Class T fast-blow 100A fuse + holder | 1 套 | 800 | 800 | supercap 短路峰值 ~5kA 需快斷 |
| 🛡️ | **Supercap 預充電** | **5 Ω / 50 W wirewound resistor + 40A 5-pin automotive relay + driver MOSFET (2N7000)** | 1 套 | 250 | 250 | **v1.3 補(review B1)**:32V × 29F bank 直接接帶電 bus = 200+ A inrush 會炸 IRFB4115;此路徑為硬體第二防線,主防線是「手動 pre-charge supercap 到距 bus < 0.5V 才合主接觸器」(§4.5.5 SOP) |
| 🛡️ | PPE | 1.5kV 絕緣手套 + 護目鏡 | 1 套 | 800 | 800 | **降階** v1.2 NT$ 2,000 — 噴罐獨立列 |
| 🛡️ | 滅火 | Lith-Ex / F-500 鋰電池噴罐 | 1 | 1,200 | 1,200 | 蝦皮 / momo |
| 🎯 #2 | 機械 | 開放式壓克力 400×250×150 + 鋁角材 | 1 套 | 1,800 | 1,800 | Maxwell 2 顆串聯需放大 |
| 🛡️ | 散熱 | 80mm fan × 2 + heatsink | 1 套 | 400 | 400 | **降階** v1.2 NT$ 600,4 fans → 2 fans |
| 🎯 #2 | 連接 / 線材 | 矽膠線 10AWG + Anderson SB50 + 熱縮套 | 1 套 | 800 | 800 | |
| 🎯 #4 | **USB-to-RS485 dongle** | CH340 + MAX485 small board(蝦皮 / 露天)| 1 | 200 | 200 | **v1.3 review H1**:JK-BMS RS485 → PC 必需 |
| 🎯 全項 | **USB hub**(4-port 自供電 USB 3.0) | 確保 DL24M / JK-485 / STM32 / Pi 5 不爭電 | 1 | 300 | 300 | v1.3 review H1 |
| 🎯 #3 | **Pi 5 配件**:5V/5A USB-C PSU + 32GB SD card + micro-HDMI 線 | 開機必需 | 1 套 | 1,200 | 1,200 | v1.3 review H1;PSU 不能用普通手機充電器(會限流) |
| 🛡️ | **30V/3A bench DC PSU**(或借學校 EE 系)| LFP 8S 0.5C CC/CV 充電 + supercap pre-charge SOP §4.5.5 L1 | 1 | 1,500 | 1,500 | v1.3 review H1;若借不到才買;主要候選 EVENTEK DPS3010 |
| 🛡️ | **數位萬用表**(或借學校)| cell OCV 粗篩、ESR / V / I 量、debug | 1 | 800 | 800 | v1.3 review H1;若借不到才買;標稱 Fluke 17B+ 或 UNI-T UT139C |
| 🛡️ | **ST-Link V2 clone** | Black Pill DFU brick 保險 / SWD debug | 1 | 300 | 300 | v1.3 review H1;主 flash 路徑是 USB-C DFU,此為 fallback |
| **小計** | | | | | **~39,858** | |

**Buffer:NT$ ~10,142**(50,000 − 39,858)。Lean BoM 預算仍寬鬆,可吸收採購意外、補耗材、買額外探棒、或 W4 階段加碼買 STM32N6 補做實機 trace(若 Pi 5 latency 數字想再加強)。

> v1.3 review H1 補 6 項合計 NT$ 4,300:USB-RS485 dongle + USB hub + Pi 5 配件 + bench PSU + 萬用表 + ST-Link。其中 bench PSU 與萬用表若 Sysgration 或學校 EE 系可借,buffer 回升到 ~12,442。
>
> **v1.4 更新(2026-05-17)**:Maxwell 通路從 Heisener B02(缺貨)切 DigiKey C02(現貨 26 pcs),單價 4,500 → 5,304(+18 %);總額 +1,608,Buffer 從 11,750 → 10,142;借得到 PSU+萬用表 buffer 從 14,050 → 12,442。電氣規格同 family,§1.3 gate 仍 PASS。

### Lean vs Full 差異(v1.2 → v1.3 砍掉的清單)

| 砍 | 省 NT$ | 為什麼可砍 |
|---|---:|---|
| STM32N6570-DK → Pi 5 替代 | 9,000 − 4,500 = **4,500** | Pi 5 ONNX runtime 出 INT8 latency 夠當證據;簡報註腳「實機 NPU 待 W3+ 補」對齊 v2.2 §8.2 路線圖 |
| LEM HASS Hall sensor × 2 → INA226 × 2 | 3,000 − 200 = **2,800** | INA226 對 30 A 工作點精度夠,200 mA 解析度看得到 hybrid split |
| LFP cell 16 顆 → 8 顆 | 4,000 − 2,000 = **2,000** | 8S1P 不需要 2P 備品(複賽 demo 不會深放電) |
| 第 2 顆 STM32 | **600** | 1 顆 controller + Pi 5 兼 telemetry bridge |
| DPS5020 數位電源 | **1,800** | 電子負載當 source,不需主動電源板 |
| 點焊機 → 彈片座 | **3,500** | 預設借不到,buffer 更安全 |
| LFP cell 備品 4 顆 | **(內含 8 顆刪減)** | — |
| INA226 線材 + DS18B20 從 NT$ 600 → 400 | **200** | 8 顆 → 4 顆溫度感測夠 |
| 散熱風扇 4 → 2 | **200** | 開放式架構,2 顆足 |
| PPE 簡化 | **1,200** | 噴罐獨立列,手套 + 護目鏡夠 |
| **總計** | **~8,042** | v1.2 NT$ 47,900 → v1.4 NT$ ~39,858(含 B1 supercap pre-charge NT$ 250 + H1 補 6 項 NT$ 4,300 + v1.4 Maxwell 通路升 DigiKey C02 +NT$ 1,608) |

### 採購順序(下單優先級)

1. **🎯 立刻下單**(W1 內必到):LFP cell × 8、Maxwell BMOD0058 × 2、JK-BMS、STM32 Black Pill、IRFB4115、UCC27282、DL24M、Pi 5、INA226、DS18B20
2. **🛡️ 安全配備**(W2 接電前必到):fuses、接觸器、E-stop、PPE、Lith-Ex 噴罐、線材
3. **🎯 機械 / 散熱**(W3 整合用):壓克力、鋁角材、fan、熱縮套

---

## 2.2 Full BoM(v1.2 凍結版,NT$ ~47,900)留作對照

| 類別 | 品項 | 數量 | 單價(NT$) | 小計 | 通路 / 注意 |
|---|---|---:|---:|---:|---|
| **主電池** | LFP 26650 3.2 V / 5 Ah(EVE / Lishen / A123 二手)| 16(8S2P 含備品) | 250 | 4,000 | 蝦皮 / 露天 / Aliexpress;選同批號 + 入庫測容量配對 |
| 電池座 | 26650 holder + nickel strip | 1 套 | 800 | 800 | |
| 點焊機 | (條件式)二手 KW 級點焊機 | 0 或 1 | 3,500 | 0 / 3,500 | **優先借社團 / Sysgration 廠工具**;借不到改 26650 高電流彈片座 + crimp + 鎖點(已含於上一行電池座 NT$ 800),省 NT$ 3,500 入 buffer。決策日 5/19 前 |
| **超級電容** | **Maxwell BMOD0058-E016-B02 × 2 (串聯成 32 V bank)** | 2 | 4,500 | 9,000 | **v1.2 §1.3 gate 鎖定**:i_peak 9.3 A / 模組(51 % Ioper 19 A 餘量),UVLO 餘量 15.6 V;ESR 22 mΩ × 模組;UCAP Power (前 Maxwell) 仍產;**Heisener (HK) 庫存 6,732 pcs** 為主通路(DigiKey 已下架);eBay 二手新品都有 |
| **BMS** | JK-BMS 8S 100A active balance(LFP 預設) | 1 | 2,800 | 2,800 | 蝦皮;支援 RS485 telemetry |
|  | OR Daly Smart BMS 8S 80A | 1 | 2,200 | 2,200 | |
| **DC-DC / 雙向** | DPS5020 5 A / 50 V 數位電源(buck-only)+ 電子負載當 source | 1 | 1,800 | 1,800 | 若需雙向,改 RIDEN RD6018W ~NT$ 5,500 |
| **電子負載 (GB200 emulator)** | **ATORCH DL24M 600 W**(單機)可程式電子負載,USB 控制 | 1 | 4,500 | 4,500 | **v1.2 升級**:demonstrator peak 650 W,原 DL24P 150W 帶不動;DL24M 5 ms 階躍同 DL24P,韌體 API 相容無需改動。**v1.4 品牌修正**(RIDEN → ATORCH) |
| **控制板** | STM32 Nucleo-L476RG 或 Black Pill F411 | 2 | 600 | 1,200 | 控制律執行 + ADC 取樣 |
| **邊緣推論板** | STM32N6570-DK (Neural-ART NPU dev kit) | 1 | 9,000 | 9,000 | lead time 風險高,Mouser/Digi-Key 確認;備案 Pi 5 + Coral USB ~NT$ 4,500 |
| **電流感測** | LEM HASS 50-S Hall sensor × 2(LFP / LIC 各一) | 2 | 1,500 | 3,000 | 量到 6C × 5 Ah = 30 A ok |
| **電壓 / 溫度** | INA226 模組 × 4 + DS18B20 × 8 | 1 套 | 600 | 600 | I²C 多通道 |
| **保護 (LFP 側)** | 80 A blade fuse + 100 A 接觸器(SSR / 機械) + busbar + E-stop 按鈕 | 1 套 | 1,500 | 1,500 | LFP 短路電流上限 ~200–300 A,blade fuse 足夠 |
| **保護 (supercap 側)** | Class T fast-blow fuse 100 A(Bussmann JJN-100 / JJS-100 同等)+ holder | 1 套 | 800 | 800 | **新增 (用戶 review #2)**:supercap bank ESR ≈ 10 mΩ → 短路理論峰值 ≈ 5 kA,blade fuse I²t 不足以快速斷開,**必須用 fast-blow / semiconductor fuse**;沒有這條,supercap 短路會把線材熔斷再引燃 |
| **MOSFET switch matrix** | IRFB4115PBF × 4 + **5 °C/W TO-220 鋁鰭片散熱器 × 2** + 散熱矽脂 + 80 mm 風扇強制對流(共用 §機械 / 散熱欄的風扇)| 1 套 | 900 | 900 | **新增 (用戶 review #5,v1.1 修正散熱):**雙路 high-side N-MOS;**自然對流 25 °C/W 鰭片帶不動 14 W,必須改強制對流 + 低熱阻鰭片**,詳 §4.5.2 熱推導 |
| **Gate driver** | UCC27282 isolated half-bridge driver × 2 + bootstrap cap/diode + carrier 小板 | 1 套 | 900 | 900 | **新增 (用戶 review #5)**:isolated half-bridge driver 避免 bootstrap 在低 duty 失效;若取不到 UCC27282,fallback IR2110 + Schottky bootstrap diode 較便宜但要求 PWM 持續切換 |
| **連接 / 線材** | 10 AWG 矽膠線 × 5 m + Anderson SB50 + XT60 + 端子 | 1 套 | 800 | 800 | |
| **量測儀器** | (借)示波器 / 萬用表 / 鉗式電流表 — 用學校 EE 系實驗室 | 0 | 0 | 0 | 若沒法借,DSO138 數位示波器 NT$ 1,500 |
| **機械** | 透明壓克力 **400 × 250 × 150** + 鋁角材框架 | 1 套 | 1,800 | 1,800 | **v1.2 放大**:Maxwell BMOD0058 單模組 226.5 × 76 × 49.5 mm,2 顆串聯需 ~470mm 線距;原 250 × 200 × 100 裝不下。不做 ORV3 機械形狀,規劃感標註對齊 12U 即可 |
| **散熱** | 80 mm × 25 mm DC fan × 4 + heatsink | 1 套 | 600 | 600 | |
| **個人防護 (PPE)** | 3M 1.5 kV 絕緣手套 + 護目鏡 + **Lith-Ex 鋰電池滅火噴罐**(F-500 同等水基鋰滅火劑亦可) | 1 套 | 2,000 | 2,000 | **改 (用戶 review #2)**:Class D 金屬粉滅火器台灣難買且粉劑會二次污染;Lith-Ex / F-500 是鋰電池專用噴罐,蝦皮 / momo 有現貨 |
| **小計**(借得到點焊機 / 點焊版本)| | | | **~47,900** | |
| **小計**(借不到點焊機 / 彈片座版本)| | | | **~44,400** | |

> Buffer:借得到點焊機剩 NT$ 2,100,借不到剩 NT$ 5,600。後者建議把多出的預算留給 STM32N6 缺貨改 Pi 5 + Coral USB,或差動探棒升級。
> **v1.2 修訂**:電子負載 DL24P 150W → DL24M 600W(+NT$ 2,000),supercap 規格已鎖 2× Maxwell 串聯 32V(不再列備案);**§1.3 supercap upgrade buffer 已用不到** — gate 已 PASS,2× Maxwell 串聯帶 51 % 餘量是最終配置。

**對 Sysgration 贊助金的一筆建議**:把 Eaton XLR 列為「stretch goal」單獨報價(NT$ 25k–30k 一顆),
若贊助金額 >5 萬 + 採購到貨能在 W2 結束前到,可以把 supercap demo 升級到「真實 LIC demo」。
這是上行情境,不在主時程上。

---

# Part 3 · 系統架構(實機)

```
                        ┌─────────────────────────────┐
                        │  PC (筆電) — Python Bridge   │
                        │  • DL24P 電子負載控制        │
                        │  • Telemetry 收集            │
                        │  • Push 到 Dashboard         │
                        └────────┬────────────────────┘
                                 │ USB
                                 ▼
              ┌──────────────────────────────────────────┐
              │  ATORCH DL24M 電子負載 — GB200 emulator   │
              │  播放 ±30 % @ 100 ms power profile        │
              └──────────────────────┬───────────────────┘
                                     │ DC load
                                     ▼
   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │  Hybrid Control  │   │   8S LFP pack    │   │  Supercap bank   │
   │  Board (STM32)   │◄──┤   (5-10 Ah / 2P) │   │  (LIC stand-in)  │
   │  • τ = 0.5 s     │   │   + JK-BMS       │   │  + 平衡網路       │
   │  • 互補濾波器     │   │   RS485 telem    │   │                  │
   │  • PWM duty 命令  │   └────────┬─────────┘   └────────┬─────────┘
   └────────┬─────────┘            │                       │
            │ HW PWM / SPI         │                       │
            ▼                      │                       │
   ┌──────────────────┐            │                       │
   │  雙路 MOSFET     │◄───────────┘                       │
   │  switch matrix   │◄───────────────────────────────────┘
   │  (LFP/LIC blend) │
   └────────┬─────────┘
            │
            ▼ 共 DC bus → DL24P
            │
   ┌──────────────────┐         ┌──────────────────────┐
   │  電流感測 ×2     │────────►│ STM32N6 邊緣推論板     │
   │  電壓感測 ×4     │         │ • LSTM INT8 (63 KB)  │
   │  溫度感測 ×8     │         │ • RUL 推論 µs latency│
   └──────────────────┘         │ • UART → PC          │
                                └──────────────────────┘
```

---

# Part 4 · 韌體實作清單

## 4.1 Hybrid Control Board (STM32)

```
priority   workitem                                        effort
P0   一階互補濾波器:τ=0.5s 數位實作 (1 kHz loop)          1 d
P0   ADC 取樣電流/電壓 + 控制環校驗(simulink 對齊)         2 d
P0   PWM 雙路 duty 控制 + dead-time 互鎖                  1 d
P0   E-stop 中斷 + 關閉 PWM(< 1 ms 響應)                   0.5 d
P0   **預充電狀態機 §4.5.5(INIT→PRECHARGE→BYPASS→RAMP→RUN)**  1 d
P0   **L3 PWM ramp 0→nominal 10 秒過渡**                    0.5 d
P1   過壓 / 過流 / 過溫 fault state machine              1 d
P1   UART 上拋 telemetry @ 10 Hz                         0.5 d
P2   控制律 τ live-tunable (USB CDC command)             0.5 d
```

**v1.3 軟體實作完成**:
- `scripts/hybrid_control_emulator.py` — Python 版控制律(同一條 IIR LPF + 互補濾波器 + 預充電狀態機 stub),**輸出對齊 §1.3 scaled_8s_sim.py 5.72×**(full-window methodology),steady-state 17.36× 作上界參考
- `firmware/stm32_hybrid_control/`(W2 work):
  - `main.c` — 完整狀態機 + 1 kHz 控制環 + 互補 PWM stub(HAL 呼叫註解為 placeholder,等 CubeMX 生成後接)
  - `pin_map.md` — Black Pill F411 完整 pin 分配(TIM1 PWM ch1/ch1N、TIM2 PWM ch1/ch2、ADC1 4 ch DMA、USART2 telemetry、PB0 K1 relay、PB1 Q3 precharge、PB2 E-stop EXTI)
  - `README.md` — STM32CubeIDE 建專案 + flash + bench dry-run SOP(W2 Tue 5/27 / Wed 5/28)

**驗證點**:
- W1:`python scripts/hybrid_control_emulator.py --plot` 驗證控制律 Python 版可重現 §1.3 sim 數字(已 ✅ PASS)
- W2 Tue:CubeMX 開新專案,paste `main.c`,build + flash 到 Black Pill;USART2 看到 telemetry stream
- W2 Wed bench dry-run(無電池):信號發生器灌假 v_bus / v_sc 進 ADC,logic analyzer 看狀態機跳轉 + PWM duty ramp 線性度,W2 Thu 再接實電池

## 4.2 BMS 整合(JK-BMS)

JK-BMS 出廠就有 RS485 / Bluetooth telemetry,無需自寫 BMS 韌體。

**v1.3 軟體實作完成**:
- `scripts/jkbms.py` — minimal RS485 parser(`read-all` 命令 0x06,協議參考 PurpleAlien/jk-bms_grafana + alferz gist + JK-BMS 官方 PDF)
- 解析 pack voltage / pack current / SOC / 3 顆溫度感測,cell-level 暫不解(M4 LIVE row 不需)
- Checksum 自測通過(`assert sum(frame[:-4]) == BE_int(frame[-4:])`)
- 合成 8S response 自測通過:`pack_v=25.8V, pack_i=5.0A, soc=85%, t_fet=35°C`
- `scripts/live_demonstrator_bridge.py --port COM3` 切 bench mode,連續 5 次讀失敗才寫 offline snapshot(避免單次抖動就閃 LIVE 卡)

⚠️ **未經實機驗證**(購買 JK-BMS 時必確認 series — **指定 JK-B,不是 DZ11 或 PB1**;後兩者 protocol offset 不同):
- pack current 符號約定(高位元 sign vs 反向)— 首次接線用 `--invert-current` flag 翻轉,或先跑 `python scripts/jkbms.py --port COM3` 一次性測試
- temperature 負溫換算(raw > 100 視為負)— 室溫下不會觸發,寒冬若做戶外才驗
- bytecount 計算假設 8S(`cells_start + n_cells × 3 = 38`)— 改 cell 數要傳 `--n-cells`

### 4.2.1 ⚠️ LFP cell pre-balance + 首充 SOP(v1.3 review H2/H6 補)

**為什麼這節獨立**:8 顆 LFP 26650 從蝦皮 / 露天到貨時 SOC 不同(常見一顆 2.8V、另一顆 3.6V)。**直接串聯接 BMS,首充 5 分鐘 BMS 會 trip**(高 SOC cell 先過充截止);active balance 50-100 mA 要 10+ 小時才平衡完 — **燒掉 W2 工期**。

**Pre-balance SOP**(貨到當日 30-60 min):

```
1. 萬用表逐顆量 OCV(靜置 5 min 後再量)
2. 記錄 8 顆 OCV,挑出 max / min:
     若 max - min ≤ 30 mV → 直接組 pack,跳到「首充」
     若 max - min > 30 mV → 進 step 3
3. 拉所有 cell 到統一目標電壓 ~3.30 V(LFP plateau 中段,SOC ≈ 50%):
     OCV > 3.35 V → 用 12V 鹵素車燈(或 10 Ω 50W resistor + 30V PSU 限流 0.5A)放電到 3.30 V
       (LFP 5 Ah cell 從 3.4 → 3.3 V 大約 0.3 Ah → 在 0.5A 放電下 ~36 min)
     OCV < 3.25 V → bench PSU 設 3.40 V / 限流 0.5A 充到 3.30 V
4. 再量 8 顆 OCV:確認 max - min ≤ 30 mV;否則回 step 3 個別微調
5. 組 8S1P pack(彈片座或點焊),裝 JK-BMS
```

**首充 SOP**(pack 組好,接 BMS,接 bench PSU):

```
1. 確認 BMS 全燈正常,無 fault flag(藍牙或 RS485 連 PC 看 cell 電壓散布)
2. bench PSU 設定:
     CC stage: 限流 2.5 A(0.5C for 5 Ah cell)
     CV stage: 29.2 V(LFP 3.65V × 8 cells,BMS 內部已 hard-cut 在此)
3. 開 PSU,觀察:
     pack current 從 ~2.5 A 維持 → 直到 cell voltage 接近 3.6V
     BMS active balance 啟動(LED 應有指示)
     任一 cell 電壓飄到 3.65V → BMS 切斷充電(正常,等其他 cell 跟上)
4. CV stage 收斂:pack current 降到 < 0.25 A(0.05C)即為「充飽」
5. 全程 < 10 °C 溫升(熱影像 / 手摸)— 若 > 15 °C 立刻斷電
6. 充飽後靜置 30 min,再量 cell 電壓:max - min ≤ 30 mV → ✅ pack 可用
```

**burn-in**:充飽後接 0.5C 放電(JK-BMS LED 顯示 SOC 應持續下降),跑 1 小時看是否飄移 / 過熱。**v1.3 lean 不做 24 h**;只跑 1 hr 確認 pack 整體穩定。

**Reject criteria**(出現任一條,該 cell 退貨換新):
- OCV 異常低(< 2.5 V)且 pre-charge 後仍掉壓
- 內阻 > 30 mΩ(LCR meter 量)
- 充飽後 30 min 自放電 > 20 mV
- 充電中溫升 > 15 °C
- BMS 報告 cell drift > 100 mV(active balance 跑 4 hr 後)

**安全**:
- **充電全程必有人在場**,離可燃物 > 1 m
- 第一次充任何一個 cell 異常(冒煙、鼓包、燙手)→ E-stop + 拍照 + 立刻拆出該 cell 放金屬桶
- Lith-Ex 噴罐在桌邊,§6.2 SOP 演練過

## 4.3 邊緣推論(Pi 5 預設 / STM32N6 stretch)

> v1.3 lean 預設走 **Raspberry Pi 5 + onnxruntime** 跑 INT8 LSTM 出 latency histogram(critical path #3 / M2 達成的最短路徑);STM32N6N570-DK 留作 stretch goal(若 W3 時間有餘 + 板子取得)。**兩者皆可滿足 M2 證據**,差別是 STM32N6 µs 級延遲更亮、Pi 5 ~1 ms 級已足以證明可部署。

### 4.3.1 Pi 5 路徑(lean 預設)

> ⚡ **腳本已備好**:`scripts/measure_lstm_latency.py` 是 device-agnostic 的;笔电 baseline 已跑(`lstm_latency_laptop_cpu.{json,png}`)。Pi 5 到貨後 `python scripts/measure_lstm_latency.py --device-label pi5` 即出 M2 final evidence。

| 步驟 | 工作 | effort | 狀態 |
|---|---|---:|:--:|
| 1 | Pi 5 8GB + Pi OS 64-bit Bookworm 燒 32GB SD card 開機 | 0.5 d | ⬜ 等貨 |
| 2 | `sudo apt update && sudo apt install python3-pip python3-venv` | 5 min | ⬜ |
| 3 | `python3 -m venv .venv && source .venv/bin/activate && pip install onnxruntime numpy matplotlib` | 5 min | ⬜ |
| 4 | **aarch64 wheel 驗證**:`python -c "import onnxruntime; print(onnxruntime.get_device(), onnxruntime.get_available_providers())"` 應印 `CPU` + `['CPUExecutionProvider']` — 若印 `azure` 表示裝錯版本 | 1 min | ⬜ |
| 5 | scp models/ → Pi 5(8.2 + 211 + 63 KB,1 秒) | 1 min | ⬜ |
| 6 | 跑 `measure_lstm_latency.py --device-label pi5` → 1000 次 × FP32+INT8 | 5 min | ⬜ |
| 7 | 自動產 JSON + histogram PNG;**腳本內建 1 ms p99 pass 閘** | 即時 | ✅ 腳本就緒 |

**笔电 baseline 已採**(M2 partial,2026-05-17):

| dtype | mean | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| FP32 | 176.4 µs | 170.0 µs | 219.3 µs | 263.5 µs | 421.5 µs |
| **INT8** | **135.2 µs** | **123.7 µs** | 184.7 µs | **245.1 µs** | 378.4 µs |

Pi 5 經驗法則 3–5× 慢於笔电 CPU → 推估 p99 INT8 ~750–1200 µs,**接近 1 ms threshold 但 lean mode 應通過**。若 Pi 5 fail,fallback 直接跑 `--device-label laptop_cpu` 拿笔电 baseline 進簡報(誠實標示「P99 245 µs on i7 laptop;Pi 5 部署延遲 W3+ 補測」)。

### 4.3.2 STM32N6 路徑(stretch,留 W3 餘力做)

| 步驟 | 工作 | effort |
|---|---|---:|
| 1 | 取得 STM32N6570-DK 開發板(W1 立刻下單,風險最高一項)| - |
| 2 | 安裝 X-CUBE-AI 9.x + STM32CubeIDE(SOP 已寫於 `docs/x_cube_ai_install_sop.md`)| 1 d |
| 3 | Import `models/lstm_int8.onnx` → C code generation | 0.5 d |
| 4 | Flash + serial trace,跑 99-cycle 測試 sequence,量真實 NPU latency | 1 d |
| 5 | UART telemetry 整合到 Python bridge | 0.5 d |

**Fallback**(若 STM32N6 板來不及):用 Raspberry Pi 5 + onnxruntime 跑 INT8 model,
簡報誠實說「STM32N6 板於 W3+ 補實機 trace,目前以 Pi 5 ONNX runtime 模擬邊緣端」。
比起跳票,降階 stand-in 仍可拿出延遲數字。

## 4.4 Telemetry → Dashboard

現有 dashboard 是 static export,真實 telemetry 接入要動軟體側:

**最小改動方案**(推薦):
- 在 `apps/web/public/scenarios/` 加一個 `live_demonstrator.json`,Python bridge 每 5 秒覆寫
- `dashboard-client.tsx` 加一個 `useEffect` 每 5 秒重 fetch `live_demonstrator.json`
- 新增「LIVE DEMONSTRATOR」高亮 row,SIMULATED 1000 台 + 1 台 LIVE
- 評審現場可看 live row 的 SOH/RUL 隨負載變化

**關鍵實作細節 — atomic write**(用戶 review #4):
Python bridge 寫 `live_demonstrator.json` **不能直接 `open(path, 'w')`**,否則
dashboard 5 秒 polling 有機率讀到「半寫的檔案」而 `JSON.parse` 拋例外,客戶端整個
state 掛掉。**寫法強制 atomic**:

```python
import json, os, tempfile

def atomic_write_json(path: str, data: dict) -> None:
    dir_ = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(suffix='.tmp', dir=dir_)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)  # POSIX + Windows atomic rename
    except Exception:
        os.unlink(tmp)
        raise
```

**為什麼用 `os.replace` 不用 `os.rename`**:`os.rename` 在 Windows 上目標檔存在
會拋 `FileExistsError`,`os.replace` 跨平台都 atomic 覆寫。**為什麼要 `fsync`**:
demo 當天若筆電突然斷電,沒 fsync 的版本可能讓 page cache 未寫回 → 重啟後檔
損毀;fsync 確保資料落到 disk 才換名。

**避開**的選項:把 dashboard 改成 SaaS / FastAPI(白皮書 §8.2 列為 W3+),26 天動不到 —
`output: "export"` 不變。

## 4.5 MOSFET switch matrix + gate drive(用戶 review #5 補完)

### 4.5.1 拓樸

雙路 high-side N-channel MOSFET,each path 控制 LFP 或 supercap 進共 DC bus 的功率
share。**為什麼選 high-side 而不是 low-side**:demonstrator 走共地參考(scope 量
測簡單),low-side 切換會讓 source 浮動,scope 接地夾必須改差動探棒,操作複雜
度與安全風險都升。

```
  LFP+  ──┬──[fuse]──┬──[ MOSFET Q1 ]──┬── DC bus +
          │          │  (gate by Q1_HS) │
          │          │                  │
  SC+  ───┴──[Tfuse]─┴──[ MOSFET Q2 ]──┘
                        (gate by Q2_HS)

  Common GND ──────────────────────────── DC bus −
```

### 4.5.2 元件選型(已加進 §2 BoM)

| 元件 | 型號 | 關鍵規格 | 餘量檢算 |
|---|---|---|---|
| MOSFET × 4(2 主 + 2 備品)| **IRFB4115PBF** | Vds 150 V / Id 104 A / Rds(on) 9.3 mΩ @ Vgs 10 V, 25 °C | 8S LFP 滿電 29.2 V → Vds 餘量 **5.1×**;30 A 連續,**Rds(on) 在 100 °C 約 1.7× 升至 16 mΩ**(IRFB4115 datasheet fig. 4),P_loss ≈ 30² × 0.016 = **14.4 W**;**TO-220 + 5 °C/W 鋁鰭片 + 80 mm 風扇**才壓得住(14.4 × 5 = 72 °C 溫升,環境 25 °C → 散熱片 97 °C、junction ~110 °C,留 65 °C 給 Tj_max 175 °C)。**25 °C/W 自然對流會燒掉,不要用**(原 v1.0 BoM 寫法錯誤,v1.1 修正) |
| Gate driver × 2 | **UCC27282** | Isolated half-bridge,bootstrap 上下臂各 4 A peak | 適用 30–80 V bus;對比 IR2110 不需大 bootstrap cap,**low duty 也不會失效**(關鍵 — 因 hybrid 控制律可能某些工作點 duty 接近 0 或 1)|
| Bootstrap cap | 1 µF 50 V X7R | UCC27282 datasheet 推薦 | |
| Bootstrap diode | UF4007(若 UCC27282 內部不夠快) | 反向恢復 < 75 ns | |

**Fallback 元件**(若 UCC27282 取不到):

| Fallback | 為什麼能接受 | 注意 |
|---|---|---|
| IR2110 + 1N4148 + 10 µF bootstrap cap | 蝦皮 / 露天現貨,單顆 NT$ 50 | 嚴格要求 PWM duty 在 5–95 % 之間切換,**hybrid 控制律必須加 minimum-on / minimum-off 時間,不能讓 supercap 路 idle 太久** |
| Si827x 系列 isolated driver | 規格更好,但 Mouser 通路為主 | 預算 +NT$ 300 |

### 4.5.3 韌體 / 設計重點

1. **Dead-time 互鎖**:兩路 PWM 不能同時導通(會把 supercap 直接灌進 LFP),STM32 timer 用 **complementary PWM with dead-time** 模式,死區時間 ≥ 500 ns(IRFB4115 turn-off delay 約 100 ns,留 5× margin)。
2. **Gate resistor**:Rg = 10 Ω(限 di/dt 與 EMI),搭配 1N5819 反向關斷加速。
3. **Vgs clamp**:每顆 MOSFET gate-source 之間 12 V zener,避免異常電壓打穿 gate oxide。
4. **熱保護**:MOSFET 散熱片貼 DS18B20,> 70 °C 軟體強制 PWM duty = 0。

### 4.5.4 W1 採購死線(下單前確認)

- [ ] IRFB4115PBF 現貨確認(Mouser / Digi-Key / 唐文 / 利眾)
- [ ] UCC27282 現貨確認;**4 週以上 lead time → 立刻換 IR2110**(蝦皮一定有)
- [ ] 散熱片 TO-220 用 25 °C/W aluminum heatsink

⚠️ **這條若 W1 結束前未完成,整個 W2 沒法做 switch matrix 組裝,連帶 W3 整合會崩**。

### 4.5.5 ⚠️ Supercap 預充電序列(v1.3 review #B1 補)

**為什麼需要**:32V supercap bank 串聯 29F 等效電容,從 0V 接帶電 DC bus 的瞬間電流:

$$
I_{\text{inrush}} = \frac{V_{\text{bus}} - V_{\text{sc}}}{R_{\text{path}}} = \frac{25.6 - 0}{0.0025 + R_{\text{接觸電阻}}} \approx 5\text{--}10\,\text{kA}
$$

IRFB4115 Ifsm pulse rating 700 A → **燒 MOSFET、熔 PCB trace、可能觸發 Class T fuse 但時間不夠快保護 die**。安全第一防線必須是「不讓 inrush 發生」,不是「事後保護」。

**三層防線**(序列必須全做):

| 防線 | 何時做 | 機制 |
|---|---|---|
| **L1 手動 pre-charge** | 每次 demo / 測試 session **開始** | bench PSU (限流 1A) 把 supercap 充到距 bus 電壓 < 0.5V,**才**手動合 supercap 主接觸器。殘餘 inrush ≤ 200 A,落 Class T fuse safe 區間 |
| **L2 硬體預充電路** | 全程在電路上 | **5 Ω / 50 W 電阻 + 40A relay** 串聯 supercap → bus;系統 enable 時 relay 開路(走電阻),5 秒後 STM32 量到 v_sc > 0.95 × v_bus 才關 relay 繞過 |
| **L3 韌體 PWM ramp** | 控制律啟動瞬間 | TIM1/TIM2 PWM duty 從 0 線性 ramp 到 nominal duty,**10 秒過渡**(避免 v_bus 階躍激發 supercap 路) |

**L1 SOP**(每次 demo 前 5 分鐘):

```
0. ⚠️ 萬用表先量 v_supercap +/- 兩端電壓:
     若 = 0 V → 正常(初始或上次 demo 後有 short wire 短接保存)
     若 > 0 V(典型 1–2 V)→ "bounce-back"(datasheet 警告):
       Maxwell 模組充滿放完電,儲存無 short wire 會自然回升 ~2 V。
       串聯使用時可能造成電擊。
       對策:接 5 Ω 預充電阻跨 +/- 兩端放電 30 秒,再進 step 1。
1. 確認 supercap 主接觸器 OPEN
2. bench PSU 設 32 V / 限流 1 A,接 supercap +/- 端
3. 開 PSU,等 30-60 秒(supercap 充電,讀電流降到 < 50 mA)
4. 確認 v_supercap ≈ 32 V(萬用表)
5. 關 PSU,拆 PSU 線
6. 開 LFP 主接觸器,讀 v_bus
7. 確認 |v_bus - v_supercap| < 0.5 V
8. 合 supercap 主接觸器(此時 inrush 已限制)
9. 啟動 STM32 控制,觀察 5 秒 supercap 路電流 ≤ 30 A
```

**儲存規則(v1.4 review 補)**:demo / 測試 session 結束後,supercap bank 必須 **+/- 兩端短路保存**(5 Ω 預充電阻跨接,或專用 shorting wire)。Maxwell datasheet WARNING 明文:「fully discharged module may bounce back up to 2 V if stored without shorting wire on +/- terminals. Series-string usage with bounce-back has potential to cause dangerous electrical shocks.」

**L2 電路**:

```
LFP+ ──[fuse 80A]──┬── DC bus +
                   │
SC+  ─[Tfuse 100A]─┤
                   │
                   ├─[5Ω 50W]──[Q3 IRFB4115]── DC bus +     ← precharge path
                   │              ▲
                   │              │ STM32 GPIO via UCC27282
                   │
                   └────[K1 40A relay NO]──── DC bus +       ← bypass path (when precharge done)
                                 ▲
                                 │ STM32 GPIO via 2N7000
```

**Q3 IRFB4115 與 §4.5.2 主 switch 共用備品**(BoM × 4 中扣 1);K1 relay coil drive by 2N7000 small-signal MOSFET。

**L3 韌體狀態機**(`STM32_main.c` 必須實作,**M3 critical path**):

```
STATE_INIT          : 全部 PWM = 0, relay OPEN, contactor OPEN
STATE_PRECHARGE     : enable Q3 (precharge MOSFET full on),
                      tick 100 Hz 量測 v_sc,
                      timeout 30s 或 v_sc > 0.95 × v_bus 進下一步
STATE_BYPASS_RELAY  : close K1, 100ms 延遲確認接觸,disable Q3
STATE_RAMP_PWM      : duty 從 0 線性 ramp 到 nominal,10 秒過渡
STATE_RUNNING       : 互補濾波器控制律全速運行
STATE_FAULT         : 任何 fault → 全 PWM = 0, contactor OPEN, K1 OPEN
                      (不是 reset,需手動 clear)
```

**測試**(W2):
1. **L1 dry run**:不接 supercap,只用 bench PSU + 1 顆電解電容(4700µF / 50V)模擬;驗 v_sc 確實爬到 bus 電壓
2. **L2 dry run**:relay 接 LED 模擬,GPIO toggle 驗開合
3. **L3 dry run**:STM32 PWM 接 scope,看 duty ramp 是否線性
4. **真實 supercap 整合**:必須 2 人在場、E-stop 在手、scope 監看 inrush 波形

---

# Part 5 · 驗證流程(實機 bench test plan)

> v1.3 reframe:測項以 🎯/🛡️/⏭️ 標記。critical-path-only mode 下 §5.3 + §5.4 必做,§5.1 / §5.2 簡化為「能開機不冒煙」level,⏭️ 項可砍。

## 5.1 階段 1:單元測試(W1–W2,各元件分開)

| 標記 | 元件 | 測項 | Pass 條件 |
|:--:|---|---|---|
| 🛡️ | LFP cell **粗篩**(OCV)| 萬用表量靜置 30 min 後開路電壓 | **OCV 偏差 ≤ 30 mV**(粗篩,~30 min)— 這條是 🛡️ 不能砍,不平衡會讓 BMS 提早 cut |
| ⏭️ | LFP cell **精密配對**(10A 放電)| 4 顆並行 10A 放電量真容量 | ≤ 5 % 偏差(~4 hr;**lean mode 可砍**,粗篩夠) |
| 🛡️ | Supercap | leakage current + ESR DC 量測 | ESR < datasheet × 1.5(放寬 — 二手老化可接受) |
| 🛡️ | BMS | 過充截斷 / 過放截斷 / 短路保護(低容量替身電池) | 動作 < 100 ms;**不通過不准接 8S pack** |
| 🎯 | 電子負載 | 100 ms 階躍上升時間 | < 5 ms (DL24M 規格) |
| 🎯 | Pi 5 / STM32N6 | LSTM 99-cycle inference vs onnxruntime FP32 reference | MAPE < 1 % |

## 5.2 階段 2:子系統整合(W2 末)

| 標記 | 子系統 | 測項 | Pass 條件 |
|:--:|---|---|---|
| 🛡️ | LFP+BMS+DC bus | 0.5C 充電 / 0.5C 放電 5 分鐘(**lean: 不跑 1C 飽和**),熱影像看溫升 | < 10 °C 溫升 |
| 🎯 | Supercap bank | 100 A 脈衝放電,v_cap droop | 對齊 §1.3 sim RC 模型 ± 15 % |
| 🎯 | Hybrid control 開環測試 | LFP+supercap 接電,0.5 Hz 方波負載,scope 看 LFP/LIC 分流 | 高頻分量 > 80 % 進 supercap |

## 5.3 階段 3:Headline 數字實機重現(W3)— 🎯 critical path #2

**5.7× 實驗**(v1.2 對齊 §1.3 sim):
- 設定:**DL24M 播放 500 W baseline ±30 % @ 100 ms**(peak 650 W)
- 量:LFP 接收功率 RMS,純 LFP 模式 vs hybrid 模式
- Pass:hybrid / pure ratio **≥ 4×**(sim 預期 5.72×,留 30 % bench measurement noise margin)
- 若 ratio < 3×,先檢查 τ 是否寫成 0.5 s(韌體常見錯誤是時間單位),次檢查 supercap 串聯接點電阻

**3.5× 實驗**(v1.2 對齊 §1.3 sim):
- 同一個 setup,scope 量 cell-level 電壓
- **必用差動探棒**(借 — §6.1 接地策略強制);用普通探棒共地接 cell− 會把 BMS 接點電位拉到 AC GND,引入 60 Hz noise + 對 BMS 產生電氣壓力
- 探棒解析度:差動 2 mV/div(大部分差動探棒 5 mV/div 起,可接受;若解析度不足顯示 ~62 mV pp 會糊在 4 div 內)
- sim 預期:pure pp ≈ 62 mV,hybrid pp ≈ 18 mV,ratio 3.52×
- Pass:hybrid pp ΔV / pure pp ΔV **≤ 0.4**(留 bench noise margin)

**🎯 critical path #3 邊緣推論 latency 實測**:
- Pi 5 + onnxruntime(lean 預設)或 STM32N6 X-CUBE-AI(stretch)
- 在 `models/lstm_int8.onnx` 上跑 1000 次 inference,程式碼 `time.perf_counter_ns()` 量 wall clock
- 出 histogram 截圖:p50 / p95 / p99
- Pass:p99 < 1 ms (Pi 5) 或 < 200 µs(STM32N6)
- 簡報用句:「實機跑出 N µs,對齊白皮書附錄 C 估算 27–109 µs」

## 5.4 階段 4:Dashboard LIVE row 整合(W3 末–W4)— 🎯 critical path #4

- Python bridge 從 BMS RS485 + INA226 + DS18B20 收 telemetry → atomic JSON write
- 寫 `live_demonstrator.json` 進 `apps/web/public/scenarios/`(用 §4.4 atomic helper)
- `dashboard-client.tsx` 加 5 秒 polling fetch
- 1000 simulated rows + 1 LIVE row(綠色光暈標識)
- E2E demo:電子負載增加負載 → 30 秒內 dashboard 看到 LIVE row 電壓微降 / 溫度上升
- **產出**:dashboard 截圖 + 5 秒影片 = 簡報 slide 用

---

# Part 6 · 安全(學生實驗室絕對不能省)

## 6.1 設計層

| 風險 | 防護 |
|---|---|
| Cell 短路 / 內短 | BMS + 80A 主回路 fuse + 100A 接觸器(E-stop 直接斷) |
| Cell 過充 | BMS hard-cut @ 3.65 V/cell(LFP 規格) |
| Cell 過放 | BMS hard-cut @ 2.5 V/cell |
| Cell 過溫 | DS18B20 × 8 監測,> 50 °C 軟體警告,> 60 °C 強制 cut |
| 熱失控傳播 | cell 之間用 KOOLON 隔熱片或 mica 板,避免 cell touching |
| 電弧 | 不徒手插拔帶電線,Anderson SB50 連接器只在系統下電後操作 |
| 絕緣失效 | 整個系統浮地(不接大地),用差動探棒量測,嚴禁示波器探地直接夾 BMS |
| **Supercap inrush** | **不可徒手合 supercap 主接觸器** — 必跑 §4.5.5 L1 預充 SOP;違反 = 200+ A inrush 直接燒 MOSFET 與線材 |
| **Supercap bounce-back**(v1.4 補)| 放完電儲存 supercap bank 必加 short wire 跨 +/- 端;datasheet 警告未短接會自然回升 2 V,串聯使用造成電擊風險。每次 demo 前先量 v_supercap 確認狀態 |
| **Ground loop / 接地策略**(v1.3 review H5) | (1) 系統電氣浮地 — DC bus 兩端不接 AC mains earth;(2) PC / DL24M / bench PSU / JK-485 dongle 都接 PC AC earth(共地);(3) **scope 接地僅單點**:接「電池 −(pack ground)」, 絕不接電池 + 或 supercap +;(4) cell-level mV 量測**必須用差動探棒**(借)— 普通探棒共地接 cell− 會引入 60 Hz mains noise 並可能對 BMS 產生電氣壓力 |

## 6.2 操作層

| 場景 | SOP |
|---|---|
| 充電 | 室內通風處,離可燃物 > 1 m,有人在現場,首充必跟到底 |
| 存放 | 50–60 % SOC 收納;放金屬盒(不要紙箱);遠離兒童寵物 |
| 運送 | 拆 pack 為 cell 單體,UN38.3 不適用範圍但仍要絕緣 cell 接點 |
| 失火 | **Lith-Ex / F-500 鋰電池滅火噴罐**就在桌邊;**不要試水或 CO₂**(LFP 噴火會釋放 HF 氣體);Class D 金屬粉劑為次選,但台灣難購得 |
| PPE | 接電時戴 1.5 kV 絕緣手套 + 護目鏡(開電解液氣味要立即戴 N95 並通風) |

## 6.3 測試前檢查清單(每次開機)

- [ ] 所有 cell 電壓在 3.0–3.5 V
- [ ] BMS LED 顯示正常,無 fault flag
- [ ] E-stop 按鈕可達 + 可動
- [ ] 滅火器在桌邊
- [ ] 至少 2 人在場(一人操作、一人盯安全)
- [ ] 攝影機開錄(失火影片是 incident report 證據)
- [ ] 電子負載限流設正確(避免無限拉)

---

# Part 7 · 26 天時程拆解(從 2026/05/16 到 2026/06/11)

> v1.3 reframe:**圍繞 4 件 critical-path milestone 重排**(不再是「組裝 → 測試」線性流程)。Pi 5 推論可與硬體組裝並行,軟體 LIVE row 可在硬體到貨前完成。4 人團隊、每人每週 20–30 hours、扣週末約 18 工作天。

## 4 件 critical-path milestone(本 Part 主節奏)

| Milestone | Critical path | 預定完成日 | 狀態 |
|---|---|---|:--:|
| M1 | 🎯 §1.3 模擬 gate PASS | 2026-05-17 | ✅ 完成 |
| M2 | 🎯 邊緣推論 latency histogram | 2026-05-25(W2 上半) | 🟡 **laptop CPU baseline 已完成 2026-05-17**(`data/processed/lstm_latency_laptop_cpu.{json,png}`,FP32 p50 170/p99 264 µs,INT8 p50 124/p99 245 µs);Pi 5 到貨後跑 `--device-label pi5` 即達成 |
| M3 | 🎯 Hybrid 削峰 5.7×/3.5× 實機波形 | 2026-06-02(W3 中) | ⬜ |
| M4 | 🎯 Dashboard LIVE row E2E | 2026-06-04(W3 末) | ⬜ |

**M2 / M3 / M4 可大幅平行**(不像 v1.2 完全線性);M2 不需等硬體到貨,M4 軟體部分 W1 就能寫好 stub。

## W1(5/16–5/22):🎯 M1 達成 + 採購 + 🎯 M4 軟體 stub

| Day | 標記 | 任務 | 負責 |
|---|:--:|---|---|
| **Sun 5/17** | 🎯 **M1** | **§1.3 W1 Day 1 模擬 gate** ✅ PASS(5.72× / 3.52×)`data/processed/scaled_8s_sim.json` | 韌體 ✅ |
| Sun 5/17 | 🎯 | Gate 判讀:鎖定 2× Maxwell 串聯 32V + demonstrator 降載 500 W baseline | 韌體+採購 ✅ |
| Sun 5/17 PM | 🎯 | **§2.1 Lean BoM 採購**:LFP × 8、Maxwell × 2(Heisener)、JK-BMS、DL24M、Pi 5、INA226、STM32、MOSFET+driver+fuse 下單 | 採購 |
| Sun 5/17 | 🛡️ | Lith-Ex 噴罐 + PPE 採購(蝦皮 / momo 翌日到) | 採購 |
| Sun 5/17 | ⏭️ | (lean: 點焊機不借,直接用彈片座) | 採購 |
| Mon 5/18 | 🎯 **M4** | **寫 `live_demonstrator.json` schema + dashboard polling + atomic write helper**(用 fake data,W2 stub) | 軟體 |
| Mon 5/18 | 🎯 | 寫 JK-BMS RS485 parser(GitHub fork) | 軟體 |
| Wed 5/20 | 🎯 | 控制律 Python sim:跑 `tau=0.5s` 互補濾波器,輸出對齊 `transient_hybrid.json` | 韌體 |
| Wed 5/20 | 🎯 | MOSFET + gate driver 預組(無電池) — 實驗室電源 + 假負載空跑驗證 dead-time | 韌體 |
| **貨到當日** | 🛡️ | LFP cell **OCV 粗篩 + pre-balance**(§4.2.1 SOP,~30-60 min);精密 10A 配對 ⏭️ 可砍 | 硬體 |
| Fri 5/22 | 🛡️ | W1 review:採購全部到貨確認 + M4 軟體 stub 跑通(fake data 輸出 dashboard 顯示) | 全員 |

⚠️ **W1 死線**:
- ~~§1.3 模擬 gate~~ ✅ M1 已達成(2026-05-17)
- Pi 5 / Maxwell BMOD0058 Heisener 下單後追蹤;若 > 2 週 lead time → Pi 5 改露天現貨 / Maxwell 改 eBay 二手或 LS Mtron LSUM
- UCC27282 lead time > 4 週 → 立刻換 IR2110(韌體加 minimum-duty 限制)
- (STM32N6 已 descope 進 lean BoM stretch goal,不影響 critical path)

## W2(5/23–5/29):元件單測 + 子系統組裝 + 🎯 M2 完成

| Day | 標記 | 任務 | 負責 |
|---|:--:|---|---|
| Sat 5/23 | ⏭️ | LFP cell **粗篩** OCV ≤ 30 mV 偏差(lean,~30 min);若 W1 已到貨已做則略過 | 硬體 |
| Sun 5/24 | 🛡️ | 8S1P pack 組裝(**彈片座優先**)+ JK-BMS 接線 + **§4.2.1 首充 CC/CV SOP**(0.5C/2.5A → 29.2V → 收斂 < 0.05C);1 hr burn-in(**lean: 不跑 24h**)| 硬體 |
| Sun 5/24 | 🎯 M2 | **Pi 5 + onnxruntime + `lstm_int8.onnx` flash,跑 1000 次 inference,出 latency histogram** ← **M2 達成** | 韌體 |
| Mon 5/25 | 🎯 | Supercap bank 串聯組裝 + leakage / ESR 量測(對齊 §1.3 sim) | 硬體 |
| Mon 5/25 | 🎯 | STM32 控制板 ADC + PWM 空跑(信號發生器當電池模型) | 韌體 |
| Tue 5/26 | 🎯 | DC bus + MOSFET switch matrix 組裝(W1 已空跑驗證過 dead-time) | 硬體 |
| Wed 5/27 | 🎯 | **§5.4 軟體側 dashboard polling + atomic write helper 完成**(stub 接 fake telemetry) | 軟體 |
| Thu 5/28 | 🎯 | 所有子系統合接,空載開機 → 接電子負載 1 A 試拉 | 硬體+韌體 |
| Fri 5/29 | 🛡️ | W2 review:M2 達成確認 + 子系統可運作 + **安全 SOP 演練**(E-stop / Lith-Ex 位置 / PPE) | 全員 |

⚠️ **W2 死線**:
- M2(latency histogram)5/24 內必完成 — 純軟體,不該卡
- LFP pack 首充任何 cell 異常(電壓飄 / 溫升 > 10 °C)立刻換,**不要硬撐**

## W3(5/30–6/5):🎯 M3 + 🎯 M4 完成

| Day | 標記 | 任務 | 負責 |
|---|:--:|---|---|
| Sat 5/30 | 🎯 | 整機接電,1 A → 5 A 漸進試拉,scope 量基線雜訊 | 硬體+韌體 |
| Sun 5/31 | 🎯 | Hybrid 控制 OFF 純 LFP baseline 30 分鐘穩定性 + 出純 LFP 削峰前波形 | 韌體 |
| Mon 6/1 | 🎯 | Hybrid ON 跑 ±30 % @ 100 ms 負載,scope 量電壓震盪 + 韌體調 τ | 韌體 |
| **Tue 6/2** | 🎯 **M3** | **5.7× / 3.5× headline 實驗 + 出實機波形圖**(M3 達成) | 韌體 |
| Wed 6/3 | 🎯 | Dashboard LIVE row 軟體側接實機 telemetry(W2 stub 切換到真實 source) | 軟體 |
| **Thu 6/4** | 🎯 **M4** | **E2E demo 跑通:動電子負載 → dashboard LIVE row 變化**(M4 達成) | 軟體+硬體 |
| Fri 6/5 | 🛡️ | W3 review:M3 + M4 證據 artifact 蒐齊(波形 PNG × 2 + latency histogram + dashboard 影片) | 全員 |

⚠️ **W3 死線**:6/2 拿不到 M3 headline → 立刻啟動 Plan C 降階(§9 Plan C — bench-top PoC)。

## W4(6/6–6/11):複賽簡報整合 + buffer

| Day | 標記 | 任務 | 負責 |
|---|:--:|---|---|
| Sat 6/6 | 🎯 | 簡報整合 4 份 critical-path 證據 artifact + 對照 v2.2 spec 故事 | 簡報 |
| Sun 6/7 | 🎯 | 答辯模擬 — 對著 v2.2 spec gap 練 scaled-down rationale + 對照 §1.1 / §1.3 表 | 全員 |
| Mon 6/8 | ⏭️ | demonstrator 燒機 (lean: 8 hr 而非 24 h)監看飄移 | 硬體 |
| Tue 6/9 | ⏭️ | 機械固定 + 走線整理 + 拍商品照 | 硬體 |
| Wed 6/10 | 🎯 | 完整 dry-run 30 分鐘(從開機到 dashboard LIVE 完整流程)× 3 次 | 全員 |
| Thu 6/11 | 🎯 | **複賽日**:現場 demo + 答辯;備案:4 份 artifact 錄影 + screenshot 後援 | 全員 |

**W4 心法**:M1–M4 都已達成,W4 是「不要把已有的證據搞砸」 — ⏭️ 標記的工作砍掉空間留給 dry-run + buffer。

---

# Part 8 · 風險登錄(高 → 低)

| # | 風險 | 機率 | 衝擊 | 緩解 / contingency |
|---|---|---|---|---|
| R1 | STM32N6 板採購來不及 | 高 | 高 | W1 下單立刻確認;Plan B 切 Pi 5 + onnxruntime,簡報誠實說「NPU 實機 W3+」 |
| R2 | LFP 8S pack 點焊失敗 / cell 配對失準 | 中 | 高 | 多買 4 顆備品(BoM 已含);買現成 8S LFP pack 商品(露天 NT$ 4–6k)當 fallback |
| R3 | Hybrid 控制律 oscillation / unstable | 中 | 高 | W1 完成 Python sim 對照;W2 用信號發生器空跑;留 W3 後 2 天 buffer 調 τ |
| R4 | Supercap bank ESR 與計算不符,droop 過大 | 中 | 中 | 量測後若 ESR 比預期高,用更多並聯解(BoM 預算 buffer 給多買 1 顆)|
| R5 | 電子負載動態響應跟不上 100 ms 階躍 | 低 | 中 | DL24P spec 5 ms 應 ok;備案改 50 ms 週期(對齊白皮書 §3.1 dt = 5 ms × 10) |
| R6 | Cell 異常燃燒 / 冒煙 | 低 | 極高 | §6 SOP;保險:萬一發生,立刻拍照、E-stop、**Lith-Ex 噴罐**滅火,不要靠近;事故報告寫進複賽簡報 transparency 加分 |
| R7 | Dashboard 改動破壞 static export build | 中 | 低 | 改 dashboard-client.tsx 不要動 page.tsx 的 fs.readFile(對齊 CLAUDE.md 規則);v1.3 build 已驗 |
| R8 | 複賽當日網路不穩 / Vercel 掛掉 | 低 | 中 | **v1.3:localhost dev server 本來就是預設 demo 路徑**(LIVE row 只能 localhost,§Q10);Vercel 掛掉只影響 /tco /twin SaaS 部分,demonstrator demo 不受影響 |
| **R11 (v1.3 新)** | **Supercap pre-charge SOP 違反 → MOSFET 炸**| 中 | 極高 | §4.5.5 三層防線必跑(L1 手動 + L2 硬體 + L3 韌體);任何 demo 開機前必跑 L1 SOP,違反就斷電 |
| **R12 (v1.3 新)** | **JK-BMS 買到 DZ11/PB1 非 JK-B series → parser offset 不對**| 中 | 中 | 採購時指定 JK-B series;到貨先跑 `python scripts/jkbms.py --port COM3` 一次性驗證,失敗則 fork parser 加新 offset |
| **R13 (v1.3 新)** | **LFP cell 到貨 SOC 散布大 → BMS 首充 5 min trip**| 高 | 中 | §4.2.1 SOP pre-balance(萬用表逐顆量 OCV → 個別 pre-charge / discharge 到 3.30V ± 30 mV)再組 pack |
| R9 | Sysgration 贊助金到帳延遲 | 中 | 中 | 隊員先墊付,只買 W1–W2 必要件;Eaton XLR stretch goal 不墊付 |
| R10 | 隊員間排程衝突(期末考)| 高 | 中 | 從一開始就排定每人 weekly commit hours;留 weekend session 給整合 |

---

# Part 9 · Fall-back 階梯(萬一某段做不出來)

> 即使最壞情境,也要有東西可以演示。階梯由高到低(**v1.3 reframe** — Plan A 改為 Pi 5 預設 lean,Plan B 拿掉,STM32N6 升級為 stretch):

1. **完整 demonstrator(Plan A,v1.3 lean 預設)**:8S LFP + 2× Maxwell + STM32 + **Pi 5** + LIVE row。4 件 critical-path 證據齊全。
2. **Plan A+(stretch)**:同 Plan A 但 Pi 5 換 STM32N6N570-DK(若 W2/W3 拿得到板 + 時間 + 預算 buffer 夠)。
3. **Plan C(Bench-top PoC,M3 失敗時降階)**:4S LFP + 1 顆 supercap + STM32 控制板 + 電子負載 GB200 emulator。只 prove 控制律 + Pi 5 latency,不接 LIVE row。
4. **Plan D(桌面元件展示)**:cell + supercap + BMS + Pi 5 各自單獨展示 + 既有 SaaS。證明採購 + 韌體可運作,系統整合留 W3+ 路線圖。
5. **Plan E(純軟體展示,絕對最後)**:跟初賽一樣只 demo 既有 SaaS + 簡報強調「實作物因元件缺貨延後到 W3+」。**等於沒晉級成果**。

**決策點**:每個 W 末 review 時對照 Plan A → Plan E:
- W1 review(5/22):採購到貨確認 + M1 ✅ + M2 笔电 baseline + M4 軟體 stub → 仍走 Plan A
- W2 review(5/29):各子系統能單獨運作 → 走 Plan A;若 STM32 韌體 build 失敗 → 降 Plan C
- W3 review(6/5):M3 + M4 達成 → 走 Plan A;M3 削峰 ratio < 3× → 降 Plan C;LIVE row 接不通 → 降 Plan D
- W4 dry-run(6/10):demo 流程順暢 → 維持 Plan A;**不可拖到複賽日才降階**

---

# Part 10 · 同步要做的軟體側工作(不要忽略)

實機只是「加一塊」,既有 SaaS 也要對齊新 demonstrator 故事:

| 工作 | 動的檔案 | 狀態(v1.3) |
|---|---|---|
| `live_demonstrator.json` schema 加進 dashboard | `apps/web/src/app/dashboard/dashboard-client.tsx` + `apps/web/public/scenarios/live_demonstrator.json`(新)| ✅ 完成 |
| LIVE row 視覺強調(綠色光暈 + LIVE pulse 動畫) | `apps/web/src/components/live-demonstrator-card.tsx`(新)| ✅ 完成 |
| Bridge stub + atomic write | `scripts/live_demonstrator_bridge.py` + `scripts/atomic_json.py`(新)| ✅ 完成(mock + bench modes) |
| JK-BMS RS485 parser | `scripts/jkbms.py`(新)| ✅ 完成(checksum + 8S response 自測) |
| E-load profile 控制 | `scripts/eload_gb200_profile.py`(新)| ✅ 完成(PX100 protocol,Atorch stub) |
| M2 latency 量測 | `scripts/measure_lstm_latency.py`(新)| ✅ 完成(笔电 baseline,Pi 5 swap ready) |
| Hybrid 控制律 Python emulator | `scripts/hybrid_control_emulator.py`(新)| ✅ 完成(對齊 §1.3 sim 5.72×) |
| Vercel cache header for LIVE JSON | `apps/web/vercel.json`(修)| ✅ 完成(v1.3 review H3) |
| `PRESENTATION_GUIDE.md` 增「複賽 demo SOP」 + Q7-Q10 | `PRESENTATION_GUIDE.md`(修)| ✅ 完成 |
| 白皮書 §2.1.1 demonstrator 5C/1C footnote | `docs/whitepaper_restructured.md` §2.1.1 E 表(修)| ✅ 完成(v1.3 review B4) |
| ⏭️ `/twin` 加 Bench Validation cards | `apps/web/src/app/twin/page.tsx` 或新 route | ⏭️ skippable,W4 dry-run 後若有時間再做 |
| ⏭️ 白皮書 §8.2 路線圖補「demonstrator 已運作」 | `docs/whitepaper.md` `docs/whitepaper_restructured.md` §2 | ⏭️ skippable,複賽當天 PRESENTATION_GUIDE Q7-Q10 已 cover |

---

# Part 11 · 給評審的 next-steps(對齊 W3+ roadmap)

複賽簡報結尾用,證明這只是 milestone 1:

1. **Sysgration EVT 階段(2026 Q3)**:LFP 升 15S(換車規 LG ESS B-series 或 Samsung SDI)、supercap 換 2× Eaton XLR-48-166、機箱進 12U OCP ORV3 mock。
2. **NFPA 855 abuse 樣品送測(2026 Q3)**:單體穿刺 / 過充 / 外短路,取得 abuse 報告 → OCP 認證 prerequisite。
3. **STM32N6 X-CUBE-AI 9.x 實機 trace**:complete demonstrator 已驗證的 µs latency 進白皮書附錄 C(取代靜態圖估算)。
4. **Tier-2 colo PoC(2027 Q1–Q2)**:demonstrator 收集的 BMS / SOH / 控制律響應資料當「客戶 onboarding 教材」。

---

# Part 12 · 內部 self-review(寫計畫時揭露的不確定點)

- ✅ **誠實揭露**:Part 0 就講「26 天 5 萬做不出 spec-grade」,沒拿幻想說服自己。
- ✅ **對齊 v2.2 spec**:demonstrator 規格(τ=0.5 s、互補濾波器、INT8 LSTM)直接 link 到 `generate_twin_scenarios.py` 與既有 ONNX。Per-cell C-rate 工作點(6C peak / 1.5C 連續)與 spec 一致 — 這是「縮放但不違背」的關鍵論述。
- ⚠️ **預算抓得緊**:46.5k / 50k 只剩 7 % buffer,一個元件壞掉就破表。可考慮把點焊機改租或借,省 NT$ 3,500。
- ⚠️ **STM32N6 lead time 是最大未知**:應在 BoM 發出後 24 hr 內向 Mouser/Digi-Key/ST 直接報價並查現貨;若 lead time > 4 週,W1 結束就要 commit Pi 5 fallback。
- ⚠️ **安全部分仍偏紙上**:Class D 滅火器在台灣不易買(多為 ABC),要查替代 — Lith-Ex / F-500 滅火噴罐(NT$ 1500–2500)是更實際的選項。
- ⚠️ **未驗證的單一假設**:demonstrator 的 8S LFP + supercap 能否真的重現 5.7× / 3.5×,本計畫用 spec 中的物理推論假設成立;強烈建議 W1 在 Python 端先跑一次 8S scaled simulation 驗證(改 `generate_twin_scenarios.py` 參數即可),確認縮放後的數字仍 ≥ 3× / 2×,免得 W3 出實機波形時是 1.5× 一場空。

---

# Part 13 · 修訂歷史

## v1.1(2026-05-16,用戶 review 後)

1. **§1.3 新增 W1 Day 1 模擬 gate** — 8S scaled sim 從「建議」升級為 W1 第一天必做;結果決定 supercap 數量,避免 W3 才發現削峰只有 1.5×。
2. **§2 BoM 修正**:
   - **保護分 LFP / supercap 雙路**:supercap ESR 極低,短路峰值 ~5 kA,blade fuse 擋不住,**新增 Class T fast-blow fuse NT$ 800**。
   - **新增 MOSFET (IRFB4115PBF × 4) + gate driver (UCC27282 × 2) + 5 °C/W TO-220 鰭片**:30 A 級 high-side N-MOS 不能單靠 GPIO,要 bootstrap / isolated gate driver;**Rds(on) 熱推算 14 W,需強制對流散熱(內部 self-review 修正初版的 25 °C/W 自然對流數字錯誤)**,合計 **NT$ 1,800**。
   - **滅火器 Class D → Lith-Ex 噴罐**:台灣難購 → 蝦皮現貨,**省 NT$ 1,500**。
   - **點焊機改條件式**:優先借,借不到改彈片座,**可能省 NT$ 3,500**。
   - **總額重算**:借得到點焊機 ~45,300;借不到 ~41,800(buffer 從 7 % 上升到 16 %)。
3. **§4.4 加 atomic write 規範** — Python bridge 寫 `live_demonstrator.json` 必須 `mkstemp + fsync + os.replace`,避免 dashboard polling 讀到半寫檔 crash。
4. **§4.5 新增 MOSFET switch matrix + gate drive 設計章節** — 拓樸、元件選型、dead-time 互鎖、Vgs clamp、熱保護、Fallback IR2110 配置、W1 採購死線。
5. **§6.2 Class D → Lith-Ex** 對齊 BoM,維持文件內部一致性。
6. **§7 W1 / W2 時程修正**:
   - W1 Sat AM 模擬 gate 排在採購之前
   - LFP cell 配對改「貨到立刻做」(W1 中後段)而非堆到 W2 Sat
   - W2 Sat 改為 buffer / 補做,主壓力轉到 Sun 點焊

**未動的章節**(用戶 review 確認判斷正確):Part 0 現實檢查、Part 9 fallback 階梯、Part 6 安全 SOP 結構、Part 4.4 dashboard 最小改動方案、Part 11 給評審的 next-steps。

## v1.2(2026-05-17,用戶 push「確定可以用 Maxwell?」後)

**觸發**:v1.1 推 Maxwell BMOD0058 基於訓練資料記憶,未查證 Ioper 與 2026 通路狀況。用戶 challenge 後 web search 發現:

1. **Tesla 2021 把 Maxwell ultracap 賣給 UCAP Power**,Maxwell 品牌仍產;DigiKey 已下架,Heisener (HK) 庫存 6,732 pcs 是主通路。
2. **BMOD0058-E016-B02 規格**:22 mΩ ESR、**Ioper 19 A 連續** / 200 A 突波 —— v1.1 的「2× 串聯 1 kW baseline」配置 i_peak = 18.6 A,**沒餘量**(僅 2 %)。
3. **同 form-factor 替代品(CSI / LS Mtron)Ioper 都在 19 A 級**,不是品牌問題是物理限制。
4. **Skeleton 高電流 supercap 單顆 NT$ 12,500+**,超預算 → 不可行。

**對應修訂**:

1. **§1.1 demonstrator spec**:per-cell peak C-rate 6C → **5C**(因 demonstrator baseline 從 1 kW 降到 500 W);1.5C 連續 → ~1C 連續。5C / 1C 仍落在車規 LFP datasheet 不同條目允許區,§2.1.1 答辯邏輯不變。
2. **§1.3 W1 gate**:已執行,**PASS**(5.72× / 3.52×)。Sweep 4 supercap 配置,鎖定 **2× Maxwell 串聯 32V bank**(i_peak 9.3 A / 模組 = 51 % Ioper 餘量,UVLO 餘量 15.6 V)。
3. **§2 BoM**:
   - Supercap 一列改為 **「Maxwell BMOD0058 × 2 串聯」明確規格**,刪除「(備案) EDLC 自組」(已不需要)
   - 電子負載 **DL24P 150W → DL24M 600W**(+NT$ 2,000),因 demonstrator peak 650 W
   - 小計重算:借得到點焊機 NT$ 47,600 / 借不到 NT$ 44,100;buffer 從 ~7 % 收緊到 ~5–12 %
4. **§5.3 Headline 實驗**:測試設定數字對齊 sim — 500 W baseline、pass 條件 ≥ 4×(留 30 % bench noise margin)
5. **§7 W1 timeline**:gate 標記為 5/17 已完成 ✅;採購行程從 Sat 5/16 順延 Sun 5/17(因 gate 實際在 5/17 完成);Maxwell 通路 fallback 規則新增。
6. **新工具**:`scripts/generate_scaled_8s_sim.py` — 重跑 gate 用,改 BASELINE_KW 或 CONFIGS 即可 re-validate。

**未動的章節**(v1.2 review 確認仍正確):Part 4 韌體選型(MOSFET 30 A 級在新降載後反而更輕鬆,IRFB4115 + UCC27282 維持)、Part 6 安全 SOP、Part 9 fallback 階梯、Part 11 next-steps。

## v1.4(2026-05-17,Maxwell 通路改 DigiKey C02 + DL24M 品牌修正 + datasheet 嚴謹化)

**觸發 1(Maxwell 通路)**:用戶在 Heisener 找不到 BMOD0058-E016-**B02** 庫存(v1.2 記錄的 6,732 pcs 已售罄或下架);DigiKey 台 listing `BMOD0058-E016-**C02**`(part 11673898)庫存 26 pcs。用戶 WebFetch DigiKey product page + Maxwell datasheet PDF 驗證 C02 規格。

**觸發 2(DL24M 品牌)**:用戶傳露天 listing `ATORCH DL24M 150W 可並聯 600W`,WebSearch 三條交叉驗證後確認 BoM 寫的「RIDEN DL24M」品牌錯誤 — DL24 系列(DL24 / DL24P / DL24M / DL24MP / DL24M-H)全屬 **ATORCH(炬為)**;**RIDEN** 是另一品牌(做 DPS5020 / RD60XX 雙向電源,無電子負載線)。露天那台「DL24M 150W 並聯 600W」實為 DL24(150W) 冒充 DL24M。真正 DL24M 是**單機 600W**,透過 jumper cap + 軟體切 150 / 300 / 450 / 600 W 4 mode。

**驗證結果**(C02 vs B02 同 family):
- 電氣:16V / 58F / 22mΩ ESR — 完全一致 ✅
- IDCMAX(datasheet 嚴謹版):14A @ ΔT=15°C / 23A @ ΔT=40°C;9.3A 工作點最保守 34 % 餘量(原 B02 標的 19A 是中間折衷標式)
- IPEAK:190 A(B02 標 200 A 是 round-up)
- 端子:M5 螺絲(4 Nm 扭力);完美相容 ring lug + 10 AWG 矽膠線 + Anderson SB50
- 尺寸:226.5 × 49.5 × 75.9 mm(v1.3 BoM W/H 寫反 76 × 49.5,實際是 49.5 × 75.9;envelope 不變)

**對應修訂**:
1. **§2.1 BoM**:Maxwell 列改 C02 + DigiKey 通路 + 單價 4,500 → 5,304(+18%);小計 38,250 → 39,858;Buffer 11,750 → 10,142(借得到 PSU+萬用表 14,050 → 12,442)
2. **§1.3 footnote**:加 datasheet ΔT-based IDCMAX 嚴謹說明表(取代「19 A 統一標式」),補 datasheet PDF URL
3. **§4.5.5 L1 SOP**:加 step 0 — 萬用表先量 v_supercap,若 > 0 V 表示 bounce-back(datasheet WARNING),用 5 Ω 預充電阻放電 30 秒再進 step 1
4. **§4.5.5 加儲存規則**:每次 session 結束後 supercap +/- 端必須 short wire 保存
5. **§6.1 安全表加一條 Supercap bounce-back**:demo 前必量 v_supercap 確認狀態
6. **PURCHASE_LIST.md**:第一波 1B 改 DigiKey;採購時程「Heisener 24h 追單」改 DigiKey 「隔日到貨」;總額 / 風險警示同步;加 receiving 後 bounce-back 量測 SOP
7. **DL24M 品牌全文修正**:§1.3 / §2.1 BoM / §2.2 BoM / §3 ASCII art / PURCHASE_LIST 第一波 1A 共 5 處 `RIDEN DL24M` → `ATORCH DL24M`;BoM 備註加「**買單機 600 W 版**,避開賣家標『150W × 4 並聯到 600W』冒充」
8. **DL24M peak overload caveat**:demonstrator peak 650 W 略超 DL24M 單機 600 W cap ~8%,100 ms pulse 在 IPEAK 容差內;簡報若波形見頂部削平標明 cap 限制不影響削峰 ratio 結論

**為什麼這條值得 v1.4 而不是悄悄改**:Heisener → DigiKey 看似採購雜事,但 datasheet 嚴謹化(ΔT-based IDCMAX)+ bounce-back warning 是**安全相關發現**,直接寫進 SOP 才能避免 W2 接電時踩雷。

**未動的章節**(v1.4 review 確認仍正確):Part 0 現實檢查、Part 1.1 系統 spec(per-cell 工作點不變)、Part 3 系統架構、Part 4 韌體(MOSFET 30A 級對 9.3A 工作點仍輕鬆)、Part 5 驗證、Part 7 時程、Part 9 fallback、Part 11 next-steps。

---

## v1.3(2026-05-17,用戶 reframe「不要做整顆 BBU,只要證明可行性」)

**觸發**:用戶觀察「做出 BBU」≠「證明可行性」,直接拆出 4 件 critical-path 證據,並列出 ⏭️ 可砍清單。重新檢視全文發現 v1.2 規劃為「完整 demonstrator」加了不少不直接是 critical path 的工作。

**核心 reframe**:**「critical-path-only mode」** — 4 件可被評審 challenge 的證據(模擬 gate / 削峰波形 / NPU latency / dashboard LIVE row)是充分條件,其他都是支撐 infrastructure(safety enabler)或加分(skippable)。

**修訂**:

1. **§0.4 新增**「Critical-path-only mode」總綱:4 件證據定義 + 🎯/🛡️/⏭️ 三層標記法。
2. **§1.2 重寫**:「3 件事」→ **4 件 critical-path 證據**(把模擬 gate 升格為獨立證據,而不是只當作 W1 工作項)。
3. **§2 拆兩版**:
   - **§2.1 Lean BoM(推薦)** NT$ ~33,700(v1.3 release-time;後續 B1+H1 patch 升到 ~38,250),只留 🎯 + 🛡️
   - **§2.2 Full BoM(v1.2 凍結)** NT$ ~47,900,保留作 stretch / 對照
   - Lean 砍掉:STM32N6 → Pi 5(省 4,500)、LEM Hall → INA226(省 2,800)、cell 16→8 顆(省 2,000)、第 2 顆 STM32(省 600)、DPS5020(省 1,800)、點焊機(省 3,500)、PPE 簡化、散熱簡化 — **共省 NT$ 14,200,buffer 從 NT$ 2,100 → 16,300**。
4. **§5 加標記**:每個測項標 🎯/🛡️/⏭️;§5.3 / §5.4 明標 critical path #2/#3/#4;§5.1 cell 配對降階為「OCV 粗篩 30 min」(原 10A 放電 4 hr)。
5. **§7 圍繞 4 milestone 重排**:
   - M1 = §1.3 模擬 gate ✅(2026-05-17)
   - M2 = 邊緣推論 latency histogram(預定 2026-05-24,Pi 5 + onnxruntime,**不需等硬體到貨**)
   - M3 = Hybrid 削峰實機波形(預定 2026-06-02)
   - M4 = Dashboard LIVE row E2E(預定 2026-06-04)
   - M2 / M3 / M4 可大幅平行,軟體 stub W1 就能寫好
6. **時程節省**:cell 配對 4 hr → 30 min(W2 Sat 不卡)、burn-in 24 h → 4 hr(W2 Sun)+ 8 hr(W4 Mon)、不做機械商品照(W4 buffer 多 1 天 dry-run)。

**未動的章節**:Part 0.1–0.3 現實檢查、Part 3 系統架構、Part 4 韌體實作、Part 6 安全 SOP、Part 8–11 風險 / fallback / 軟體側 / next-steps、Part 12 v1.0 self-review。

**心法**:M1 已 ✅;M2 純軟體可在 W2 上半完成,M3 / M4 留 W3 完整一週 — 比 v1.2「線性 W1 採購 → W2 組裝 → W3 整合」抗風險強很多。Plan A → Plan E fallback 階梯(§9)未動,critical-path-only mode 落在 Plan A / B 之間。
