# Sysblade BBU Demonstrator 代辦清單 v1.7

> **2026-05-18 generated** · 對應 BoM v1.7(NT$ 43,234 / Buffer 6,766)· 複賽日 2026-06-11
>
> **圖例**:✅ 完成 · 🟡 partial · 🔄 進行中 · 📋 待辦 · ⏸️ blocked(等外部)
> **急迫**:🔴 今天(5/18)· 🟠 明天(5/19)· 🟡 本週 W1(5/22)· 🟢 W2(5/23-29)· 🔵 W3(5/30-6/5)· ⚪ W4(6/6-11)
>
> **使用法**:Print 出來逐項打勾;每天 standup 看 🔴 / 🟠 完成度。

---

## 📊 匯總統計

| 類別 | 總 | ✅ | 🟡 | 📋 | ⏸️ |
|---|---:|---:|---:|---:|---:|
| 軟體 / 韌體 | 12 | 9 | 1 | 0 | 2 |
| 採購 Tier A | 9 | 0 鎖通路 | — | 9 待下單 | — |
| 採購 Tier B | 1 | — | — | — | 1 等回覆 |
| 採購 Tier C | 17 | — | — | 17 待採購 | — |
| 借設備 | 5 | — | — | 5 待詢 | — |
| 詢價 / 通訊 | 2 | — | — | 2 急 | — |
| 收貨驗證 SOP | 9 | (SOP 寫完) | — | 9 觸發式 | — |
| W2 組裝 | 9 | — | — | 9 待 | — |
| W3 整合 + M3/M4 | 7 | — | — | 7 待 | — |
| W4 簡報 | 6 | — | — | 6 待 | — |
| **總計** | **77** | **9** | **1** | **64** | **3** |

---

## 🔥 今天(5/18)必做 6 件

1. [ ] **DigiKey 同單下訂 4 項**(Maxwell + INA228 + IRFB4115 + Pi 5)~ NT$ 18,324
2. [ ] **Amazon 下訂 ATORCH DL24M**(ASIN B0993H6NXH)~ NT$ 4,500
3. [ ] **JK-BMS 賣家下單**(checkout 必勾 RS485 + GX12 cable 加購)~ NT$ 4,000
4. [ ] **Alibaba LFP 賣家 chat 4 條問題**(等回覆判 GO/NO-GO)
5. [ ] **Lith-Ex 噴罐通路查詢**(台灣通路不密,可能要訂)
6. [ ] **學校 EE 系發信借** 示波器 + 差動探棒(必借)+ bench PSU + 萬用表(optional)

## 🟠 明天(5/19)必做 3 件

1. [ ] **ICShop FT232+SP485EEN dongle 下單**
2. [ ] **SanDisk SD card 下單**(SanDisk 官方旗艦店,**絕不蝦皮路邊**)
3. [ ] **Mouser / 利眾 UCC27282 lead time 確認**;> 4 週立刻換 IR2110 蝦皮備案

## 🟡 W1(本週 5/22)前完成

- [ ] Tier C 17 項蝦皮一次掃完
- [ ] 點焊機借不借決定(預設不借)
- [ ] LFP cell 到貨 → §4.2.1 OCV 粗篩 + pre-balance
- [ ] 借的 5 項設備全部 confirm

---

## 1️⃣ 軟體 / 韌體交付(12 項)

| 項 | 狀態 | 急迫 | 證據 / 備註 |
|---|:--:|:--:|---|
| **M1** §1.3 8S scaled sim gate(PASS 5.72×/3.52×)| ✅ | — | `data/processed/scaled_8s_sim.json` |
| **M2** 笔电 CPU LSTM latency baseline(p99 245µs)| ✅ | — | `data/processed/lstm_latency_laptop_cpu.{json,png}` |
| **M2** Pi 5 latency final(`--device-label pi5`)| ⏸️ | 🟢 | 等 Pi 5 到貨,腳本就緒 |
| **M4** dashboard LIVE row card + polling | ✅ | — | `apps/web/src/components/live-demonstrator-card.tsx` |
| **M4** atomic JSON write helper | ✅ | — | `scripts/atomic_json.py` |
| **M4** bridge mock mode(46s smoke test PASS)| ✅ | — | `scripts/live_demonstrator_bridge.py --mock` |
| **M4** bridge bench mode(JK-BMS RS485 read)| ⏸️ | 🟢 | 等 JK-BMS 到貨;parser 已自測 |
| `scripts/jkbms.py`(checksum + 8S response 自測 PASS)| ✅ | — | |
| `scripts/eload_gb200_profile.py`(PX100 protocol)| ✅ | — | 4 編碼測例驗證;Atorch protocol 留 stub |
| `scripts/hybrid_control_emulator.py`(對齊 §1.3 sim 5.72×)| ✅ | — | full-window + steady-state 雙報告 |
| `firmware/stm32_hybrid_control/{main.c,pin_map.md,README.md}` | ✅ skeleton | 🟢 | CubeMX 專案 W2 Tue 生成 |
| **M3** hybrid 削峰實機波形 | ⏸️ | 🔵 | W3 中 6/2 死線;blocked on 硬體 |

