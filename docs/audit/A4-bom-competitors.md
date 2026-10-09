# A4：純 LFP BBU vs LFP＋LIC 混合——元件級公開價格量級對照＋競品公開規格表

> 本檔為口試前自我稽核摘要，2026-10-09 自稽核工作區複製進 repo；文中路徑以 repo 根目錄為準，標「稽核過程紀錄（未入 repo）」者為未納入版控的驗收紀錄。

DC-DC 功率等級與 LIC 顆數引用 `A2-power-electronics.md` §4 與 §2B（**A2 已驗收（兩輪）**）：主算 bus 側 60 kW、LIC 14S2P＝28 顆；50 kW、85 kW 與 13S3P＝39 顆為敏感度。

查詢日期：2026-10-09（所有價格、規格皆為當日 WebSearch／WebFetch 結果）。
範圍聲明：**只算元件**，不含組裝、認證（UL 9540／9540A）、熱設計、機構、BMS 開發、保固、良率與採購量折扣。本表是「公開價格量級」，不是量產報價，不得當成產品成本。無實體硬體，全部為設計層級試算。

來源等級代號：
- R = 零售／通路公開標價（Digikey 等，單件價）
- P = 官方採購價目表（政府採購文件）
- S = 次級來源（新聞、分析、搜尋摘要、賣家部落格）
- E = 本檔的估計或假設（無公開價格，標「假設」）
- V = 廠商自述；T = 第三方

---

## 1. 比較基準（含假設）

| 項目 | 取值 | 來源 |
|---|---|---|
| 一台機櫃 BBU 數 | 8 台並聯 | repo `scripts/generate_twin_scenarios.py:65`（N_BBU_PER_RACK） |
| 單台 BBU | LFP 15S × 3.2 V（48 V 標稱）、2.5 kWh、峰值 15 kW | `generate_twin_scenarios.py:66-67`（LFP_PACK_KWH、LFP_PACK_NOMINAL_V）；`docs/whitepaper.md:140-141` |
| 機櫃 LFP 總能量 | 8 × 2.5 = **20 kWh**；機櫃峰值 120 kW | 同上 |
| LIC 庫（主算） | 14S2P＝**28 顆** 3300 F 級 LIC 單體（2.2–3.8 V），DC-DC 限 60 kW；敏感度 13S3P＝**39 顆**（P1–P4 需求集合、不含 P5；含 P5〔停電前閒置、120 kW 階躍〕且不限功率需 10S5P＝50 顆，見 A2:25、:138） | `A2-power-electronics.md` §2B（單體參數為 JSR／JM Energy 2012 年簡報的 R&D 原型暫定值，**假設**，非 Musashi CPQ3300SD 規格） |
| LIC 庫能量（價格換算基礎） | 單顆窗內能量 ½·3300·(3.8²−2.2²)=15,840 J=4.4 Wh；28 顆＝**123.2 Wh**（443.5 kJ）；39 顆＝171.6 Wh（617.8 kJ，與 A2 的 618 kJ 一致） | 計算 |
| 雙向 DC-DC 功率 | 主算 **bus 側 60 kW**；敏感度 50 kW（下緣）與 85 kW（方波邊緣全由 LIC 吸收）。LIC 側電流約 1.8 kA（14S2P）——**成本表的 $/kW 錨點沒有反映這個大電流額定，真實價格可能更高** | `A2-power-electronics.md` §4 |

比較對象（機櫃層級，因 LIC 庫與 DC-DC 是整櫃共用，不是每台 BBU 一份）：
- 純 LFP：8 台 BBU，共 20 kWh 電芯。
- 混合：同樣 20 kWh LFP，**另加** LIC 庫（28 顆 LIC 單體）＋ 1 顆 60 kW 雙向 DC-DC。

兩個基線（因為公平性問題必須都列）：
- **基線 A（僅電芯）**：純 LFP 只算 20 kWh 電芯／pack 價。這會讓混合顯得很貴，因為純電池方案實際上也要有放電功率轉換級，只是此處沒算。
- **基線 B（電芯＋功率轉換）**：純 LFP 另加 8 × 15 kW = 120 kW 的 BBU 內部轉換級，用與 DC-DC 同一檔 $/kW 單價。**這個轉換級是假設**（whitepaper 未明列純電池版的轉換器配置）；混合版的 8 台 BBU 轉換級視為同樣存在，所以增量不變。

