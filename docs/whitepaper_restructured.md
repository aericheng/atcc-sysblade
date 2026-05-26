---
title: "Sysblade HyperBuffer 技術白皮書"
subtitle: "Part 1 架構速覽 · Part 2 技術細節 · Part 3 競品差異化"
version: "v1.3"
date: "2026-05-26"
authors:
  - 系統電 ATCC C13 學生競賽團隊
abstract: |
  **Sysblade HyperBuffer** 是針對北美 Tier-2/3 AI 機房 BBU 市場的軟硬整合
  方案 —— **LFP + 鋰離子電容混合 BBU + Battery Digital Twin SaaS**,一次解
  GB200 毫秒瞬態、±400 V HVDC 換代、與 1000 + 節 fleet 維運可視化三大痛點。

  **六個亮點數字**:**5.7×** LFP 接收功率波動下降(從 8.7 kW 壓到 1.5 kW)·
  **~25 %** LFP 主電池循環壽命延長(10 年內客戶替換次數從 1.5 次降為 1 次,
  並由 Rainflow + Wang 2011 第二條獨立物理路徑在 worst-case GB200 工作點
  交叉驗證 5.5 % per-Ah 損傷下降,§2.3.2)· **8.38 %** RUL 預測 MAPE
  (低於 Severson 2019 paper benchmark 9.1 %)·
  **33.1 %** 客戶 10 年 TCO 下降(Hyperscale 500 racks 年省 USD 482.9 k)·
  **60 sec** graceful shutdown @ 120 kW rack peak(**8 台 BBU 並聯 / per rack**,
  20 kWh 總能量,動態 ramp profile,業師最關注點見 **§2.1.1**)·
  **3.49×** ONNX INT8 量化壓縮(LSTM 從 219 KB 壓到 63 KB,ΔMAPE 僅
  +0.10 pp,部署於 STM32N6 Neural-ART NPU)。

  商業模式 = **硬體一次性採購 + SaaS USD 25 k / site / yr**(對齊 v2.2
  §G.3,可隨時取消);Live demo:<https://sysblade-atcc.vercel.app>。
---

# Sysblade HyperBuffer 技術白皮書

> ATCC 第 23 屆 · 系統電工業大學企業菁英賽 C13 · 學生組
> 文件版本 v1.3 / 2026-05-26(§2.8 改寫:複賽 BBU demonstrator → twin-first validation,對齊 `BBU_IMPLEMENTATION_PLAN.md` v2.0 + `RD_BRIEF.md` v0.1)
> Live demo: <https://sysblade-atcc.vercel.app>
> 上游文件:商業企劃書 v2.2 · 完整技術白皮書 `docs/whitepaper.md`

---

# Part 1 — 產品速覽

> **60 秒導讀**:本章依序帶過一句話定位、六個關鍵數字、痛點與解法、三層架構、
> 市場切入五件事。技術細節在 Part 2,選型推理在 Part 3。

---

## 1.1 一句話定位

> **Sysblade HyperBuffer** = 北美 AI 機房用的
> **LFP + LIC 混合 BBU + AI 維運 SaaS**,
> 一次解掉 GB200 毫秒瞬態、±400 V HVDC 換代、與 1000+ 節 fleet 維運可視化三大痛點。
> 商業模式 = **硬體一次性採購 + SaaS USD 25k / site / yr**(對齊 v2.2 §G.3)。

---

## 1.2 六個關鍵數字

### 🔋 5.7× — LFP 接收功率波動下降

LFP + LIC 混合拓撲把 GB200 ±30 % 瞬態能量分頻給 LIC 吃,LFP 主電池接收功率
RMS 從 **8.7 kW 壓到 1.5 kW**(PyBaMM DFN 實測,詳見 §2.3),電芯電壓震盪
peak-to-peak 也同步從 62 mV 收斂到 18 mV(**3.5× 改善**)。

### ⏳ ~25 % — LFP 主電池循環壽命延長

這個 25 % 的**主要組成**是 BBU 低 duty 排程(§2.3.1 `duty_factor = 0.33`,
~50 cyc/yr vs Severson 1C/1C 實驗室 cadence ~365 cyc/yr),而**不是** hybrid
拓樸本身;Attia 2020 *Nature* [6] 與 Severson 衰減模型外推 [1] 給出 BBU
duty 下的壽命估算。Hybrid 拓樸的 per-Ah 損傷貢獻**獨立**由 Rainflow +
Wang 2011 cross-validation 估算(§2.3.2):在 GB200 worst-case 波形下
hybrid 比純 LFP 損傷低 **5.5 %**,在 demo 波形上**幾近 neutral**(整合比
1.012,hybrid 略高 1.2 %,因 Wang kernel 在 0.5–6 C 區近於平坦)。BBU 浮充
duty 下 LFP 服役壽命估達 **8–12 年**(NMC BBU 基準 6–8 年,v2.2 附件 C),
客戶 10 年內替換次數從 1.5 次降為 1 次。**注意 calendar life 是 binding
constraint**(v2.1 §G.3 footnote + §E.1 Tier-B 明文 8–12 yr LFP 浮充壽命),
**不是 cycle-fade 限制** — LSTM 預測 BBU duty 下 cycle-fade headroom 可達
數萬 cycles(`/dashboard` drilldown 顯示 ≫ 10 yr cycle-fade 時記得這條)。
**此估值對 cycle cadence 假設非常敏感**(若客戶實際 duty 升到 200 cyc/yr,
壽命優勢會大幅縮減,§2.7.2 sensitivity)。capex 溢價與替換節省如何在 §2.7.1
TCO 表中互抵的完整邏輯詳見 §2.3.1 最後一段。

### 🧠 8.38 % — RUL 預測 MAPE(Severson 學術 baseline)

bagged-GBT (K=24) + xstrict filter (n=134):MAPE **8.38 %** (median, 10-seed)
< Severson paper 9.1 %;R² 0.890,7/10 seeds < 10 %(§2.4)。**Fleet 部署實採
LSTM 19.10 %**(跨 regime honesty 取捨,§2.5)。

### 💰 33 % — 客戶 10 年 TCO 下降

每 rack USD 9,600 / 10y。Mid-tier 50r·TX **年省 $44.6k**(payback 2.4 y);
Hyperscale 500r·VA **年省 $482.9k**(payback 2.3 y);三 preset 29.9–33.2 %
(完整 model + 敏感度見 §2.7)。

### ⚡ 60 sec graceful @ 120 kW rack peak — 對齊 OCP ORV3

**每 rack 8 台 BBU 並聯**(`scripts/generate_twin_scenarios.py::N_BBU_PER_RACK = 8`),
每台 2.5 kWh / 15S LFP pack(v2.2 §E.1 Tier-B),**rack 總能量 8 × 2.5 = 20 kWh**;
單台 BBU 峰值 **15 kW(6C peak)**,落在車規 LFP pulse 規格內。理論值
20 kWh ÷ 120 kW = **600 秒**,60 秒備援只用 **10 % DoD,留 8 倍餘量**,
落在 OCP ORV3 30–90 sec 規範區間;graceful 為動態 power profile(t = 0–2 s 由
LIC + LFP 共同承擔 6C peak,t = 2–60 s 由 LFP 以 1.5C 連續放電撐至結束),
**完整 cell-level 工作點防禦見 §2.1.1 ⭐**。長時 outage 由 facility UPS 接力。

### 📦 3.49× — ONNX INT8 壓縮(邊緣 NPU 可跑)

LSTM 從 **219 KB FP32 壓縮到 63 KB INT8**(measured,ΔMAPE +0.10 pp)。模型
僅占 STM32N6 Neural-ART NPU 1.6 MB FLASH 的 4 %,單樣本 NPU latency 估算為
**27–109 µs**(靜態 graph + ±2× 區間;詳見 §2.5 與附錄 C.4)。

### 客戶 ROI 一頁看完

| 數字 | 客戶層意義 |
|---|---|
| **5.7× 功率波動下降** | GB200 訓練不會因為 BBU 抖動掉 checkpoint(下游 PSU 不會誤觸 OVP/UVP)|
| **~25 % 壽命延長** | 10 年內少派 0.5 次替換工單(Hyper 500 racks 規模等於 250 次現場派工避免)。LFP+LIC capex 溢價 +$2,880 與替換節省 -$2,880 互抵,**客戶 TCO 不增,而拿到 +25 % 服役年限與 ESG 碳排可列報告** |
| **8.38 % MAPE** | BBU 替換時機可在 6–8 個月前預警,把維運從「壞了再換」改成「預知排程」 |
| **33 % TCO 下降** | Mid 50r 年省 $44.6k,相當於 1 名維運工程師年薪;Hyper 500r 年省 $482.9k,約 5 台 H100 採購預算 |
| **60 sec graceful** | 斷電瞬間 AI 工作負載仍有 60 sec 安全收尾,單次事件損失從「整批重跑」收斂到「最後 batch 收尾」(8 台 BBU 並聯 / 動態 ramp profile,§2.1.1) |
| **3.49× INT8** | 斷網仍能本地推論,客戶不被 cloud per-inference billing 綁定;BBU 健康資料留在客戶現場,符合 EU Battery Passport 2027 合規 |

---

## 1.3 痛點、解法、護城河(三點一張看完)