---

## 2️⃣ 採購狀態(28 項)

### Tier A — 通路鎖定(9 項可立刻下單)

| □ | 項 | 數 | NT$ | 通路 / part | 急迫 |
|:--:|---|---:|---:|---|:--:|
| [ ] | Maxwell BMOD0058-E016-C02 supercap | 2 | 10,608 | DigiKey 11673898 | 🔴 |
| [ ] | Adafruit INA228 #5832 | 2 | 1,076 | DigiKey 1528-5832-ND | 🔴 |
| [ ] | Infineon IRFB4115PBF MOSFET | 5 | 540 | DigiKey 448-IRFB4115PBF-ND | 🔴 |
| [ ] | Raspberry Pi 5 8GB | 1 | 5,600 | DigiKey 2648-SC1432-ND | 🔴 |
| [ ] | ATORCH DL24M 600W 單機 | 1 | 4,500 | Amazon B0993H6NXH | 🔴 |
| [ ] | JK-BMS JK-B 8S 100A(必勾 RS485) | 1 | 3,800 | JK 賣家 listing | 🔴 |
| [ ] | JK-BMS GX12-DuPont cable | 1 | 200 | 同 JK 賣家加購 | 🔴 |
| [ ] | ICShop FT232+SP485EEN USB-RS485 | 1 | 400 | ICShop | 🟠 |
| [ ] | SanDisk Extreme 32GB SD card | 1 | 350 | SanDisk 官方旗艦店 / WD 台灣 | 🟠 |

### Tier B — 等回覆(1 項)

| □ | 項 | 數 | NT$ 估 | 狀態 / 下一步 | 急迫 |
|:--:|---|---:|---:|---|:--:|
| [ ] | LFP 26650 5Ah cell | 12 | 2,000-4,800 | Alibaba 賣家 chat 4 條問題:(1) brand/model? (2) datasheet PDF? (3) IR mΩ? (4) sample 12 顆 unit price + 空運到台灣總價? | 🔴 chat 今天必發 |

### Tier C — 蝦皮可掃(17 項)

| □ | 項 | 數 | NT$ | 急迫 | 通路重點 |
|:--:|---|---:|---:|:--:|---|
| [ ] | 26650 cell holder(高電流彈片座)| 1 套 | 800 | 🟡 | 「26650 holder 高電流 / 銅鍍鎳」 |
| [ ] | STM32 Black Pill F411 | 1 | 600 | 🟡 | 認準 USB-C 版 |
| [ ] | UCC27282 + bootstrap + carrier 小板 | 1 套 | 900 | 🟠 | Mouser 為主;lead time > 4 週切 IR2110 |
| [ ] | 5°C/W TO-220 鰭片 × 5 | 5 | 250 | 🟡 | 蝦皮 |
| [ ] | Arctic MX-4 矽脂 | 1 | 100 | 🟡 | 蝦皮 |
| [ ] | DS18B20 防水溫度 × 4 | 4 | 200 | 🟡 | 不鏽鋼封裝 |
| [ ] | 80A blade fuse + 100A 接觸器 + E-stop | 1 套 | 1,500 | 🟡 | DC rated 接觸器 |
| [ ] | Class T fast-blow 100A fuse + holder | 1 套 | 800 | 🟡 | Bussmann JJN-100 |
| [ ] | Supercap pre-charge 套件(5Ω/50W + 40A relay + 2N7000)| 1 套 | 250 | 🟡 | 3 顆別漏 |
| [ ] | 1.5kV 絕緣手套 + 護目鏡 | 1 套 | 800 | 🟡 | 工業安全用品行 |
| [ ] | **Lith-Ex / F-500 鋰電池滅火噴罐** | 1 | 1,200 | 🔴 | ⚠️ 台灣通路不密,**提早查** |
| [ ] | 透明壓克力 400×250×150 + 鋁角材 | 1 套 | 1,800 | 🟢 | 雷射切割代工 |
| [ ] | 80mm fan × 2 + heatsink | 1 套 | 400 | 🟡 | 蝦皮 |
| [ ] | 矽膠線 10AWG + Anderson SB50 + 熱縮套 | 1 套 | 800 | 🟡 | RC / 航模通路 |
| [ ] | 4-port 自供電 USB 3.0 hub | 1 | 300 | 🟡 | 含 5V/3A 電源 |
| [ ] | Pi 5 PSU 5V/5A + micro-HDMI 線 | 1 套 | 800 | 🟡 | 必 5V/5A 規格;micro-HDMI 非 mini |
| [ ] | ST-Link V2 clone | 1 | 300 | 🟡 | 蝦皮通用 |