文件對齊提醒：repo 現行 LIC 常數是 `LIC_ENERGY_KJ_PER_RACK=5.0`、過配倍數 69（345 kJ）與 2 顆 Eaton XLR 的配置；A2 指出 XLR 是 EDLC、repo 的 51.3 V 超過其 48.6 V 額定（額定窗 48.6→38 V 下 2 顆可用約 152 kJ，本檔曾自行驗算），並改以 28 或 39 顆 3300 F 級 LIC 單體重新尺寸化。**本檔 LIC 庫已改採 A2 的顆數**；Eaton XLR 價格（§2.2）只保留作為「大型 48 V 模組」價格參考。

---

## 2. 公開價格資料點（每筆：URL＋日期＋等級）

### 2.1 LFP

| 資料點 | 數值 | URL | 日期 | 等級 |
|---|---|---|---|---|
| BNEF 2025 年 LFP pack 全產業平均 | **$81/kWh** | https://about.bnef.com/insights/commodities/lithium-ion-battery-pack-prices-fall-to-108-per-kilowatt-hour-despite-rising-metal-prices/ | 2026-10-09（頁面發布日 2025-12-09） | S（BNEF 新聞稿本身，但完整調查為付費） |
| BNEF 2025 年固定式儲能 pack | **$70/kWh** | 同上 | 同上 | S |
| BNEF 2025 年 NMC pack 平均 | **$128/kWh** | https://www.ess-news.com/?p=7552 | 2026-10-09（文章 2025-12-09） | S（轉述 BNEF） |

### 2.2 LIC／超級電容

查證結果：**Musashi CPQ 系列與 JM Energy ULTIMO 在 Digikey／Mouser 搜尋不到公開單價（未查證）**；Taiyo Yuden 只找到小型單體。因此 LIC 價格以下面三種錨點取 $/kWh 量級。

| 資料點 | 數值 | URL | 日期 | 等級 |
|---|---|---|---|---|
| Eaton XLR-48R6167-R（166 F、48.6 V、nameplate 196 kJ ≈ 54.4 Wh）Digikey 單件價 | **US$1,350.01**（庫存 0，預計 2027-02-15） | https://www.digikey.com/en/products/detail/eaton-electronics-division/XLR-48R6167-R/5956249 | 2026-10-09 | R（主對話瀏覽器確認 2026-10-09 頁面顯示 $1,350.01、分類為 EDLC；本檔 WebFetch 亦讀到同價） |
| 同品項在 Mouser CA | 約 CAD 2,387.87（3 件庫存，搜尋摘要，未開頁） | https://www.mouser.ca/c/passive-components/capacitors/?q=48V | 2026-10-09 | S（摘要） |
| 超級電容系統 capex | 約 US$10,000/kWh、US$40/kW（15 s 儲存尺度；**EDLC 系統層級，非 LIC**） | https://thundersaidenergy.com/?p=71119 | 2026-10-09 | S |
| Taiyo Yuden LIC1030 系列 120 F/3.8 V 小單體（可用能量 ½·120·(3.8²−2.2²)=576 J=0.16 Wh） | FindChips 當日開頁顯示 LIC1030Q3R8127（120 F／3.8 V）$1.8535–2.0953（賣家 Unikey，製造商欄寫 CDA，與 Taiyo Yuden 不一致，只當量級）→ 1.8535/0.16 至 2.0953/0.16 = **$11.6k–13.1k/kWh**。先前搜尋摘要的 $6.45／$3.31（Digikey 快照）未在頁面上找到，已不採用 | https://www.findchips.com/search/ic1030 | 2026-10-09 | S（聚合頁，來源互相矛盾，只當量級） |
| LIC 單價賣家部落格 | $1–5/Wh（$1,000–5,000/kWh），**無出處** | https://www.ymin.cn/blog/choosing-the-right-lithium-ion-capacitor-for-your-needs/ | 2026-10-09 | S（弱，僅當極端低標，不納入三檔） |
| Maxwell 3000 F EDLC 單體（對照，非 LIC） | 約 $44–53／顆（Richardson，頁面回 403，僅搜尋摘要） | https://shop.richardsonrfpd.com/Products/Product/BCAP3000P300K05 | 2026-10-09 | S（摘要，未開頁） |

