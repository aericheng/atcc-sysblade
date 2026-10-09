# A3｜RUL 模型方法論補強實驗（口試前自我稽核）

> 本檔為口試前自我稽核摘要，2026-10-09 自稽核工作區複製進 repo；文中路徑以 repo 根目錄為準，標「稽核過程紀錄（未入 repo）」者為未納入版控的驗收紀錄。

> 產出日：2026-10-09。目的：把真相量出來，不是讓數字好看。結果變差的地方照實寫。
> 腳本：`atcc/scripts/audit/ml_*.py`；結果：`atcc/data/processed/audit/ml_*.json`（每個 JSON 都有 `_meta`，含版本與重跑指令）。
> 環境：Python 3.11.9、torch 2.13.0+cpu、scikit-learn 1.9.0、numpy 1.26.4、scipy 1.17.1、pandas 3.0.5（`ml_e1_tcn_multiseed.json:_meta.versions`）。原始報告用 torch 2.11，所以 TCN 數字不會逐位相同。
> 所有 JSON 路徑以 `檔名:欄位.子欄位` 標示，下文簡寫：`E1A`＝`ml_e1a_mv_regime_metrics.json`、`E1`＝`ml_e1_tcn_multiseed.json`（`summary.<protocol>.<key>`）、`EX`＝`ml_e1_extras.json`、`E3`＝`ml_e3_severson_nested.json`。

---

## 0. 結論先行

1. **8.38% 沒有優於論文。** 8.38% 可以逐位重現（E3:`repro.xstrict_bagged_gbt_median`＝8.38），但它是 24 組「過濾 × 模型」在測試集上比出來的最小值（E3:`repro.grid_min_config`）。改用巢狀選擇（設定只在訓練資料內用交叉驗證選）後：論文式過濾（≥200）是**中位數 12.69%**（平均 12.41 ± 2.33），xstrict（≥400）是**中位數 9.47%**（9.93 ± 1.64）。論文式條件下比 9.1% 差約 3.6 pp。xstrict 的 9.47% 跟 9.1% 同量級，但它的測試母體已經排除最短命的電芯，條件不對等。
2. **early-stop 改用獨立驗證集後，TCN 的誤差變大，而且很不穩定。** 原協定（early-stop 看測試集）跑 10 種子是 25.2 ± 6.4%（E1:`orig.tcn_leaky.all.mape_pct`），18.15% 落在這個分布的低端。改用獨立 val 後，主協定的中位數是 **28.2%**，平均 49.3 ± 44.7%，10 個種子裡有 3 個超過 60%（seed 3、5、8；E1:`main.tcn.all.mape_pct`）。
   - **崩潰歸因**：有三顆電芯會被預測到離譜的量級（EX:`main.per_seed[*].tcn_worst_cell`；E1:`per_seed[*].tcn_pred_test`）。
     - b1c18：真值 691，seed 3 預測 27,534，seed 8 預測 13,967。它的輸入本身就異常：相對 Severson 全體，最大 z-score 75.5（verifier 獨立重算，見 稽核過程紀錄（未入 repo）：`verify-A3.md`，repo JSON 裡沒有這個數字）。
     - b2c15：真值 209，seed 3 預測 3,313，seed 5 預測 1,903。它是 Severson 的離群電芯，最大 z-score 6.1（同出處）。
     - bbu_c009：真值 8,413，seed 5 預測 59,957，讓 seed 5 的 BBU 子集 MAPE 衝到 90.4%（E1:`per_seed`，main seed 5 的 `tcn.bbu.mape_pct`）。
   - **機制**：原本 MV（seed 42）的切分裡，這三顆全部落在 train（`model_validation.json` 的 `predicted_vs_actual[*].split = "train"`），MV 的「train」也包含 cal，所以更精確地說，這三顆不在 MV 的 37 顆測試集裡，單一種子的 18.15% 從來沒有被它們考驗過。b1c18 一旦進了 test，模型多半會崩。所有協定中 b1c18 在 test 的情況共 5 次，其中 4 次 MAPE ≥ 39.6%：
     - 原協定 seed 3：39.6%，是原協定分布的最大值。
     - main seed 3：163.5%，就算看 test 做 early-stop（洩漏版）也還是 92.2%。
     - main seed 8：76.3%。
     - main_t60 seed 3：221.4%。
     - 唯一的例外是 main_t60 seed 8：30.7%。
     
     （E1:`per_seed[*].test_ids` 與對應的 `tcn` / `tcn_leaky.all.mape_pct`。）有證據的部分：b1c18 進 test 時多半出大錯。**推論**：seed 42 偏低有一部分可歸因於 b1c18 不在測試集，但不能說是主因——原協定下 bbu_c009 進 test 的 s0/s1/s8 為 18.25/32.0/26.84%、b2c15 進 test 的 s9 為 24.21%，兩者都沒讓模型崩；三顆都不在 test 的 5 個原協定種子為 19.51–24.75%（中位數 21.6%），仍全部高於 seed 42 的 18.15%（本機重跑 17.21%）。seed 42 偏低仍有一部分無法用這三顆解釋（數字見 稽核過程紀錄（未入 repo）：`verify-A3-r2.md`）。