---

## 3️⃣ 借設備(5 項)

| □ | 項 | 必要性 | 預期通路 | 借不到 fallback |
|:--:|---|:--:|---|---|
| [ ] | bench DC PSU 30V/3A | 🟡 | 學校 EE 系 | NT$ 1,500 蝦皮(EVENTEK DPS3010)|
| [ ] | 數位萬用表 | 🟡 | 學校 EE 系 | NT$ 800 蝦皮(UNI-T UT139C)|
| [ ] | **示波器 ≥ 100MHz** | 🔴 **必借** | 學校 EE 系 | **沒借 = M3 GG** |
| [ ] | **差動探棒** | 🔴 **必借** | 學校 EE 系 | **沒借 = §6.1 接地策略違反,量錯一切白搭** |
| [ ] | 熱影像 / IR thermometer | 🟢 | 學校 EE 系 | 手摸 / 紙杯水溫對照粗判 |

---

## 4️⃣ 詢價 / 通訊任務(2 項)

| □ | 項 | 急迫 | 內容 |
|:--:|---|:--:|---|
| [ ] | **Alibaba LFP 26650 賣家 chat 4 條問題** | 🔴 今天 | (1) brand/model? (2) datasheet PDF? (3) IR mΩ? (4) sample 12 顆 unit price + 空運到台灣總價? |
| [ ] | JK-BMS 賣家 cart 確認 customization 勾選 | 🔴 今天 | ☑ RS485 / ☐ CANBus / ☐ Display / ☐ Heating;加購 GX12 cable |

---

## 5️⃣ 收貨驗證 SOP(W1-W2 到貨時觸發,9 項)

| □ | 項 | 觸發 | 急迫 | SOP 在哪 |
|:--:|---|---|:--:|---|
| [ ] | LFP cell OCV 粗篩 + pre-balance(30-60 min) | cell 到貨當日 | 🟢 | `§4.2.1` 寫好 |
| [ ] | LFP cell 首充 CC/CV(0.5C → 29.2V → 收斂 < 0.05C,4 hr)| pack 組好 | 🟢 | `§4.2.1` 寫好 |
| [ ] | Maxwell supercap bounce-back check + 短路保存 | supercap 到貨當日 | 🟢 | `§4.5.5` + 風險表 |
| [ ] | JK-BMS terminal ID 確認 = 0x00000000(藍牙 APP)| JK-BMS 到貨當日 | 🟢 | `§4.2 / scripts/jkbms.py` 備註 |
| [ ] | JK-BMS RS485 protocol 驗證(`python scripts/jkbms.py --port COM3`)| JK-BMS + GX12 cable + dongle 到貨 | 🟢 | bridge 文件 |
| [ ] | SanDisk SD card h2testw 容量驗證 | SD card 到貨當日 | 🟠 | PURCHASE_LIST 防仿冒 SOP |
| [ ] | INA228 I²C address 跳線(0x40 / 0x41) | INA228 到貨 W2 接線前 | 🟢 | PURCHASE_LIST 收貨驗證 |
| [ ] | DL24M PX100 protocol 驗證(`--once --amps 1`) | DL24M 到貨 | 🟢 | bridge 文件 |
| [ ] | IRFB4115 真品檢驗(視覺 + 連續度)| MOSFET 到貨 | 🟢 | 標準電子件檢驗 |

---

## 6️⃣ 組裝 / 整合 / 簡報

### W2(5/23-29)組裝 + 子系統測試(9 項)