重要揭露：Digikey 頁面把 Eaton XLR 分類為「EDLC（雙電層）」，而本專案文件把它當 LIC 使用。XLR 是否為 LIC／hybrid 本檔**未證實**；若是 EDLC，其電壓窗（可放到 0 V）與 LIC（2.2–3.8 V 窗）特性不同，repo 的能量／ESR 建模與此價格是否對應需另外核對。

### 2.3 雙向 DC-DC（50–85 kW 等級，主算 60 kW）

查證結果：**查不到 50–85 kW、48 V、雙向模組的公開標價（未查證）**。48 V 側 50 kW 約 1 kA 電流，比高壓 EV 充電模組更難做，可能更貴（此為推論，非查證）。以下用鄰近品類的 $/kW 當量級錨點：

| 資料點 | 數值 | URL | 日期 | 等級 |
|---|---|---|---|---|
| 中國市場 50 kW 充電模組（型號 MXR150050B，**實為 AC/DC 整流充電模組、0–1500 VDC，非 DC-DC**；MOQ 100 件） | US$1,300/件 → $26/kW（**不可當雙向 DC-DC 價格錨點**；已不用於三檔，低檔改用其他錨點見 §3） | https://www.made-in-china.com/video-channel/angelitepower_sGPRfUZVJbrt_Rectifier-Charging-Module-Power-Rectifier-Module-Master-Control-Module-EV-Charging-Fast-Fast-EV-Charging-Module-Modules-Power.html | 2026-10-09 | S（經 reader 開頁驗證價格與型號） |
| 美國明尼蘇達州採購價目表：Kempower 50 kW Power Module（500/800 V，單向） | **US$18,300/件 → $366/kW** | https://osp.admin.mn.gov/sites/osp/files/2023-08/e-1085zef_energy_ps_a2.pdf（PDF 第 195 行，已用 pdftotext 驗證原文） | 2026-10-09（價目表為 2023 年） | P |
| Battle Born／Wakespeed 3 kW 48 V↔12 V 雙向 DC-DC 套件（含控制器線束） | US$3,116.50 → **$1,039/kW**（小功率零售，50 kW 不適用，僅作極端高標） | https://battlebornbatteries.com/products/wakespeed-48v-12v-bi-directional-dc-dc-converter | 2026-10-09 | R（搜尋摘要） |
| PNNL：PCS 廠商表示典型成本 $45/kW（公用事業級逆變器，非 DC-DC，規模與電壓級皆不同；驗收時於該頁未能再找到此數字，僅搜尋摘要） | $45/kW（**僅作低檔下限錨點**，可信度低） | https://www.pnnl.gov/ESGC-cost-performance | 2026-10-09 | S（摘要被截斷） |

---

## 3. 元件成本表（機櫃層級，低／中／高三檔）

三檔定義（各欄同檔取值，不混檔）：

| 項目 | 低 | 中 | 高 | 取值依據 |
|---|---|---|---|---|
| LFP 單價 $/kWh | 70 | 81 | 128 | BNEF 固定式 pack／LFP 平均／NMC pack（高檔用 NMC 價代表高功率 6C 電芯溢價，**假設**） |
| LIC $/kWh（窗內能量） | 10,000 | 13,096 | 24,789 | 低＝Thunder Said 超級電容 capex（EDLC 系統，**非 LIC，未查證適用性**）；中＝FindChips 小型 LIC 單體 $2.0953／0.16 Wh（製造商欄不一致）；高＝Eaton XLR Digikey $1,350.01／54.46 Wh nameplate（EDLC 大型模組）。**3300 F 級 LIC 單顆沒有公開價**，故用 $/kWh 乘 4.4 Wh/顆；隱含單顆約 $44／$58／$109（非公開標價） |
| DC-DC $/kW | 45 | 366 | 1,039 | 低＝PNNL PCS 摘要（低可信度，**未查證**）；中＝Kempower 50 kW 模組採購價；高＝Wakespeed 3 kW 零售 |

