# 硬體特性量測 protocol — H3 twin 校準

> 目的:用系統電提供的真實 LFP 電芯 + LIC 模組,量測 capacity / OCV-SOC / DCIR / C / ESR,
> 校準 Sysblade twin(V1 PyBaMM LFP fit / V2 LIC RC droop),把證據從
> 「model vs datasheet/Prada2013」升級成「model vs measured on real hardware」。
>
> 配套程式:`scripts/calibrate_from_measured.py`(吃本文件定義的 CSV → 算參數 → 重算
> V2 droop → 輸出 `data/processed/measured_calibration.json`)。
>
> 定位:這是 twin-first 的 **bench 驗證**,不是改做硬體;是 EVT 2026 Q4 要做的事的安全縮小版。

---

## 0. 安全(必讀,未滿足不上電)

- [ ] 現場 **>= 1 位系統電工程師陪同**(單人不得獨自操作高功率電池/電容)
- [ ] E-stop 伸手可及;滅火就位(Class D / 沙桶 / Lith-Ex,鋰電池適用)
- [ ] 護目鏡、絕緣工具;接線用適當線徑 + 在線保險絲(fuse)
- [ ] 防火墊 / LiPo 防爆袋;桌面無導電雜物
- [ ] **單體(single cell, 3.2 V)優先量測;不組整 15S 48 V 高壓 pack**
- [ ] LIC 充電務必限流(CC);放電電流 `I_step <= IDCMAX`(看 datasheet)
- [ ] 量測完把 cell / LIC 放到安全存放 SOC(cell ~30-50%,LIC 放電至低電壓)
- [ ] 全程記錄溫度;cell 表面 > 45 C 或 LIC > datasheet 上限即停機

---

## 1. 給系統電的設備需求清單

最佳做法:**借半天到一天實驗室時段 + 1 位工程師陪同**(一次解決設備、品質、安全)。

| 項目 | 規格 / 數量 | 用途 |
|---|---|---|
| LFP 電芯(單體) | spec 級 2-4 顆,附 datasheet | 容量 / OCV / DCIR |
| LIC / 電容模組 | spec 級 1-2 顆,附 datasheet | C / ESR |
| 電芯 cycler 或 程控電子負載 + 程控電源 | 含資料記錄(logging) | 充放電 + 脈衝 |
| 量測 / 記錄 | USB 示波器 或 高速 DAQ(>= 1 kHz)量階躍邊緣 | ESR / DCIR R0 |
| 溫度 | K-type thermocouple x2 或 IR 測溫槍 | 安全 + 溫度欄位 |
| 安全 | fuse、線材、防火墊 / LiPo 袋、護目鏡 | 見 §0 |

> 量測項目(列給系統電看,顯示你知道在量什麼):
> cell 容量(Ah)、OCV-SOC、**DCIR @ 多個 SOC**;LIC **電容 C(F)**、**ESR(mΩ)**、(選)1C/2C 脈衝波形。

---

## 2. 量測項目、步驟、CSV 格式

所有 CSV **第一列為欄名**,逗號分隔,放到 `data/raw/measured/`。
先跑 `python scripts/calibrate_from_measured.py --make-template` 會產生可參考的範例檔(內含合成資料,直接覆蓋成實測即可)。

### 2.1 LIC:電容 C + ESR(constant-current step 法)

原理:定電流放電時 `V(t) = V0 - I*ESR - (I/C)*t`。
- 階躍瞬間的歐姆跳變 -> `ESR = ΔV_jump / I`
- 放電斜坡的斜率 -> `C = I / |dV/dt|`

步驟:
1. LIC 限流充到接近 nominal(例 51.3 V bank,或單模組額定),靜置 30 s。
2. 施加定電流放電 `I_step`(建議 2-5 A,且 `<= IDCMAX`),持續 5-10 s,再切回 0 A。
3. **階躍邊緣(on/off 那兩瞬間)取樣率 >= 1 kHz**(量 ESR 跳變);斜坡段 >= 10 Hz 即可。

CSV `lic_step.csv` 欄位:
```
t_s,i_a,v_v,temp_c
```
- `i_a`:放電為正或負皆可(script 取 `|i|`);`temp_c` 可選。

跑:`python scripts/calibrate_from_measured.py --lic data/raw/measured/lic_step.csv --i-step 4.0 --n-parallel 2`
(`--n-parallel` = 你 bank 並聯模組數,用來把單模組量測換算成 bank 重算 V2 droop。)

### 2.2 Cell:容量(CC 放電 coulomb counting)

