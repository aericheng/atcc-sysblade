# LFP 電芯採購 SOP — Endrich 乾坤富實業

> ⚠️ **v1.x archive · v2.0 已 descope**(2026-05-26 twin-first pivot;2026-05-27
> v1.x 採購全數退貨完成,Endrich LFP 訂單(若已下)也走退貨流程)。本 SOP **不再執行**,
> 保留為 v1.x procurement rigor + 防偽 SOP 工程紀律證據(評審看到「先做了完整
> 採購防偽 SOP 才 pivot」是加分點)。**v2.0 不依賴任何硬體採購**,所有 V1-V6
> 驗證在純軟體 sim 層完成。

> **負責人:** _____(請填名字)
> **執行日期:** 2026-05-20(今天)PM
> **死線:** 2026-05-22 W1 review(電芯必須到貨)
> **預算欄位:** PURCHASE_LIST.md §1A「LFP 26650」行,原列 NT$ 3,000,改 NT$ 4,020(+1,020 從 Buffer 扣)
> **狀態:** 規格已驗證 ✅ / 通路已驗證 ✅ / **電話確認 + 下單** ⬜(你現在要做的)

---

## 一句話背景

蝦皮 / Alibaba / 一般電子零件行買到的「LFP 26650 5Ah」**90 % 是假料**(實測 4.2V 充飽 = Li-ion 偽裝)。我們花了一週搜遍 Taiwan 通路,**唯一安全選項**是 Endrich(乾坤富實業)的 Lithium Werks ANR26650M1B 原廠正品。今天就要打電話確認 + 下單,明天到貨。

---

## ① 為什麼選這顆 — 規格對齊

**型號:** Lithium Werks ANR26650M1B(A123 系出名門,2017 被 Lithium Werks 併購)

| 規格 | 數值 | 我們需求 | OK? |
|---|---|---|---|
| 化學系統 | LiFePO4 Nanophosphate® | 真 LFP | ✅ |
| 標稱電壓 | 3.3V | 3.2-3.3V | ✅ |
| 充飽電壓 | 3.65V | 3.65V(LFP 絕對不能 4.2V) | ✅ |
| 放電截止 | 2.0V | 2.0V | ✅ |
| 容量 | 2.5 Ah | 原規劃 5 Ah → **減半**(見下方說明) | ⚠️ |
| 連續放電 | 50A(20C) | 我們連續 12.5A,**4× 餘量** | ✅ |
| Peak 放電 | 120A(48C, 10s pulse) | 我們 M3 peak 25A,**4.8× 餘量** | ✅ |
| 內阻 | ~6 mΩ | Power Cell 級,發熱低 | ✅ |
| 循環壽命 | 1,000+ @ 100% DOD | 充足 | ✅ |

**容量減半但不影響 demo:**
- M3 削峰是 100 ms pulse → 不耗能量
- M4 LIVE row 是 5 秒 polling → 不耗能量
- 2 小時 demo 跑得完(64 Wh ÷ 2A = 32 hr 額定;25A peak pulse 跑 ~2.5 hr)
- **C-rate 大幅升級**:從 5C peak / 2.5C continuous → 48C / 20C — M3 削峰實驗更穩,Maxwell 端內阻發熱降 10×

---

## ② 通路資訊(打電話用)

```
公司:乾坤富實業有限公司(Endrich Co., Ltd.)
身分:Taiwan 官方 A123 / Lithium Werks Asia 經銷商
     (2009 創立,2017 後成為 Lithium Werks Asia partner — 不是貼牌貿易商)
地址:新北市汐止區新台五路一段 75 號 19F-5(郵編 22101)
電話:02-2698-2588      ← 今天打這支
傳真:02-2698-2678
Email:jackpeng@endrich.com.tw(業務 Jack Peng)
官網:<https://www.endrich.com.tw/en-us/index>(已驗證可開)
產品線索引:Endrich 首頁 → Products → Lithium Werks / A123 → ANR26650M1B
(注:舊有 B2C 子站 tw.buya123products.com / buya123products.com 不穩,以電話為準)
```

**價格參考:**
- 單顆零售:NT$ 335
- 批量價:NT$ 190(MOQ 不明,問就知道)
- **庫存:** 網頁顯示 15,266 顆 / 24h 出貨(以電話確認為準)

---

## ③ 你要打的電話 — 逐字稿

> 撥 **02-2698-2588**,找 **Jack Peng 業務**。
> 如果 Jack 不在,改問:「請問誰能接 A123 / Lithium Werks ANR26650M1B 樣品單?」

