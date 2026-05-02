# v2.1 → v2.2 整合 SOP(2 天內可完成,2026-05-03)

本目錄是技術選手交給商業選手的「企畫書 v2.1 → v2.2 補強包」。商業選手
拿這 4 個 markdown 直接複製貼到 v2.1 .docx / .pages / .key 原檔,**不需
動 PDF 排版**。

## 4 個交付物

| 檔案 | 用途 | 預計插入位置 | 估時 |
|---|---|---|---|
| `appendix_d_technical_validation.md` | **新增** 附件 D 技術交付物實證(整份新章節)| v2.1 附件 C 之後,占約 1.5–2 頁 | 30 min(複製貼上 + 排版)|
| `patch_appendix_b.md` | **取代** v2.1 附件 B 軟體技術棧內容 | v2.1 第 16-17 頁附件 B 整段 | 15 min |
| `patch_cover_and_E3.md` | **修訂** 封面 + §E.3 + §F.4(可選 Q6/Q7)| 封面 / 第 8 頁 / 第 12-13 頁 | 20 min |
| `README.md`(本文件)| 整合 SOP 與檢核清單 | — | — |

## 整合工作流(建議)

### 1. 開 v2.1 原檔副本為 v2.2(20 min)

* Word / Pages / Keynote 任一,確認排版工具能保持原 v2.1 樣式
* 檔名建議:`Sysblade_HyperBuffer_Proposal_v2.2.docx`(或 .pdf 來源檔)
* 在封面增加 v2.2 修訂日期 2026-05-03

### 2. 複製貼上三條補丁(1 hr)

按以下順序套用,避免章節編號錯亂:

1. **patch_cover_and_E3.md** 第 1 條(封面 URL 4 行)→ v2.2 封面
2. **patch_cover_and_E3.md** 第 2 條(§E.3 第 1 段改寫)→ v2.2 第 8 頁
3. **patch_appendix_b.md** 整段 → 取代 v2.2 附件 B(第 16-17 頁)
4. **appendix_d_technical_validation.md** 整份 → 插入 v2.2 附件 C 後
   (新第 17–19 頁,v2.2 變 19–20 頁)
5. **(可選)patch_cover_and_E3.md** 第 3 條 Q6 / Q7 → v2.2 §F.4 第 12-13 頁

### 3. 排版檢核(30 min)

* 字型 / 段距 / 表格樣式對齊原 v2.1
* 表格內數字置右對齊
* 程式碼字串(`models/lstm_rul.onnx`、`scripts/...`)用等寬字
* 行內公式與 § 編號樣式對齊原文
* 重新編目錄(若 Word / Pages 有自動目錄功能)

### 4. 數字最終一致性檢核(30 min)

開 GitHub `data/processed/*.json` 與 v2.2 對 4 條最關鍵數字:

| v2.2 引用 | JSON ground truth | 容差 |
|---|---|---|
| 8.38 % MAPE | severson_model_eval.json `headline.best_random_full.test_mape_pct_median` | ± 0.05 |
| 13.87 % cross-batch | 同上 `results[]` 找 kind=bagged_ols, split=cross_batch, filter=xstrict | ± 0.05 |
| 19.10 % LSTM | model_validation.json `metrics.test_mape_pct` | ± 0.05 |
| 3.49× INT8 compression | lstm_quantization_report.json `size.compression_ratio` | ± 0.01 |

若任一不對,立刻找技術選手確認來源,不要自行修改 v2.2 數字。

### 5. 匯出 PDF + 提交檢核(15 min)

* 匯出 v2.2 PDF(同 v2.1 設定:A4、PDF/A 相容、字型內嵌)
* 檢查連結:封面 GitHub URL + Live demo URL 點下去能跳到正確頁面
* 檔案大小 < 10 MB(若超過用 Acrobat / pdfsizeopt 壓縮)
* 命名:`Sysblade_HyperBuffer_Proposal_v2.2.pdf`

### 6. 同步白皮書 changelog(15 min)

技術選手在 `docs/whitepaper.md` 文件版本歷史加一行:
```
* v1.2 — 2026-05-03。對應企畫書 v2.2 附件 D / 附件 B 修訂、§E.3 /
  §F.4 加 URL + Q6/Q7。技術數字未變動,僅 v2.1 PDF 整合補強。
```

## 業師現場 Q&A 對照

評審看 v2.2 PDF 後若打開 demo / GitHub,以下對照保證 30 秒內找到答案:

| 業師可能問 | v2.2 內哪一節 | 同步 GitHub 路徑 |
|---|---|---|
| < 10 % MAPE 實際達多少? | §E.3 / 附件 B (b) / 附件 D §D.1 | `data/processed/severson_model_eval.json` `headline` |
| INT8 量化準度退化? | 附件 D §D.2 | `data/processed/lstm_quantization_report.json` |
| 跨化學能不能直接部署? | 附件 D §D.4 / §F.4 Q7 | `data/processed/cross_dataset_mape.json` |
| TCO 33 % 怎麼算的? | §G.3 表 + 附件 B (a) | `apps/web/src/lib/tco.ts` |
| 1000 台是真的還是 mock? | 附件 B (c) + 附件 D 序言 | `apps/web/public/scenarios/fleet_devices.json` + `.simulated-watermark` CSS |
| 這數字怎麼確保不是事後調的? | 附件 D §D.5 reproducibility CI | `.github/workflows/check.yml` + `scripts/check_whitepaper_numbers.py` |

## 不要做的事

* **不要在 v2.2 動 §G.3 TCO 表的數字**(已 100 % 對齊 `tco.ts`)
* **不要把 8.38 % 寫成「cross-batch」**(那是 random split + xstrict + bagged-GBT)
* **不要把 best-seed 5.93 % 拿來宣稱**(屬 cherry-pick,業師會抓)
* **不要重寫 v2.1 §C.1 JLL 18.6 % / 15 %**(那是 v2.1 已驗證的真實 JLL 數字;
  fleet 模擬 49/27 在附件 D 內已誠實標明為「模擬假設非 JLL 直接引用」)
* **不要刪掉「未上實機資料前不承諾 < 5 %」**(v2.1 附件 B 原文,維持承諾邊界)

## 整合完成後的最終檢核(交給商業選手)

```
□ v2.2 封面有 GitHub + Live demo URL
□ 附件 B 三條 (a)/(b)/(c) 都含 measured 數字
□ 附件 D 5 段(D.1–D.5)整段插入,含 D.6 數字溯源表
□ §E.3 第 1 段已改為「已開發並部署」+ URL
□ (可選)§F.4 加 Q6 / Q7
□ 4 條最關鍵數字對齊 GitHub JSON
□ 匯出 PDF 連結可點
□ 檔案大小 < 10 MB
□ 提交平台上傳成功
```
