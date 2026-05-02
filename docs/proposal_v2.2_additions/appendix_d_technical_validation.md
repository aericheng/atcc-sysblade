# 附件 D — 技術交付物實證(v2.2 新增,2026-05-03 更新)

> **完整方法論、限制與引文鏈**:GitHub `aericheng/atcc-sysblade` ·
> `docs/whitepaper.md`(1100 行技術白皮書)
> **Live demo**(可現場操作):<https://sysblade-atcc.vercel.app>
>
> 本附件以 measurement-based 表格摘要 v2.1 §E 三件套的真實實作結果,
> 數字皆來自 `data/processed/*.json` 與 `packages/shared/scenarios/*.json`,
> 由 `scripts/check_whitepaper_numbers.py`(GitHub Action CI gate)逐 push
> 自動驗證一致性。**任何業師問到的數字都能在 ≤ 30 s 從 GitHub 找到出處**。

## D.1 RUL 預測管線實測(對應 §E.1 Tier-C、附件 B (b))

Severson 2019 *Nature Energy* 124-cell LFP fast-charge 資料集為主訓練,
50 顆 PyBaMM-calibrated BBU-duty 合成 cell 為 regime-gap 補強,共 188 cells。

| 模型 | 配置 | Random split | Cross-batch | 角色 |
|---|---|---:|---:|---|
| Severson 13-feat OLS | unfiltered 138 cells | 14.51 % MAPE, R² 0.53 | 14.54 %, R² +0.08 | Plan C+ baseline(歷史對照) |
| Severson 13-feat **bagged-GBT (K=24) + xstrict cell filter** | extra-strict `cycle_life ≥ 400`, n=134 | **8.38 %, R² 0.89, per-seed [5.93, 12.91], 7/10 seeds < 10 %** | 17.91 %(GBT 跨 protocol 退化) | **paper 學術 baseline,達 v2.1 附件 B 「< 10 %」承諾** |
| Severson 13-feat **bagged-OLS + xstrict** | 同上 | 12.43 % | **13.87 %, R² +0.21** | **cross-protocol fall-back** |
| **LSTM augmented**(2-layer, hidden=64, ONNX 匯出)| Severson 138 + BBU-duty 50 = 188 cells, 60/20/20 split | **19.10 % MAPE, R² 0.86** | — | **`/dashboard` 1000 台 fleet 推論引擎** |

**部署 SOP**(三條 routing rule):

1. 客戶端 cell 與 fleet 訓練資料同 protocol → 用 bagged-GBT(8.38 %)
2. 客戶端 cell 是新 protocol → fall back 到 bagged-OLS(13.87 %,R² 由負轉正)
3. 客戶端 cell 是新化學(LFP → NMC 等)→ 須 per-chemistry calibration cycle(見 D.4)

> **誠實邊界**:8.38 % 為 random split 10-seed median,xstrict 篩掉 4/138 顆
> 早夭 cell;業師問「為何不 cross-batch 也是 8.38 %」答「樹型模型在跨 protocol
> 退化(17–22 %),這是 protocol-specific overfit 的經典 bias-variance 證據,
> 部署用 OLS 路徑」。**不引用 best-seed 5.93 %**(屬 cherry-pick)。

## D.2 邊緣端 INT8 量化驗證(對應 §E.1 Tier-C STM32N6 部署)

`scripts/quantize_lstm_onnx.py` 用 `onnxruntime.quantization.quantize_dynamic`
(matches X-CUBE-AI 9.x INT8 路徑,AN5354 §INT8)對 `models/lstm_rul.onnx` 真實
量化,在 188-cell test 集上量測:

| 指標 | FP32 baseline | INT8 quantised | Δ |
|---|---:|---:|---:|
| ONNX size(graph + external data total) | **219.2 KiB** | **62.9 KiB** | **3.49× compression** |
| Test MAPE(同一 test set) | 19.10 % | 19.20 % | **+0.10 pp** |
| Test R² | 0.862 | 0.862 | 不變 |
| 平均 \|prediction Δ\| / FP32 prediction | — | — | **0.57 %** |
| CPU latency p50(笔電,單樣本)| 0.267 ms | 0.241 ms | 1.11× |

**結論**:INT8 在這個 LSTM 上**幾乎無精度退化**,**63 KiB 遠小於 STM32N6
1.6 MB ML FLASH** 上限,是「STM32N6 部署 go decision」的 first-party 證據。

**仍待 W3**:NPU 真機 cycle-accurate latency(需 ST 帳號 + X-CUBE-AI GUI;
SOP `docs/x_cube_ai_install_sop.md`)。本估算 54.7 µs(`onnx_static_analysis.py`,
40 % NPU utilisation heuristic ±2× 不確定區間);ST datasheet Neural-ART INT8
LSTM typical 0.3 ms 為承諾上限,本估算遠低於此。