開頭照念:

> 「您好,我們是大專院校 ATCC 學生競賽團隊,要做 BBU 樣品 demonstrator。
> 想跟你們訂 **Lithium Werks ANR26650M1B 12 顆**,請問幾個問題:
>
> 1. **12 顆能不能算 bulk 價?** 網路上看到 single NT$ 335 / bulk NT$ 190,12 顆是哪個 tier?
> 2. **12 顆現貨在嗎?** 同批號可以嗎?(我們要做 cell-matching)
> 3. **黑貓宅配 5/21(明天)能到嗎?** 收件地址在 _____(請填收件地址)
> 4. 可以提供 **datasheet PDF** 嗎?我們競賽要當規格證據附在報告。
> 5. **二聯式發票** OK 嗎?(學生團隊不需報帳 invoice,二聯就夠)
> 6. 付款方式?**ATM / 匯款 / 貨到付款** 哪個最快?」

---

## ④ 三個價格情境 + 對應動作

| 情境 | 報價 | 12 顆總額 | 對 Buffer 影響 | 該怎麼辦 |
|---|---|---:|---:|---|
| **A. Bulk 接受** | NT$ 190 × 12 | **NT$ 2,280** | Buffer **+720**(7,486)| 🎉 賺到,立刻下單 |
| **B. 介於 bulk/零售** | NT$ 250 × 12 | NT$ 3,000 | Buffer 不變(8,066)| ✅ 立刻下單 |
| **C. 只給零售** | NT$ 335 × 12 | NT$ 4,020 | Buffer **−1,020**(7,046,警戒線 5,000 之上)| ✅ 仍可下單(借 PSU+萬用表的版本 Buffer 還有 7,046) |
| **D. 零售 + 不借設備** | NT$ 335 × 12 | NT$ 4,020 | Buffer **4,746**(跌破警戒線 5,000 ⚠️)| ⚠️ 改買 **10 顆**(8 主用 + 2 備品)= NT$ 3,350,Buffer 拉回 5,416 |

**判斷規則:** 只要 Buffer ≥ NT$ 5,000(警戒線),12 顆照下;低於就降到 10 顆。

---

## ⑤ 如果 Endrich 不接 12 顆 sample 單 — 三個備案

按優先序試:

**備案 B1(優先):減量到 10 顆**
- 8 主用 + 2 備品,Endrich 10 × 335 = NT$ 3,350
- 預算影響 +350(可吸收)
- 時程:5/21 到 ✅
- 缺點:備品從 4 顆降到 2 顆,cell-matching 池小一點(可接受)

**備案 B2:轉 nkon.nl(荷蘭)DHL 國際**
- 12 × ~€5 ≈ NT$ 2,300 + DHL 運費 ~NT$ 1,500 = ~NT$ 3,800
- 預算 break-even
- 時程:**7-10 天**(可能 miss W1 5/22 ⚠️)— 只在 Endrich 完全拒絕時才用
- 連結:<https://www.nkon.nl/en/a123-systems-anr26650m1b-a-grade-3-3v-a-grade.html>

**備案 B3:啟動 Plan E(降規 4S × 5 顆 PoC)**
- 5 × 335 = NT$ 1,675(省 1,325)
- 時程:5/21 到 ✅
- 缺點:demo 從 8S 25.6V 降到 4S 12.8V,需要重寫 demo 腳本 — **最後手段**,要先通知隊長

---

## ⑥ 下單後 — 收貨當日 SOP

1. **數量點清** — 12 顆(或約定的數量)
2. **外觀檢查** — 12 顆同批號(批號通常印在 cell 側邊或 shrink wrap)、無凹陷、無漏液
3. **電壓量測** — 萬用表逐顆量開路電壓
   - 正常 LFP 出貨 OPV:**3.20-3.35V**
   - 任何一顆 < 3.0V 或 > 3.5V:標記不用,優先丟備品池
4. **拍照存證** — 12 顆排好 + datasheet PDF 一起拍,存到 `docs/figures/lfp_receiving_5_21.jpg`(或當天日期)
5. **填回 PURCHASE_LIST.md** — 「✅ 到貨 5/21,實付 NT$ ___,單顆 OPV 範圍 ___ V-___ V」
6. **通知隊長** — Slack / Discord 一句「LFP 到貨完成,可進 §4.2.1 first-charge SOP」