| 客戶痛點 | 現況缺口 | Sysblade 解法 | 護城河(為什麼只有我們) | § |
|---|---|---|---|:-:|
| **毫秒級電壓瞬態** | 純電池 BBU 撐不住 50–200 ms 壓降,造成下游 PSU 重啟 | LFP + LIC 混合架構搭配一階互補濾波器(τ = 0.5 s)| Eaton 只賣 LIC 元件,控制律與整體調校客戶必須自做,需要電化學與 ML 兩棲團隊,Tier-2/3 colo 沒這量能 | §2.3 |
| **48 V 升 ±400 V HVDC 過渡** | Vertiv 只賣 48 V,客戶 2027 之後須整套 forklift 換代 | 雙電壓 ready 介面,2027 過渡免換代 | Schneider 集中式 UPS 若做 rack-level 等於 cannibalize 自家旗艦,大公司不會自我蠶食 | §2.1 |
| **1000+ 節 fleet 維運** | 人工巡檢 hit-rate 低,無公開 SaaS 提供 BBU 級 RUL | Cloud Fleet Dashboard 三層服務,搭配 STM32N6 NPU 邊緣本地推論 | 推論本地化避免 cloud per-inference billing 抗拒;客戶 PoC 真實 BBU duty 資料閉環回流模型再校準 | §2.6 |

---

## 1.4 三層架構速覽

**☁️ 軟體層 — Cloud SaaS**
`/twin` Battery Digital Twin · `/tco` TCO Calculator · `/dashboard` Fleet Dashboard(1000 台模擬)

**🤖 邊緣層 — STM32N6 + Neural-ART NPU**
LSTM 2-layer hidden=64 · INT8 63 KB · BBU 內本地推論

**🔋 硬體層 — Per-rack 12U 機箱(對齊 v2.2 §E.1 三層電氣分層)**

- **Tier-A**(瞬態)— 2× Eaton XLR-48-166 rack-level LIC 並聯,5 kJ 設計目標
- **Tier-B**(備援)— **每 rack 8 台 BBU 並聯**,每台 2.5 kWh / 15S LFP pack,
  rack 總計 **20 kWh**,**60 sec graceful @ 120 kW rack peak**(每台 15 kW / 6C peak,
  動態 ramp profile **§2.1.1**)
- **Tier-C**(智能)— BMC + STM32N6 NPU + edge LSTM 推論

模型流程依序為:PyBaMM DFN 在 build-time 線下預算波形,輸出 ONNX 後做 INT8
量化(壓縮 3.49×),最後部署到 STM32N6 NPU 上推論。

---

## 1.5 市場切入

依 JLL Year-End 2025,**全美在建資料中心容量 35 GW**;德州 6.5 GW 加上
北維吉尼亞 5.3 GW,**兩地合計約 33 %,是 Sysblade 鎖定的第一級戰場**。Tier-1
hyperscale 多以自研消化內需,Sysblade 不與其正面競爭,而是聚焦 Tier-2/3 colo:
這群客戶對外服務 AI inference,仍仰賴外採 BBU,但市場上沒有現成「軟體加硬體
加維運」的整合方案。Sysblade 鎖定的縫隙評估至少有 18–24 個月空窗(完整推論
見 §3.4.2)。

---

# Part 2 — 技術細節

> 客戶看得到、會問的是 **三件套 SaaS**(§2.6)、**TCO 模型**(§2.7)、與
> **核心硬體規格**(§2.1);§2.2–§2.5 為支撐這三件套的技術論述,精簡到能
> 答辯為止 —— **完整數學定義 / 實驗 sweep / op dispatch 見附錄 A/B/C 與
> `docs/whitepaper.md`**。

---

## 2.1 硬體拓撲(per-rack 8 台 12U BBU 並聯)

Sysblade HyperBuffer 鎖定 Hyperscale tier 機房(單 rack 50–120 kW,GB200 等級
AI inference 工作負載),per-rack 規格完全沿用 v2.2 §E.1「**同一個 12U 機箱
內三層電氣分層**」架構(Electrical Tiering ≠ 物理拆解)。

> **拓撲關鍵數字**(常被誤讀):每 rack **8 台 BBU 並聯**(對齊 `tco.ts:4`
> 「Per-rack 10-year cost (USD) for a 100 kW-class rack with **8 BBUs**」與
> `generate_twin_scenarios.py::N_BBU_PER_RACK = 8`)。單台 BBU 2.5 kWh /
> 15 kW peak,rack 總能量 **20 kWh**,rack peak 120 kW 對應每台 BBU **6C peak
> per cell**(非 48C,**讀者若用單台 BBU 容量除整 rack 功率心算會誤推 48C,
> 這是 unit-mixing,完整化解見 §2.1.1**)。

| 層 | 規格 | 用途 / 設計依據 |
|---|---|---|
| **Tier-A** 瞬態緩衝 | **2× Eaton XLR-48-166 並聯**(48.6 V / 166 F / 54 Wh / ESR 5 mΩ,per Eaton XLR-48R6167-R datasheet)| 吃 ms 級瞬態。能量需求估算 120 kW × 30 % × 100 ms ≈ 3.6 kJ,加 30 % margin 後取 **5 kJ 為設計目標**;N+1 冗餘 |
| **Tier-B** 短時備援 | **每 rack 8 台 BBU 並聯**,每台 **2.5 kWh / 15S 整合 LFP pack**(3.2 V × 15 = 48 V 標稱),rack 總能量 **20 kWh** | **60 sec graceful @ 120 kW rack peak** —— 每台 BBU 15 kW peak / **6C peak per cell**,1.5C 連續;**20 kWh ÷ 120 kW = 600 sec 理論值**,60 秒備援只用 **10 % DoD,8 倍餘量**;動態 power profile 詳 §2.1.1 ⭐;LFP 採車規 LG Energy Solution / Samsung SDI / KORE Power 等日韓系或北美自有 cell line 電芯(連續 1–3C / pulse 5–10C 規格涵蓋本工作點),**避 BABA Act / CFIUS 風險** |
| **Tier-C** 智能管理 | STM32N6 + Neural-ART NPU + edge LSTM | BBU 內邊緣推論(§2.5),斷網仍可運作 |
| 介面 | 48 V DC + **±400 V HVDC ready**(雙電壓設計)| 規避 2027 OCP Mt. Diablo HVDC 換代 forklift 風險 |
| 機械 | 單一 **12U OCP ORV3 BBU shelf** | 落 OCP ORV3 30–90 sec 備援規範區間 |
| 長時 outage | **由 facility UPS 接力** | BBU 不獨自撐長時 |

> **備援接力分工**:斷電 t = 0 後,**8 台 BBU 在第 1 秒共同承擔 rack peak 120 kW**
> (每台 15 kW / 6C peak < 2 秒,落在車規 LFP pulse 5–10C 規格內);BMC 觸發
> GPU power-cap 將 rack 負載收斂至 ~30 kW(checkpoint + idle),由 LFP 在後
> 58 秒以 **1.5C 連續放電**撐完 60 秒 graceful shutdown(**完整功率曲線見 §2.1.1**)。
> facility UPS 處理長時 outage,客戶站若缺 facility UPS 須走 v2.2 §E.5 Tier-A
> 擴大版規格(本文未涵蓋)。

---

## 2.1.1 ⭐ graceful 動態 power profile —— 業師最關注點

**為什麼這節獨立成段**:讀者(尤其電池/電源產業背景)若用單台 BBU 容量除以
整 rack 功率心算「2.5 kWh ÷ 120 kW = 75 秒 → 48C → LFP 物理不可行」,會錯誤
推導出致命矛盾。**這是 unit-mixing 誤讀**:2.5 kWh 是 **單台 BBU**,120 kW 是
**整 rack(8 台 BBU 並聯)**。本節用三層論述化解:**(1) 拓撲是 8 台並聯;
(2) graceful 是動態 ramp 不是平直 120 kW × 60 秒;(3) cell-level 工作點完全
落在車規 LFP datasheet 允許區**。

### A. 拓撲層:每 rack 8 台 BBU 並聯

| 項目 | 單台 BBU | 整 rack(8 台並聯) |
|---|---:|---:|
| 能量容量 | 2.5 kWh | **20 kWh** |
| 峰值功率(t = 0) | 15 kW | 120 kW(GB200 NVL72 nominal) |
| 連續功率(t > 2 s) | 3.75 kW | 30 kW(checkpoint + idle) |
| LFP cell C-rate(peak) | **6C** | —— |
| LFP cell C-rate(連續)| **1.5C** | —— |
| 60 秒備援能量需求 | —— | **0.53 kWh**(僅 20 kWh 容量的 2.6 %) |

來源:`scripts/generate_twin_scenarios.py` 第 63–73 行硬編參數
(`N_BBU_PER_RACK = 8`、`LFP_PACK_KWH = 2.5`、`TARGET_PEAK_C_RATE = 6.0`)
與 `apps/web/src/lib/tco.ts:4` TCO 模型「8 BBUs per rack」假設交叉一致。

### B. 時序層:斷電後 60 秒功率曲線

