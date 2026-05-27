# 複賽 BBU 採購清單

> **v2.0 凍結 · 2026-05-26**(Twin-first pivot — v1.x 已下單部分列入 sunk cost / 可挽回標註,Wave 2-3 全部取消)
> v1.x → v2.0:**整個硬體 demonstrator 路線 descope**;v2.0 critical path 是 6 條 twin validation chains(V1-V6,純軟體 / 純 sim),**增量採購 NT$ 0**。下方 v1.x 38 SKU 表保留為**已執行採購歷史 + 處置狀態**。
> 對應 BoM(v1.x archive):[docs/BBU_IMPLEMENTATION_PLAN.md §2.1](BBU_IMPLEMENTATION_PLAN.md)(v1.10 凍結時的最終 BoM)
> 對應 v2.0 計畫:[docs/BBU_IMPLEMENTATION_PLAN.md § 摘要 + § 0.5](BBU_IMPLEMENTATION_PLAN.md)

---

## § 0 v2.0 sunk cost / 可挽回 / 取消(**新增,2026-05-26**)

> **動作死線 2026-06-02**(7 天後)— 所有「可挽回」項目須於此日前決定退貨 / 二手出 / 轉用,逾期退換貨窗口關閉。

### 已完成處置(2026-05-27)

**全數退貨 / 取消下單**。團隊決議不留任何 v1.x 採購硬體,專心 twin-only 路線。
所有訂單(Wave 1A 蝦皮 / 1B DigiKey / 1C UCC27282 / 1D Pi 5 配件 / Wave 2 安全
/ Wave 3 機構)無論已收貨與否一律啟動退貨流程,**無項目轉用 / 無項目暫存**。

### 統計(v2.0 帳目 — 最終版)

| 類別 | NT$ |
|---|---:|
| **預算上限** | 50,000 |
| **v1.x 採購全數退貨** | ~0 sunk(退貨手續費 / 運費可能 ~NT$ 500-1,000 不可回收,實際金額以退款入帳後確認) |
| **v2.0 增量採購** | **0**(純軟體 / 純 sim) |
| **Buffer 剩餘** | **~49,000-50,000** |

> 底線:**v1.x 沒有 sunk cost legacy**;v2.0 起 NT$ 5 萬預算近乎全額保留,團隊
> 後續若有 W3+ EVT 階段重啟硬體採購不受 v1.x 牽絆。

---

## ⚠️ 以下為 v1.x archive(2026-05-22 v1.10 凍結時的採購清單)

> v2.0 已 descope。**保留為 engineering process evidence**(評審看到 procurement
> rigor + sourcing 防偽 SOP + datasheet 嚴謹化的軌跡是加分點),**但 v2.0
> 階段不依此執行**。已執行的部分按 §0 處置 SOP 處理。

---

## 採購時程(關鍵節點 — v1.x archive)

| 時間 | 動作 |
|---|---|
| **5/18 PM**(今天)| **DigiKey 同單下訂 4 項(Maxwell × 2 + INA228 × 2 + IRFB4115 × 5 + Pi 5 × 1)= ~NT$ 17,824 + 運費**;同時下 1A 蝦皮 / 露天;1C UCC27282 看 Mouser lead time;1D Pi 配件 PSU + SD + HDMI |
| 5/18-19 | **Wave 1A 蝦皮一晚搞定**(13 項);JK-BMS 賣家下單(checkout 照 v1.6 customization 必勾 RS485 + 加購 GX12 cable);ICShop FT232+SP485EEN |
| 5/18 | DigiKey 訂單 confirmation email 預期當日到 — 若 24h 沒收到,登入帳號或客服查詢 |
| 5/19 早上 | UCC27282 Mouser lead time > 4 週 → **立刻**蝦皮下 IR2110 備案 |
| 5/19 全天 | 第二波下單;問學校 EE 系借 bench PSU + 萬用表 + **示波器 + 差動探棒**(M3 必用) |
| 5/19 前 | 點焊機借不借決定(預設借不到 → 彈片座 BoM 已含) |
| 5/22 W1 review | 採購到貨清點 + 軟體 stub 全綠 |