步驟:
1. 依 datasheet CC-CV 充滿(例 CC 0.5C 到 3.65 V,CV 到電流降至 0.05C),靜置 30 min。
2. CC 放電(建議 0.5C)到下限截止(例 2.5 V)。
3. 取樣 1 Hz 即可。

CSV `cell_capacity.csv` 欄位:
```
t_s,i_a,v_v,temp_c
```
- **放電電流請記為負值**(script 以負電流判定放電;若你的設備記正值,script 會自動以 `|i|` 退回判定)。

跑:`python scripts/calibrate_from_measured.py --cell-capacity data/raw/measured/cell_capacity.csv --cell-nominal-ah <銘牌Ah>`

### 2.3 Cell:DCIR(脈衝法,多 SOC)

步驟:
1. 把 cell 調到目標 SOC(建議 90 / 70 / 50 / 30 %)。
2. 每個 SOC 施加 ~1C、10 s 放電脈衝,前後各靜置 >= 30 s。
3. **脈衝起始邊取樣率 >= 1 kHz**(量 ohmic R0 跳變)。

CSV `cell_dcir.csv` 欄位(多 SOC 串成一個檔):
```
t_s,i_a,v_v,soc_pct
```
- `soc_pct`:該脈衝對應的 SOC(讓報告標出每點 R0)。

跑:`python scripts/calibrate_from_measured.py --cell-dcir data/raw/measured/cell_dcir.csv`

> R0(ohmic DCIR)是 BoL 內阻;它 **錨定老化模型「80% SOH 時 DCIR +50%」的起點**
> (`apps/web/src/lib/aging.ts` / `scripts/generate_twin_scenarios.py`)。

### 2.4 (選,有時間再做)Cell:OCV-SOC 曲線

每放電 10% SOC 靜置 30-60 min,記錄靜置末端電壓當 OCV。時間成本高,排在最後。

---

## 3. 跑校準 + 驗收

一次跑全部:
```bash
python scripts/calibrate_from_measured.py \
  --lic data/raw/measured/lic_step.csv \
  --cell-capacity data/raw/measured/cell_capacity.csv \
  --cell-dcir data/raw/measured/cell_dcir.csv \
  --cell-nominal-ah <銘牌Ah> --plot
```
輸出 `data/processed/measured_calibration.json`(+ 選配 PNG)。

**進實驗室前先驗證 pipeline(不需硬體)**:
```bash
python scripts/calibrate_from_measured.py --selftest        # 合成已知參數 -> 驗證能回推
python scripts/calibrate_from_measured.py --make-template   # 產生可跑的範例 CSV
```

驗收標準(是「在同一量級」的 sanity gate,不是準度宣稱):

| 量測 | 通過條件 | 不通過的意義 |
|---|---|---|
| LIC C | 與 anchor 偏差 <= 20% | 你拿的模組規格與 spec 不同,需更新 anchor |
| LIC ESR | <= 30% | 同上 |
| 重算 V2 droop | 用實測 C/ESR 重算,UVLO headroom > 0 -> PASS | 實測下 droop 逼近 UVLO,需設計修正 |
| Cell 容量 | 與銘牌偏差 <= 10% | cell 衰減 / 規格不符 |
| Cell DCIR R0 | 量到即可(錨定老化起點) | — |

> **吻合或不吻合都是誠實的 measured 結果**。吻合 -> twin 升級成「對齊實測」;
> 不吻合 -> 這就是為什麼要實測校準,且明確指出哪個 anchor 要在 EVT 前修。

---

## 4. 接進簡報的話術

- 對馮博堅 / 技術業師:「27-109 μs NPU latency 還是估算,但**電芯與電容的物理參數我們實測了**
  ——C / ESR / DCIR / 容量量在系統電給的真硬體上,V2 droop 用實測值重跑仍 PASS。」
- 對電化學業師(Q5 Prada2013):「我們不主張 chemistry 等同;**真 cell 的容量 / DCIR / OCV 已量**,
  twin 用實測錨定,不只靠 2013 參數集。」
- 對加百裕 A4(老化後功率):「老化模型的 DCIR +50% 不是空談,**BoL R0 我們量了當起點**。」
- 對白崇亮 / 孫宗德:「這是 twin 預測、實機量到的閉環——真產品該有的 measured 證據。」

驗收後把 `measured_calibration.json` 的 headline 數字 + 對照圖,加到
`PRESENTATION_GUIDE.md`「實作成果」段,並在簡報「實作成果與可行性驗證」放一張
「twin(datasheet)vs measured」對照。