3. **在同一切分下，bagged-GBT 每個種子都贏 TCN。** GBT 整體 MAPE 14.4 ± 1.9%，TCN 中位數 28.2%，10/10 個種子都是 GBT 較好（E1:`main.diff_mape.gbt_minus_tcn_on_gbt_cells.all`）。所以「用 18% 的 TCN、不用 GBT」只能用部署格式（可靜態 INT8 量化）來解釋，精度上不成立。
4. **TCN 在 BBU 合成電芯上「有一點」排序能力，但證據弱、而且是自己比自己。** MV 那個單一種子確實等於常數（19.13% 對 19.11%，R² 0.216）。多種子之下，BBU 子集的中位數是 15.2%，常數是 21.1%，10 個種子裡 TCN 贏 7 個；Spearman 中位數 0.76。但平均值（22.0 ± 24.3%）因為一個種子崩掉而比常數差。外插測試（最溫和的 20% 合成電芯）沒有崩：TCN 20.9 ± 10.7%，常數 40.3%，GBT 32.2%。不過標籤和特徵出自同一個生成器，**這些都不是真實 BBU 的精度證據**。
5. **conformal 90% 只在同分布下成立；一換批次就失效。** 主協定下（cal 獨立）整體覆蓋率是 91.6%（339/370），Severson 89.3%，BBU 98%，名目上可信。但 BBU 區間中位寬度約 15,000 循環，實務上沒有用。把 Severson b3 整批留作測試時，覆蓋率掉到 **39.8%**（175/440）；用 BBU 校準、拿來套 Severson 也只有 67.4%。

---

## 1. 五個口試問題（每題 ≤5 行）

**Q1「8.38% 真的優於論文嗎？」**
不是。8.38% 是 24 組設定在測試集上挑出的最小值（E3:`repro.grid_min_median`），而且用了 cycle_life ≥ 400 的過濾。改成巢狀選擇、測試集只評估一次：論文式過濾是中位數 12.69%（E3:`nested_summary.paper_ge200.nested_outer_mape.median`），比 9.1% 差。xstrict 是 9.47%（`…xstrict_ge400…median`），跟論文同量級，但測試母體不同。論文的固定切分我們沒有重現，所以兩邊本來就不能直接比「優劣」。

**Q2「TCN 在 BBU 上有預測能力嗎？」**
在合成資料上有一點排序能力，但不穩定，而且不能拿來代表真實 BBU。多種子 BBU 子集：TCN 中位數 15.2%，常數 21.1%，TCN 在 7/10 個種子較好；Spearman 中位數 0.76；平均 22.0 ± 24.3%（E1:`main.tcn.bbu.*`、`main.const.bbu.*`、`main.diff_mape.tcn_minus_const.bbu`）。MV 那次單一種子就等於常數（19.13 對 19.11，E1A:`tcn_mv.bbu`、`baseline_regime_median_train151.bbu`）。標籤和特徵出自同一條公式，真實 BBU 精度目前沒有任何證據。這點我已經逐行查過 `scripts/generate_bbu_duty_cells.py`：severity 是 ambient、C-rate、DoD、events/yr 的決定性函數（:103-107），壽命由 severity 決定性算出（:126-145），特徵也直接用同一組參數生成（:166-183）。