---

## 🔥 第一波 — TODAY 5/17 PM 立刻下單(W1 內必到)

### 1A. 蝦皮 / 露天(1-3 天到)— 小計 ~14,520(v1.10:STM32 備品 + holder 單節 + DS18B20 備品 + 5Ω 實價)

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| LFP 26650 3.2V/5Ah | **12** | **3,000** | `LFP 26650 5Ah`、`磷酸鋰鐵 26650`、`EVE 26650 5000mAh`、`A123 26650 高功率` | **v1.8 對齊 proposal_v2**:8 主用 + **4 備品**(DOA replacement + cell-matching 池);**5 防呆**:① 標 3.2V(不是 3.7V Li-ion)② 充飽 3.65V(不是 4.2V)③ 化學系統 LiFePO4 / 磷酸鋰鐵(不是 NCM/NMC/NCA)④ prefix IFR(不是 ICR/INR)⑤ 連續放電 ≥ 2C(我們 25A peak 要求);同批號;避開 NCR / BRC 假料品牌 |
| **26650 單節電池盒 BH-26650-1**(廣華) | **10** | **300** | 廣華 shop.cpu.com.tw `BH-26650-1`;或蝦皮 `26650 單節 電池盒 彈片` | **v1.10**:台灣無 8 串整盒 → 單節 holder × 10 排 8S1P(8 用 + 2 備);NT$ 30/顆;★★★★★(2 節款 ★★ 避開);79×29×29mm,A123 平頭相容;Endrich 若答帶 tab 則當純機械座 |
| **JK-BMS 8S 100A**(限 JK-B 系列,含 RS485 customization) | 1 | 3,800 | `JK-BMS 8S B1A8S20P`、`極空 BMS JK-B` | **v1.6 升**:基礎 USD $89.98 + checkout 必勾 ☑ RS485 → ~USD $110-125 ≈ NT$ 3,800;☐ CANBus / ☐ Display / ☐ Heating 不勾;**勿買 DZ11/PB1**(jkbms.py offset 不同) |
| **JK-BMS GX12-DuPont RS485 cable**(加購)| 1 | 200 | 同 JK-BMS 賣家頁面「RS485 Adapter Cable: Sold separately as optional add-on」 | JK-B RS485 訊號出在 4-pin GX12 port(俗稱 "GPS port"),需 cable 把 GX12 → DuPont 才能接 ICShop FT232+SP485EEN dongle |
| STM32 Black Pill F411 | **2** | **1,200** | `STM32F411 Black Pill`、`WeAct F411CE` | F411CE 512KB;USB-C;**v1.10:1 用 + 1 備品**(控制大腦,3.3V GPIO 接 32V 電路易 brick,W3 死線備品可當場換) |
| **ATORCH DL24M-H 600W 套組** | 1 | 4,500 | `DL24M-H 600W`、`ATORCH DL24M-H`、`DL24M 600W 套組` | **v1.10 修正 v1.4 錯誤**:無「單機 600W」DL24M —— 單一模組僅 150W;600W = **DL24M-H 完整套組(master + 3 擴充模組,150W×4)**。下單**必問賣家「master + 3 擴充模組附齊?」**;避開 DL24(150W)/ DL24P(180W)誤購;蝦皮無貨 → AliExpress ATORCH 官方店;USB 可程式 + 4 線 Kelvin;**套組實價待確認,可能異動 Buffer** |
| DS18B20 防水 | **6** | **300** | `DS18B20 防水 不鏽鋼` | 不鏽鋼封裝;**v1.10:4 用 + 2 備品**(1-Wire 3 腳易接反燒) |
| **ICShop USB-RS485 dongle**(FT232 + SP485EEN) | 1 | 400 | ICShop 搜「FT232 RS485」或「USB to RS485」 | **v1.6 升**:從 generic CH340 升 FT232+SP485EEN;FT232 比 CH340 driver 穩(macOS/Linux 不卡);SP485EEN 半雙工 RS485 transceiver;搭 JK-BMS GX12 cable 的 DuPont 端子直連 |
| USB hub 4-port 自供電 | 1 | 300 | `USB 3.0 hub 4 port 帶電源` | 含 5V/3A 外接電源 |
| ST-Link V2 clone | 1 | 300 | `ST-Link V2 STM32 迷你` | 帶 SWD 4-pin cable |
| 5Ω/50W 線繞電阻(B1 預充) | 1 | **50** | `RX24 50W 5歐姆 鋁殼電阻`、`5R 50W 鋁殼` | **v1.10 實價 80→50**:RX24 鋁殼繞線;**認「現貨」賣家**(避開「較長備貨」6/2-6/8 到貨會卡 W3) |
| 40A 5-pin auto relay(B1) | 1 | 120 | `汽車繼電器 40A 12V 5腳`、`Bosch 0332019150` | 12V 線圈 / NO 接點 / 真 40A |
| IRLZ44N(B1 relay driver) | 2 | 50 | `IRLZ44N TO-220`、`IRLZ44NPBF` | **v1.9 換 2N7000**:Picker PC792A relay 線圈 133 mA,2N7000 Id 200 mA 餘量不足;IRLZ44N logic-level(Vgs(th) 1-2 V,STM32 3.3 V GPIO 直驅)/ Id 47 A / TO-220;**搭 UF4007 flyback 跨接線圈** |

