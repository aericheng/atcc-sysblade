# 修訂:封面 + §E.3 加 GitHub / Live demo URL(v2.1 → v2.2)

v2.1 第 9 頁 §E.3 提到「GitHub 公開部分模組」但未給具體 URL,業師無法直接
驗證。本修訂在兩處顯式列出 URL,評審 30 秒內可從 PDF 跳到實作。

---

## 修訂 1:封面(第 1 頁)新增 1 行

在「v2.1 修訂版 · 已通過完整技術與邏輯驗證」下方,加入:

```
GitHub: https://github.com/aericheng/atcc-sysblade
Live demo: https://sysblade-atcc.vercel.app
技術白皮書: docs/whitepaper.md(1100 行,含完整方法論)
本書附件 D 為技術交付物實證摘要(2026-05-03 更新)
```

---

## 修訂 2:§E.3 與程式選手協作的軟體生態系(v2.1 第 8 頁)

v2.1 §E.3 第 1 段末尾原句:
> 我們的工程選手 (具 Python ML + React/Next.js) 將開發三件套:

**改寫為**:
> 我們的工程選手(具 Python ML + React/Next.js)已開發並部署三件套至
> **<https://sysblade-atcc.vercel.app>**(GitHub `aericheng/atcc-sysblade`,
> 含 1100 行技術白皮書 `docs/whitepaper.md` 與 reproducibility CI gate);
> 各模組實作細節 + measured 結果見**附件 B**(stack + 實證)與**附件 D**
> (數字溯源):

(原本三件套的 (a)/(b)/(c) bullet 由附件 B 修訂版本接續)

---

## 修訂 3:§F.4 業師質詢預演(v2.1 第 12-13 頁,可選)

v2.1 §F.4 已有 5 題 Q1–Q5(財務 / 市場 / 競爭 / 工程)。建議在 Q5 後加
**Q6(軟體 / 工程)**:

> **Q6(軟體):你說 Battery Twin 跑出 < 10 % MAPE,實際做到幾 %?**
>
> Severson 13-feature paper-aligned model 配合 K=24 bagged-GradientBoosting
> ensemble + extra-strict cell filter(`cycle_life ≥ 400`,134/138 cells),
> Severson random split 10-seed median test MAPE **8.38 %、R² 0.89**
> (per-seed [5.93, 12.91],7/10 seeds < 10 %)— **首次低於 v2.1 附件 B
> 「< 10 %、Severson 9.1 % 對標」承諾**。Cross-batch 由 bagged-OLS 達
> 13.87 %、R² +0.21(GBT 跨 protocol 退化到 17–22 %,部署 SOP fallback)。
> LSTM augmented 188-cell test 整體 19.10 %、R² 0.86,作為 `/dashboard`
> 1000 台 fleet 推論引擎。INT8 動態量化後 size 從 219 KiB → 63 KiB(3.49×
> 壓縮),ΔMAPE 僅 +0.10 pp,R² 不變 — STM32N6 NPU 部署 go decision 已
> 拿到。完整數字見附件 D 與 GitHub `data/processed/severson_model_eval.json` /
> `lstm_quantization_report.json`。**未上實機資料前不承諾 < 5 %**(維持 v2.1
> 原承諾邊界)。

> **Q7(工程):跨化學部署有沒有限制?**
>
> 有,Severson(LFP)→ NASA(NMC)cross-dataset 5/5 feature 全部 OOD、
> z-distance 5–65 σ。**模型不可直接跨化學部署,產品 SOP 必須含 per-chemistry
> calibration cycle**(每批新採購 LFP 模組 / 跨化學 vendor 切換時觸發)。
> 此誠實聲明寫進客戶交付物,是商業差異化武器(競品 KULR、Eaton 都沒做跨化學
> 量化驗證)。詳附件 D §D.4。