| □ | 項 | 急迫 | 依賴 |
|:--:|---|:--:|---|
| [ ] | 8S1P pack 組裝(彈片座) | 🟢 W2 Sun | cell 到貨 + pre-balance 完成 |
| [ ] | 首充 + 1hr burn-in | 🟢 W2 Sun | pack 組好 + bench PSU |
| [ ] | Supercap 串聯組裝 + ESR 量測 | 🟢 W2 Mon | supercap 到貨 + LCR meter / 萬用表 |
| [ ] | STM32 CubeMX 專案 + flash main.c | 🟢 W2 Tue | STM32 + ST-Link |
| [ ] | STM32 bench dry-run(無電池,信號發生器灌假 ADC)| 🟢 W2 Wed | STM32 flashed + 信號發生器 |
| [ ] | MOSFET + gate driver carrier 板焊 | 🟢 W2 Thu | MOSFET + UCC27282 + carrier PCB |
| [ ] | DC bus + 接觸器 + fuse + E-stop 接線 | 🟢 W2 Thu | 全 BoM 元件 |
| [ ] | Pi 5 setup(Pi OS + onnxruntime + LSTM model)| 🟢 W2 Sun | Pi 5 + SD + PSU + HDMI |
| [ ] | **M2 final**:Pi 5 跑 `measure_lstm_latency.py --device-label pi5` | 🟢 W2 Sun | Pi 5 setup 完成 |

### W3(5/30-6/5)整合 + 削峰實機(7 項)

| □ | 項 | 急迫 | 死線 |
|:--:|---|:--:|:--:|
| [ ] | 整機接電(空載 → 1A → 5A 漸進)| 🔵 W3 Sat | — |
| [ ] | Hybrid OFF baseline(純 LFP)1 hr 穩定性 | 🔵 W3 Sun | — |
| [ ] | Hybrid ON + e-load profile(`--baseline-w 500`)| 🔵 W3 Mon | — |
| [ ] | **M3 5.7× / 3.5× headline 實機波形** | 🔵 **W3 Tue 6/2** | **6/2 拿不到 → 啟 Plan C 降階** |
| [ ] | Bridge bench mode 接 JK-BMS RS485 | 🔵 W3 Wed | — |
| [ ] | **M4 E2E**:e-load 變化 → LIVE row 數字動 | 🔵 **W3 Thu 6/4** | — |
| [ ] | W3 review:4 件 artifact 蒐齊 + 影片錄製 | 🔵 W3 Fri | — |

### W4(6/6-11)簡報 + dry-run(6 項)

| □ | 項 | 急迫 |
|:--:|---|:--:|
| [ ] | 4 件 critical-path 證據整合進簡報 | ⚪ W4 Sat |
| [ ] | Q7-Q10 答辯口試模擬 | ⚪ W4 Sun |
| [ ] | demonstrator 8hr 燒機監看 | ⚪ W4 Mon |
| [ ] | 30 分鐘完整 dry-run × 3 | ⚪ W4 Wed |
| [ ] | **複賽日** 現場 demo + 答辯 | ⚪ **6/11 Thu** |
| [ ] | Git commit + PR 文件整合入庫 | ⚪ W4 |

---

## 🚨 採購防呆全集(7 條,違反 = 元件壞 / 時程崩 / 安全事件)

1. **Maxwell:DigiKey C02(11673898),不是 Heisener B02**(B02 已缺貨)
2. **ATORCH DL24M 必認單機 600W 版,避開「150W × 4 並聯」listing**
3. **JK-BMS 必選 JK-B series** + **checkout 必勾 RS485 customization**
4. **JK-BMS GX12 → DuPont cable** 必加購
5. **SanDisk:只認官方旗艦店 / WD 台灣 / PChome / momo / 博客來 / Costco**
6. **Pi 5 PSU 必 5V/5A USB-C 規格**(手機充電器會限流)
7. **LFP cell:Alibaba 賣家若無法提供品牌 + datasheet + IR 數字 → NO-GO**

---

## 📎 關聯文件

- 完整 BoM + 替代品 + Lean vs Full:`docs/BBU_IMPLEMENTATION_PLAN.md` §2.1
- 採購清單分波 + 收貨 SOP + 風險表:`docs/PURCHASE_LIST.md`
- 4 件 critical-path milestone 細節:`docs/BBU_IMPLEMENTATION_PLAN.md` §1.2 + §7
- LFP 首充 CC/CV SOP:§4.2.1
- Supercap pre-charge 三層防線 SOP:§4.5.5
- 答辯硬問 Q7-Q10:`PRESENTATION_GUIDE.md`
- Plan A→E fallback 階梯:§9