### 1B. DigiKey 台(現貨主通路)— **17,932**(v1.10 IRFB4115 5→6)

> **v1.7 集中通路**:Maxwell + INA228 + IRFB4115 + Pi 5 同單下訂,**運費攤平 ~NT$ 500**,3-5 工作天到貨

| 品項 | 數 | NT$ | 通路 | 備案 |
|---|---:|---:|---|---|
| **Maxwell BMOD0058-E016-C02** | 2 | 10,608 | digikey.tw part **11673898**(26 pcs 現貨) | DigiKey 缺貨 → eBay 二手 `Maxwell BMOD0058` 或 LS Mtron `LSUM016R8C0058F`(同 form-factor) |
| **Adafruit INA228 breakout #5832** | 2 | 1,076 | digikey.tw part **1528-5832-ND**(671 pcs 現貨) | DigiKey 缺貨 → Adafruit US 直購(USD 14.95)或蝦皮 INA228 模組(無 STEMMA QT) |
| **Infineon IRFB4115PBF MOSFET**(v1.7 從 1C 移入) | **6** | 648 | digikey.tw part **448-IRFB4115PBF-ND**(4,126 pcs 現貨) | **v1.10:4 主 + 2 備品**(MOSFET 電力電子頭號陣亡品,有時成對死);USD $3.37/pc × 6 = $20.22;IRFB4115 是仿冒重災區,DigiKey 真品 reliability margin 大;備案 Mouser / 利眾 / 唐文(蝦皮便宜但仿冒風險) |
| **Raspberry Pi 5 8GB**(v1.7 通路鎖)| 1 | 5,600 | digikey.tw part **2648-SC1432-ND** / SC1432(11,513 pcs 現貨) | USD $175;比 RS TW (~NT$ 3,300) 貴 NT$ 2,200 但同單下訂省運費 + 時程確定性;備案 RS TW part **2841190** 或蝦皮 RS / iCircuit 官方店 |

**Maxwell 規格驗證**(對 datasheet PDF 3003212.2):16V / 58F / 22mΩ ESR / **IDCMAX 14 A @ ΔT=15°C 或 23 A @ ΔT=40°C** / IPEAK 190 A / M5 螺絲端子 4 Nm / 226.5 × 49.5 × 75.9 mm / 0.63 kg。9.3 A 工作點全條件下 ≥ 34 % 餘量,§1.3 gate PASS。**單價 NT$ 5,304 × 2 = 10,608**(DigiKey 台幣計價;1 顆 5,304 / 10 顆批 4,672 / 50 顆批 4,419)。

