# 複賽 BBU Demonstrator 採購清單

> v1.4 凍結 · 2026-05-17(Maxwell 通路升 DigiKey C02)
> 對應 BoM:[docs/BBU_IMPLEMENTATION_PLAN.md §2.1](BBU_IMPLEMENTATION_PLAN.md#21--lean-bom推薦nt-39858)
> 總額 NT$ 39,858 / Buffer 10,142(借得到 bench PSU + 萬用表 → 12,442)

---

## 採購時程(關鍵節點)

| 時間 | 動作 |
|---|---|
| **5/17 PM** | **DigiKey Maxwell BMOD0058-E016-C02 × 2 立刻按下單**(現貨 26 pcs,隔日到貨);其餘第一波 1A/1C/1D 同步下 |
| 5/17 晚上 | DigiKey 訂單 confirmation email 預期當日到 — 若 24h 沒收到,登入帳號或客服查詢 |
| 5/18 早上 | UCC27282 Mouser lead time > 4 週 → **立刻**蝦皮下 IR2110 備案 |
| 5/18 全天 | 第二波下單;問學校 EE 系借 bench PSU + 萬用表 + **示波器 + 差動探棒**(M3 必用) |
| 5/19 前 | 點焊機借不借決定(預設借不到 → 彈片座 BoM 已含) |
| 5/22 W1 review | 採購到貨清點 + 軟體 stub 全綠 |

---

## 🔥 第一波 — TODAY 5/17 PM 立刻下單(W1 內必到)

### 1A. 蝦皮 / 露天(1-3 天到)— 小計 ~13,150

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| LFP 26650 3.2V/5Ah | 8 | 2,000 | `LFP 26650 5Ah`、`磷酸鋰鐵 26650`、`EVE 26650 5000mAh` | **LFP 不是 NMC**(NMC 3.7V);同批號;避開 NCR |
| 26650 8S holder + 端子 | 1 套 | 800 | `26650 電池盒 8串`、`26650 彈片座` | 焊腳 ≥ 0.3mm;**彈片座**(預設借不到點焊機) |
| **JK-BMS 8S 100A**(限 JK-B 系列) | 1 | 2,800 | `JK-BMS 8S B1A8S20P`、`極空 BMS JK-B` | RS485 + 藍牙;**勿買 DZ11/PB1**(jkbms.py 不支援 offset) |
| STM32 Black Pill F411 | 1 | 600 | `STM32F411 Black Pill`、`WeAct F411CE` | F411CE 512KB;USB-C |
| INA226 模組 | 2 | 200 | `INA226 模組 breakout` | I²C + onboard shunt + 量程 ≥ 36V |
| **ATORCH DL24M 600W**(單機) | 1 | 4,500 | `ATORCH DL24M 600W 單機`、`DL24M 40A 200V`、`DL24M jumper 切 600W` | **v1.4 品牌修正**(RIDEN → ATORCH);**買單機 600 W 版**(jumper cap + 軟體切 150/300/450/600 W mode);**避開**「150W × 4 並聯到 600W」listing 那是 DL24 冒充 DL24M;USB + 4 線 Kelvin;最穩備案 Amazon ASIN `B0993H6NXH`(USD ~50-65) |
| DS18B20 防水 | 4 | 200 | `DS18B20 防水 不鏽鋼` | 不鏽鋼封裝 |
| USB-RS485 dongle | 1 | 200 | `USB RS485 CH340 MAX485` | **帶 MAX485**(便宜版只有 USB-TTL 不夠) |
| USB hub 4-port 自供電 | 1 | 300 | `USB 3.0 hub 4 port 帶電源` | 含 5V/3A 外接電源 |
| ST-Link V2 clone | 1 | 300 | `ST-Link V2 STM32 迷你` | 帶 SWD 4-pin cable |
| 5Ω/50W 線繞電阻(B1 預充) | 1 | 80 | `50W 5歐姆 線繞電阻 鋁殼` | 鋁殼包覆型 |
| 40A 5-pin auto relay(B1) | 1 | 120 | `汽車繼電器 40A 12V 5腳`、`Bosch 0332019150` | 12V 線圈 / NO 接點 / 真 40A |
| 2N7000(B1 driver) | 2 | 50 | `2N7000 TO-92` | TO-92 |

### 1B. DigiKey 台(現貨主通路)— 10,608

| 品項 | 數 | NT$ | 通路 | 備案 |
|---|---:|---:|---|---|
| **Maxwell BMOD0058-E016-C02** | 2 | 10,608 | digikey.tw part **11673898** | DigiKey 缺貨 → eBay 二手 `Maxwell BMOD0058` 或 LS Mtron `LSUM016R8C0058F`(同 form-factor) |

**規格驗證**(對 datasheet PDF 3003212.2):16V / 58F / 22mΩ ESR / **IDCMAX 14 A @ ΔT=15°C 或 23 A @ ΔT=40°C** / IPEAK 190 A / M5 螺絲端子 4 Nm / 226.5 × 49.5 × 75.9 mm / 0.63 kg。9.3 A 工作點全條件下 ≥ 34 % 餘量,§1.3 gate PASS。**單價 NT$ 5,304 × 2 = 10,608**(DigiKey 台幣計價;1 顆 5,304 / 10 顆批 4,672 / 50 顆批 4,419)。

**v1.4 通路升 DigiKey 理由**:Heisener B02 通路缺貨(v1.2 記錄 6,732 pcs 已售完);DigiKey 台 stock 26 pcs C02 隔日到貨、台幣計價、發票退換貨機制完整,差價 NT$ 1,608(+18 %)Buffer 吃得下,免「Heisener 24h email 追單」的時間壓力。

⚠️ **datasheet WARNING(收貨當日必做)**:Maxwell 模組未短路保存 +/- 端可能 bounce back 至 2 V → 收到後**第一動作:萬用表量 +/- 兩端**,若 > 0 V 用 5 Ω 預充電阻跨接放電 30 秒。串聯 / 預充 SOP 全程在 §4.5.5。

### 1C. Mouser / Digi-Key / 利眾 / 唐文 — 1,800

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| IRFB4115PBF | 4 | 900 | `IRFB4115PBF` | Vds 150V / Id 104A / Rds(on) 9.3mΩ;**Mouser 正品**(蝦皮山寨假料風險高);TO-220 |
| UCC27282 | 2 | 900 | `UCC27282` | **lead time ≤ 2 週**;> 4 週**立刻**換 IR2110 + 1N4148 + 10µF cap(蝦皮 NT$ 200 全套)+ 韌體加 minimum-duty 限制 |

### 1D. Pi 5 台灣代理(Cytron / 翔暉)— 5,700

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| Raspberry Pi 5 8GB | 1 | 4,500 | `Raspberry Pi 5 8GB` | **8GB 版** |
| Pi 5 配件套裝 | 1 套 | 1,200 | `Pi 5 official PSU` + `SanDisk Extreme 32GB U3` + `micro HDMI 線 1m` | **官方 5V/5A PSU**(山寨會 throttle NPU);**micro-HDMI 非 mini-HDMI**;**U3 級 SD** |

---

## 🛡️ 第二波 — 5/18 接電前必到(蝦皮 / momo 翌日到)— 小計 ~6,400(2 項可借)

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| 80A blade fuse + holder | 1 套 | 400 | `ANL fuse 80A`、`80A 保險絲座` | 螺絲端子 |
| 100A DC 接觸器 + E-stop | 1 套 | 1,100 | `DC 接觸器 100A 12V`、`E-stop 緊急停止按鈕` | **DC rated**(AC contactor 直流會 arc);12V 線圈 |
| **Class T 100A fast-blow fuse** | 1 套 | 800 | `Class T fuse 100A`、`Bussmann JJN-100` | **必 Class T / semiconductor fuse**(ANL 擋不住 supercap 5kA 短路) |
| 1.5kV 絕緣手套 + 護目鏡 | 1 套 | 800 | `絕緣手套 1000V 電工`、`護目鏡 安全 防衝擊` | EN 60903 Class 0+;含側護 |
| **Lith-Ex / F-500 鋰電池滅火噴罐** | 1 | 1,200 | `Lith-Ex 鋰電池滅火`、`F-500 噴罐` | **必鋰電池專用**(ABC 一般滅火器 ❌) |
| 矽膠線 10AWG + Anderson SB50 + 熱縮套 | 1 套 | 800 | `矽膠線 10AWG`、`Anderson SB50 紅` | 矽膠絕緣(PVC 耐熱不夠) |
| 1µF 50V X7R MLCC(UCC27282 bootstrap) | 4 | 50 | `1uF 50V X7R 0805` | X7R 非 Y5V;若改 IR2110 改 10µF 50V 電解 |
| UF4007 二極體 | 4 | 50 | `UF4007 快速恢復` | trr < 75ns |
| ★ bench PSU 30V/3A(借不到才買) | 1 | 1,500 | `EVENTEK DPS3010`、`UNI-T UTP3315TFL` | **優先借學校 EE 系** |
| ★ 數位萬用表(借不到才買) | 1 | 800 | `Fluke 17B+`、`UNI-T UT139C` | **優先借學校 EE 系** |

---

## 🔧 第三波 — 5/25 前到(W3 整合用)— 小計 2,200

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| 壓克力盒 400×250×150 + 鋁角材 | 1 套 | 1,800 | `壓克力盒 400 250 150`、`鋁角材 25mm` | 內部 ≥ 400mm 長(Maxwell 2 顆串聯 470mm 線距) |
| 80mm DC fan × 2 + TO-220 heatsink | 1 套 | 400 | `80mm 風扇 12V`、`TO-220 鋁鰭片 5度` | **5 °C/W**(自然對流 25 °C/W 會燒 IRFB4115) |
| 散熱矽脂 | 1 | 100 | `Arctic MX-4` | 不導電 |

---

## 📦 借的清單(優先嘗試 · 可省 NT$ 2,300+)

| 項目 | 找誰借 | 沒借到怎辦 |
|---|---|---|
| **bench DC PSU 30V/3A** | 學校 EE 系 / Sysgration | 蝦皮買 DPS3010 NT$ 1,500 |
| **數位萬用表** | 學校 EE 系 | 蝦皮買 UT139C NT$ 800 |
| **示波器(M3 必用)+ 差動探棒**(H5 接地策略必用) | 學校 EE 系**必借** | 沒借到 = M3 跑不出來 |
| **點焊機** | 社團 / Sysgration 廠 | 已預設借不到,用彈片座(BoM 已含 NT$ 800) |

---

## 採購總額對照

| 波次 | 含項 | 小計 |
|---|---:|---:|
| 第一波 1A(蝦皮 / 露天) | 13 項 | 13,150 |
| 第一波 1B(DigiKey Maxwell C02) | 1 項 × 2 顆 | 10,608 |
| 第一波 1C(Mouser / 利眾) | 2 項 | 1,800 |
| 第一波 1D(Pi 代理) | 2 項 | 5,700 |
| 第二波(安全 + 電源,2 項可借) | 10 項 | 6,400 |
| 第三波(機械散熱) | 3 項 | 2,200 |
| **採購總額** | **30 SKU** | **~39,858** |
| **+ 運費 / 雜耗估** | | ~2,000 |
| **實付** | | **~41,500-42,500** |
| **Buffer**(全買新) | | 10,142 |
| **Buffer**(借得到 PSU + 萬用表) | | **12,442** |

---

## ⚠️ 風險警示(下單前必讀)

| 風險 | 機率 | 對策 |
|---|:--:|---|
| DigiKey Maxwell C02 缺貨 | 低 | 26 pcs 現貨;若清貨切 eBay 二手 `BMOD0058` 或 LS Mtron `LSUM016R8C0058F`(同 form-factor) |
| Supercap bounce-back(收貨後)| 高(若未量測)| **收貨當日**萬用表量 +/- 兩端,> 0 V 用 5 Ω 跨接放電 30 秒;之後 demo 結束都必 short wire 保存 |
|---|:--:|---|
| Heisener Maxwell 24h 無 confirmation | 中 | email 追;延 > 2 週切 eBay / LS Mtron 備案 |
| UCC27282 Mouser lead time > 4 週 | 中 | **5/18 早上**看到立刻換 IR2110(蝦皮 NT$ 200 全套),韌體加 minimum-duty 5-95% 切換 |
| Pi 5 蝦皮 / 代理缺貨 | 低 | 露天現貨;或 M2 fallback 用笔电 baseline 進簡報(p99 245 µs 仍可接受) |
| JK-BMS 買到 DZ11/PB1 系列 | 中 | 採購時**問賣家確認 JK-B**;收貨用 `python scripts/jkbms.py --port COM3` 驗 protocol |
| LFP cell 到貨 SOC 偏差 > 30 mV | 高 | **必跑 §4.2.1 pre-balance SOP**(30-60 min 拉到 ±50 mV 內再串聯) |
| Maxwell supercap 直接接帶電 bus | 高(若未跑 SOP) | **必跑 §4.5.5 L1 pre-charge SOP**(bench PSU 把 supercap 拉到距 bus < 0.5V 才合主接觸器) |

---

## 對應 BoM / 計畫 / 韌體交叉引用

- BoM 完整 25 列細目 → [BBU_IMPLEMENTATION_PLAN.md §2.1](BBU_IMPLEMENTATION_PLAN.md)
- LFP 首充 CC/CV SOP → §4.2.1
- Supercap pre-charge 三層防線 SOP → §4.5.5
- 4 件 critical-path milestone(M1-M4)→ §1.2 + §7 時程表
- 答辯硬問(Q7-Q10:8S vs 15S / Maxwell vs Eaton / Pi 5 vs STM32N6 / LIVE row Vercel)→ [PRESENTATION_GUIDE.md](../PRESENTATION_GUIDE.md)
- Plan A→E fallback 階梯 → §9
