# A2 電力電子與最壞情境補強實驗（口試前自我稽核）

> 本檔為口試前自我稽核摘要，2026-10-09 自稽核工作區複製進 repo；文中路徑以 repo 根目錄為準，標「稽核過程紀錄（未入 repo）」者為未納入版控的驗收紀錄。

> 日期：2026-10-09（v2：依驗收報告 `稽核過程紀錄（未入 repo）：verify-A2.md` 修正 DC-DC 模型的數值缺陷與措辭）
> 環境：repo `.venv`（PyBaMM 26.6.2、numpy 1.26.4、scipy 1.17.1）
> 重跑（repo 根目錄，一行）：`.venv/Scripts/python scripts/audit/a2_run_all.py`（約 20 分鐘，DC-DC 密掃與收斂測試占大部分；連跑兩次輸出逐位元組相同，見文末）
> 腳本：`scripts/audit/a2_common.py`、`a2_dcdc_average_model.py`、`a2_spec_bounds_lic_sizing.py`、`a2_worst_case.py`、`a2_run_all.py`
> 輸出：`data/processed/audit/a2_dcdc_average_model.json`、`a2_spec_bounds_lic_sizing.json`、`a2_worst_case.json`，以及三張 PNG（`a2_dcdc_heatmap.png`、`a2_spec_bounds_lic_sizing.png`、`a2_worst_case.png`）
> 未修改任何既有腳本或 JSON；沒有跑 make verify；沒有 commit。

---

## 結論先行

1. **「計入 DC-DC 約 2.4–3.9×」現在有腳本，但只對得上一半。**
   - 5 Hz 示範波形下，功率標準差倍率 3.1×／3.9× 分別需要**電流迴路頻寬約 26／42 Hz**（假設；密掃求得，dt 減半變化 <1 %）。
   - 效率 η 0.95 與 0.97 的差別 <0.2 %。
   - 另一半「電壓 pp 2.4–3.2×」**重現不出來**：f_bw ≤ 1 kHz 時，5 Hz 波形的瞬時 bus 電壓 pp 倍率全部 <1（0.55–0.57），也就是比沒有 LIC 還差。
2. **「>100 Hz 退到 1.5×」的原因是迴路頻寬，不是濾波器。** 理想濾波器在 200 Hz 的倍率是 693×；加入一階電流迴路與 50 µs 控制延遲後，200 Hz 波形要達到 1.5×，**迴路頻寬約需 340 Hz**。f_bw = 1 kHz 時是 2.22×，f_bw ≤ 50 Hz 時約 1.0×。
3. **電容超規：電壓三個情境都超，連續電流在連續波形下超 2.70 倍，峰值電流沒超。**
   - 電壓：模組端電壓最高 51.81 V，規格上限 48.6 V；模擬用的 OCV 常數 51.3 V 本身就已超過上限。
   - 連續電流：示範波形穩態每模組 RMS 233 A，連續額定 86 A。若持續運轉，推估穩態溫升約 110 °C（上界，模組熱容未知）。
   - 峰值電流：每模組 463–877 A，低於 1 s 峰值 2200 A。
4. **換 LIC（3300F 級，參數為假設）至少 13S3P＝39 顆，中點約 3.5 V/cell，不是 50 % SOC。**
   - 綁住尺寸的是單體峰值電流與 ESR 壓降，不是能量。
   - 若停電前 BBU 閒置、LIC 要扛 120 kW 階躍：10S5P＝50 顆。
   - 若 DC-DC 限在 60 kW：14S2P＝28 顆。
5. **DC-DC 建議功率等級：bus 側約 60 kW（前提見 §4），範圍 50–85 kW。**
   - 停電轉換不需要更大的 DC-DC：把 LIC 功率限在 30–60 kW 時，LFP 峰值 C-rate 不變。
   - 85 kW 只在「理想方波邊緣要全部由 LIC 吸收」時才需要。
6. **峰值時掉一台：有 LIC 就沒事；LIC 也失效時短暫超過 6C。**
   - t = 0.25 s 掉一台：每台需求 6.86C，但 LIC 吸收峰值後，LFP 實際最高 5.54C。
   - LIC 同時失效：LFP 停在 6.86C 約 0.25 s（網格計數 0.26 s），>6C 共 0.5 s。
