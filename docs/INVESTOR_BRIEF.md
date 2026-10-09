---
title: "Sysblade HyperBuffer — Investor / Consultant Brief"
subtitle: "北美 AI 機房 BBU 軟硬整合方案"
version: "v0.1"
date: "2026-05-26"
audience: "顧問 / 投資人 / 策略合作夥伴"
read_time: "90 秒"
team: "ATCC 第 23 屆 C13 系統電工業菁英賽 學生競賽團隊"
github: "https://github.com/aericheng/atcc-sysblade"
demo: "https://sysblade-atcc.vercel.app"
---

# Sysblade HyperBuffer
### 為北美 AI 機房做的下世代電池備援單元(BBU)+ AI 維運 SaaS

> ## 勘誤與口徑說明(2026-10)
>
> 本文為 ATCC 競賽期(2026-05)的投資人簡報版本,保留作為競賽歷史紀錄。下列競賽期數字與說法**已撤回或更正**,現行口徑以中技社《創意作品說明書》定稿為準;正文對應位置已就地加註〔已撤回／已更正〕。
>
> - **10 年 TCO 節省 33 %、payback 年數、年省金額**:**已撤回**。推估基礎不夠紮實,不再引用任何固定節省比例;網站 `/tco` 僅為依使用者自行輸入假設的試算工具,非實際或保證節省。
> - **SaaS 訂閱定價(USD 25 k/site/yr)**:**已撤回**。商業模式(硬體一次性採購＋軟體維運服務)仍屬構想階段,尚未經實際客戶採購驗證,不引用任何定價數字。
> - **18–24 個月先發空窗/三大廠「不會做」**:**已撤回**。空窗已關閉——Eaton、Vertiv、Schneider×NVIDIA、KULR、Skeleton、Delta 均已進入同一品類;差異化落在可被第三方重跑的驗證方法論與跨三領域整合設計,而非先發優勢。
> - **Eaton XLR 為 LIC/Eaton 販售 LIC**:**已更正**。競賽期電容側參數錨定 Eaton XLR-48R6167-R 規格書,但其官方 datasheet 實為 **EDLC(超級電容)而非 LIC**;量產設計改採真正的鋰離子電容 Musashi ULTIMO CPQ3300SD。
> - **本地 NPU 推論**:**已更正**。邊緣端部署目前僅為概念、**尚未上板**,不引用任何 NPU 延遲數字;現行 RUL 模型為 **TCN**(LSTM 為前一版基線)。
> - **5.7× 削峰**:為 ±30 %/100 ms 參考波形下的**理想無損耗上界,非電池壽命倍率**;計入 DC-DC 損耗典型 2.4–3.9×,>100 Hz 退至約 1.5×;全部來自模擬,實機波形量測尚未完成。
> - 本專案**沒有實體硬體**;1000 台機隊**全為模擬資料**;EVT／PoC／認證時程為競賽期規劃。

---

## 我們在做什麼(一句話)

**北美 AI 機房 35 GW 在建容量正在從傳統電池備援過渡到 GB200-class GPU
的毫秒級瞬態 + ±400 V HVDC 換代,Tier-2/3 colo 客戶(對外服務的小型雲端
機房)需要一個整合方案,我們用 AI 數位孿生驗證的軟硬整合產品回應這個需求。**
〔競賽期原句為「18-24 個月內市場上沒有的整合方案」,已撤回:空窗已關閉,見檔頭勘誤。〕

---

## 為什麼是現在(timing)

| 時點訊號 | 數字 |
|---|---|
| 北美在建資料中心容量(JLL 2025 Year-End)| **35 GW**,德州 + 維吉尼亞兩地合計 **33 %** |
| Tier-1 hyperscale(AWS / Azure / Meta)自研 BBU,Tier-2/3 colo **必依賴外採** | 市場縫隙明確 |
| GB200 NVL72 整 rack 功率 | **120 kW peak**(較前一代提升 ~3×)|
| 北美 HVDC 換代窗口 | **2025–2028** 從 48 V 漸進到 ±400 V |
| 〔已撤回〕我們鎖定客群 18-24 個月先發空窗 | 〔已撤回:空窗已關閉,Eaton、Vertiv、Schneider×NVIDIA、KULR、Skeleton、Delta 均已進入同一品類,見檔頭勘誤〕 |

---

## 市場縫隙的根因 — 為什麼三大廠商不做

> 〔競賽期分析,已撤回:本節「三大廠商不會做」的前提已被市場推翻(上述廠商與 KULR、Skeleton、Delta 均已進入同一品類);Eaton XLR 實為 EDLC 而非 LIC。下表僅保留作競賽歷史,見檔頭勘誤。〕