## D.3 機率輸出 — MC Dropout + Split Conformal PI(對應 §E.3 SaaS Tier-3 admission)

| 指標 | Raw MC Dropout(100 forward passes)| **+ Split Conformal calibration** |
|---|---:|---:|
| Test set 90 % PI coverage | 100 % | **100 %**(≥ 90 % conformal 保證) |
| 中位數 PI 寬度 | 1910 cycles | **1075 cycles(縮窄 44 %)** |
| Conformal q_factor | — | **0.563**(< 1 即 raw PIs 偏寬,calibration 縮窄) |

**業務意義**:`/dashboard` Tier-3 admission(`status === "early_aging"` ⇔
`SOH < 0.85` OR `RUL < 800`)從「不確定 ± 1500 cycles」收緊到「± 500 cycles」,
替換決策成為 actionable 而非「再觀察」。Vovk 2005 / Lei 2018 conformal exchangeability
保證 — calibration 集 37 cells held-out,test coverage 為理論保證之上界。

## D.4 跨化學限制 — 跨資料集驗證(誠實聲明,對應 §F.4 業師質詢預演)

Severson(LFP)→ NASA(NMC)cross-dataset z-distance 結果:

| Feature | Severson 範圍 | NASA 範圍 | OOD ? | z-distance |
|---|---:|---:|:---:|---:|
| log_var_delta_q | [-5.21, -2.73] | [-2.07, -1.54] | ✗ | 5.3 σ |
| log_min_delta_q | [-2.30, -0.86] | [-0.51, -0.26] | ✗ | 5.1 σ |
| slope_q_2_100 | [-0.001, 0] | [-0.006, -0.004] | ✗ | 54 σ |
| intercept_q_2_100 | [0.97, 1.10] | [1.86, 2.04] | ✗ | 61 σ |
| q_at_cycle_2 | [0.97, 1.09] | [1.85, 2.04] | ✗ | **65 σ** |

**5/5 feature 全部 OOD,z-distance 5–65 σ**。Severson-trained 模型不可直接
部署到不同化學的 cell;**產品 SOP 必須含 per-chemistry calibration cycle**
(每批新採購 LFP 模組 / 跨化學 vendor 切換時觸發)。**這個結論寫進客戶交付物**,
是商業上的差異化武器(競品 KULR、Eaton 都沒做跨化學量化驗證)。

## D.5 Reproducibility CI(對應 §F.4 業師質詢「你們是不是事後調的數字」)

GitHub Action(`.github/workflows/check.yml`)在每次 push / PR 跑:

* `pnpm typecheck` + `pnpm lint` + `pnpm build`(web app 三件套)
* `pnpm check:numbers`:**19 條 cross-check** 掃 `whitepaper.md` /
  `README.md` / `PRESENTATION_GUIDE.md` / `packages/battery-twin/README.md`
  vs JSON ground truth(`severson_model_eval.json` / `lstm_quantization_report.json`
  / `cross_dataset_mape.json` / `model_validation.json`),數字偏離容差
  **0.05 pp 以上自動 fail**。**首跑就抓到 1 條真的 stale 22.5 %**(舊 LSTM
  訓練數字)並修正為 19.10 %;此後 commit `c2bf10e` 起 v2.1 §X 引用全部
  對齊 PDF 真實章節編號(7 條原本錯誤的 cross-reference)。

> **本附件本身也受此 gate 保護**:任何數字若漂離 JSON 真值,push 時 CI 直接
> 紅燈,業師檢核 GitHub 任一 commit 的 Actions tab 都看得到 20+/N passed 紀錄。

## D.6 數字溯源(每一條都可追)

| v2.2 引用 | repo 路徑 |
|---|---|
| 8.38 % / 13.87 % / 14.51 % MAPE 三條 | `data/processed/severson_model_eval.json` `headline.best_random_full` + `results[]` |
| INT8 size / accuracy / CPU latency | `data/processed/lstm_quantization_report.json` |
| LSTM 19.10 % / R² 0.86 / Conformal q_factor | `packages/shared/scenarios/model_validation.json` |
| Cross-dataset z-distance 5/5 OOD | `data/processed/cross_dataset_mape.json` |
| TCO 5760 / 8640 / 29000 / 19400(對齊 §G.3 表)| `apps/web/src/lib/tco.ts` 常數 |
| Tier-3 admission rule | `scripts/generate_twin_scenarios.py::status_for_device` |
| 1000 台 fleet 模擬 | `apps/web/public/scenarios/fleet_devices.json` |

> 競賽期間若業師在現場 demo 質疑任何一個數字,可直接打開 GitHub 對應檔案
> 點 raw view、或 Live demo 對應頁面 — 兩條路徑都即時可驗。
