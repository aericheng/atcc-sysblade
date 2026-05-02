# Proposal Figures

Visual assets for the 5/5 企劃書 — designed to swap blocks of text for figures.

| File | 用途 | 如何用 |
|---|---|---|
| `demo_qr.svg` | 指向 https://sysblade-atcc.vercel.app 的 QR code | 直接放封面 / 結尾頁 |
| `screenshot_guide.md` | 4 張 demo 截圖 + callout 標註指引 | 照指引截圖,在 Word/PPT 加箭頭 |
| `tco_comparison.svg` | TCO 10 年成本對比 stacked bar | 直接內嵌(向量圖,可任意放大) |
| `architecture.mmd` | 系統架構圖 Mermaid source | 貼到 https://mermaid.live → Export PNG/SVG |
| `tam_sam_som.svg` | TAM/SAM/SOM 同心圓($3.5B / $1.4B / $70M) | §A 市場規模章節主視覺 |
| `persona_journey.svg` | Tier-2 colo Mark Chen persona + 5 階段旅程 | §C / §F 對應商業面論述 |

## Architecture diagram 渲染步驟

1. 開啟 https://mermaid.live
2. 把 `architecture.mmd` 整份貼到左邊編輯區
3. 右上角 **Actions → PNG** 或 **SVG** 下載
4. 建議匯出尺寸:1600×900 (放 16:9 投影片) 或 1200×800 (放 A4 直式)

## 如果 mermaid.live 太陽春,本地渲染:

```bash
npm i -g @mermaid-js/mermaid-cli
mmdc -i docs/figures/architecture.mmd -o docs/figures/architecture.png -w 1600 -H 900 -b transparent
```

## SVG 在 Word/PowerPoint

- Word 365 / PPT 365:**插入 → 圖片 → 此裝置** 直接吃 SVG
- Word 2019 以下:先用 Inkscape 或 mermaid-cli 轉 PNG (300 dpi)

## 對應企劃書位置建議

| 圖 | 章節 | 位置理由 |
|---|---|---|
| 封面 + QR | 封面頁 | 評審當場可掃,首因效應 |
| TAM/SAM/SOM 同心圓 | §A 市場規模 | 一頁打包 $3.5B → $1.4B → $70M 的三層收斂 |
| Persona Journey | §C 客戶分析 / §F 執行時程 | 把抽象的 18 個月里程碑變成「一個人的故事」 |
| Architecture (Mermaid) | §D 解決方案概觀 | 一頁交代「我們做什麼」 |
| TCO bar | §G 商業模式 / 財務 | 把 33% 節省視覺化 |
| Demo screenshots × 4 | §H 產品實證 / Appendix | 每張對應一個 SaaS 模組 |
| QR (再放一次) | 結尾「立即試玩」 | 評審帶走的最後一個動作 |