**Q3「為什麼用 18% 的 TCN，不用 GBT？」**
精度上沒有理由。同一切分下，GBT 14.4 ± 1.9%，TCN 中位數 28.2%，GBT 在 10/10 個種子較好（E1:`main.gbt.all.mape_pct`、`main.diff_mape.gbt_minus_tcn_on_gbt_cells.all`）。換批次（b3）時差距更大：GBT 18.2%，TCN 50.6%（E1:`lbo_b3.*`）。唯一的理由是部署格式：TCN 全是 Conv/Gemm，可以靜態 INT8 量化、跑在 NPU 上。部署還沒落地之前，應該報告的是 GBT。唯一 TCN 較好的情境是合成參數區最溫和的那一端（外插距離很小，見 2.3）（TCN 20.9%，GBT 32.2%，E1:`extrap.*`）。原因我**推論**是樹模型無法外插到訓練標籤範圍以外。佐證：seed 0 的 GBT 預測全部落在 5,796–6,759，低於訓練中 BBU 的最大標籤 7,950；真值則是 8,912–13,131（E1:`per_seed`，extrap seed 0 的 `extrap_info`）。這個結果也是合成資料。

**Q4「conformal 90% 可信嗎？」**
在同分布、cal 獨立的條件下大致可信：10 種子合計覆蓋率 91.6%（339/370），Severson 89.3%，BBU 98%（E1:`main.cov.pooled_cal.*.pooled_rate`）。但有三個限制。第一，BBU 區間中位寬度約 15,000 循環，實務上沒有用（`main.width.pooled_cal.bbu`）。第二，整批換成 b3 時，覆蓋率掉到 39.8%（`lbo_b3.cov.pooled_cal.all`）。第三，用 BBU 校準去套 Severson 只剩 67.4%（`main.cov.bbu_cal_only.severson`）。結論：只在同分布下成立，部署到新批次或新工況前，必須用現場資料重新校準。

**Q5「early-stop 用測試集修正後，數字變多少？」**
從 18.15% 變成主協定的中位數 28.2%，而且有 3/10 個種子崩到 60% 以上（E1:`main.tcn.all.mape_pct`；median APE 17.7%，EX:`main.tcn_median_ape`）。在同一份 train、同一份 test 上，只改 early-stop 的依據，獨立 val 比看測試集差，中位數差 +4.0 pp（`main.diff_mape.tcn_minus_tcn_leaky.all`）；訓練集維持 60% 的版本差 +10.4 pp，而且 0/10 個種子較好（`main_t60.…`）。另外，原協定本身換 10 個種子就是 25.2 ± 6.4%（`orig.tcn_leaky.all.mape_pct`）。原協定裡三顆異常電芯都不在 test 的 5 個種子，也全都高於 18.15%（19.51–24.75%），所以 18.15% 是單一種子的偏低值。有證據的是：b1c18 進了 test 的 5 次中，有 4 次 MAPE ≥ 39.6%，連洩漏版也一樣（見第 0 節第 2 點）；seed 42 偏低的完整原因無法只用這幾顆電芯解釋（推論）。

---

## 2. 數字表

### 2.1 E1-a：MV 既有預測（seed 42、n_test = 37，這 37 顆同時也是 early-stop 的依據）

| 子集 | TCN MAPE | TCN R² | TCN ρ | 常數（train+cal 151 顆中位數） | 常數（真 train 114 顆中位數） |
|---|---|---|---|---|---|
| 整體 | 18.15% | 0.892 | 0.918 | 25.55%（R² 0.845） | 24.98% |
| Severson（23） | 17.56% | 0.457 | 0.699 | 29.46% | 29.09% |
| BBU（14） | **19.13%** | **0.216** | 0.829 | **19.11%** | **18.23%** |

出處：E1A:`tcn_mv.*`、`baseline_regime_median_train151.*`、`baseline_regime_median_train114.*`。用真正的 114 顆訓練電芯算中位數時，常數在 BBU 上反而比 TCN 好 0.9 pp。BBU 的預測範圍 4,419–8,808，真值 5,103–12,657（`test_prediction_range`）。另外確認：seed 42 重建的測試集電芯與 MV 完全一致（`split_reconstruction_matches_mv = true`）。