| 廠商 | 2024 全球營收 | 為什麼還沒做 Sysblade 在做的事 |
|---|---|---|
| **Eaton** | USD 24.9 B | 純電力元件商,**沒有軟體 / SaaS / ML DNA**;LIC 利基已是 cash cow,投 SaaS ROI 不對齊主業 |
| **Vertiv** | USD 8.0 B | 重押 **Tier-1 hyperscale 大型 UPS**(單筆 USD M 級),Tier-2/3 colo 利基太薄,**策略上看不上** |
| **Schneider** | EUR 38.2 B | 集中式 UPS Galaxy VS 是**核心產品線**,做 rack-level 等於 **cannibalize 自家旗艦** |
| **Sysgration(我們)** | TWSE 6312(母公司)| 無 cannibalization 包袱 + 既有電芯採購通路 + Plano 廠北美在地化 + **軟硬整合是新世代差異化** |

---

## 我們做到了什麼(以團隊體質為證)

學生團隊 5 人 / 26 天 / NT$ 5 萬預算下,從零做出 **GitHub 公開、Vercel 線上
活 demo、技術白皮書 75 K 字、商業企劃書、12 篇修訂歷史**,所有技術主張可被
跨領域 RD 在 30 分鐘內自行重跑驗證:

| 證據 | 商業含義 |
|---|---|
| **RUL 預測誤差 8.38 %**,超越學術 baseline 9.1 % | 電池剩餘壽命預測比業界公開 benchmark 準 → 客戶可信替換隊列(〔成立條件:13 特徵、K=24 bagged GBT、隨機切分 10 種子中位數;跨批次切分為 13.87 %(bagged-OLS)〕;〔競賽期「SaaS 訂閱有定價依據」已撤回〕) |
| **物理模擬 5.7× 削峰效果**,與第二條獨立物理路徑交叉驗證 | 〔已更正:5.7× 為理想無損耗上界、非電池壽命倍率,計入 DC-DC 損耗典型 2.4–3.9×;競賽期「LFP 電池壽命延長 ~25 %、10 年換電池次數 1.5 → 1 次」推論不再引用〕 |
| **AI 模型壓縮 3.49×,精度退化 +0.10 pp** | 〔已更正:邊緣端部署目前為概念、尚未上板;競賽期「推論在本地 NPU 跑」與訂閱相關推論不再引用〕 |
| 〔已撤回〕**客戶 10 年 TCO 節省 33 %**(USD 29 k → 19.4 k / rack),Payback **2.3 年** | 〔已撤回:固定節省比例、payback 與年省金額均不再引用;`/tco` 僅為依使用者輸入假設的試算工具,見檔頭勘誤〕 |
| **Vercel 線上 SaaS 三件套**(`/twin` / `/tco` / `/dashboard`)+ 1000-node fleet 模擬 + 三層替換隊列 | 不是 PowerPoint,是 live demo,VC / 顧問可直接點開試用 |

> **線上點開試用**:<https://sysblade-atcc.vercel.app>

---

## 商業模式

**硬體一次性採購 + 軟體維運服務**(〔競賽期訂閱定價 USD 25 k/site/yr 已撤回;此模式仍屬構想階段,尚未經實際客戶採購驗證〕)

- 不收 per-inference billing(〔競賽期以「本地 NPU」為前提,已更正:邊緣端尚未上板〕)
- Site license 對 Tier-2/3 colo 較 per-rack 訂閱友善
- Sysgration 母公司 TWSE 6312 既有通路 + Plano 北美廠提供 onshore 信任

---

## 我們需要的 ask

| 我們需要 | 對應 stakeholder |
|---|---|
| **跨領域 RD / 顧問 1 小時 review**(電池 / ML / 系統 / 商業 任一專業)| 顧問、產業前輩 |
| **Tier-2 colo 客戶 introduction**(願簽 NDA PoC 的對象)| 北美機房通路、Sysgration 客戶網 |
| **EVT 工程板 2026 Q3 啟動的策略合作**(車規 LFP cell 樣品 + 電容模組採購量達 NDA 門檻;〔已更正:競賽期寫「Eaton XLR LIC」,該型號實為 EDLC,量產改採 Musashi ULTIMO CPQ3300SD〕)| LG ESS / Samsung SDI / Eaton |
| **Seed 階段 capital**(EVT 啟動 + 認證(UL 1973 / NFPA 855)+ Tier-2 colo PoC)| 早期 VC、Sysgration 戰略投資 |

---

## 90 秒結論

**Sysblade = Sysgration(TWSE 6312)在北美 AI 機房 BBU 縫隙的軟硬整合切入點。**
學生團隊已用 NT$ 5 萬預算把**整體技術可行性、跨化學 ML pipeline** 做到可被第三方重跑檢驗(〔競賽期另列「商業 TCO 模型」已撤回;以上皆為模擬驗證,無實體硬體〕),**所有數字 GitHub 公開可重跑**(`make verify`
30 分鐘 self-check)。下一步是 2026 Q3 EVT、2027 Q1 客戶 PoC、2027 Q3 OCP 認證
— 對齊 v2.2 商業企劃書 18 個月里程碑。

技術深度詳 **`docs/RD_BRIEF.md`**(RD reviewer 2 頁版)+ **`docs/whitepaper.md`**
(75 K 字完整版)+ **`https://sysblade-atcc.vercel.app`**(live demo)。

---

**Contact**:`[contact email]` · GitHub `aericheng/atcc-sysblade`
