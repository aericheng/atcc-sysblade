---
title: "複賽日 PDF binder — 印刷順序 + 使用指南"
date: "2026-05-27"
target_event: "ATCC 第 23 屆 C13 複賽日 2026-06-11"
location: "out_pdf/ 目錄(整個資料夾 gitignored,本機 only)"
---

# 複賽日 PDF binder

> 給上場時用的「實體紙本 backup」。萬一投影、Wi-Fi、Vercel、筆電任何一個壞掉,
> 桌上有這份 binder 就能繼續走 5 分鐘 demo SOP。

---

## 印刷清單(7 份 + 1 backup,~80 頁雙面 = 1 cm 厚)

| # | 檔案 | 頁數估 | 何時翻 | 給誰看 |
|---|---|---|---|---|
| **1** | `INVESTOR_BRIEF.pdf` | 1 頁 A4 | 步驟 1 (90 秒商業敘事) | 顧問 / 投資人(less technical)|
| **2** | `RD_BRIEF.pdf` | 2 頁 A4 | 步驟 2-3 過程中業師翻 | 跨領域 RD reviewer |
| **3** | `PRESENTATION_GUIDE.pdf` | ~15 頁 | 你自己手上(speaker binder)| 自用 — 5 步驟 SOP + Q1-Q15 答辯彈藥 |
| **4** | `BBU_PROPOSAL.pdf` | ~12 頁 | 業師問 v2.0 / v1.x archive 時翻 | 繳交對外提案(v2.0 + v1.x archive) |
| **5** | `whitepaper_restructured.pdf` | ~25 頁 | 步驟 2 深問時翻 | Part 1 速覽 / Part 2 技術 / Part 3 競品 |
| **6** | `BBU_IMPLEMENTATION_PLAN.pdf` | ~35 頁 | 業師問工程紀律 / sunk cost | 14 章 + Annex(v1.x → v2.0 演進)|
| **7** | `whitepaper.pdf` | ~45 頁 | 業師深問物理 / ML 細節時 | 完整版 75K 字 + 9 章 + 4 附錄 |
| **B** | `MIRROR_SETUP.pdf` | ~6 頁 | (僅 contingency,口袋備著)| 萬一 demo 日 GitHub 出問題 |

**雙面印 + 騎馬釘 / 環裝**:每份分開裝訂(便於穿插翻),不要全部釘成一本。

---

## Speaker binder(#3)的標記建議

PRESENTATION_GUIDE.pdf 是你**手上拿**的,建議用螢光筆預先標起:

- **頁首索引**:「步驟 0 / 1 / 2 / 3 / 4 / 5」+ 「Q11-Q15 v2.0 答辯」
- **黃色螢光**:每步驟的「**講話術**」段落
- **粉紅螢光**:每個 Q 的「**關鍵詞**」結尾(收尾用)
- **紅色筆貼便利貼**:「不要做的事」清單(最後一頁)

---

## 演講前 5 分鐘的擺放順序

```
桌面從左到右:

[筆電開好 Vercel /twin]   [INVESTOR_BRIEF 第 1 張]   [PRESENTATION_GUIDE 你自己手上]
                              ↓
                          [RD_BRIEF 第 2 張等業師翻]
                              ↓
                          [BBU_PROPOSAL / whitepaper_restructured 等深問]
                              ↓
                          [BBU_IMPLEMENTATION_PLAN / whitepaper 完整版 — 桌邊備著]
                              ↓
                          [MIRROR_SETUP — 包包 / 口袋,只在 contingency 拿]
```

---

## 再生命令(若 docs 有 update 要重出 PDF)

```bash
# 重生所有 binder PDF(若 docs 改了)
.venv/Scripts/python scripts/md_to_pdf.py \
  docs/INVESTOR_BRIEF.md \
  docs/RD_BRIEF.md \
  PRESENTATION_GUIDE.md \
  docs/BBU_PROPOSAL.md \
  docs/whitepaper_restructured.md \
  docs/BBU_IMPLEMENTATION_PLAN.md \
  docs/whitepaper.md \
  docs/MIRROR_SETUP.md

# 全部跑完 ~30 秒,output 到 out_pdf/
```

---

## 印刷店 SOP

- **紙質**:80 g/m² A4 一般道林紙(不要厚卡紙,每份 80 頁太重)
- **油墨**:雙面黑白 — 技術圖表黑白也清楚;彩印每份多 NT$ 200 不划算
- **裝訂**:每份**分開騎馬釘**(staples-bound),不要全部釘成一本;便於現場穿插翻
- **數量**:1 套自用 + 1 套備用(萬一咖啡灑了)+ 給每位業師發 1 份 RD_BRIEF + INVESTOR_BRIEF
- **預算**:7 份 × 80 頁雙面 × NT$ 1.5/頁 ≈ NT$ 840(全套)

---

## ATCC 複賽日 packing checklist

- [ ] 筆電(電池充飽 + 充電器)
- [ ] HDMI 線 / Type-C → HDMI 轉接頭(2 個備用)
- [ ] USB-C charger(筆電 + 手機)
- [ ] 紙本 binder × 1 套(7 份分裝)
- [ ] 業師發 brief × N 份(`INVESTOR_BRIEF + RD_BRIEF` 各 8 份)
- [ ] 手機(熱點 backup,若會場 Wi-Fi 慢)
- [ ] **離線 export 整套**:`apps/web/out/` next build 完整 static export,U 隨身碟 backup(萬一 Vercel 掛 → `cd out && python -m http.server 8000`)
- [ ] 雷射筆 / 簡報筆(若主辦有提供也帶自己的備用)
- [ ] 名片(若有準備)

---

## 萬一現場掛掉的 fallback 階梯

| 場景 | 應對 |
|---|---|
| 投影壞 | 紙本 binder 接力 |
| 會場 Wi-Fi 慢 → Vercel 不開 | 手機熱點 + `apps/web/out/` static export(U 隨身碟)+ `python -m http.server 8000` |
| 筆電當機 | 紙本 binder + 口語(已預演 5 分鐘 demo SOP)|
| Make verify 跑當機 / 跑太慢 | **跳過步驟 4**,直接講「5/27 上次量測 70.1s 5/5 chains PASS,verify_all_report.json 在 binder 第 X 頁」 |
| 業師深問你不會答 | 翻 PRESENTATION_GUIDE Q1-Q15 找關鍵詞;或誠實說「這個我們沒驗過,EVT 階段才能答」 |

> **核心心法**:**stay with the binder**。所有要答的內容都在 7 份 PDF 裡;
> 不要試圖即興超出 binder 內容範圍,evaluator 會記得「該誠實的時候誠實」是
> 工程紀律加分點。