**主算（60 kW、28 顆）**算式與結果（USD，每櫃）：

| 項目 | 低（未查證） | 中 | 高 | 算式 |
|---|---|---|---|---|
| (a) 純 LFP 電芯 20 kWh | 1,400 | 1,620 | 2,560 | 20 × 70 / 81 / 128 |
| (b) LIC 庫 28 顆 | 1,232 | 1,613 | 3,054 | 0.1232 kWh × 10,000 / 13,096 / 24,789 |
| (c) 60 kW 雙向 DC-DC | 2,700 | 21,960 | 62,340 | 60 × 45 / 366 / 1,039 |
| (d) 混合多出的元件成本 = (b)+(c) | 3,932 | 23,573 | 65,394 | 1,232+2,700；1,613+21,960；3,054+62,340 |
| **基線 A：(d)/(a)** | 2.81 倍 | **14.55 倍** | 25.5 倍 | 3,932/1,400；23,573/1,620；65,394/2,560 |
| (e) 純 LFP 的 120 kW 轉換級（**假設**） | 5,400 | 43,920 | 124,680 | 120 × 45 / 366 / 1,039 |
| (f) 基線 B 純 LFP 元件 = (a)+(e) | 6,800 | 45,540 | 127,240 | 1,400+5,400；1,620+43,920；2,560+124,680 |
| **基線 B：(d)/(f)** | 57.8% | **51.8%** | 51.4% | 3,932/6,800；23,573/45,540；65,394/127,240 |
| 每台 BBU 攤提增量（÷8） | 約 492 | **約 2,947** | 約 8,174 | (d)/8 |

每櫃增量量級（只含元件）：**中檔約 US$23.6k**；低檔約 3.9k（未查證）、高檔約 65k 為範圍參考。

敏感度（USD，每櫃增量 (d)／基線 A 倍數／基線 B 百分比；演算同上，只換 kW 或顆數）：

| 情境 | 低（未查證） | 中 | 高 |
|---|---|---|---|
| 50 kW、28 顆 | 3,482／2.49 倍／51.2% | 19,913／12.29 倍／43.7% | 55,004／21.5 倍／43.2% |
| 60 kW、28 顆（主算） | 3,932／2.81 倍／57.8% | 23,573／14.55 倍／51.8% | 65,394／25.5 倍／51.4% |
| 60 kW、39 顆（LIC 顆數敏感度；39 顆＝P1–P4、不含 P5，此列只作顆數敏感度；含 P5 需 50 顆，中檔 LIC 約 $2.9k） | 4,416／3.15 倍／64.9% | 24,207／14.94 倍／53.2% | 66,594／26.0 倍／52.3% |
| 85 kW、28 顆 | 5,057／3.61 倍／74.4% | 32,723／20.2 倍／71.9% | 91,369／35.7 倍／71.8% |
| 85 kW、39 顆 | 5,541／3.96 倍／81.5% | 33,357／20.6 倍／73.2% | 92,569／36.2 倍／72.8% |

判讀（照實揭露）：
1. 若純電池版**只算電芯**（基線 A），混合版多出的元件成本中檔約為電芯的 **14.6 倍**（範圍 2.8–25.5 倍）。在這個口徑，混合**不划算**；增量由 DC-DC 主導（中檔佔增量 93%：21,960/23,573）。LIC 庫本身中檔只約 US$1.6k。
2. 若純電池版也計入同量級的功率轉換級（基線 B，**該基線的轉換器配置為假設**），混合多出的元件成本中檔約為純電池的 **52%**（60 kW 敏感度範圍：50 kW 約 44%，85 kW 約 72%）。三檔接近，因為 DC-DC 單價同時放大分子與分母。
3. 比例高度依賴「DC-DC 單價」這個**查不到直接公開價格**的輸入，且 60 kW／約 1.8 kA LIC 側的大電流額定可能使真實價格高於 $/kW 錨點；結果不能當作定論。此表不回答「值不值得」，因為沒有量化下游效益的資料。
4. 與定稿 3.4 的「約為競賽版本 2.0–2.7 倍」不可互相換算（基準不同），不要在口試中把兩者混用。
5. 不含：DC-DC 損耗（會影響效率，whitepaper 已寫混合有額外損耗）、LIC 平衡與保護、母排／機構、認證。
6. 低檔的兩個錨點（EDLC 系統 capex、PNNL PCS 摘要）都是未查證或低可信度，口試不引用低檔與高檔，只引中檔。