### 2.2 E1＋E2：多種子、無洩漏（10 種子，每種子 test 37 顆＝27 Severson + 10 BBU）

MAPE 是 10 種子的平均 ± 標準差（中位數）。

| 模型 | 整體 | Severson | BBU | BBU R²（中位數） |
|---|---|---|---|---|
| TCN（val 做 early-stop） | 49.3 ± 44.7（**28.2**） | 59.4 ± 60.4（34.4） | 22.0 ± 24.3（**15.2**） | 0.356 |
| TCN 洩漏版（同 train，看 test 停） | 34.0 ± 21.9（27.6） | 40.8 ± 30.5（29.6） | 15.5 ± 4.9（14.9） | 0.442 |
| bagged-GBT（9 特徵，只用 train） | **14.4 ± 1.9**（14.7） | 14.4 ± 2.9（13.9） | 14.3 ± 4.3（14.9） | 0.328 |
| 常數（分工況 train 中位數） | 35.8 ± 4.7（35.5） | 41.4 ± 7.6（40.1） | 20.4 ± 5.7（21.1） | −0.273 |

出處：E1:`summary.main.{tcn,tcn_leaky,gbt,const}.{all,severson,bbu}.mape_pct`、`.bbu.r2`。

逐種子成對比較（E1:`summary.main.diff_mape.*`）：
- TCN − 常數：整體中位數 −5.6 pp，BBU 中位數 −4.8 pp，TCN 在 7/10 個種子較好（整體和 BBU 都是）。
- GBT − TCN：整體中位數 −14.4 pp，GBT 在 10/10 個種子較好；BBU 中位數 −0.4 pp，6/10。
- TCN − 洩漏版：整體中位數 +4.0 pp；乾淨版只在 4/10 個種子較好。
- 穩健統計（EX:`main.*`）：median APE 是 TCN 17.7%、GBT 9.2%、常數 27.7%。10 個種子裡有 6 個至少一顆測試電芯的 APE 超過 100%。

訓練集大小敏感度（`main_t60`，60/10/10/20，train 115 顆，跟原始的 114 顆相當）：TCN 中位數 31.1%（49.9 ± 60.6%），洩漏版 21.0%（24.4 ± 10.4%），乾淨減洩漏的中位數 +10.4 pp、0/10 個種子較好；GBT 中位數 14.0%（14.0 ± 1.6%）；常數中位數 36.1%（35.7 ± 4.8%）（E1:`summary.main_t60.*`）。所以「訓練集被切小」不是 TCN 變差的主因。

原協定重跑（random 60/20/20、early-stop 看 test，10 種子；E1:`summary.orig`）：TCN 25.2 ± 6.4%（範圍 18.3–39.6）；BBU 14.4 ± 5.5%，常數 21.3%。seed 42 在 torch 2.13 下重跑是 17.21%，原報告是 18.15%（`orig_seed42_rerun`）。

### 2.3 E1-b：外插（最溫和 20% 合成 BBU，10 顆，severity 0.069–0.102；訓練中 BBU 的最低 severity：seed 0 是 0.114，seed 1–9 是 0.103–0.104。外插距離其實很小，見下方說明）

| 模型 | MAPE 平均 ± sd（中位數） | 和常數比（逐種子） |
|---|---|---|
| TCN | 20.9 ± 10.7（18.6） | 10/10 較好 |
| GBT | 32.2 ± 3.6（32.1） | GBT 比 TCN 差：TCN 在 8/10 個種子較好 |
| 常數 | 40.3 ± 1.2 | — |

出處：E1:`summary.extrap.*`。真值 8,912–13,131。訓練中 BBU 的最大標籤，seed 0 約 7,950，seed 1–9 是 8,712–8,777（E1:`per_seed`，extrap 各種子的 `extrap_info.train_bbu_max_label` 與 `train_severity_min`）。

**外插距離的實話**：測試集的 severity 上限是 0.102，訓練集的下限在 seed 1–9 是 0.103–0.104，兩者幾乎相接。所以這個測試主要量的是「最溫和那一端」的表現，不是遠距離外插，結論不宜外推。

