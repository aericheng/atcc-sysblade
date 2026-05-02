# X-CUBE-AI 9.x 安裝與真機 trace SOP

本文是「把附錄 C 從 proxy 升級到實機 trace」的最後一哩。當前(2026-05-03)
repo 已交付:

* **靜態 graph 分析** — `scripts/onnx_static_analysis.py`(NPU dispatch / FLASH / SRAM 估算)
* **真實 INT8 量化驗證** — `scripts/quantize_lstm_onnx.py`(size / accuracy / CPU latency,**已量測**)

仍缺的是**STM32N6 NPU 上的 per-layer cycle-accurate latency 與 power**。
這需要 STMicroelectronics 的工具鏈,流程如下。

---

## 1. 註冊 ST 帳號(5 分鐘)

開 <https://my.st.com/cas/login> → "Create an Account"。
免費,只要 e-mail 驗證。**ATCC 競賽用建議用團隊共用信箱**,
日後交接不用個人帳號綁住。

## 2. 下載 X-CUBE-AI 9.x(~1 GB,15 分鐘)

兩條路線擇一:

### 路線 A:STM32CubeMX + X-CUBE-AI 套件(推薦)

1. 到 <https://www.st.com/en/development-tools/stm32cubemx.html>
2. 下載 **STM32CubeMX 6.13** 以上(Windows / macOS / Linux 都有)
3. 開 STM32CubeMX → `Help` → `Manage embedded software packages`
4. `STMicroelectronics` 分頁找 `X-CUBE-AI` → 勾 **9.0 或更新版** → `Install Now`
5. 同樣在 STM32CubeMX 開新專案,Board 選 `NUCLEO-N657X0-Q`(ATCC 用)或
   `STM32N657i-DK`(更全功能評估板),確認 X-CUBE-AI 在 IP & Middleware 清單裡

### 路線 B:獨立 stedgeai-core CLI(進階)

ST 從 X-CUBE-AI 9.x 起把核心 toolchain 拆出 `stedgeai-core` CLI。**目前
仍須登入 ST 後從 X-CUBE-AI 套件解出**(PyPI 沒有;這是 W3+ 任務,等 ST
在 2026 後半年公開 PyPI distribution 後就能 `pip install stedgeai-core`)。
2026-05 時點本團隊**未驗證**獨立 CLI 流程,首推路線 A。

## 3. 跑 X-CUBE-AI analyse(15 分鐘)

```cmd
:: Windows CMD,在 X-CUBE-AI 安裝目錄
cd %USERPROFILE%\STM32Cube\Repository\Packs\STMicroelectronics\X-CUBE-AI\9.0.0\Utilities\windows

:: 把 atcc-sysblade 的 ONNX 餵進去
stedgeai analyze --target stm32n6 ^
                 --model %USERPROFILE%\Desktop\dev\atcc\models\lstm_rul.onnx ^
                 --workspace .\workspace ^
                 --output .\reports\lstm_rul_analyse.json
```

輸出:

* `reports/lstm_rul_analyse.json` — per-layer FLASH / RAM / cycles / NPU dispatch
* `reports/lstm_rul_analyse.txt` — 人類可讀 summary
* `workspace/network.c / network.h / network_data.c` — 量化後 C 檔

## 4. 跑 X-CUBE-AI validate(可選,30 分鐘)

需要實體 NUCLEO-N657X0-Q(NTD ~ 4000)。流程在 STM32CubeMX:
`Software Packs` → `X-CUBE-AI` → `Validate on target`。會用 ST-Link 把
網路 + 測試輸入燒進板子,跑完回傳 per-cell latency / power 真值。

## 5. 把報告灌回本 repo

把 `reports/lstm_rul_analyse.json` 複製到本 repo:

```bash
cp <path-to-x-cube-ai>/reports/lstm_rul_analyse.json \
   data/processed/x_cube_ai_real_trace.json
```

然後在 `scripts/onnx_static_analysis.py::main` 加一條 read,把 real trace
的 per-layer latency 取代 §C.4 的估算。Markdown 會自動重生。

PR 模板(複賽用):

```
docs(twin): replace appendix C estimate with real X-CUBE-AI 9.x trace

* per-layer NPU latency: <pasted from json>
* total inference latency: ___ us (vs static est 54.7 us)
* power: NPU active ___ mW vs CPU fallback ___ mW
* INT8 accuracy delta: matches scripts/quantize_lstm_onnx.py output ±0.05 pp
```

## 6. 失敗模式

| 症狀 | 原因 | 應對 |
|------|------|------|
| `stedgeai: command not found` | X-CUBE-AI 路徑沒進 PATH | 用 STM32CubeMX GUI 跑 analyse 而非 CLI |
| `Op LSTM not supported` | X-CUBE-AI < 8.0 | 升到 9.0+(LSTM 從 8.0 開始支援) |
| Validate-on-target 卡 in `wait for ST-Link` | NUCLEO 韌體舊 | STM32CubeProgrammer 升 ST-Link 韌體 |
| INT8 量化後 MAPE 退化 > 1 pp | 該模型對量化敏感 | 用 `scripts/quantize_lstm_onnx.py` 的 ΔMAPE 比照,若兩邊都退化是模型問題;若只在 X-CUBE-AI 上退化是 ST 量化策略差異 |

## 7. 為什麼本 repo 沒直接 `pip install` 跑這條?

X-CUBE-AI 9.x 的核心引擎(NPU code generator + 量化器)受 ST 商業條款保護,
PyPI 沒有 distribution。**ATCC 學生競賽用本流程是合法路徑**,但在 2026-05
時點需要本 SOP 描述的手動步驟。複賽結束後若 ST 公開 stedgeai-core PyPI 套件,
本 SOP 會更新為一行 `pip install stedgeai-core`。