---

## 4. 競品公開規格表

| 廠商／產品 | 公開規格 | 來源 URL（查詢日 2026-10-09） | 來源性質 | Sysblade 定位差異 |
|---|---|---|---|---|
| 台達 Power capacitance shelf | LIC（鋰離子電容）、「15s hold-up @ 20kW」、支援 EDPP 能量備援、相容 19" (1RU)／21" (1OU) ORV3 機櫃；頁面無獨立 kW 額定與價格。由 15 s × 20 kW 推算約 300 kJ（本檔推算） | https://www.deltaww.com/en-GB/landing/Power-and-Cooling-Solutions-for-Data-Center | V（廠商頁） | 同品類（LIC 提供秒級緩衝）。Sysblade 是模擬設計，不主張硬體性能優於台達；以可用能量比較：A2 的 28 顆 LIC 在 2.2–3.8 V 窗內約 443.5 kJ（假設的單體參數）；台達推算 300 kJ（15 s × 20 kW）。443.5 kJ 是整個電壓窗的能量；從 A2 的中點 V_ref 48.7 V（3.48 V/cell）往下實際可放約 335 kJ，扣 η 0.95 約 319 kJ（驗收者計算，見 稽核過程紀錄（未入 repo）：verify-A4-r2.md），與台達推算 300 kJ 同量級、差約 6–12%。沒有任何實測，不能據此比較性能 |
| 台達 Battery backup system | 18/22/33 kW 規格系列、「97.5% efficiency」、UL9540A 認證；頁面未列放電時間 | 同上 | V | Sysblade 無效率實測，**不報效率百分比**，不與 97.5% 比較 |
| 台達 BBU 33 kW（產品頁） | 搜尋摘要稱 33 kW 90 s（6 年後）、24 kW 240 s、效率 97%，符合 ORv3；但 deltaww 頁面本次 WebFetch 抓不到規格內容 | https://www.deltaww.com/en-US/products/dc-power-systems/battery-backup-system-33kw | S（搜尋摘要，頁面未再確認） | 同上；此列數字未經頁面確認，口試別引用 |
| NVIDIA GB300 NVL72 power shelf（與 LITEON 共同設計） | 電解電容儲能 **65 J/GPU**（PSU 約一半體積為電容）；尖峰電網需求最高降 30%（NVIDIA 實測自述）；文章稱平滑技術「也會帶到 GB200 NVL72」，但結論段只提 GB300 | https://developer.nvidia.com/blog/how-new-gb300-nvl72-features-provide-steady-power-for-ai/ | V（NVIDIA 官方部落格） | 它處理毫秒～亞秒帶（72 GPU × 65 J ≈ 4.7 kJ，本檔推算）；Sysblade 目標在秒級頻帶與斷電尖峰，是補在其之外的假設，尚無實測 |
| Skeleton GrapheneGPU（PCS50） | 超級電容＋AI 控制軟體；宣稱降 44% 電力連接需求、最多 45% 降低 AI 能耗、最多 40% 運算性能（頁面標題與內文有 44/45% 不一致）；2025-05-28 發布、2025-06 德國出貨；**頁面無 kW／kWh 規格，也未指名驗證單位** | https://www.skeletontech.com/news/skeletons-new-product-cuts-ai-data-center-energy-use-by-44-and-boosts-computing-power-by-40 | V | 技術路線相近（高功率儲存＋控制）；Sysblade 不引用其效益數字 |
| LITEON | GTC 2025（2025-03-20）新聞稿：33 kW 1RU 鋰電池 BBU、55 kW 電源櫃（power shelf，符 NVIDIA MGX）；新聞稿**無效率數字、無電容儲能描述** | https://technode.global/prnasia/liteon-showcases-solutions-supporting-next-generation-nvidia-ai-data-center-architecture-at-gtc-2025/ | V（新聞稿轉載） | 純電池 BBU 與電源櫃供應商；Sysblade 不主張勝過 |
| Vertiv PowerDirect 3000 33 kW | 33 kW／shelf、六顆 5.5 kW 熱插拔 PSU、19" 規格、內建 capacitance 處理 GPU pulse；頁面無電容量與效率數字 | https://www.vertiv.com/es-emea/products-catalog/critical-power/dc-power-systems/vertiv-powerdirect-3000-33kw-for-nvidia-gb200-and-gb300-nvl72---50vdc-power-systems/ | V | 電源櫃內建小電容，類似 NVIDIA 路線；非獨立 LIC 儲能 |
| Flex GB300 power shelf | 2025-08-04 OCP APAC 發布；33 kW／shelf、半載峰值效率 97.5%、轉換損耗較傳統降 60% 以上、3+3 冗餘；**新聞稿無儲能／BBU 描述** | https://seekingalpha.com/pr/20188338-flex-delivers-advanced-power-management-for-next-generation-nvidia-ai-infrastructure | V（新聞稿轉載） | 屬電源轉換層，與 Sysblade 儲能緩衝不同層 |
| 第三方佐證（BBU／超級電容為 GB200/GB300 儲能托盤，供應商含台達、Lite-On、Megmeet；GB200 時為選配、GB300 變標配） | 付費分析的公開摘要，數字屬分析師說法 | https://globaltechresearch.substack.com/p/nvidia-nvda-us-gb300-power-system | T（Substack 分析；本次只看到搜尋摘要） | 僅供背景，口試不要當事實引用 |