| 時段 | rack 負載 | 每台 BBU 負載 | per-cell C-rate | 主導機制 |
|---|---:|---:|:--:|---|
| **t = 0–500 ms** | 120 kW 滿載 | 15 kW | **6C peak** | LIC 主導(2× XLR-48-166 模組共 ~290 kJ usable,單獨可撐 ~2.4 秒) |
| **t = 500 ms–2 s** | 120 kW → 30 kW(線性 ramp) | 15 kW → 3.75 kW | 6C → 1.5C | BMC 觸發 GPU power-cap,LIC + LFP 共同 ramp down |
| **t = 2–60 s** | 30 kW 穩態 | 3.75 kW | **1.5C 連續** | LFP 獨撐(LIC 已耗盡進入待機) |

**60 秒總放電能量積分**:t = 0–2 s 平均 ~75 kW × 2 s = 150 kJ,t = 2–60 s
30 kW × 58 s = 1740 kJ,合計 **1.89 MJ ≈ 0.53 kWh per rack**,僅 rack 總能量
20 kWh 的 **2.6 %**(留 38 倍能量餘量,跟「8 倍 DoD 餘量」是兩個不同維度
的 margin:時間維度是 600 秒理論 / 60 秒承諾,能量維度是 20 kWh / 0.53 kWh 實耗)。

### C. cell 工作點層:車規 LFP datasheet 合規性

| 工作點 | 持續時間 | 車規 LFP datasheet 規格 | 結論 |
|---|---|---|---|
| **6C peak** | < 2 秒 | LG ESS B-series / Samsung SDI 高功率版 pulse 規格 5–10C × 30 秒允許 | ✅ 落在 pulse 允許區 |
| **6C → 1.5C ramp** | 1.5 秒 | 仍屬 pulse 範疇(< 30 秒總窗口) | ✅ pulse 允許區 |
| **1.5C 連續** | 58 秒 | 車規 LFP 連續放電規格 1–3C | ✅ 連續允許區下緣 |

**沒有任何工作點需要「車規 LFP × 連續 6C × 60 秒」**(這個工作點才是 48C 誤讀
的物理不可行點)。Sysblade 的設計是把 6C 限制在 < 2 秒 pulse,把 60 秒連續
工作點壓到 1.5C —— **這是兩個不同的車規 LFP datasheet 規格條目,各自合規**。

### D. GPU 協同 ramp 的觸發機制(W3 EVT 階段交付)

斷電 t = 0 觸發鏈:**BBU 偵測 mains_loss → BMC 透過 OOB 介面通知 GB200 BMC →
GPU driver 在 ~1 秒內將 power management limit 收斂到 idle clock**。具體
control plane API(NVIDIA `nvml`、IPMI Power Capping Spec 1.0、Redfish
`PowerLimit` resource)**選型於 EVT 工程板實測後再 commit**(對齊 v2.2 §F.1
18 個月里程碑 2027 Q1)。本企劃書承諾的是 **power profile 設計與 cell 工作點
合規性**,具體 API 為實作層細節,不在本層 spec 範圍。

### E. 業師可預期的追問與我們的答案

| 業師追問 | Sysblade 答辯 |
|---|---|
| 「2.5 kWh ÷ 120 kW = 75 秒 → 48C 不可行?」 | **單位混用誤讀**。2.5 kWh 是單台 BBU,120 kW 是整 rack(8 台並聯);正確算法 **20 kWh ÷ 120 kW = 600 秒理論 / 60 秒承諾,8 倍餘量,per-cell 6C peak**(非 48C)|
| 「車規 LFP 怎麼撐 6C × 60 秒連續?」 | **不是連續 6C**,是 **6C × < 2 秒 pulse + 1.5C × 58 秒連續**(B 段表),兩段各自落在車規 LFP datasheet 不同規格條目允許區內 |
| 「具體選哪一顆車規 LFP cell?」 | LG ESS B-series 與 Samsung SDI 高功率版均為候選,具體 cell selection 在 W3 EVT 階段(2026 Q3)依 datasheet 5–10C pulse + 1–3C 連續規格涵蓋本工作點為 GO 條件 |
| 「GPU power-cap 怎麼實作?延遲多少?」 | W3 EVT 階段交付,候選 API 已列(nvml / IPMI / Redfish);本層為設計承諾與 power profile commit,**不是已驗證實作**,對齊 v2.2 §F.1 18 個月里程碑 |
| 「客戶 inference workload 不能被中斷怎辦?」 | facility UPS 接手長時備援是 v2.2 §E 共同設計前提;Sysblade 60 秒 graceful 是給 **checkpoint + graceful drain**,不是無中斷服務(若客戶站缺 facility UPS,走 v2.2 §E.5 Tier-A 擴大版規格)|
| 「為什麼不用更大 BBU 例如 25 kWh × 1 台?」 | **單點故障 blast radius**:per-rack 8 台並聯允許 N+1 容錯(任一台失效不影響 rack);整合單台 25 kWh 違反 v2.2 §E.1 12U OCP ORV3 機械形狀因子 + 失效範圍擴大 |
| 「複賽 demonstrator 是 8S × 5C peak / 1C 連續,跟 spec 6C/1.5C 不一致?」 | **是 scaled-down,per-cell 工作點 transferable**:demonstrator 因預算 + 26 天時程 + 學生實驗室安全考量,容量縮 ~10×、串數縮 1/2、cell C-rate peak 5C / 連續 ~1C(因 Maxwell BMOD0058 Ioper 19A 限制)。**控制律 τ=0.5s、互補濾波器、5.72×/3.52× 削峰物理 chemistry-agnostic 且 sim 驗過**(`scripts/generate_scaled_8s_sim.py` PASS)。Spec 6C/1.5C 仍是 EVT(2026 Q3)目標,對齊 v2.2 §F.1。詳 `docs/BBU_IMPLEMENTATION_PLAN.md` §1.1 demonstrator spec |

⭐ **本節 §2.1.1 + §2.3.1 RMS 應力分析(C-rate 6C peak → 1C 連續)+ §2.3.2 Wang+rainflow 交叉驗證(worst-case 5.5 % per-Ah 損傷下降),共構 LFP cell 工作點完整防禦**。

---

## 2.2 物理模擬引擎(PyBaMM DFN)

採用 **PyBaMM 26.4.1 DFN**(Doyle-Fuller-Newman 1-D PDE 求解器)+ **Prada2013
LFP-graphite 參數集**[3],離線預先計算 4 個 scenario JSON 餵給前端
(`scripts/generate_twin_scenarios.py`):

| 情境 | 內容 | Headline 結果 |
|---|---|---|
| `transient_lfp_only.json` | 80 kW baseline ±30 % swing(GB200 NVL72 級),純 LFP 應對 | ΔV pp ≈ **62 mV** |
| `transient_hybrid.json` | 同負載,LFP + LIC 混合(τ = 0.5 s) | ΔV pp ≈ **18 mV** |
| `aging_lfp.json` | 3000 cycle BBU duty 下 SOH 衰減 | 80 % SOH @ ~3000 cycles |
| `aging_rainflow_validation.json` | Rainflow + Wang 2011 獨立交叉驗證(§2.3.2)| worst_case η = **0.945**(5.5 % 損傷下降)|
| `model_validation.json` | LSTM 逐 cycle 推論 + actual | 9 個 curated cells |

> **靜態匯出設計**:Next.js `output: "export"`,所有 RUL 預測在 build time 預先
> 算好,不在瀏覽器即時跑 PyBaMM(體積過大)。即時推論留 W3 FastAPI 後端整合。
> 前端 4 個 JSON 雙寫到 `packages/shared/` 與 `apps/web/public/`,SHA-256 一致;
> `aging_rainflow_validation.json` 不被 UI 消費,純後端交叉驗證可追溯產物。

---

## 2.3 混合控制律(LFP/LIC 頻譜分頻)

LIC 吃 > 0.32 Hz 截止頻率以上的高頻分量(GB200 ms 級瞬態脈衝),LFP 吃低頻
穩態。一階互補濾波器,時間常數 $\tau = 0.5$ s
(`SPLIT_FILTER_TAU_S` 唯一可調參數):

$$
P_{\text{LIC}}(t) = P_{\text{load}}(t) - \mathrm{LPF}_{\tau}(P_{\text{load}}(t)),\quad
P_{\text{LFP}}(t) = \mathrm{LPF}_{\tau}(P_{\text{load}}(t))
$$

**模擬結果**(對應首頁 5.7× / 3.5× headline):

| 指標 | 純 LFP | LFP + LIC | 改善 |
|------|---:|---:|:---:|
| LFP 接收功率 RMS | 8.7 kW | 1.5 kW | **5.7×** |
| 電池電壓震盪 (steady-state pp) | ~62 mV | ~18 mV | **3.5×** |

### 2.3.0 LIC 物理層 — closed-form RC + Eaton datasheet anchor ⭐

LFP 我們走完整 PyBaMM DFN 物理模擬;**LIC 側刻意分層**走 closed-form 一階
RC 等效模型(`_simulate_lic_rc()`,`scripts/generate_twin_scenarios.py`)。
為什麼分層?LIC 跟 LFP 化學完全不同,塞一起算 10 秒跑半小時,投資報酬不對;
production 階段直接用 Eaton in-the-loop 量測比 PyBaMM 重做更精準。

**參數錨**(Eaton XLR-48-166 × 2 並聯,datasheet 典型值):