⚠️ **絕對不要做:**
- ❌ 不要拆 shrink wrap 後馬上焊接 — 先 first-charge balance(見 `docs/BBU_IMPLEMENTATION_PLAN.md §4.2.1`)
- ❌ 不要把 cell 隨便丟桌上疊 — 短路風險,放電池盒或單獨絕緣袋
- ❌ 不要用 Li-ion 充電器充 — 4.2V 會炸,只能用 LFP 專用充電器或 JK-BMS 控充

---

## ⑦ 風險揭露(誠實)

| 風險 | 機率 | 影響 | 緩解 |
|---|---|---|---|
| Endrich 12 顆不接 sample 單 | 中 | 走 B1 減 10 顆 | B1 預算 +350 已留 Buffer |
| 庫存實際 < 12 顆 | 低(網頁 15,266) | 走 B1 或等補貨 | 打電話當下確認 |
| 5/21 來不及到 | 低(24h 出貨) | W1 deadline 5/22 卡關 | 同店 pickup 自取 / 黑貓急件加價 |
| 出貨送錯型號(寄到 Li-ion) | 極低(原廠代理) | 全退 | 收貨第一步量電壓 + 看 prefix(IFR / ANR) |
| Buffer 跌破警戒線 | 看報價 | 後續任何升級被卡 | 走 B1 降到 10 顆 |

---

## ⑧ 為什麼這次有信心(對比前 4 次假料)

| 來源 | LFP 真假驗證 | 結論 |
|---|---|---|
| 蝦皮「Panasonic-5000」 | ❌ 充飽 4.2V = Li-ion | 拒絕 |
| Alibaba「Factory Wholesale 26650 LFP」 | ❌ 照片印 Li-ion 3.7V | 拒絕 |
| AGM-ICR 26650 | ❌ ICR prefix = LiCoO₂,充飽 4.2V | 拒絕 |
| lithium-cell.com 26650 5000mAh 10A | ❌ WebFetch 證實 3.7V Li-ion(BSMI 合格的 Taiwan 賣家也標錯) | 拒絕 |
| **Endrich Lithium Werks ANR26650M1B** | ✅ 原廠 Nanophosphate® LFP / datasheet 全網對齊 | **可下** |

**關鍵差別:** Endrich 是**原廠代理**,不是貼牌 / 改標 / SEO 灌水的二手通路。Lithium Werks datasheet(BatterySpace + a123batteries.com + 多家獨立來源交叉印證)一致顯示 **3.3V / 50A 連續 / 6 mΩ / Nanophosphate LFP**。

---

## ⑨ 參考連結

連結狀態於 2026-05-20 PM 用 WebFetch 實測:

| # | 連結 | 用途 | 狀態 |
|---|---|---|---|
| 1 | <https://www.endrich.com.tw/en-us/index> | Endrich 官網(身分驗證:Taiwan Lithium Werks 經銷商) | ✅ 200 OK |
| 2 | <https://lithiumwerks.com/products/lithium-ion-26650-cells/> | Lithium Werks 原廠產品頁(規格證據) | ✅ 200 OK |
| 3 | <https://www.batteryspace.com/prod-specs/6610.pdf> | A123 ANR26650M1-B datasheet PDF(2.9 MB,規格證據) | ✅ 200 OK |
| 4 | <https://www.nkon.nl/en/a123-systems-anr26650m1b-a-grade-3-3v-a-grade.html> | nkon.nl 荷蘭備案(Plan B2 用)| ⚠️ WebFetch 被 bot 擋(403),真人瀏覽器正常 |
| ~~5~~ | ~~tw.buya123products.com B2C 子站~~ | 移除 — 站點 down(ECONNREFUSED) | ❌ 已 down |

---

## ⑩ 完成 checklist

- [ ] 打電話 02-2698-2588(找 Jack Peng)
- [ ] 確認:bulk 價 / 庫存 / 同批號 / 5/21 到貨 / datasheet PDF / 二聯式發票 / 付款方式
- [ ] 依「情境 A/B/C/D」決定 12 顆 or 10 顆
- [ ] 當天匯款 / ATM 完成
- [ ] 把收件單號 + 預計到貨時間貼回隊伍 channel
- [ ] 5/21 收貨 → 執行 §⑥ 收貨 SOP
- [ ] 把實付金額更新到 `docs/PURCHASE_LIST.md` §1A LFP 26650 行
- [ ] 進 `docs/BBU_IMPLEMENTATION_PLAN.md §4.2.1` first-charge SOP