7. **滿載 60 s 不降載：** DoD 10.0 %，LFP ≥5.9C 約 58.1 s。再加掉一台：>6C 共 59.1 s，≥6.8C 共 57.7 s，每台 DoD 11.35 %。
   - DFN 最低電壓 3.066 V，離 2.5 V 截止還有 0.57 V；溫升 1.6–6.5 °C。
   - 本模型內電壓與溫度都沒有觸限，**但 6C 設計點被突破**；電芯能否 6.86C 持續 1 分鐘，沒有規格書可對照。
8. **原情境可重現：** DoD 2.65625 % 完全一致；DFN 最低電壓差 +3.1×10⁻⁷ V。

---

## 1. DC-DC 平均模型（W2／W9）

### 模型

`a2_dcdc_average_model.py` 檔頭有完整說明，摘要如下。
- 外環沿用 repo 的 EMA（τ = 0.5 s），HPF 指令加上 SOC 回復項 `P_soc = C·V_ref·(V_oc − V_ref)/τ_soc`。
- **數位控制延遲（v2 新增）：** 控制取樣週期 50 µs（假設 20 kHz），電流命令延遲一個取樣週期才送進電流內環。
  - 改這個的原因：v1 在負載邊緣出現的同一步就更新 LIC 電流（零延遲），在 f_bw = 1 kHz、dt = 200 µs 時，單步就反應 71.5 %，把結果灌高了。
  - 50 µs 是假設，不是設計值；本版只模擬過這一個延遲值（50 µs 下 200 Hz 達 1.5× 需 340 Hz）。上一輪驗收者以 v1 程式「無延遲、細步長」估約 272 Hz，因程式版本不同，兩者不構成嚴格的延遲敏感度分析（「延遲越大所需頻寬越高」為推論）。延遲以每個積分步更新的純延遲實作，不是 20 kHz 零階保持。
- 一階電流內環（頻寬 f_bw）、LIC 側電流上限、效率 η；殘差由 LFP 承擔。
- **積分步長（v2 修正）：** dt = 50 µs/n，且 dt ≤ min(週期/800, 1/(50·f_bw))。dt 減半做收斂測試，結果在 JSON `convergence`：
  - 5 Hz 網格最大相對變化 0.90 %，200 Hz 網格 0.60 %；三個門檻值 0.44–0.73 %；`pass_all_lt_1pct = true`。
  - v1 的 dt 沒有隨 f_bw 縮小，1 kHz 那列的 15.68×、2.27× 是步長假象，已作廢。
- bus KVL 用 LFP rack Thevenin 計算：`V_bus = E − R0·P_lfp/V_bus`。
  - Thevenin 由 PyBaMM DFN（Prada2013）3C 脈衝擬合，依 repo 映射（15S×22.64P，出處 `generate_full_rack_60s_sim.py:134-138`）放大到 8 台並聯。
  - 結果：R0 1.94 mΩ、R1 2.02 mΩ、τ1 0.92 s、OCV 53.98 V；擬合 RMSE 3.0 mV（JSON `thevenin`）。
- **假設**（JSON `_meta.assumptions`）：f_bw、η、50 µs 延遲、電流上限 1500 A、SOC 設定點 40 V、τ_soc 10 s、LFP 直掛 bus、無 bus 大電容、理想方波。

### 結果

**5 Hz 示範波形，η = 0.95（假設），穩態視窗後 6 s**（JSON `grid`，篩選 `f_wave_hz=5, eta=0.95`）：