| 參數 | 值 |
|---|---:|
| Bank capacitance C | **332 F**(166 F × 2 parallel) |
| Bank ESR | **2.5 mΩ**(5 mΩ × 0.5,parallel) |
| V_nominal(滿電) | 51.3 V |
| V_min(datasheet UVLO) | 38.0 V |

**Demo waveform 跑出來**:

| 指標 | 值 |
|---|---:|
| Worst-case droop | **2.32 V**(從 51.3 → 48.98 V) |
| Headroom to UVLO | **10.98 V**(`passes_cutoff = true`) |
| Droop 組成 | 95 % 由 ESR drop 主導(926 A peak × 2.5 mΩ),5 % 由累積電容放電 |
| 13.31 kJ ÷ 332 F 累積 | 0.78 V |

**production 含意**:droop ESR-dominated → 加並聯模組(降 ESR)比加電量(加 C)
有效。`/twin` 第 3 張 ChartCard 直接渲染 v_lic(t) 配紅色 dashed UVLO line,
業師可現場驗證。

**未模(明示邊界)**:LIC pseudo-capacitance、temperature-dependent ESR、
self-discharge、Helmholtz layer electrode kinetics — 這些 production 階段以
Eaton in-the-loop 量測曲線校正;current-rating gate(463 A peak per module)
也未在 RC 模型內驗證,需 Eaton lot-specific datasheet 確認(`docs/citations_audit.md`)。

### 2.3.1 為什麼這對 LFP 壽命是決定性影響

5.7× 功率波動下降不只是「電壓好看」,而是直接對應 LFP 主電池壽命延長:

* **電化學機制**:LFP 衰減主導因子是高 C-rate 引發的 lithium plating、SEI 增厚與顆粒裂解(Severson 2019 §3 衰減模型)。RMS 應力(rack 級)從 8.7 kW 壓到 1.5 kW,對應到 **per-BBU 單顆 LFP cell** 的有效 C-rate 從約 **6 C peak**(瞬態,< 2 秒 pulse)拉回約 **1 C 連續**(8 台 BBU 並聯,每台 ~1.1 kW continuous),**完全落在車規 LFP 安全工作區**(完整 8-BBU 拓撲與 cell 工作點推導見 §2.1.1)。
* **量化估算**:依據 Attia 2020 *Nature* [6] 的 closed-loop fast-charge 結果,LIC 削峰可延長 LFP 主電池循環壽命約 25 %(v2.2 §D.1 的永續承諾保守估為 30 %)。
* **產品層轉換**:BBU 浮充 duty 大約是每年 50 個循環(engineering estimate
  anchored to v2.1 §G.3 footnote + §E.1 Tier-B,**非** v2.1 §B.2 verbatim
  數字),屬循環極少場景。將 25 % 壽命延長映射到產品層,LFP 服役壽命可達
  **8–12 年**(NMC BBU 基準 6–8 年,v2.2 附件 C),客戶 10 年內替換次數從
  **1.5 次降到 1 次**。**注意 calendar life(thermal-driven SEI growth)是
  binding constraint** — LSTM-driven RUL 預測 BBU duty cycle-fade headroom
  可達數萬 cycles,但 calendar life 在 8–12 yr 內已強制報廢。`/dashboard`
  drilldown 對「≫ 10 yr cycle-fade」顯示加 calendar-life-binds caveat。

**TCO 角色(誠實邊界)**:在 §2.7.1 TCO 表中,LFP+LIC 「初次採購 +$2,880 / rack」與「替換節省 −$2,880 / rack」剛好互抵,**壽命延長對 TCO bottom-line 的淨貢獻趨近於零**;33 % saving 主要是由瞬態損失(−3,600)、維運人力(−3,000)、HVDC 過渡(−3,000)三條 row 撐起(§2.7.1)。換句話說,壽命延長的角色是讓 Sysblade 能收下這筆 capex 溢價而不增加客戶 TCO,客戶實質拿到的是 +25 % 服役年限、Hyperscale 500 racks 規模 250 次現場派工避免,以及可列入 ESG 碳排報告的減量(對齊 v2.2 §D.1)。

### 2.3.2 獨立交叉驗證 — Rainflow + Wang 2011 ⭐

§2.3.1 的 25 % 壽命延長基於 Attia + Severson 統計外推。為提供**第二條獨立可
檢驗的物理路徑**,我們對 PyBaMM 產出的 LFP cell 電流跑 **ASTM E1049-85
4-point rainflow + Wang 2011 半經驗 cycle-aging 公式** [7] 獨立估算每 Ah
損傷比 $\eta = Q_{\text{loss,hybrid}} / Q_{\text{loss,LFP-only}}$:

| 波形 | LFP-only Q_loss (60s) | Hybrid Q_loss (60s) | $\eta_{\text{cyc}}$ |
|---|---:|---:|:--:|
| demo (±30 %, 100 ms) | 0.0338 % | 0.0342 % | **1.012** |
| **worst_case (10 C × 30 ms 脈衝,team-derived per-cell scaling of GB200 power-swing context [11])** | 0.0375 % | 0.0355 % | **0.945** |

**判讀(誠實邊界)**:
* **demo η = 1.012**(hybrid 略差 1.2 %)— Wang kernel 在 0.5–6 C 區間幾乎
  flat,demo cell C-rate 落 3.2–6 C 讓 hybrid 平直波形 per-Ah 損傷略高。
  **主動揭露不藏**:demo 振幅本來就是「示意波形」,**不是 hybrid 真正發揮
  優勢的工作點**。
* **worst_case η = 0.945**(5.5 % per-Ah 損傷下降):Wang kernel 在 6 C 至 10 C
  區間躍升到 0.192,LIC 將 10 C 脈衝吸收掉之後,LFP 看到的最大 C-rate 降回
  4.8 C。**這才是 LIC 真正發揮作用的場景**,對應 v2.2 §B.1 描述的「10–30 ms
  5–10 C 瞬態」設計對象。

> **方法學嚴謹**:hybrid 25 % 壽命延長**不是單一統計外推** —— Wang+rainflow
> 是完全獨立的物理路徑與 calibration 來源(A123 ANR26650 moderate-rate
> 數據,獨立於 Severson)。**兩條路徑同方向**才是這條結論的根據。完整方法
> 與絕對數值 caveat 見 `docs/whitepaper.md` §3.2.1;輸出
> `aging_rainflow_validation.json`(repo 可追溯,不被 UI 消費)。

---

## 2.4 RUL 預測管線

訓練資料 Severson 2019 [1] 公開的 124 顆 LFP 18650 cell。**核心兩個數字**:

| 指標 | 結果 | 客戶意義 |
|---|---|---|
| **Severson 同 batch random split MAPE** | **8.38 %**(R² 0.890) | **比 Severson paper benchmark 9.1 % 還準**,代表客戶用同款 LFP 電芯時模型可信度 |
| **跨 batch / 新 protocol fall-back MAPE** | **13.87 %**(R² +0.207) | 客戶換新快充協議或新批次電芯時,模型仍可用、誤差受控 |

> **部署 routing 規則**(寫進 v2.2 §F 客戶 SOP):**同 protocol** 用 bagged-GBT
> 享 8.38 % 點精度;**新 protocol** fall back bagged-OLS;**新化學**(LFP → NMC
> 等)每批必跑 calibration cycle,**5/5 feature OOD、z-distance 5–65 σ 證實
> 線性外插無意義**。完整 5 regressor × 4 filter sweep + 13-feature 工程詳述 +
> NASA cross-dataset z-distance 表見**附錄 A / B**。

---

## 2.5 LSTM + 邊緣部署

兩件事最關鍵:

| 客戶問 | 我們答 | 客戶意義 |
|---|---|---|
| **「模型準不準?」** | **19.10 % MAPE / R² 0.86**(2-layer LSTM,Severson 138 顆真實 + 50 顆 **Severson-anchored synthetic BBU-duty** cell;合成 cell 走 analytic decay + per-cell noise,**不是** PyBaMM aging)| Fleet 推論可用,跨 lab 壓力測試與 BBU 浮充兩個 regime 都涵蓋 |
| **「部署到 BBU 上跑得動嗎?」** | **STM32N6 NPU 27–109 µs 單樣本估算**(靜態 graph + ±2× 區間,附錄 C.4;模型 63 KB 占 NPU FLASH 4 %)| 對比 ST datasheet typical 0.3 ms 即使 worst-case 109 µs 仍 ~3× margin;**斷網本地推論 + 不被 cloud per-inference billing 綁** |

> **為什麼 LSTM 19.10 % > GBT 8.38 %?**這不是退步,是「per-regime sharpness
> 換 cross-regime honesty」的取捨:GBT 只看過 Severson 壓力測試 cell,對 BBU
> 浮充部署是**沉默外插**;augmented LSTM 涵蓋兩個 regime,點精度退讓但對客戶
> 部署 honest。**Fleet 推論用 LSTM,學術 baseline 報 GBT**(§2.4)。

### 2.5.1 合成 cell 是否 self-fulfilling — Severson-only 反證 ⭐

業師會問:**50 顆 Severson-anchored synthetic BBU 是不是讓模型訓自己?**
合成 cell 的 cycle_life label 由同一條 Severson-fit 解析公式產出,LSTM 在
這些 cell 上的預測本質上就是「重現 generator 函數」 — **形式上有 data
leakage 風險**。