**v1.4 通路升 DigiKey 理由**:Heisener B02 通路缺貨(v1.2 記錄 6,732 pcs 已售完);DigiKey 台 stock 26 pcs C02 隔日到貨、台幣計價、發票退換貨機制完整,差價 NT$ 1,608(+18 %)Buffer 吃得下,免「Heisener 24h email 追單」的時間壓力。

⚠️ **datasheet WARNING(收貨當日必做)**:Maxwell 模組未短路保存 +/- 端可能 bounce back 至 2 V → 收到後**第一動作:萬用表量 +/- 兩端**,若 > 0 V 用 5 Ω 預充電阻跨接放電 30 秒。串聯 / 預充 SOP 全程在 §4.5.5。

**INA228 規格驗證**(對 TI INA228 datasheet + Adafruit 5832 schematic):85V 量程(supercap 32V 餘量 165%)/ 20-bit ADC / I²C 介面 / onboard shunt **R015 = 15 mΩ**(滿量程 ±10.9 A)/ STEMMA QT JST-SH 4-pin + 7 腳排針座(板上未焊,需自焊)/ ADR0+ADR1 跳線 4 種 address(預設 0x40)。**用法**:#1 量 supercap path(15 mΩ 直用,9.3 A peak 在量程內 85%);#2 量 LFP path(25 A peak 須**外接 5 mΩ shunt** 跨 VIN+ / VIN- 螺絲端子,將量程拉到 ±32 A;或讀 JK-BMS RS485 回報 I_total 反推)。2 顆並掛同條 I²C bus,**第 2 顆把 ADR0 跳線改 0x41**。

**v1.5 升階 INA228 理由**:INA226(16-bit / 36V)對 supercap 32V bank 只 11% 餘量,bounce-back 場景可能踩線;INA228 量程 +165% + ADC 解析度 ×16 + 整合 coulomb / joule accumulator(M3 削峰量測直接讀累積能量,不需軟體積分)— +NT$ 876 升階值得。

### 1C. DigiKey(UCC27282 併入 1B 同單)— 189

| 品項 | 數 | NT$ | 搜尋 query | 確認重點 |
|---|---:|---:|---|---|
| ~~IRFB4115PBF~~ | ~~4~~ | ~~900~~ | (**v1.7 移到 1B DigiKey 同單下訂**) | — |
| **UCC27282DR** | **3** | **189** | digikey.tw part **13213543**(SOIC-8,6,570 pcs 現貨,NT$ 63/顆)| **v1.10**:2 用 + 1 備品(gate driver 常陪 MOSFET 陣亡);通路改 DigiKey(舊 Mouser 估 900 過高,實價 −711);**併入 1B DigiKey 同單**;Fallback IR2110 + 1N4148 + 10µF cap(蝦皮 NT$ 200 全套) |

### 1D. Pi 5 配件(主板已移到 1B DigiKey)— **1,200**