TCN 有一半的預測超出訓練最大值（`share_tcn_pred_above_train_bbu_max` 中位數 0.5）；GBT 的預測全部壓在 5,796–6,759（seed 0）。在這 10 顆裡，TCN 的 R² 中位數是 −2.4，Spearman 中位數 0.35。（推論）它可能主要抓到「比較長命」這個方向；有數據的是組內排序能力弱。TCN 沒有崩，但這是合成資料。

### 2.4 E4：conformal 90% 覆蓋率（α = 0.10；MC-dropout 100 次＋split conformal，用原函式）

| 情境 | 整體 | Severson | BBU | 中位寬度（循環） |
|---|---|---|---|---|
| main，混合 cal（37 顆） | 91.6%（339/370）；平均 0.916 ± 0.067 | 89.3%（241/270） | 98%（98/100） | Sev 約 1,031；BBU 約 15,132 |
| main，只用 Severson cal → 測 BBU | — | 92.2% | 100%（100/100） | BBU 約 17,406 |
| main，只用 BBU cal → 測 Severson | — | **67.4%**（182/270） | 89% | Sev 約 659 |
| main，分工況（Mondrian） | 91.4% | 92.2% | 89% | BBU 約 8,210 |
| main_t60（cal 只有 18 顆） | 92.4% | 89.6% | 100% | — |
| **leave-batch-out：b3 當測試**（44 顆） | **39.8%**（175/440） | 同左 | — | 約 688 |
| b3，只用 Severson cal | 47.5% | | | |
| extrap（最溫和 BBU） | 99%（99/100） | | | 約 19,058 |

出處：E1:`summary.<protocol>.cov.<cal 方式>.<subset>`（`pooled_rate`、`mean`、`sd`）、`width.*.median`。百分比是 10 種子合計的覆蓋率（pooled），平均 ± sd 是逐種子覆蓋率的統計。原始 MC-dropout 區間在 main 是 98.4%（過寬），在 b3 只有 76%。

### 2.5 E3：Severson 頭條重評（Full 13 特徵、random 70/30、10 種子）

**重現**（E3:`repro`）：xstrict ＋ bagged-GBT ＝ **8.38**（逐種子 7.80…12.91，與既有 JSON 完全一致）；論文式 ＋ bagged-GBT ＝ **12.49**。24 組設定與既有 JSON 的最大差距是 0.00（`max_abs_delta_vs_committed_over_grid`）。

| 口徑 | 中位數 | 平均 ± sd | 範圍 | 說明 |
|---|---|---|---|---|
| 既有頭條（在測試集上挑出的最小值） | 8.38 | — | 5.93–12.91 | 24 組 Full/random 的最小值 |
| 論文式母體，在測試集上挑最小值 | 11.83 | — | — | stack；E3:`repro.paper_pop_grid_min` |
| 論文式母體，固定 bagged-GBT | 12.49 | — | 9.33–14.36 | 既有設定重跑 |
| **巢狀選擇，論文式 ≥200**（n_test 42） | **12.69** | 12.41 ± 2.33 | 9.26–15.94 | R² 中位數 0.73 |
| **巢狀選擇，xstrict ≥400**（n_test 41） | **9.47** | 9.93 ± 1.64 | 7.25–13.06 | R² 中位數 0.83 |

出處：E3:`nested_summary.<pop>.nested_outer_mape`、`nested_outer_r2`、`per_seed_outer_mape`。內層選出來的設定每個種子都不一樣（最常見的是 stack；`selected_configs`），這表示「哪一組最好」本身就不穩定。

---

## 3. 無洩漏協定（每個實驗的資料用途）

切分一律以電芯為單位，四個集合互斥（`ml_common.assert_disjoint` 在每個工作都會檢查），test 只在最後評估一次。

| 實驗 | train | val | cal | test |
|---|---|---|---|---|
| E1 main（50/10/20/20，依工況分層） | 擬合權重；常數基線的中位數；GBT 擬合 | 只用於 TCN early-stop | 只用於 conformal q | 最後評估一次（洩漏版另外列為「錯誤協定參考」） |
| E1 main_t60（60/10/10/20） | 同上 | 同上 | 同上（18 顆） | 同上 |
| E1 orig（原協定重跑） | 擬合 | **＝test（刻意重現錯誤）** | 不使用 | 不是有效的測試估計，只拿來比較 |
| E4 leave-batch-out | b1+b2+bbu 的 62.5% | 12.5% | 25% | Severson b3 全部（44 顆） |
| E1-b 外插 | 其餘電芯的 62.5% | 12.5% | 25% | severity 最低的 10 顆 BBU（固定） |
| E2 GBT | 與 TCN 同一份 train | 不需要 | 不使用 | 與 TCN 同一份 test |
| E3 巢狀 | 訓練池＝138 顆扣掉外層 test；內層 5-fold 選設定，再用整個訓練池重擬合 | 內層 fold（只計入屬於該母體的電芯） | — | 外層 test（與既有 sweep 同一組 fold），只評估一次 |
| E1-a | MV 既有預測，未重訓 | — | — | MV 的 test（也是原始 early-stop 集，已標註） |