我們跑了反證 — `python scripts/export_lstm_onnx.py --severson-only` 用
同一條 LSTM、同 seed=42、同 60/20/20 random split,**只訓 138 顆真實
Severson cell**:

| 指標 | Augmented(138 真實 + 50 合成) | **Severson-only** |
|---|---:|---:|
| Test MAPE | 19.10 % | **16.17 %** |
| Test R² | 0.862 | **0.553** |
| Conformal PI median width | 1075 cycles | **793 cycles** |
| n_train / cal / test | 114 / 37 / 37 | 84 / 27 / 27 |

**關鍵觀察**:**augmentation 反而把 MAPE 從 16.17 % 升到 19.10 %**。如果合成
cell 是 self-fulfilling 作弊,augmented MAPE 應該更低;**實際相反 → 反證
作弊質疑**。Augmentation 的價值是 R² **從 0.55 升到 0.86** + 跨 regime
部署能力,**不是 MAPE 障眼法**。

可一條 flag 重現,seed=42 deterministic;完整 JSON 在
`data/processed/lstm_severson_only_eval.json`,CI 守門 4 條 soft check 對齊
README + 完整白皮書 §3.3.8。

> 完整訓練細節 / Conformal calibration / per-batch MAPE 切面 / op dispatch 見
> **附錄 C** 與 `docs/whitepaper.md` §3.3。

---

## 2.6 軟體三件套(客戶實際看到的產品)

三件套全部以 SaaS USD 25k/site/yr 訂閱交付;每個產品配一個 **典型使用情境**
示範客戶實際使用流程 —— **情境為示意 persona,非已成交客戶**,角色 / 流程
符合北美 Tier-2/3 colo 維運慣例。

### 2.6.1 Battery Digital Twin · `/twin`

🔗 **Live demo**:<https://sysblade-atcc.vercel.app/twin>

**典型使用情境 — 機房維運副理 daily check-in**:
> 副理 9:00 打開 `/twin`,9 顆 walkthrough cell 中 b2c1 標 **critical**(fleet
> 內 critical 占 3.9 %),點進去看 LSTM 預測 — **點 218 cycles、90 % PI
> [144, 332](≈ 4.4 BBU 年,PI 2.9–6.6 年);預期 EOL 比 walkthrough 中位數
> ~20 BBU 年早 ~16 年**,當場開工單請工程隊優先排程現場巡檢。

**產品內容**:物理 + ML 整合可視化 — PyBaMM DFN 線下預算的瞬態 / 老化波形 +
LSTM 推論點預測 + MC Dropout + Split Conformal 90 % PI 逐 cell 呈現。9 顆精選
cell span healthy / warning / early_aging / critical 四個狀態,可現場點選
觀察 LSTM 輸入序列(99 cycle × 7 feature)與 PI bar。

### 2.6.2 TCO Calculator · `/tco`

🔗 **Live demo**:<https://sysblade-atcc.vercel.app/tco>

**典型使用情境 — 業務客戶提案會議**:
> 客戶 CFO 問:「你們比 Vertiv 貴 50 %,為什麼換?」業務當場開 `/tco`、拉
> slider 到客戶規模(50 racks · ERCOT 0.085 USD/kWh),畫面顯示年省 $44.6k、
> payback 2.4 年;**回收期 < 折舊週期一半**,問題從「為什麼換」變「下個月
> PoC 嗎」。

**產品內容**:業務談判工具,客戶可帶走自己跑數字。彈性參數(racks / 電價 /
PUE / grid carbon)+ 三個 preset(Mid-tier · TX / Hyperscale · VA / Edge AI · PNW)
即時看 10 年成本差。完整公式見 §2.7。

### 2.6.3 Fleet Dashboard · `/dashboard`

🔗 **Live demo**:<https://sysblade-atcc.vercel.app/dashboard>

**典型使用情境 — 維運服務派工流程**:
> 7:00,某客戶 Dallas 機房一台 rack SOH 從 0.86 跌至 **0.84**(RUL 5,400
> cycles)跨入 **early_aging**,系統推 ServiceNow ticket 給 Sysgration
> 工程隊 + email 客戶。**7-day SLA 倒數**;工程隊 3 天內從 Plano 廠派工帶
> 替換 LFP pack。**客戶不需自己 monitor、不會踩 SLA、Sysgration 收維運年費**。

> **Admission 分支揭露**:本案模擬 fleet 中 77 台 early_aging 全由 `SOH < 0.85`
> 觸發,`RUL < 800` 分支零觸發(fleet RUL 分布 4389–7130 cycles)。完整 admission
> rule 仍是 `SOH < 0.85 OR RUL < 800`(對齊 v2.2 §F)。

**產品內容**(對齊 v2.2 §E.3 三層服務承諾):
* **Tier-1 即時監控**:1000 台 fleet 的 SOH / RUL / status 即時表
* **Tier-2 地理分布**:AI 機房密度加權地圖(Texas 49 % / Virginia 27 %,本文模擬權重)
* **Tier-3 替換隊列**:`status === "early_aging"`(SOH < 0.85 或 RUL < 800 cycles),觸發 7-day SLA 派工;**支援 row click drilldown**,點擊任一替換 row 開出 panel 顯示該 device 的 SOH (LFP/LIC) / RUL 與 BBU 年數估算 / 熱與操作層 metrics,fleet-level conformal PI 仍須點到 /twin 看 9 顆 walkthrough cell

> 1000 台機台是 **seeded RNG 模擬**,所有 panel 明標 **SIMULATED DATA**
> watermark。RUL 到 BBU 年數的換算:BBU duty 平均年循環約 50,BBU 年數
> 約等於 rul_cycles / 50。

---

## 2.7 TCO 模型

### 2.7.1 33 % 節省的推導(對齊 v2.2 §G.3)

每 rack 10 年成本(USD):

| 項目 | Traditional NMC | Sysblade LFP+LIC | 差距 |
|------|---:|---:|---:|
| 初次採購 | 5,760 | 8,640 | +2,880 |
| 10 年內替換 | 8,640 | 5,760 | -2,880 |
| 瞬態損失 | 4,800 | 1,200 | -3,600 |
| 維運人力 | 5,000 | 2,000 | -3,000 |
| HVDC 過渡 | 4,800 | 1,800 | -3,000 |
| **合計** | **29,000** | **19,400** | **-9,600** |

$$
\text{Saving} = \frac{29{,}000 - 19{,}400}{29{,}000} = 33.1\,\%
$$

> **LFP 單位成本對稱性說明(誠實邊界)**:細心讀者會留意「LFP+LIC 初次採購
> 8,640」與「10 年內替換 5,760」表面上不能用同一個 single-unit price 推出。
> 對齊 v2.2 §G.3 BOM 模型,此 row 反映兩條假設。第一,**NMC 屬成熟化學體系**,
> 單位成本在 10 年模型中假設 flat($5,760 維持);**LFP+LIC 仍在學習曲線陡降
> 段**,Sysgration 內部估 6–8 年內 single-cell ASP 下降約 30 %,**服役期到時
> LFP+LIC 單位成本已接近 NMC 同價**。第二,Sysblade 採「refurbish 而非整套
> 換」策略,替換時僅更換衰退電芯而保留 BMC、機箱與電氣分層介面,壓低替換
> BOM。若改用較激進「LFP+LIC initial 也採 5,760」假設,壽命延長將額外貢獻
> USD 2,880 / rack / 10y 替換節省,**33 % saving 會推升到 43 %**。本案
> §2.7.1 採保守版本,**33.1 % 是 lower bound**。

### 2.7.2 三個 preset 敏感度(數值對齊 live demo `apps/web/src/app/tco/tco-client.tsx`)

| Preset | racks | 電價 | PUE | per-rack saving | 整 fleet 年節省 | Payback |
|--------|---:|---:|---:|---:|---:|---:|
| **Mid-tier · Texas** | 50 | 0.085 USD/kWh(ERCOT 2024)| 1.40 | $8,925 / 10y | **$44.6k** | **2.4 y** |
| **Hyperscale · Virginia** | 500 | 0.105 USD/kWh(PJM 2024)| 1.35 | $9,657 / 10y | **$482.9k** | **2.3 y** |
| **Edge AI · Pacific NW** | 10 | 0.07 USD/kWh(BPA / hydro)| 1.30 | $8,025 / 10y | $8.0k | 2.6 y |

> 33.1 % 的 §2.7.1 headline 是 **baseline**(電價 0.10、PUE 1.4)情境;在實際
> preset 下 saving % 落在 **29.9 % – 33.2 %** 區間(Hyperscale 33.2 %、
> Mid-tier 31.8 %、Edge 29.9 %),敏感度呈現「**電價 × PUE 同向放大瞬態
> 損失差距**」 —— Edge 因 0.07 USD/kWh + PUE 1.3 雙低,k = 0.65,瞬態
> 損失壓縮明顯,saving % 略低 baseline。

Payback 對 rack 數量不敏感(extra capex 與 saving 都隨 racks 線性 scale),
但對電價 × PUE 敏感 — Virginia 0.105 USD/kWh × PUE 1.35 較 Texas 0.085 ×
1.4 略放大瞬態損失差距,payback 縮短 ~ 0.1 年。完整 elasticity 邏輯見
`apps/web/src/lib/tco.ts`,UI 在 `/tco`。

