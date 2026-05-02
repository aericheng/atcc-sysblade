# Demo Screenshot Annotation Guide

For embedding into the proposal PDF. **Easier path:** the 4 base screenshots are already captured to `docs/figures/screenshots/` by `capture_screenshots.ps1` (headless Chrome, 1440×2400). Just open them, add callouts in PowerPoint / Word / Figma per the guide below, save as PNG.

To re-capture (e.g. after deploying UI changes):

```powershell
pwsh -File docs/figures/capture_screenshots.ps1
# or against local dev:
pwsh -File docs/figures/capture_screenshots.ps1 -Base "http://localhost:3000"
```

If you'd rather frame manually, use Snipping Tool (Win+Shift+S) on a **1440×900** browser window for consistent framing.

---

## Shot 1 — Landing (`/`)

**What to capture**: scroll to the four headline cards (3.5×, 5.7×, 10 yr, ≈33%). Frame all four in one shot.

**Callouts to add**:
- → **3.5×** : "壽命提升 vs 傳統 NMC BBU"
- → **5.7×** : "突波吸收能力 (LIC + LFP hybrid)"
- → **10 yr**: "目標可用壽命 (DoD 80%, 25°C)"
- → **≈33%**: "10-year TCO 節省"

**Caption**: "Sysblade HyperBuffer 四大頭條指標 — 來源:PyBaMM DFN 模擬 + Severson MIT dataset 校驗 (n=1000 cells)"

---

## Shot 2 — TCO Calculator (`/tco`)

**What to capture**: full page with default inputs (1000 racks, $0.10 / kWh, PUE 1.4). Make sure both the input form (left) and the cost breakdown (right) are visible.

**Callouts to add**:
- ⬅ Inputs panel : "可調 rack 數 / 電價 / PUE / 碳排係數"
- → Total saving : "$9,600 per rack × 1000 = $9.6M / 10 年"
- ↓ Payback line : "回收期 ≈ {實際數字}年"
- ↓ CO2 line : "≈ {實際數字} t CO₂e 減量"

**Caption**: "TCO Calculator — 投資人/採購可即時試算自家車隊的 10 年總持有成本與碳排影響"

---

## Shot 3 — Battery Digital Twin (`/twin`)

**What to capture**: split screen with the LFP-only ↔ Hybrid 切換按鈕在頂部、SOH 衰減曲線(主圖)+ scope chart(底部小圖)同框。**先點 Hybrid 模式**再截。

**Callouts to add**:
- ⬆ Mode toggle : "LFP-only vs LIC+LFP Hybrid 對比"
- → SOH curve : "DFN 物理模擬 1000 顆 cell 並行,平均 + 95% CI"
- ↓ Scope chart : "ms 級突波 — LIC 在 30 ms 內吸收,主電池零循環"

**Caption**: "Battery Digital Twin — PyBaMM DFN + LSTM RUL 共同預測,MAPE < 10% (Severson 9.1%)"

---

## Shot 4 — Fleet Dashboard (`/dashboard`)

**What to capture**: 上半的 Tier-1/2/3 統計卡 + 下半的 US fleet map(綠/橙/紅點)。**水印 "SIMULATED DATA" 必須清晰可見** — 這是 v2.1 §B 的合規線。

**Callouts to add**:
- → Tier-3 紅點 : "status === 'early_aging' = SOH<0.85 OR RUL<800"
- ⬆ Watermark : "依 v2.1 規範,模擬資料一律標示"
- → 數量總和 : "Tier-1+2+3 = 1000 racks(來自 PyBaMM 場景)"

**Caption**: "Fleet Dashboard — 1000 機櫃即時健康狀態,提前 800 cycles 觸發 Tier-3 替換預警"

---

## QR Code

`docs/figures/demo_qr.svg` — 指向 `https://sysblade-atcc.vercel.app`。建議放在企劃書封面 / 結尾頁,標註 "掃 QR 立即試玩 demo"。

---

## 排版建議

- 4 張截圖各佔半頁 (A4),圖説放在圖下方 8 pt italic
- 每張圖加 1px 灰邊框,讓 callout 箭頭有對比
- 同一頁不要超過 2 張圖,否則 callout 會擠