---

## 4. 口試建議措辭

- **P7 頭條**：「說明書寫 8.38%『優於』論文 9.1%，寫得太強。8.38% 的成立條件是 cycle_life ≥ 400 的過濾、隨機切分、10 種子中位數，而且是在測試集上從多組設定挑出來的。改用巢狀選擇、論文式過濾後是 12.7%，在論文的條件下我們沒有超越論文。」
- **TCN 精度**：「原本 18% 這個數字，early-stop 用到了測試集，而且只有一個種子。我已經用獨立驗證集、10 個種子重跑，中位數是 28%，有幾個種子會把少數異常電芯預測到差一個數量級以上，所以這個模型目前不穩定。同一切分下 GBT 是 14%，每個種子都比較好。」
- **為什麼用 TCN**：「選 TCN 的理由只有部署格式：它可以完整靜態 INT8 量化、跑在 NPU 上。精度上它不如 GBT。在邊緣部署真的落地之前，對外報告的精度應該以 GBT 為準。」
- **BBU**：「50 顆合成電芯的標籤和特徵出自同一個公式，所以在上面量到的任何誤差，都只能說明模型和我們的假設是否一致。多種子下 TCN 大概有一點排序能力，但真實 BBU 的精度目前沒有證據。」
- **conformal**：「90% 覆蓋率在同分布、校準集獨立的時候成立，我重跑是 91.6%。但整批換成沒看過的批次，覆蓋率會掉到 40%。所以部署到新批次前，一定要用現場資料重新校準。BBU 的區間寬到一萬多循環，目前不能拿來做決策。」
- **不要說**：「優於論文」「跨工況訓練是誠實的取捨，所以選 TCN」「conformal 保證 90%」（沒有附條件的版本都不要說）。

---

## 5. 限制

1. 只有 10 個種子、每個種子 test 37 顆（BBU 10 顆）。種子間變異很大，TCN 的 sd 跟平均值同量級，所以平均數不可靠，表中也一併列了中位數。
2. 沒有用相同協定重跑 LSTM（紅隊報告的 E1 建議過），所以「換成 TCN 有沒有犧牲精度」這題還沒回答。
3. 沒有做 TCN 的超參數調整，沿用原本的設定（`train_tcn_rul.py:237-240`）。崩潰的種子也許可以靠正則化或 log 空間的離群處理改善，但那屬於模型改進，不在這次稽核的範圍內。
4. GBT 用的是 `eval_severson_transfer.py` 的設定（150 棵、depth 3），不是 `ensemble.fit_bagged_gbt`（900 棵）。BBU 的 9 個特徵直接編進了生成參數（紅隊 W2），所以 GBT 在 BBU 上的表現也一樣是在自己比自己。
5. E3 沒有重現 Severson 論文的固定 train／primary／secondary 切分（電芯清單未取得），所以巢狀選擇的數字仍然是隨機切分，不是論文協定。
6. conformal 的 BBU 覆蓋率是在合成資料上算的，不能代表真實 BBU 的覆蓋率。
7. torch 2.13 和原本的 2.11 不同：seed 42 原協定重跑是 17.21%，原報告是 18.15%。

---

## 6. 重跑與一致性