| f_bw [Hz]（假設） | 5 | 10 | 20 | 50 | 100 | 1000 | 理想無損（`ideal_lossless`） |
|---|---|---|---|---|---|---|---|
| 功率 std 倍率 | 1.37 | 1.90 | 2.71 | 4.21 | 5.71 | 11.38 | 17.36 |
| bus 電壓 pp 倍率 | 0.57 | 0.55 | 0.55 | 0.55 | 0.55 | 0.55 | 10.37 |
| bus 電壓 std 倍率 | 1.37 | 1.89 | 2.70 | 4.20 | 5.70 | 11.32 | 17.38 |
| LFP 功率 pp [kW]（負載 pp 48） | 90.0 | 92.5 | 91.9 | 91.4 | 91.2 | 91.1 | — |
| bus 最低電壓 [V] | 45.07 | 44.96 | 44.96 | 44.96 | 44.96 | 44.96 | — |

**門檻**（JSON `claim_mapping_5hz_demo`，密掃：5 Hz 時 15–60 Hz 每 0.5 Hz，200 Hz 時 150–450 Hz 每 5 Hz，相鄰點線性內插）：

| 門檻 | η = 0.95 | η = 0.97 | dt 減半後（η 0.95） |
|---|---|---|---|
| 5 Hz 功率 std 3.1× | 26.17 Hz | 26.14 Hz | 26.29 Hz |
| 5 Hz 功率 std 3.9× | 42.08 Hz | 42.03 Hz | 42.39 Hz |
| 200 Hz 功率 std 1.5× | 340.3 Hz | 340.0 Hz | 342.7 Hz |
| 5 Hz 電壓 pp 2.4× | 未達到（`..._2.4x_reached_le_1khz = false`，粗網格最大值 0.57） | 同左 | — |

- **電壓 pp <1 的機制：** 方波邊緣瞬間，LIC 電流還沒反向（延遲加上迴路落後），LFP 要先接住最多 2 倍的階躍。所以 LFP 功率 pp 從 48 kW 變成 90–93 kW，bus 最低電壓也比無 LIC 時更低（44.96 V 對 46.10 V）。
  - 本模型沒有 bus 大電容，負載又是理想方波，所以瞬時 pp 對 sub-ms 邊緣極度敏感。
  - std 類指標（功率 std 與電壓 std 幾乎一致）比 pp 穩健。
  - 因此「電壓 pp 2.4–3.2×」不能沿用；若要談電壓，必須同時給 bus 電容與負載斜率的假設。
- **頻率與迴路頻寬：**
  - 200 Hz 波形在 f_bw 5／10／20／50／100／1000 Hz 時，功率 std 倍率是 1.00／1.00／1.00／1.01／1.06／2.22。
  - 50 Hz 波形是 1.00／1.02／1.06／1.30／1.74／4.56。
  - 1 Hz 波形對 f_bw 不敏感（3.16–3.44）：τ=0.5 s 時 LPF 截止 0.32 Hz，1 Hz 基波的 LPF 增益只有 0.30，主要落在 HPF（LIC）頻帶；因為掃描的 f_bw ≥5 Hz 遠大於 1 Hz，迴路追得上，倍率上限由 LPF 分流本身決定（理想值約 3.63）。
- **repo 5.72× 的定義交叉核對**（JSON `repo_definition_crosscheck_5hz`）：同公式、10 s 全視窗重算得 5.74×（repo stats 5.72×，差 0.3 %，原因未追查）。穩態理想值是 17.38×，所以 5.7× 混進了 EMA 的啟動暫態。
- **η 的代價出現在 LFP 平均功率：** 5 Hz、f_bw 1 kHz 時，LFP 平均 82.18 kW（η 0.95）／81.88 kW（η 0.97），負載 80 kW，等於多出 2.4–2.7 %。
- **bus 最低電壓**（JSON `vbus_min_v`、`vbus_min_lfp_only_v`）：
  - 混合系統：全網格 44.83–46.12 V，只有 200 Hz 且 f_bw ≤ 10 Hz（LIC 幾乎不動作）的 4 案 ≥ 46 V。
  - 僅 LFP：45.14 V（0.25 Hz）到 46.17 V（200 Hz）。
  - 對照 `03_product_spec.md:77` 的 46 V 下限，結果取決於 Thevenin 放大假設，列為待查。

圖：`data/processed/audit/a2_dcdc_heatmap.png`（2×2：兩指標 × 兩個 η；<1 表示比無 LIC 更差）

---

## 2. 規格邊界（W5／W6）