未查證項目：Eaton、Schneider×NVIDIA、KULR、Vertiv 的儲能產品（定稿 3.4 提到的六家）本次**未逐一查規格**；Eaton 在本次搜尋中沒有 GB300 儲能產品結果。

Sysblade 站得住的定位（全列表共通）：本作品是**模擬設計＋可重跑驗證鏈**，無實體硬體、無實機波形量測、無電力電子層閉環驗證；不主張任何性能優於上述廠商產品。

---

## 5. 口試摘要

**Q1：比純電池貴多少？**
- 只算元件的公開價量級（60 kW DC-DC、28 顆 LIC，中檔）：每櫃混合多出約 US$23.6k；其中 LIC 庫約 1.6k，雙向 DC-DC 約 22.0k。
- 若純電池版只算電芯（約 US$1.6k），混合多出的成本約是電芯成本的 14.6 倍（總價比約 15.6 倍）；若純電池版也計入同量級功率轉換級（假設），多出約 52%。
- 差距主要來自 DC-DC，它查不到直接公開標價，單價是鄰近品類（Kempower 50 kW 模組採購價）推估；A2 已驗收（兩輪）。
- 本表不含組裝、認證、熱設計，也沒有效益側資料，因此不能回答「值不值得」；這個口徑下混合在成本上不便宜，照實說。

**Q2：台達、NVIDIA 已有產品，你多了什麼？**
- 承認已有：台達 LIC 電容櫃（15 s @ 20 kW）與 97.5% 效率 BBU、NVIDIA GB300 電容儲能（65 J/GPU），皆為廠商自述；代表業界已有同方向的產品。
- 我不主張硬體優於任何人，也不主張拓樸新穎。
- 本作品多的是：以模擬設計加可重跑驗證鏈（每個數字附腳本）呈現混合 BBU 的設計與取捨，可被第三方檢查。
- 限制要同時說：無實機量測、LIC 與 DC-DC 的設計值（含 60 kW 與 28 顆 LIC；A2 已驗收（兩輪），但單體參數仍為假設）有待對齊，成本數字是公開價量級。