一行重跑（在 `atcc/scripts/audit/` 底下執行；cache 只需要建一次）：
```
../../.venv/Scripts/python.exe ml_build_cache.py && ../../.venv/Scripts/python.exe ml_e1a_mv_regime_metrics.py && ../../.venv/Scripts/python.exe ml_e1_tcn_multiseed.py && ../../.venv/Scripts/python.exe ml_e1_extras.py && ../../.venv/Scripts/python.exe ml_e3_severson_nested.py
```
- 耗時：cache 約 11 秒；E1 全部（5 種協定 × 10 種子，加上 seed 42，共 51 筆 per_seed＋20 個洩漏版訓練＝71 個 TCN）約 3 分鐘（10 個 process，單模型訓練 7.4–38.4 秒，見 `per_seed[*].train_seconds`，**沒有超過 3 分鐘，所以維持 10 種子**）；E3 第一次跑 2,557 秒（12 個 process），第二次跑 1,783 秒（14 個 process；現存 JSON 的 `_meta.wall_seconds` / `_meta.workers` 記的是第二次）。
- `data/processed/**` 被 `.gitignore:40` 忽略，所以 audit 的 JSON 和 cache 不會進版控。`ml_cache_dataset.npz`（0.80 MB）可以用 `ml_build_cache.py` 在約 11 秒內重建。
- cache 的健全檢查（`ml_cache_dataset_meta.json`）：seed 42 重建的測試集 = MV 的測試集；cache 的特徵 = 已提交的論文式 parquet；138 顆 Severson 都有 Full 特徵。
- 重跑一致性：E1 第二次執行與第一次逐欄位完全一致（訓練秒數除外）；E1-a 與 E3 的重跑結果見第 7 節。

## 7. 重跑一致性紀錄

- E1-a：連跑兩次，逐欄位比對 → IDENTICAL。第一次執行是在 cache 建好之前，所以那次沒有 `*_train114` 這幾個欄位；共有的欄位也完全一致。
- E1：第一次執行（還沒有 main_t60）和第二次執行比對 main/orig/lbo_b3/extrap 的全部 per_seed 與 summary → IDENTICAL（訓練秒數除外）。
- E3：兩次完整執行（2,557 秒與 1,783 秒）逐欄位比對 → IDENTICAL。8.38 與 12.49 兩次都逐位重現。
- 比對工具是 稽核過程紀錄（未入 repo）中的 `compare_runs.py`（浮點容差 1e-9），它不是 repo 的一部分。
- 既有檔案沒有被修改：`severson_model_eval.json`、`tcn_rul_report.json`、`model_validation.json` 的 mtime 都早於本次工作，`git diff` 也是空的（新增的只有 `scripts/audit/`，`data/processed/**` 本來就被 gitignore）。

---

## 8. E5 Sandia 外部測試：下載清單（未下載）

- 資料來源：Preger et al. 2020（Sandia），A123 LFP 18650，放在 batteryarchive.org（study summary 頁面有列「Sandia National Laboratories (SNL)」這筆研究）。
- **具體檔案 URL 與大小：查不到，所以沒有列。**
  - batteryarchive.org 的電芯清單是 Redash dashboard（`https://www.batteryarchive.org/cycle_list.html` 內嵌 `database.batteryarchive.org/public/dashboards/dG5C30g…`），每顆電芯的資料要從 dashboard 介面下載，網站上沒有靜態檔案連結。
  - 我猜的路徑（`https://www.batteryarchive.org/data/SNL_18650_LFP_25C_0-100_0.5-1C_a_cycle_data.csv` 和 `…_timeseries.csv`）HEAD 都回 404。`/api/queries/29/results.json` 也回 404。
  - FAQ 的原文是「Q: How do I download data for many cells at once? A: Please contact info@batteryarchive.org」，也就是批次下載要寫信申請。
  - GitHub `battery-lcf/battery-archive-sandbox` 只有 `data/snl/SNL_18650_G5_NMC{1,2}.zip`（NMC），沒有 LFP。
  - Sandia 的 R&D Data Repository 頁面（https://www.sandia.gov/ess/tools-resources/rd-data-repository）也沒有找到 LFP 循環資料的連結。
- **建議做法（要使用者決定）**：(a) 在瀏覽器打開 batteryarchive 的 Cycle Test Cell List，用 source = SNL、cathode = LFP 篩選，逐顆下載 cycle_data CSV。下載前會先列出檔名與大小，請你確認後再下載。(b) 或寫信給 info@batteryarchive.org 申請批次下載。LFP 的完整測試矩陣（有沒有 40–60% DoD）仍然**未查證**。
