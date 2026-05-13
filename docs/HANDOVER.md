# ⏭ 後續待辦(換裝置接手用)

> 本節是 internal handover note。**這個 commit(化解 48C 誤讀 + §2.1.1 動態
> graceful ramp 防禦)在原機沒辦法跑 `pnpm install`(node_modules 不存在),
> 所有改動都是 markdown / 文字層,JSX 改的也只是字串 prop,不太可能打到
> typecheck,但換機後請務必跑下列驗證再正式繳交。**

## 1. 換機後第一件事 — 本地驗證

```powershell
# 從 repo root
pnpm install                            # 安裝 monorepo 依賴
Set-Location apps\web
pnpm typecheck                          # tsc --noEmit,確認 page.tsx + twin-client.tsx 沒語法問題
pnpm lint                               # next lint
pnpm check:numbers                      # 跨檔數字一致性 gate
pnpm build                              # next build,確認 static export OK
pnpm dev                                # 開 localhost:3000 視覺驗證下列三點:
                                        #   (a) 首頁「5 kJ / rack rule」卡片有 "8 BBUs in parallel · 15 kW & 6C peak per BBU"
                                        #   (b) /twin Method 面板的 Physics tile 展開後有 unit-mixing pitfall 說明
                                        #   (c) GitHub repo 顯示 README 時,⭐ 業師最關注點 區塊在 TL;DR 後立即可見
```

## 2. 已 ship + 已防禦的部分

- ✅ `docs/whitepaper_restructured.md` §2.1 + §2.1.1(170 行)— 拓撲層 / 時序層 / cell 工作點層 / GPU 協同 ramp / 業師六題答辯
- ✅ `docs/whitepaper.md` §2.1 開頭 unit-mixing 警告 blockquote
- ✅ `README.md` TL;DR 後的 ⭐ 業師最關注點 區塊
- ✅ `apps/web/src/app/page.tsx` + `twin-client.tsx` 補 8-BBU 註

## 3. 沒做但可選做的事(優先序)

| 任務 | 動機 | 估時 | 何時做 |
|---|---|---|---|
| **(P2)** `scripts/generate_twin_scenarios.py` 新增 `scenario_mains_fail()`,output `mains_fail_profile.json` 跑 60 秒動態 ramp 曲線 | 讓 §2.1.1 的 power profile 有 simulator 數據佐證,不是純文字 | 2–3 hr | 若業師追問「你動態 ramp 有跑過嗎?」 |
| **(P2)** `/twin` 加新 tab 視覺化 graceful 曲線 | 讓上述 JSON 在 UI 上看得到,不只 README 文字 | 2–3 hr | (P2 同步做)|
| **(P3)** 選具體車規 LFP cell datasheet(LG ESS B-series 確切 part #、Samsung SDI 確切 part #)寫進 §2.1.1 C 段 | 業師可能追問「具體哪一顆?」目前 narrative 是「W3 EVT 階段定」,如果要更硬挺可預先點名 | 1 hr 找 datasheet + 半小時改字 | EVT 工程板下單前 |
| **(P3)** `docs/figures/` 新增 graceful_ramp.svg power-vs-time 曲線圖,嵌入 §2.1.1 + README ⭐ 區塊 | 視覺化勝過表格 | 2 hr | 若簡報投影片要用同一張圖 |
| **(P4)** 把 §2.1.1 翻譯成英文版放在 `docs/whitepaper_en.md` | 國際業師 / 評審用 | 1 hr | 若有國際評審 |
| **(P4)** 跟 v2.2 docx 同步:`scripts/generate_proposal_v22.py` 是否也要把 8-BBU 註明寫進企劃書本文? | 目前企劃書 docx 沒提 8-BBU,只有白皮書有。如果業師讀 docx 又算出 48C 還是會出事 | 改 generator + 重跑 = 1–2 hr | **若 docx 還會再交一版才做;v2.2 已繳交版不動** |

## 4. 沒做且不建議做的事(對齊先前討論)

- ❌ **換高功率 LFP cell**(原 2a 方案)— 動 BOM、TCO 33%→28%、踩 BABA Act / CFIUS。Reduced 2b(用 pulse vs 連續詮釋 + 動態 ramp profile)已足以保留車規 LFP narrative,**不要再走這條**。
- ❌ **加大電池容量到 8–24 kWh / 台**(原 A 方案)— 打死 12U 形狀因子,**不要走**。
- ❌ **降低峰值宣稱**(原 B 方案)— 違反「per rack 一台 BBU」product narrative,**不要走**。

## 5. 答辯場合的兩句話備案(背起來)

> 「Sysblade 是 **per-rack 8 台 BBU 並聯**架構,單台 BBU 2.5 kWh / 15 kW peak,
> 在 rack 級 120 kW 下每台 BBU 工作在 **6C peak / 1.5C 連續**,**6C 是 < 2 秒 pulse**
> 落在車規 LFP datasheet pulse 5–10C 規格內,**1.5C 是 58 秒連續放電**落在連續
> 1–3C 規格內。**20 kWh per rack 總能量**在 60 秒 graceful 下只用 **0.53 kWh
> = 2.6 % DoD**,留 38 倍能量餘量。」

> 「如果業師讀白皮書算出 48C 不可行,那是 **unit-mixing**:**單台 BBU 容量
> (2.5 kWh)** 除 **整 rack 功率(120 kW)** 算出來的,正確算法是
> **20 kWh ÷ 120 kW = 600 秒**理論值,60 秒承諾留 8 倍 DoD 餘量。完整防禦
> 在白皮書 §2.1.1。」

## 6. 還沒解決的開放問題(下一次內部對齊用)

- **GPU power-cap 收斂時間 ~1 秒這個數字 citation 不夠硬**。NVIDIA 沒公開
  spec,目前是 W3 EVT 才會實測。如果業師追到第三刀,只能用「W3 交付物」
  framing。團隊內若有 NVIDIA / GB200 BMC 實作經驗的人,可以提早收斂這個
  數字的 confidence。
- **車規 LFP cell pulse spec 5–10C × 30 秒** 的具體 datasheet 引用尚未在
  whitepaper 點名(目前是「LG ESS B-series / Samsung SDI 高功率版均為候選」
  的 placeholder)。可選 P3 任務改善。
- **Reduced 2b 的 simulator scenario(P2)沒做**:文字描述了動態 ramp 但沒有
  PyBaMM 模擬數據佐證。如果簡報需要演示曲線,這條變成 P1 必做。