| 品項 | 數 | NT$ | 通路 | 確認重點 |
|---|---:|---:|---|---|
| ~~Raspberry Pi 5 8GB~~ | ~~1~~ | ~~4,500~~ | (**v1.7 移到 1B DigiKey 同單**)| 已升 NT$ 5,600(DigiKey SC1432)|
| **5V/5A USB-C PSU**(Raspberry Pi 官方 27W)| 1 | 600 | 蝦皮 RS / iCircuit 官方店;或 Pi 5 同店 | **必 5V/5A 規格**(手機充電器 / 一般 USB-C PSU 會限流 → Pi 5 throttle / 開機掛)|
| **SanDisk Extreme 32GB UHS-I C10 U3**(優先 A1) | 1 | 300-400 | **SanDisk 官方旗艦店 / WD 台灣 / PChome / momo / 博客來 / Costco** | ⚠️ **SanDisk 仿冒重災區**;**禁:蝦皮路邊、Aliexpress、Alibaba**;收貨用 **h2testw** 驗容量;若有 A1 標示同價就買 A1(Pi OS 開機 25s vs 45s)|
| **micro-HDMI to HDMI 線 1m** | 1 | 200-300 | 蝦皮 | **micro-HDMI 不是 mini-HDMI**;Pi 5 有 2 個 micro-HDMI port |

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
| 1µF 50V X7R MLCC(UCC27282 bootstrap) | **10** | **60** | `1uF 50V X7R 0805` | X7R 非 Y5V;**v1.10:4→10 備品**(被動件焊接必損耗);若改 IR2110 改 10µF 50V 電解 |
| UF4007 二極體 | **10** | 50 | `UF4007 快速恢復` | trr < 75ns;**v1.10:4→10 備品**(relay 線圈 flyback + 保護;銅板價多買) |
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
| 第一波 1A(蝦皮 / 露天)| 13 項 | 14,520 |
| 第一波 1B(DigiKey 同單:Maxwell + INA228 + IRFB4115×6 + Pi 5)| 4 項 | 17,932 |
| 第一波 1C(DigiKey:UCC27282DR×3,併 1B 同單)| 1 項 | 189 |
| 第一波 1D(Pi 5 配件)| 3 項 | 1,200 |
| 第二波(安全 + 電源,2 項可借)| 10 項 | 7,510 |
| 第三波(機械散熱)| 3 項 | 2,300 |
| **採購總額(v1.10,canonical = §2.1 統一 BoM)**| **34 SKU** | **~43,801** |
| **+ 運費 / 雜耗估** | | ~2,000 |
| **實付** | | **~45,500-46,500** |
| **Buffer**(全買新)| | **6,199** |
| **Buffer**(借得到 PSU + 萬用表)| | **8,499** |
| **Warning line** | | NT$ 5,000(目前餘 **NT$ 1,199**)|

> **註**:上方分波小計加總為 NT$ 43,651(購物分類視角);與 canonical 採購總額 NT$ 43,801 差 NT$ 150,為 TO-220 鰭片 / 矽脂在 `BBU_IMPLEMENTATION_PLAN.md §2.1 統一 BoM` 歸入「IRFB4115 套」、本表歸入「第三波散熱」的分類歸屬差。**headline 總額以 §2.1 統一 BoM NT$ 43,801 為準。**

---

## ⚠️ 風險警示(下單前必讀)

| 風險 | 機率 | 對策 |
|---|:--:|---|
| DigiKey Maxwell C02 缺貨 | 低 | 26 pcs 現貨;若清貨切 eBay 二手 `BMOD0058` 或 LS Mtron `LSUM016R8C0058F`(同 form-factor) |
| Supercap bounce-back(收貨後)| 高(若未量測)| **收貨當日**萬用表量 +/- 兩端,> 0 V 用 5 Ω 跨接放電 30 秒;之後 demo 結束都必 short wire 保存 |
|---|:--:|---|
| Heisener Maxwell 24h 無 confirmation | 中 | email 追;延 > 2 週切 eBay / LS Mtron 備案 |
| UCC27282 Mouser lead time > 4 週 | 中 | **5/18 早上**看到立刻換 IR2110(蝦皮 NT$ 200 全套),韌體加 minimum-duty 5-95% 切換 |
| Pi 5 DigiKey 缺貨 | **極低** | **v1.7 鎖 DigiKey SC1432,11,513 pcs 現貨**;備案 RS TW part 2841190 / 蝦皮 RS / iCircuit 官方店;或 M2 fallback 用笔电 baseline 進簡報(p99 245 µs 仍可接受)|
| IRFB4115 蝦皮買到仿冒(Rds(on) 5× 預期 → 燒)| 中(若蝦皮)| **v1.7 鎖 DigiKey 真品**,4,126 pcs 現貨;NT$ 540 / 5 顆(蝦皮 NT$ 480 / 4 顆但仿冒風險)|
| SanDisk SD card 仿冒(標 32GB 實際 8GB)| **高(若蝦皮路邊)** | **只認 SanDisk 官方旗艦店 / WD 台灣 / PChome / momo / 博客來 / Costco**;**禁 Aliexpress / Alibaba**;收貨用 h2testw 驗 |
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