---

## 2.8 複賽 twin-first validation(2026-06-11 · V1–V6 chains)

> **v1.2 → v1.3 重大改寫**(2026-05-26):放棄 v1.x 的 8S LFP scaled-down 實機
> demonstrator 路線(M1-M4 硬體 milestone),改交付 **6 條 digital-twin
> validation chains(V1-V6)**,target 科技業 RD / 顧問 / 投資人。對 colo
> 客戶的 spec-grade 15S 整機仍屬完整版 §8 路線圖 EVT 2026 Q3。
> 完整工程細節:`docs/BBU_IMPLEMENTATION_PLAN.md` v2.0、RD executive brief
> `docs/RD_BRIEF.md` v0.1。

**為什麼 twin-first**:bench-first(燒實機)迭代週期 6-12 週 / 次,失敗成本
10-30 萬;twin-first 迭代 1 小時 / 次,失敗成本趨近 0。**SpaceX / Tesla
/ Rivian 早期都先 twin close-loop 才 commit 到 silicon**,Sysblade 在 GB200-class
高功率 BBU 領域沿用此工程順序。EVT 2026 Q3 仍會做實機,**但先把 twin 證據鏈
跑齊才知道實機要驗哪幾條**,避免燒實機驗錯題。

### 6 條 critical-path validation chains(V1–V6)

| # | Validation chain | 證據 artifact | 對齊 spec | 狀態(2026-05-26)|
|:--:|---|---|---|:--:|
| **V1** | PyBaMM Prada2013 對公開車規 LFP 量測 fit error | `pybamm_lfp_fit_error.json`(目標 V RMS ≤ 5 % / capacity fade RMS ≤ 3 %)| §2.2 物理模擬可信度 | 📋 W2 |
| **V2** | LIC RC closed-form 對真實 datasheet curve fit error | `lic_rc_fit_error.json`(目標 droop RMS ≤ 10 %)| §2.3.0 RC anchor 可信度 | 📋 W2 |
| **V3** | **整 rack 60 s graceful 整合 sim**(8 BBU + LIC bank + 控制律 + GPU ramp + 熱模型)| `rack_60s_graceful.json` + `/twin` 新 row | §2.1.1 60 s 承諾 | 📋 W3 |
| **V4** | **N-1 BBU failure redundancy sim**(t=15 s 1 台 offline,剩 7 台撐 60 s)| `rack_n_minus_1.json` + dashboard fault-inject toggle | §2.1.1 N+1 容錯 | 📋 W3 |
| **V5** | Severson → PyBaMM-generated GB200 duty cell transfer test | `severson_transfer_mape.json` | §2.5 cross-regime 證據 | 📋 W3 |
| **V6** | **`make verify` 一鍵 reproducibility gate** | `Makefile` + `scripts/verify_all.py` + CI workflow | RD reviewer 30 分鐘 self-check 承諾 | 📋 W4 |

**V1-V6 完整論述**:V1+V2 物理模型 fit error 量化、V3+V4 系統整合 + 容錯
(實機學生階段做不到正是 twin 的賣點)、V5 ML pipeline 跨 regime 誠實 transfer、
V6 reviewer 可獨立重跑。

### 既有頭條數字一致性(self-check,v2.0 強化版)