### 2A. 既有模擬 vs Eaton XLR-48R6167-R（只讀既有 JSON）

**規格來源：** https://www.eaton.com/us/en-us/skuPage.XLR-48R6167-R.html
- 48.6 V、166 F、5 mΩ：A4 驗收者已透過 r.jina.ai 讀取 Eaton 官方 SKU 頁核對（`稽核過程紀錄（未入 repo）：verify-A4.md:18`）。
- 86 A（15 °C 溫升）、2200 A（1 s）：只有 WebSearch 取得的 SKU 頁摘錄。本 agent 以 WebFetch 開該頁與 datasheet PDF 皆逾時，**PDF 原文未取得**。
- 熱阻 0.4 °C/W **未查證**；改用規格自洽推得 15 °C／(86²×5 mΩ) ≈ 0.406 °C/W（JSON `eaton_spec`）。

| 情境（JSON `part_a_eaton_bounds`） | 模組端電壓最高 | 上限 48.6 V | 每模組峰值 I | 1 s 峰值 2200 A | 每模組 RMS I | 連續 86 A | 若持續的穩態溫升 |
|---|---|---|---|---|---|---|---|
| transient_hybrid（t ≥ 4 s） | 51.81 V | **超** | 463 A | 內 | **233 A（2.70×）** | **超** | 約 110 °C（ESR 損耗 270 W／模組） |
| rack_60s_graceful | 51.73 V | **超** | 877 A | 內 | 63 A（60 s 平均）；1 s 視窗最大 435 A | 內（平均） | 約 8 °C |
| rack_n_minus_1 | 51.73 V | **超** | 877 A | 內 | 同上 | 內（平均） | 約 8 °C |

- 模擬中的 LIC OCV 常數是 51.3 V（`lic_v_ocv_constant_v`，出處 `generate_twin_scenarios.py:84`、`generate_full_rack_60s_sim.py:47`），本身就高於 48.6 V（`ocv_constant_exceeds_v_limit = true`）。
- 端電壓初值：transient 是 51.3 V；60 s／N−1 是 46.91 V（t = 0 有 90 kW 放電的 ESR 壓降）（`v_terminal_initial_v`）。
- 溫升 = 15 °C × (I_rms/86)²，假設 86 A 對應穩態 15 °C 溫升。
- series 是抽樣 800 點，峰值另以 stats 推算後取大值。

### 2B. LIC 版尺寸重估

**單體參數（假設，非 Musashi CPQ3300SD 規格）：** JSR Micro／JM Energy 2012 年簡報第 29 頁「Typical properties of Prismatic type ULTIMO」，3300F type（R&D 原型、tentative values）。
- 數值：2.2–3.8 V、3300 F、DC-IR 1.0 mΩ、最大放電電流 1100 A（1 s 峰值，原廠標明由倍率數據推估）、360 g、150×91.5×15.5 mm。
- 來源：https://nccavs-usergroups.avs.org/wp-content/uploads/Joint2012/2012_2Peterson.pdf （本 agent 與驗收者都渲染過該頁核對）。
- CPQ3300SD 原廠規格書：WebSearch 兩輪查無（未查證）；它是否就是這顆原型，也未查證。
- 紅隊所稱「3000 F」找不到出處；唯一一手來源寫的是 3300F type。
- 連續電流額定與熱阻：未公開，沒有納入判準。

**判準：** 端電壓全程在 nS×[2.2, 3.8] V 內，單體峰值 ≤ 1100 A，DC-DC η = 0.95（假設）。
**LIC 功率曲線**用 repo 控制律重算（JSON `lic_profiles`）：
- P1 示範 5 Hz
- P2 V3
- P3 peak-hold 2 s
- P4 滿載 60 s
- P5 滿載且停電前閒置（LPF 從 0 起算）

