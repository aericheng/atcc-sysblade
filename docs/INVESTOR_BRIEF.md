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

---

## 我們在做什麼(一句話)

**北美 AI 機房 35 GW 在建容量正在從傳統電池備援過渡到 GB200-class GPU
的毫秒級瞬態 + ±400 V HVDC 換代,Tier-2/3 colo 客戶(對外服務的小型雲端
機房)需要一個 18-24 個月內市場上沒有的整合方案,我們用 AI 數位孿生驗證
的軟硬整合產品填補這個縫隙。**

---

## 為什麼是現在(timing)

| 時點訊號 | 數字 |
|---|---|
| 北美在建資料中心容量(JLL 2025 Year-End)| **35 GW**,德州 + 維吉尼亞兩地合計 **33 %** |
| Tier-1 hyperscale(AWS / Azure / Meta)自研 BBU,Tier-2/3 colo **必依賴外採** | 市場縫隙明確 |
| GB200 NVL72 整 rack 功率 | **120 kW peak**(較前一代提升 ~3×)|
| 北美 HVDC 換代窗口 | **2025–2028** 從 48 V 漸進到 ±400 V |
| 我們鎖定客群 18-24 個月先發空窗 | 三大競品(Eaton / Vertiv / Schneider)有 strategic moat 不會做我們在做的事(策略分析見技術白皮書 §3.4) |

---

## 市場縫隙的根因 — 為什麼三大廠商不做

| 廠商 | 2024 全球營收 | 為什麼還沒做 Sysblade 在做的事 |
|---|---|---|
| **Eaton** | USD 24.9 B | 純電力元件商,**沒有軟體 / SaaS / ML DNA**;LIC 利基已是 cash cow,投 SaaS ROI 不對齊主業 |
| **Vertiv** | USD 8.0 B | 重押 **Tier-1 hyperscale 大型 UPS**(單筆 USD M 級),Tier-2/3 colo 利基太薄,**策略上看不上** |
| **Schneider** | EUR 38.2 B | 集中式 UPS Galaxy VS 是**核心產品線**,做 rack-level 等於 **cannibalize 自家旗艦** |
| **Sysgration(我們)** | TWSE 6312(母公司)| 無 cannibalization 包袱 + 既有電芯採購通路 + Plano 廠北美在地化 + **軟硬整合是新世代差異化** |

---

## 我們做到了什麼(以團隊體質為證)

學生團隊 4 人 / 26 天 / NT$ 5 萬預算下,從零做出 **GitHub 公開、Vercel 線上
活 demo、技術白皮書 75 K 字、商業企劃書、12 篇修訂歷史**,所有技術主張可被
跨領域 RD 在 30 分鐘內自行重跑驗證:

| 證據 | 商業含義 |
|---|---|
| **RUL 預測誤差 8.38 %**,超越學術 baseline 9.1 % | 電池剩餘壽命預測比業界公開 benchmark 準 → 客戶可信替換隊列 → SaaS 訂閱有定價依據 |
| **物理模擬 5.7× 削峰效果**,與第二條獨立物理路徑交叉驗證 | LFP 電池壽命延長 ~25 %,客戶 10 年換電池次數從 1.5 次降為 1 次 |
| **AI 模型壓縮 3.49×,精度退化 +0.10 pp** | 推論在本地 NPU 跑,**客戶不為 per-inference 付費**,訂閱抗拒降低 |
| **客戶 10 年 TCO 節省 33 %**(USD 29 k → 19.4 k / rack),Payback **2.3 年** | Hyperscale 500-rack 客戶年省 USD 482.9 k,直接對 CFO 講得通 |
| **Vercel 線上 SaaS 三件套**(`/twin` / `/tco` / `/dashboard`)+ 1000-node fleet 模擬 + 三層替換隊列 | 不是 PowerPoint,是 live demo,VC / 顧問可直接點開試用 |

> **線上點開試用**:<https://sysblade-atcc.vercel.app>

---

## 商業模式

**硬體一次性採購 + SaaS USD 25 k / site / yr**(對齊客戶 IT 採購習慣;可隨時取消)

- 不收 per-inference billing(本地 NPU)
- Site license 對 Tier-2/3 colo 較 per-rack 訂閱友善
- Sysgration 母公司 TWSE 6312 既有通路 + Plano 北美廠提供 onshore 信任

---

## 我們需要的 ask

| 我們需要 | 對應 stakeholder |
|---|---|
| **跨領域 RD / 顧問 1 小時 review**(電池 / ML / 系統 / 商業 任一專業)| 顧問、產業前輩 |
| **Tier-2 colo 客戶 introduction**(願簽 NDA PoC 的對象)| 北美機房通路、Sysgration 客戶網 |
| **EVT 工程板 2026 Q3 啟動的策略合作**(車規 LFP cell 樣品 + Eaton XLR LIC 採購量達 NDA 門檻)| LG ESS / Samsung SDI / Eaton |
| **Seed 階段 capital**(EVT 啟動 + 認證(UL 1973 / NFPA 855)+ Tier-2 colo PoC)| 早期 VC、Sysgration 戰略投資 |

---

## 90 秒結論

**Sysblade = Sysgration(TWSE 6312)在北美 AI 機房 BBU 縫隙的軟硬整合切入點。**
學生團隊已用 NT$ 5 萬預算把**整體技術可行性、商業 TCO 模型、跨化學 ML pipeline**
三件事全部 close-loop 證明,**所有數字 GitHub 公開可重跑**(`make verify`
30 分鐘 self-check)。下一步是 2026 Q3 EVT、2027 Q1 客戶 PoC、2027 Q3 OCP 認證
— 對齊 v2.2 商業企劃書 18 個月里程碑。

技術深度詳 **`docs/RD_BRIEF.md`**(RD reviewer 2 頁版)+ **`docs/whitepaper.md`**
(75 K 字完整版)+ **`https://sysblade-atcc.vercel.app`**(live demo)。

---

**Contact**:`charliewang0627@gmail.com` · GitHub `aericheng/atcc-sysblade`