| 既有承諾 | v2.0 twin 對應 | 是否衝突 |
|---|---|:--:|
| **5.7× LFP RMS 削峰**(§2.3 / §2.3.1)| sim 數字不變;V1 給「sim 對 reality 的可信度區間」 | ✅ |
| **3.5× V_cell pp 收斂**(§2.3)| 同上 | ✅ |
| **8.38 % RUL MAPE**(§2.5 / Part 1.2)| 不變;V5 加 cross-regime transfer MAPE 誠實揭露 | ✅ **強化** |
| **3.49× ONNX INT8 壓縮**(Part 1.2 / 附錄 C)| 不變 | ✅ |
| **/dashboard 1000 台 SIMULATED + watermark**(§2.6.3)| V3/V4 sim 餵新 row 仍標 SIMULATED;watermark **不弱化** | ✅ |
| **LFP 15S**(v2.2 §修訂 #4)| spec 不修訂;V3 整 rack sim 直接用 15S 配置 | ✅ **更直接** |
| **60 s graceful @ 120 kW**(§2.1.1)| **V3 直接把這條曲線 sim 出來**(原本只是承諾,變 artifact)| ✅ **強化** |
| **N+1 容錯**(§2.1.1)| **V4 fault-injection sim 把這條主張變 artifact** | ✅ **強化** |
| §2.3.0 LIC RC anchor 到 Eaton datasheet typical values | **V2 把這條邊界量化為 droop RMS error %** | ✅ **強化** |
| §2.2 PyBaMM Prada2013 generic LFP | **V1 把這條邊界量化為 V RMS error %** | ✅ **強化** |
| 「不承諾 MAPE < 5 %」(v2.2 附件 B)| V5 cross-regime MAPE 若 ≥ 10 % 仍誠實寫,不修飾 | ✅ |

### 帳目 + v1.x sunk cost

v1.x 已下單 sunk cost ~NT$ 17,165(預算 34 %)+ 可挽回 / 轉用 ~14,196
(Pi 5 直接轉 V5 平台,Maxwell / INA228 / DL24M-H / JK-BMS 7-30 天內決定退貨
或二手出)+ Wave 2-3 + 借設備 全部取消下單 ~10,700。**v2.0 增量採購 NT$ 0**
(純軟體 / 純 sim)。完整處置 SOP `docs/PURCHASE_LIST.md` § 0(2026-06-02 動作
死線)+ `docs/BBU_IMPLEMENTATION_PLAN.md` § 0.5.2。

---

# Part 3 — 競品差異化

> Sysblade 跟市場現有 BBU 廠商相比的 4 個關鍵差異化點。每個差異化都帶
> measured 數據或競品文件實證,不是「我做了所以我比較好」。**內部技術選擇
> 的細節**(DFN 對 SPM、bagged-GBT 對其他回歸器、INT8 量化策略等)**已在
> Part 2 各章節完整說明,本章不重複論證**;只列在競爭面真正會被客戶問到
> 的差異點。

---

## 3.1 LFP+LIC 混合拓撲(核心硬體差異化)

**選擇**:LFP 主電池 + LIC 並聯,一階互補濾波器分頻(τ = 0.5 s)。

**為什麼這是差異化**:市場上沒有任何一家廠商提供整合好的 LFP+LIC BBU
方案 —— Eaton 賣 LIC 模組元件、Vertiv/Schneider 賣純電池或 NMC BBU,
**LIC + 主電池分頻控制律與整體調校客戶都要自己做**(需要電化學 + ML 兩棲
團隊,Tier-2/3 colo 沒這個工程量能)。

**measured 數據**(PyBaMM DFN 模擬 LFP cell,LIC 側為 R_esr × C_bulk 一階等效,
完整見 §2.3):LFP 接收功率 RMS 從 8.7 kW 壓到 1.5 kW(**5.7×**),電芯電壓震盪
peak-to-peak 從 62 mV 收斂到 18 mV(**3.5×**)。**注意這條 5.7× / 3.5× 是訊號
處理層的削峰證據**(LPF 截掉高頻),與 25 % 壽命優勢的因果鏈不是直接的 —
壽命優勢主要由 BBU 低 duty 排程貢獻(§2.3.1),hybrid 拓樸的 per-Ah 損傷
貢獻獨立由 Rainflow + Wang 2011 估算為 worst-case ~5.5 %(§2.3.2)。完整
邏輯見 §2.3.1、§2.3.2 與 §2.7.1。

**附帶好處**:電壓震盪 pp 收斂到 18 mV 之後,PSU 不會誤觸 OVP/UVP,Tier-2/3
客戶 SLA 達標壓力連帶下降。

**Trade-off**:控制律複雜度上升(τ = 0.5 s 分頻策略已開源於
`scripts/generate_twin_scenarios.py`);LIC vendor 目前 Eaton + JM Energy
兩家,規格上已並行評估替代供應商。

---

## 3.2 Rack-level 部署粒度(架構差異化)

**選擇**:per-rack BBU(OCP ORV3 12U BBU shelf,單機箱三層電氣分層),取代
集中式 UPS。

**為什麼這是差異化**:Schneider Galaxy VS 等集中式 UPS 部署粒度太粗
(1 台服務 100+ racks),有 4 個固有問題:

1. **單點故障**:集中式 UPS 一旦失效,全機房隨之 down;per-rack BBU 失效只影響該 rack
2. **HVDC 過渡昂貴**:48 V 升至 ±400 V 過渡時,客戶必須 forklift 換掉整台 UPS,Sysblade 以雙電壓介面規避
3. **AI rack 負載異質性高**:GB200 與 H100 瞬態特性不同,集中式無法針對性調整;per-rack BBU 可各自跑邊緣推論隨負載校準
4. **故障 blast radius 大**:集中式失效會牽動整片 racks,replace 需要排程 datacenter downtime;per-rack BBU 維修不影響其餘 racks

OCP ORV3 規範趨勢即往 rack-level 移動,2020 後 Meta、Google 已全面 rack-level
BBU shelf 部署。Sysblade 走 v2.2 §E.1 「**同一個 12U 機箱內三層電氣分層**」做法
(電氣分層 ≠ 物理拆解,維持備援設備可靠度原則)。

**Trade-off**:從 1 台 UPS 變 100 台 BBU,系統複雜度確實上升,但 Cloud Fleet
Dashboard 將管理介面收斂回單一儀表板。1000 台透過軟體管理,反而比集中式
UPS 更省人力(v2.2 §G.3 維運成本差 −3,000 USD/rack/10y)。

---

## 3.3 邊緣 NPU 推論 + 軟硬整合(部署差異化)

**選擇**:STM32N6 系列 MCU + Neural-ART NPU INT8 推論,LSTM RUL 模型本地
執行;搭配 `/twin` Battery Twin、`/dashboard` Fleet 監控、`/tco` Calculator
三件套 SaaS。

**為什麼這是差異化**:其他廠商大多是純硬體供應商(Eaton 完全沒軟體層,
Vertiv iCOM / Schneider EcoStruxure 是設備管理而非 BBU-level RUL 預測);
有 ML 監測的少數方案是 cloud-based 訂閱服務。Sysblade 推論本地化 +
SaaS 全套,給客戶 4 個實質好處:

1. **Latency**:STM32N6 NPU 單樣本 **27–109 µs**(附錄 C 靜態圖分析);筆記本 CPU INT8 **p50 0.241 ms / p99 0.413 ms**(`lstm_quantization_report.json`)。Cloud RTT 50–500 ms 不適用 BBU 故障即時回應
2. **斷網仍可運作**:機房斷網時 BBU 仍須運作,雲端推論是單點故障源
3. **隱私 / 合規**:客戶 BBU 健康資料是運維核心 IP 不願上雲;EU Battery Passport 2027 要求本地可審計
4. **無訂閱抗拒**:Tier-2/3 colo 客戶對 per-inference billing 抗拒,本地推論一次買斷不收訂閱費(SaaS 收 USD 25k/site/yr 是儀表板 + 維運服務,不是 per-inference)

**measured 證據**(§2.5 與附錄 C):INT8 量化壓縮 3.49×(219 KB 壓到 63 KB),
ΔMAPE 僅 +0.10 pp,落在雜訊水平,即可作為 STM32N6 NPU 部署的 go/no-go 證據。

**Trade-off**:vendor lock-in 風險用 ONNX 中間檔保留緩解(可平行 export 到
CMSIS-NN / TensorFlow Lite Micro / Edge Impulse 等替代執行環境)。

---

## 3.4 競品比較總表

### 3.4.1 技術 / 產品 feature 對比

| 維度 | Sysblade | Eaton XLR | Vertiv Liebert | Schneider Galaxy VS |
|------|:---:|:---:|:---:|:---:|
| LFP 主電池 | ✅ | ❌(只賣 LIC) | 🟡(NMC/VRLA,**非 LFP**)| 🟡(集中式 Li-ion,**通常 NMC**)|
| LIC 瞬態緩衝 | ✅(整合) | ✅(只此一項) | ❌ | ❌ |
| **Digital Twin(物理 + ML)** | ✅ | ❌ | ❌ | ❌ |
| **Fleet Dashboard SaaS** | ✅(三層服務) | ❌ | 部分(iCOM) | 部分(EcoStruxure) |
| **TCO Calculator(客戶帶走)** | ✅ | ❌ | ❌ | 部分(內部用) |
| **HVDC ±400 V ready** | ✅(雙電壓介面) | 部分 | ❌(48 V only) | ✅(集中式) |
| **Rack-level 部署** | ✅ | ✅ | 部分(Edge 系列) | ❌(集中式) |

### 3.4.2 商業 / 規模對比 ⭐

| 維度 | Sysblade(Sysgration 推案) | Eaton | Vertiv | Schneider |
|------|---|---|---|---|
| **2024 年全球營收** | Sysgration 母公司(TWSE 6312)營收量級**遠小於三家競品** —— 正是 Tier-2/3 縫隙合理的新進入者身分 | **USD 24.9 B** | **USD 8.0 B** | **EUR 38.2 B** |
| **北美機房 BBU 業務市占(估)** | 0 %(新進入者) | **~ 15 %**(LIC 利基領導)| **~ 25 %**(Tier-1 重型 UPS 主力)| **~ 30 %**(集中式 UPS 王者)|
| **為什麼還沒做 Sysblade 在做的事**(strategic moat 推論)| —— | 純電力元件商,**沒有軟體 / SaaS / ML DNA**;LIC 利基已是 cash cow,投 SaaS 整合 ROI 不對齊主業 | 重押 **Tier-1 hyperscale 大型 UPS**(單筆 USD M 級),Tier-2/3 colo 利基太薄,**策略上看不上小規模 BBU** | 集中式 UPS Galaxy VS 是**核心產品線**,做 rack-level 等於 **cannibalize 自家旗艦** —— 大公司不會自我蠶食 |
| **Sysblade 切入點** | 無 cannibalization 包袱(無現有旗艦)+ Sysgration 既有資產(電芯採購通路、Plano 廠北美在地化、母公司客戶網)+ 軟硬整合是新世代差異化 | — | — | — |

> 數據來源:Eaton 2024 Annual Report、Vertiv FY2024 Q4 results、Schneider
> Electric 2024 Universal Registration Document(全部公開財報實證,2026-05-04)。
> 市占百分比為產業分析師估算(BBU 細分項各廠商不公開),用以表達**規模量級
> 而非精確數字**。Sysblade 縫隙至少 18–24 個月空窗。

> **競品仍有優勢**:全球售後網路、認證齊全、品牌信任 — Sysblade 以透明
> 技術白皮書 + Live demo + 戰略合作夥伴(Sysgration)漸進取得客戶信任。

---

# 附錄 A — 13-feature 工程詳述

依 Severson 2019 Table S2 Full model 對應關係。所有提取程式碼在
`packages/battery-twin/data_loaders/severson_parser.py`。

## A.1 5-feature Discharge model(對齊 paper Table 1 / Figure 2c headline)

1. `log_var_delta_q` = $\log_{10} \mathrm{Var}(\Delta Q_{100-10}(V))$,1000-pt 電壓網格 LFP 2.0–3.5 V
2. `log_min_delta_q` = $\log_{10}|\min \Delta Q_{100-10}(V)|$
3. `slope_q_2_100` = per-cycle 峰值 $Q_d$ 對 cycle 線性回歸斜率(cycles 2–100)
4. `intercept_q_2_100` = 同回歸的截距
5. `q_at_cycle_2` = cycle 2 的峰值 $Q_d$

## A.2 8 個延伸 feature(對齊 paper Table S2 Full model)

6. `log_max_temp_2_100` = $\log_{10}(\max_{i=2..100} \max_t T_i(t))$
7. `log_temp_integral_2_100` = $\log_{10}(\sum_{i=2}^{100} \int T_i\,dt)$,trapezoidal
8. `log_charge_time_avg_2_6` = $\log_{10}(\frac{1}{5}\sum_{i=2}^{6} (\arg\max_t V_i - t_{i,0}))$
9. `slope_q_91_100` = per-cycle $Q_d$ 線性回歸斜率(cycles 91–100,後段衰減)
10. `intercept_q_91_100` = cycles 91–100 polyfit 截距(共用 #9 的 polyfit)
11. `q_at_cycle_100` = cycles 91–100 polyfit 在 cycle 100 的估值
12. `log_min_ir_2_100` = $\log_{10}(\min_{i \in [2,100]} IR_i)$ — 內阻反映 cell 製造品質
13. `log_ir_diff_100_2` = $\log_{10}(|IR_{100} - IR_2|)$ — 早期衰退速率

> 本實作對齊 Paper Table S2 Full model 中定義明確的 8 個延伸 feature;
> 第 9 個 IR-difference 變體因 paper 原文定義較模糊、邊際貢獻預期不大,
> 改以另兩個 IR feature(`log_min_ir_2_100`、`log_ir_diff_100_2`)等效覆蓋
> 內阻演化資訊。

---

# 附錄 B — Cross-dataset z-distance 完整表

完整 JSON 來源:`data/processed/cross_dataset_mape.json`,生成腳本
`scripts/eval_cross_dataset.py`。

## B.1 每個 feature 的 Severson 訓練分布 vs NASA 測試分布

| Feature | Sev μ | Sev σ | Sev [min, max] | NASA [min, max] | OOD | z-dist |
|---|---:|---:|:---:|:---:|:--:|---:|
| log_var_delta_q | -3.878 | 0.441 | [-5.21, -2.73] | [-2.07, -1.54] | ✗ | **5.31** |
| log_min_delta_q | -1.462 | 0.238 | [-2.30, -0.86] | [-0.51, -0.26] | ✗ | **5.06** |
| slope_q_2_100 | -0.000 | 0.000 | [-0.001, 0] | [-0.006, -0.004] | ✗ | **54.00** |
| intercept_q_2_100 | 1.073 | 0.016 | [0.97, 1.10] | [1.86, 2.04] | ✗ | **61.41** |
| q_at_cycle_2 | 1.069 | 0.015 | [0.97, 1.09] | [1.85, 2.04] | ✗ | **64.55** |

**z-distance 計算**:
$$z = \max(|x_{\text{NASA,min}} - \mu_{\text{Sev}}|,\ |x_{\text{NASA,max}} - \mu_{\text{Sev}}|) / \sigma_{\text{Sev}}$$

## B.2 NASA 4 顆 cell 的真實 vs 預測 cycle life

| Cell | Cycle life (80 % SOH) | OLS 預測 | 絕對誤差 |
|---|---:|---:|---:|
| nasa_B0005 | 106 | 8,589.5 | 8003 % |
| nasa_B0006 | 62 | 22,540.7 | 36256 % |
| nasa_B0007 | 126 | 10,589.4 | 8304 % |
| nasa_B0018 | 79 | 10,484.8 | 13172 % |

> **這些絕對誤差數字本身不該被引用為「模型差度」量化指標** — 它們是
> OLS 線性外插到訓練分布外 65 σ 的計算結果,意義是「Severson-trained
> 模型對 NASA NMC 的預測沒有意義」,而非「模型可改進到 X %」。**真正
> 可引用的量化指標是 z-distance 表**。

---

# 附錄 C — STM32N6 X-CUBE-AI 混合分析

本附錄合併兩條證據鏈:**靜態 graph 分析(proxy)**用 Python `onnx` library
+ ST 公開資料估算 op dispatch 與 NPU latency(±2× 不確定性);**真實 INT8
量化驗證(measured)**的 size、accuracy、CPU latency 為實測,報告 JSON:
`data/processed/lstm_quantization_report.json`。

## C.1 模型摘要

| 項目 | 值 | 來源 |
|---|---:|---|
| 參數總數(ONNX initializer 計數)| **54,093** | `x_cube_ai_static_analysis.json` static graph |
| 參數總數(PyTorch `parameters()` 計數)| 54,081 | `model_validation.json`(差 12 為 ONNX export 多帶的 initializer constants)|
| Weight FLASH(FP32 total = graph 8.18 KiB + external_data 211.0 KiB)| **219.18 KiB** | **measured**(`lstm_quantization_report.json::size.fp32_total_kib`)|
| Weight FLASH(INT8 dynamic)| **62.87 KiB** | **measured(3.49× compression)** |
| Activation peak SRAM(INT8 estimate)| 32.0 KB | static graph |
| ONNX nodes | 52 | static graph |

## C.2 STM32N6 配適

| 資源 | 模型需求 | NPU 容量 | 配適? |
|---|---:|---:|:---:|
| Weight FLASH(INT8 measured)| 62.9 KB | 1638.4 KB(1.6 MB)| ✅ 用 4 % |
| Activation SRAM(INT8 estimate)| 32.0 KB | 1024 KB(1 MB)| ✅ 用 3 % |

## C.3 Op dispatch(依 X-CUBE-AI 9.x 公開 op support matrix)

| 類別 | 數量 | 說明 |
|---|---:|---|
| ✅ NPU 完全加速 | 45 ops | Gemm / Conv / Add / Mul / Reshape / Transpose / Slice / Concat 等 |
| 🟡 NPU 部分 | 3 ops | LSTM(NPU 內部分解 → Gemm + Sigmoid + Tanh + element-wise)、Gather |
| ❌ CPU fallback | 4 ops | Shape × 3 + Expand × 1 — **皆為 metadata ops,0 MAC** |

**整個 inference compute path 都在 NPU 上**,fallback 到 CPU 的 4 個 op
不消耗 MAC,只是 graph 連結用的 shape 推導。

## C.4 Latency 估算

| 量 | 估值 |
|---|---:|
| 總 MAC | 3,281,954 |
| NPU MAC | 3,281,954(100 %) |
| **估算 NPU latency**(40 % NPU utilisation) | **54.7 µs** |
| **估算 ±2× 區間** | **27–109 µs** |

對比 ST datasheet Neural-ART NPU INT8 LSTM typical latency 0.3 ms ≈ 300 µs:
本估算 54.7 µs 遠低於 ST datasheet typical 上限,即使打 ±2× 不確定區間,
worst-case 109 µs 仍有 3× margin。

## C.5 真實 INT8 量化驗證(measured)

由 `scripts/quantize_lstm_onnx.py` 用 onnxruntime.quantization.quantize_dynamic
跑出。

| 指標 | FP32 baseline | INT8 quantised | Δ |
|---|---:|---:|---:|
| ONNX size(total) | 219.18 KiB | **62.87 KiB** | **3.49× compression** |
| Test MAPE(37-cell holdout)| 19.10 % | 19.20 % | **+0.10 pp** |
| Test R² | 0.862 | 0.862 | 不變 |
| Mean \|prediction Δ\| / FP32 prediction | — | — | **0.57 %** |
| CPU p50 latency | 0.267 ms | 0.241 ms | **1.11× speedup** |
| CPU p99 latency | 0.411 ms | 0.413 ms | ≈ 持平(0.995×,在 onnxruntime CPU INT8 dispatch noise floor 內)|

**結論**:INT8 dynamic quantisation 在這個 LSTM 上**幾乎無精度退化**,
是 STM32N6 部署選 INT8 的 go/no-go 證據。

---

# 參考文獻

## 電池物理與資料集

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
   (Cross-dataset 來源)
6. **Attia, P.M., Grover, A., Jin, N., Severson, K.A., Markov, T.M.,
   Liao, Y.-H., Chen, M.H., Cheong, B., Perkins, N., Yang, Z., Herring, P.K.,
   Aykol, M., Harris, S.J., Braatz, R.D., Ermon, S., Chueh, W.C.** (2020).
   "Closed-loop optimization of fast-charging protocols for batteries with
   machine learning." *Nature* **578**, 397-402. (本白皮書 §2.3.1 / §3.1
   引述「LIC 削峰延長 LFP 循環壽命 ~25 %」之主要文獻依據;對應 v2.2 §B.1
   的 [13])
7. **Wang, J., Liu, P., Hicks-Garner, J., Sherman, E., Soukiazian, S.,
   Verbrugge, M., Tataria, H., Musser, J., Finamore, P.** (2011).
   "Cycle-life model for graphite-LiFePO4 cells." *J. Power Sources* **196**
   (8), 3942-3948. (§2.3.2 獨立交叉驗證所用之半經驗 cycle-aging kernel,
   Table 2 提供 0.5 / 2 / 6 / 10 C 校準點)

## 機器學習與不確定性量化

8. **Gal, Y., Ghahramani, Z.** (2016). "Dropout as a Bayesian approximation:
   Representing model uncertainty in deep learning." *ICML* 2016.
   (MC Dropout 理論基礎,本文 §2.5 引)
9. **Vovk, V., Gammerman, A., Shafer, G.** (2005). *Algorithmic Learning in
   a Random World*. Springer. (Conformal prediction 原書,本文 §2.5 引)
10. **Lei, J., G'Sell, M., Rinaldo, A., Tibshirani, R.J., Wasserman, L.**
    (2018). "Distribution-free predictive inference for regression." *JASA*
    **113** (523), 1094-1111. (Split conformal 嚴謹處理,本文 §2.5 引)

## 系統與標準

11. **Choukse, E., Buck, I., Alben, J., et al.** (Microsoft + NVIDIA, 2025).
    "Power Stabilization for AI Training Datacenters."
    arXiv:2508.14318. (§III utility-level MW/s ramp + 0.1–200 Hz 頻域規範,
    §IV-B 提及 GB200 GPU-level power smoothing。**§2.3.2 worst-case
    10 C × 30 ms 脈衝為團隊依本文 GB200 power-swing 分析自行 per-cell BBU
    下尺度推導,原文未直接給出 cell-level 10 C × 30 ms 數值**)
12. **NFPA 855: Standard for the Installation of Stationary Energy Storage
    Systems** (2023 ed.). National Fire Protection Association.
13. **Open Compute Project (OCP) ORV3 Specification** v0.92 (2024).
14. **JLL Research** (2025). *Year-End 2025 Report*. (v2.2 §C.1 引述
    全美在建容量數據)

## 工具鏈

15. **STMicroelectronics** (2024). *STM32N6 Series Reference Manual +
    Neural-ART NPU Application Note* (AN5354).
16. **STMicroelectronics** (2024). *X-CUBE-AI 9.x User Manual*.
17. **ONNX Working Group** (2024). *ONNX Runtime documentation*.

## 競品 / 產品 datasheet

18. **Eaton Corporation** (2023/2024). *XLR-48-166 Supercapacitor Module
    datasheet*.
19. **JM Energy Corporation** (2022). *ULTIMO 3300F Lithium-Ion Capacitor
    cell datasheet*.
20. **Vertiv Group** (2024). *Liebert Edge Lithium-Ion UPS product brief*.
21. **Schneider Electric** (2024). *Galaxy VS three-phase UPS specification*.

## 企劃書與專案

22. 系統電 ATCC C13 學生競賽團隊 (2026).
    *Sysblade HyperBuffer Proposal v2.2*. 商業企劃書,本白皮書之上游文件。
23. 系統電 ATCC C13 學生競賽團隊 (2026).
    *Sysblade ATCC live demo*. <https://sysblade-atcc.vercel.app>

---