| 需求集合 | 建議配置（V_ref 可行寬度 ≥ 0.2 V/cell 的最少顆數） | 中點 V_ref | 能量 SOC | 可行 V_ref 區間 | 單體峰值 I | 重量 | 最少顆數（不穩健） |
|---|---|---|---|---|---|---|---|
| P1–P4（`part_b_sizing_P1_to_P4`） | **13S3P＝39 顆** | 45.4 V＝3.49 V/cell | 76 % | 43.0–47.7 V | 960 A | 14.0 kg | 12S3P＝36 顆（42.0–43.9 V） |
| 加 P5（`part_b_sizing_with_P5_seed0`） | **10S5P＝50 顆** | 35.5 V＝3.55 V/cell | 81 % | 34.0–36.9 V | 985 A | 18.0 kg | 15S3P＝45 顆（區間僅 0.3 V） |
| 加 P5，DC-DC 限 ±60 kW（`part_b_sizing_with_P5_dcdc_cap`） | **14S2P＝28 顆** | 48.7 V＝3.48 V/cell | 76 % | 46.6–50.7 V | 889–910 A | 10.1 kg | 13S2P＝26 顆（44.5–46.9 V） |

- **能量不是瓶頸：** 13S3P 窗內總能量 618 kJ，從 V_ref 往下可放 472 kJ，往上可吸收 145 kJ；事件需求最多 46.8 kJ（P4）。瓶頸是單體 1100 A 與 ESR 壓降（P2–P4 最低端電壓 32.9 V，下限 28.6 V）。
- **中點 SOC 管理：** 事件以放電為主，所以 V_ref 設在 3.5–3.6 V/cell。上方空間只用來吸收示範波形的振盪與 ESR 抬升（P1 最高 47.1 V，上限 49.4 V）。事件後要靠 SOC 回復項把電壓拉回 V_ref；現行韌體（`firmware/stm32_hybrid_control/main.c:186-207` 只有 duty_sc ≥ 0）**沒有回充路徑**。
- **連續波形的 ESR 損耗：** 13S3P 跑 P1 時，bank 平均 1.34 kW，單體 RMS 186 A（`recommended_robust_config.per_profile.P1_demo_5hz_10s`）；14S2P（限 60 kW）是 1.98 kW。
- 13S1P、13S2P 在不限功率時不可行，與紅隊探查腳本（`稽核過程紀錄（未入 repo）：rt/lic_sens.py`，非 repo 檔）的方向一致。

圖：`data/processed/audit/a2_spec_bounds_lic_sizing.png`（左：Eaton 邊界；中：nS×mP 可行域；右：10S5P 各 profile 單體電壓）

---

## 3. 最壞情境（W10）

做法是直接 import V3／V4 原腳本的函式，只換功率曲線與故障時刻，沒有改原檔（`a2_worst_case.py`）。

**重現**（JSON `reproduction_check`）：

| 量 | committed | 重跑（PyBaMM 26.6.2） | 差 |
|---|---|---|---|
| V3 dod_pct | 2.65625 | 2.65625 | 0 |
| V3 v_cell_min | 3.2218089628 | 3.2218092681 | +3.05×10⁻⁷ V |
| V3 v_cell_max／t_cell_max／v_lic_min | — | — | 0 |
| V4 v_cell_min | 3.2125013908 | 3.2125015628 | +1.72×10⁻⁷ V |
| V4 t_cell_max | 25.1133375843 | 同 | 0 |

**情境**（JSON `scenarios[*]`；C-rate = 每台 kW／2.5 kWh；時間 = 樣本數 × 0.02 s，含端點樣本）：

| 情境 | 每台需求峰值 | **LFP 實際峰值** | 時間：>6C／≥6.8C／停在峰值 | DoD（rack／每台 LFP） | DFN 最低電壓 | 溫升 R=8 mΩ／R=DFN 擬合 |
|---|---|---|---|---|---|---|
| 原 V3（重跑） | 6.00C | 4.85C | 0／0／— | 2.66 %／2.66 % | 3.222 V | 0.10／0.38 °C |
| 原 V4（t=15 s 掉一台） | 6.00C | 4.85C | 0／0／— | 2.66 %／2.92 % | 3.213 V | 0.11／0.46 °C |
| (a) t=0.25 s 掉一台 | **6.86C** | **5.54C** | 0／0／— | 2.66 %／3.03 % | 3.212 V | 0.12／0.50 °C |
| (a′) 同上且 LIC 不可用 | 6.86C | **6.86C** | **0.50 s／0.26 s／0.26 s** | 2.66 %／3.03 % | 3.205 V | 0.13／0.51 °C |
| (b) 120 kW 滿載 60 s | 6.00C | 6.00C | 0／0；≥5.9C 58.06 s | **10.00 %**／9.94 % | 3.081 V | 1.24／4.99 °C |
| (b′) 滿載 60 s＋掉一台 | 6.86C | **6.86C** | **59.10 s／57.72 s**／53.12 s | 10.00 %／**11.35 %** | 3.066 V | 1.62／6.52 °C |
| (c) peak-hold 1.0 s | 6.00C | 5.46C | 0 | 2.72 % | 3.202 V | 0.10／0.42 °C |
| (c) peak-hold 1.5 s | 6.00C | 5.78C | 0 | 2.78 % | 3.179 V | 0.11／0.46 °C |
| (c) peak-hold 2.0 s | 6.00C | 5.91C | 0 | 2.84 % | 3.163 V | 0.12／0.49 °C |

欄位對照：`time_lfp_above_6c_s`、`time_lfp_ge_6p8c_s`、`time_lfp_at_peak_c_s`、`time_lfp_ge_5p9c_s`。(a′) 的 6.86C 實際區間是 t = 0.25–0.5 s，網格計數為 0.26 s。

- 電壓下限：BMS 2.5 V（`docs/BBU_IMPLEMENTATION_PLAN.md:926`）。各情境最低 ≥ 3.066 V，裕度 ≥ 0.57 V。
- 「R = DFN 擬合」欄用 DFN 6C 脈衝擬合的 R0+R1 = 32.2 mΩ，取代 repo 的 8 mΩ；repo 的 8 mΩ 偏樂觀。
- peak-hold 拉長，LIC 放出能量從 34.4 kJ 增加到 45.0 kJ（`lic_energy_out_kj`），已併入 2B 的 P3。

圖：`data/processed/audit/a2_worst_case.png`（上：0–6 s 的 LFP C-rate；中、下：0–60 s 的 DFN 電壓與溫度；三圖都有時間軸標籤）

---

## 4. DC-DC 建議功率等級（供成本表）

**建議：bus 側約 60 kW（範圍 50–85 kW）。** 依據如下（LIC 路徑的 bus 側峰值功率）。補註（驗收者發現）：A1 梯形波在 τ=1–2 s 時 LIC 峰值為 60.9–61.0 kW，略高於 60 kW；下表只列 τ=0.5 與 5 s。

| 情境 | LIC 峰值 [kW] | 出處 |
|---|---|---|
| 示範 5 Hz（理想、含啟動） | 47.5 | `transient_hybrid.json stats.lic_peak_kw`；A2 `lic_profiles.P1_demo_5hz_10s.p_bus_peak_kw` |
| 示範 5 Hz（本平均模型 bus 側，f_bw 5–1000 Hz） | 36.9–44.2；全網格最高 53.1（0.25 Hz） | `a2_dcdc_average_model.json grid[*].dcdc_bus_power_peak_kw` |
| Choukse 0.2 Hz、30↔100 %、τ = 0.5 s：方波／梯形 | 82.6／52.6 | `a1_frequency_split.json results.exp3_choukse_sweep.waveforms.{sq,trap}_30_100_d50.cases`（f=0.2, τ=0.5） |
| Choukse 0.2 Hz、τ = 5 s：方波／梯形 | 52.3／49.8 | 同上（τ=5） |
| Choukse 0.2 Hz、GPU floor 65 %、τ = 0.5 s | 41.3 | 同上 `sq_65_100_d50` |
| 停電轉換（LPF 起點 30 kW／0 kW） | 90／120（未限幅時） | `a2_worst_case.json dcdc_cap_analysis.cases.*.lic_peak_uncapped_kw` |

**前提與理由**
- **停電轉換不決定 DC-DC 額定。** LIC 功率限在 30／40／60 kW 時，停電與滿載情境的 LFP 峰值都不變：8 台 4.85C／6.00C，N−1 5.54C／6.86C（`dcdc_cap_analysis.cases.*.rows[*].lfp_peak_c_*`）。原因是 LFP 峰值出現在濾波器追上之後，而不是 t = 0 的階躍。限幅的代價只是 LIC 放出的能量變少（例如 v3_mainsfail_seed30：35.3 → 32.1 kJ @ 60 kW）。
- **60 kW 的前提：** 負載邊緣有斜率（A1：梯形斜坡下，LIC 峰值最多降 56 %，τ = 0.5 s、0.1 Hz 時 83.2 → 36.3 kW），並接受理想方波邊緣的超出部分由 LFP 承擔。若要求理想方波邊緣也全部由 LIC 吸收，Choukse 0.2 Hz／τ = 0.5 s 需要約 85 kW。
- **LIC 側電流：** 限 60 kW 時，14S2P 的單體峰值 889–910 A，bank 約 1.8 kA（`part_b_sizing_with_P5_dcdc_cap...i_cell_peak_a` × 2）。DC-DC 的 LIC 側電流額定要以此為準，不能只看 kW。
- **未驗證：** 60 kW 限幅對 Choukse 波形的平滑倍率有多少影響，A2 沒有模擬；這是 A2 的平均模型（5 Hz 方波）與 A1 波形之間的缺口。

---

## 口試四問建議措辭（各 ≤5 行）

**Q1「2.4–3.9× 是哪支腳本、假設什麼？」**
> 「這個區間原本是賽後審查的估計，沒有落成腳本，是我驗證鏈的缺口；現在補上了 `scripts/audit/a2_dcdc_average_model.py`。它是雙向 buck-boost 的平均模型：一階電流迴路、50 µs 控制延遲、η 0.95–0.97，加上用 DFN 擬合的 LFP Thevenin 做 bus KVL。在 5 Hz 參考波形下，功率波動降 3.1 倍要約 26 Hz 的迴路頻寬，降 3.9 倍要約 42 Hz；效率影響小於 0.2 %。電壓 pp 的那一半我重現不出來：在沒有 bus 電容的模型裡，邊緣瞬間反而比沒有 LIC 更差，所以會改成只講功率倍率並附上頻寬假設。高頻退化來自迴路頻寬：200 Hz 時要約 340 Hz 頻寬才有 1.5 倍。」（出處：a2_dcdc_average_model.json `claim_mapping_5hz_demo`、`convergence`）

**Q2「電容會不會超規？」**
> 「會，我自己查過了。競賽版把電容 OCV 設在 51.3 V，模擬最高到 51.8 V，Eaton 這顆上限是 48.6 V。連續波形下每模組 RMS 233 A，是 86 A 連續額定的 2.7 倍；峰值 463–877 A 沒有超過 1 s 峰值 2200 A。電壓超規來自 OCV 設在 51.3 V、沒有中點 SOC 管理；RMS 電流超規則是 5 Hz 示範波形的高頻分量電流幅度造成，和 SOC 無關。加上 Eaton 本身是 EDLC，這些都已列為更正項。」（出處：a2_spec_bounds_lic_sizing.json `part_a_eaton_bounds`；規格 URL 見 `eaton_spec.source`）

**Q3「換 LIC 要幾顆、電壓窗怎麼管？」**
> 「我用公開的 3300F 級 ULTIMO 參數重算（2012 年原型暫定值；量產規格書還沒拿到，所以是假設）。結果是至少 13 串 3 並、39 顆，約 14 kg。中點設在約 3.5 V/cell，不是 50 %，因為事件以放電為主。綁住尺寸的是單體 1100 A 峰值和 ESR 壓降，不是能量。如果把 DC-DC 限在 60 kW，可以降到 14 串 2 並、28 顆；如果 LIC 要扛整個 120 kW 階躍，就要 50 顆。」（出處：a2_spec_bounds_lic_sizing.json `recommended_robust_config`）

**Q4「峰值時掉一台／滿載 60 秒會怎樣？」**
> 「兩個都跑了。峰值當下掉一台，每台需求是 6.86C，但 LIC 吃掉峰值後，LFP 實際最高 5.54C；如果 LIC 也同時失效，LFP 會停在 6.86C 約 0.25 秒、超過 6C 共 0.5 秒。不降載滿載 60 秒，DoD 10 %；再掉一台，超過 6C 共 59 秒、每台 DoD 11.4 %。DFN 最低 3.07 V、溫升 2–7 °C，沒有觸限，但已超出 6C 設計點；電芯能否 6.86C 撐一分鐘要看規格書，所以 60 秒承諾仍依賴 GPU 降載協定。」（出處：a2_worst_case.json `scenarios`）

---

## 限制（照實列）

- **全部是模型。**
  - DC-DC 是平均值模型：沒有開關漣波、死區、電感飽和，也沒有 bus 大電容。
  - 迴路頻寬、η、50 µs 延遲、電流上限、SOC 設定點都是假設。
  - 門檻頻寬可能對延遲假設敏感（推論）：50 µs 延遲下，200 Hz 達 1.5× 需約 340 Hz；上一輪驗收者以 v1 程式（無延遲、細步長）估約 272 Hz。兩者程式版本不同，不構成嚴格的延遲敏感度分析（同 §1 說明）。
- **LFP Thevenin：** 來自 Prada2013 單體，依 repo 映射放大。R 隨電流變化（1C R0 37 mΩ，6C 16 mΩ），模型用 3C 值；OCV 起點約 3.6 V/cell。
- **DFN 初始狀態：** Prada 預設，近滿電。**沒有跑低 SOC 起始的情境**，最低電壓因此偏樂觀。
- **熱模型：** 沿用 repo 的單 cell 集總模型，沒有 pack、LIC、DC-DC 的熱；R 用 8 與 32 mΩ 兩值當敏感度。
- **N−1：** 倖存 7 台立即平均分攤，沒有故障瞬間的電流重分配暫態。
- **LIC 單體參數：** 2012 年 R&D 原型暫定值，不是 CPQ3300SD 規格；連續電流額定與熱阻未知。LIC 以理想 RC 模擬。
- **Eaton 規格：** 86 A／2200 A 只取得 WebSearch 摘錄，PDF 原文沒有取得；0.4 °C/W 未查證。
- **電芯額定：** 「6.86C 持續 1 分鐘」是否在電芯允許範圍內，沒有規格書可判定。
- **DC-DC 60 kW：** 限幅對 Choukse 波形平滑倍率的影響沒有模擬。

## 重現性

`a2_run_all.py` 連跑兩次，6 個輸出檔的 sha256（前 16 碼）如下：

| 檔案 | 第 1 次 | 第 2 次 |
|---|---|---|
| a2_dcdc_average_model.json | 1ff31b951ffb4e94 | 1ff31b951ffb4e94 |
| a2_dcdc_heatmap.png | 3728b682016ad461 | 3728b682016ad461 |
| a2_spec_bounds_lic_sizing.json | e03026b99e5dc13d | e03026b99e5dc13d |
| a2_spec_bounds_lic_sizing.png | cd73fb4b17229345 | cd73fb4b17229345 |
| a2_worst_case.json | 7cf52a7cad6eddce | 7cf52a7cad6eddce |
| a2_worst_case.png | 38641173c6885d97 | 38641173c6885d97 |

- 第 1 次：v2 程式碼依序單獨執行三支腳本。第 2 次：`a2_run_all.py` 全套。兩次逐位元組相同。
- DC-DC 腳本單跑約 19 分鐘（`[a2-1] done in 1158.5s`）。
- `_meta.date` 會隨執行日期改變，跨日重跑時這一欄會不同。
- `git status`：既有追蹤檔都沒有被修改，A2 新增的只有 `scripts/audit/`（另有 3 個先前就存在的未追蹤檔：PTE_WALKTHROUGH.local.pdf、scripts/plot_capacity_trajectory.py、系辦得獎文案_百川.md）；`data/processed/**` 被 .gitignore 排除。沒有動任何 a1_* 檔。
- v1 的輸出 hash（9ba90e3a…等）已作廢。
