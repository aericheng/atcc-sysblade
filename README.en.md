# Sysblade HyperBuffer

> **Hybrid BBU for AI data centers + embedded battery digital-twin SaaS** · ATCC 23rd National Collegiate Entrepreneurship Competition · Case C13 (Sysgration)

[**繁體中文**](README.md) · [**Live demo**](https://sysblade-atcc.vercel.app) · [**Whitepaper v1.3**](docs/whitepaper.md) · [**Condensed v1.3**](docs/whitepaper_restructured.md) · [**Implementation Plan v2.0**](docs/BBU_IMPLEMENTATION_PLAN.md) · [**RD Brief**](docs/RD_BRIEF.md) · [**Investor Brief**](docs/INVESTOR_BRIEF.md) · [**About ATCC**](https://atcc.co/)

> This is a translation of the canonical Chinese [README.md](README.md). Headline numbers are pinned to the Chinese version by CI (`scripts/check_whitepaper_numbers.py`); if the two ever disagree, the Chinese version wins.

## Project status (2026-07)

**National runner-up, 23rd ATCC finals (2026-07-05) — the repo is now in archive / maintenance mode.** It preserves the complete competition deliverables and reproducible engineering assets; every headline number is locked to an automated validation chain (see "Validation chains" below) and can be re-run with a single `make verify`.

| Stage | Date | Delivered |
|---|---|---|
| Preliminary | 2026-05-05 | Proposal v2.2 + three-app SaaS suite live (/tco · /twin · /dashboard) |
| Semifinal pivot | 2026-05-27 | 8S hardware demonstrator (v1.x M1-M4) pivoted to **twin-first validation chains V1-V6**; all hardware returned |
| Semifinal | 2026-06-11 | Whitepaper v1.3 + `make verify` CI gate + four-domain mentor validation (tech / finance / supply chain / IP) |
| National finals | 2026-07-05 | V7 pack screening + V8 supervisory closed loop + fleet inference switched to production TCN; **national runner-up** |

---

## Real-product errata (2026-06)

> Five honest deltas between competition-stage claims and a true production-grade spec (LIC part selection / peak-shaving bounds / DC-DC / NPU model / Tier-C partitioning).

<details>
<summary><b>Expand the five-item errata table</b></summary>

| # | Competition-stage claim | Correction (production baseline) |
|---|---|---|
| 1 | Tier-A "LIC" anchored to Eaton XLR | The official Eaton XLR-48R6167-R datasheet is an **EDLC supercapacitor**; **production Tier-A moves to a true LIC (Musashi ULTIMO CPQ3300SD)** |
| 2 | 5.7× / 3.5× peak shaving | **Ideal lossless upper bound on the ±30 %/100 ms reference waveform, not a lifetime multiplier**; with DC-DC losses typically **2.4–3.9×, degrading to ~1.5× above 100 Hz** |
| 3 | Bidirectional DC-DC front end | OCP ORV3 forbids capacitors behind the Oring on the bus → **DC-DC is a compliance necessity**; the sim is an open-loop equivalent, the **power-electronics** closed loop is an EVT deliverable (the supervisory SOH→τ loop is sim-verified in **V8**, `make v8`) |
| 4 | STM32N6 NPU running LSTM (54.7 µs) | Neural-ART **NPU does not support LSTM/GRU**; production RUL moves to **TCN/1D-CNN** (NPU-native + static-INT8 quantizable) |
| 5 | Tier-C single-chip integration (incl. OpenBMC) | The M55 has no MMU and cannot run OpenBMC; **split into three layers** (BMS-AFE + safety MCU + N6 inference), the BBU speaks MCTP/PLDM and **does not claim to be a BMC** |

> Also: the first-mover window has closed; a realistic BOM is ~2.0–2.7× the v2.2 estimate; certification must extend to UL 9540 / 9540A; cell localisation is pack-assembly-first with imports handled under UFLPA. Details in `docs/product_realization/` (local deliverable, not published in this repo).

</details>

---

## TL;DR

A hardware + software play for the **North-American Tier-2/3 AI data-center BBU market** —
an **LFP + lithium-ion-capacitor (LIC) hybrid BBU** paired with a **Battery Digital Twin SaaS**, addressing three pains at once:

- **GB200 millisecond-scale voltage transients** — battery-only BBUs cannot ride the 50–200 ms sags that reboot downstream PSUs
- **48 V → ±400 V HVDC transition** — incumbents sell 48 V only; customers face a forklift upgrade after 2027
- **1000+ node fleet operations** — manual inspection has a low hit-rate; no public SaaS offers BBU-level RUL

**Six key numbers**: 5.7× lower power ripple on the battery · ~25 % LFP float-life advantage† · 33 % customer 10-year TCO reduction · 60 s graceful shutdown at 120 kW **rack** peak (**8 BBUs in parallel per rack**, dynamic ramp profile — see the mentor-focus section below) · 8.38 % RUL prediction MAPE · 3.49× INT8 quantization compression (full derivations in the [whitepaper](docs/whitepaper.md)).

> † The "~25 %" comes primarily from **low BBU duty scheduling** (§G.3 `duty_factor=0.33`, ~50 equivalent cycles/yr vs the Severson 1C/1C lab cadence), **not** from the hybrid topology; the topology's per-Ah damage delta is independently checked with rainflow counting + the Wang 2011 model (`aging_rainflow_validation.json`): worst-case ~5 %, near-neutral on the demo waveform.

---

## Validation chains (V1-V8 + XCHECK)

Every externally quoted headline number hangs off a re-runnable validation chain. Locally, `make verify` runs everything (incl. V1, which needs the Severson dataset); CI runs V2-V5 + V8 + XCHECK on every push (V1 needs the 8 GB raw Severson data and runs locally only).

| Chain | What it validates | Criterion / result | Artifact |
|---|---|---|---|
| **V1** | PyBaMM Prada2013 vs measured Severson discharge curves | RMS error **2.15 %** (gate ≤ 5 %) [v] | `data/processed/pybamm_lfp_fit_error.json` |
| **V2** | First-order LIC RC model vs Eaton XLR datasheet (+ 4 nonlinear extensions) | droop under-estimate ≤ **2.93 %** (gate 10 %) [v] | `scripts/eval_lic_rc_fit.py` |
| **V3** | Full-rack 60 s graceful dynamic sim (with thermal model) | voltage / temperature / C-rate compliant throughout, DoD 2.66 % [v] | `apps/web/public/scenarios/rack_60s_graceful.json` |
| **V4** | N-1 fault tolerance: 1 BBU dropped at t = 15 s | remaining 7 finish the full 60 s, +14 % per-unit load, still compliant [v] | `apps/web/public/scenarios/rack_n_minus_1.json` |
| **V5** | Severson → BBU-duty cross-regime transfer | MAPE 9.04 % → **80.20 %** (an honestly disclosed limitation) | `data/processed/severson_transfer_mape.json` |
| **V6** | `make verify` reproducibility orchestrator | **6/6 chains PASS** | `data/processed/verify_all_report.json` |
| **V7** | 15S pack imbalance screening (cell spread + thermal gradient + 2-cell shunt-capacitor A/B) | weakest-cell transient burden **−13.3 %** (screening, not a gate) | `apps/web/public/scenarios/pack_imbalance.json` |
| **V8** | Supervisory closed loop (SOH → τ adaptation) | aged pack peaks at 6.06C, crossing the 6C design point → loop restores **5.47C** [v] | `apps/web/public/scenarios/adaptive_split.json` |
| **XCHECK** | Whitepaper / README / UI number cross-consistency | **43/43 assertions** [v] | `scripts/check_whitepaper_numbers.py` |

---

## Mentor focus: the 60 s graceful architecture — defusing the "48C is impossible" misreading

**Conclusion**: each rack carries **8 BBUs in parallel** (2.5 kWh / 15 kW peak each, 20 kWh total);
a 120 kW rack peak maps to **6C peak per cell (not 48C)**, and the 60 s window is a dynamic ramp
(dropping to **1.5C continuous** after 2 s) — all inside automotive-grade LFP datasheet limits.
"48C impossible" comes from dividing one unit's capacity by the whole rack's power: a unit-mixing error.

<details>
<summary><b>Expand the full derivation</b> (unit-mixing guard / 60 s power profile / cell datasheet compliance)</summary>

### Why this section exists (the unit-mixing trap)

A reader who divides **one BBU's capacity (2.5 kWh)** by **the whole rack's power (120 kW)** computes
"2.5 kWh ÷ 120 kW = 75 s → 48C → physically impossible for LFP" — a fatal-looking but false contradiction.
**That is unit-mixing**: 2.5 kWh is one BBU, 120 kW is the whole rack (8 in parallel).

| Mental-math misreading | Correct arithmetic |
|---|---|
| 2.5 kWh ÷ 120 kW = **75 s → 48C** [x] | **20 kWh ÷ 120 kW = 600 s theoretical** / 60 s committed, **8× DoD margin, 6C peak per cell** [v] |

Cross-consistent sources (architecture precedes documentation):
- `scripts/generate_twin_scenarios.py:65` `N_BBU_PER_RACK = 8` · `LFP_PACK_KWH = 2.5` · `TARGET_PEAK_C_RATE = 6.0`
- `apps/web/src/lib/tco.ts:4` "Per-rack 10-year cost (USD) for a **100 kW-class rack with 8 BBUs**"

### 60 s power profile (dynamic ramp, not flat 120 kW)

| Window | Rack load | Per BBU | Per-cell C-rate | Dominant mechanism |
|---|---:|---:|:--:|---|
| **t = 0–500 ms** | 120 kW full load | 15 kW | **6C peak** | LIC-led (2× XLR-48-166, ~290 kJ usable, can hold ~2.4 s alone) |
| **t = 500 ms–2 s** | 120 → 30 kW (linear ramp) | 15 → 3.75 kW | 6C → 1.5C | BMC triggers GPU power-cap; LIC + LFP ramp down together |
| **t = 2–60 s** | 30 kW steady (checkpoint + idle) | 3.75 kW | **1.5C continuous** | LFP alone (LIC exhausted, standing by) |

Total energy over the 60 s integrates to ≈ **0.53 kWh per rack** — only **2.6 %** of the 20 kWh rack capacity
(a 38× energy margin).

### Automotive LFP datasheet compliance

| Operating point | Duration | Automotive LFP datasheet spec | Verdict |
|---|---|---|---|
| **6C peak** | < 2 s | LG ESS B-series / Samsung SDI high-power pulse ratings allow 5–10C × 30 s | [v] inside the pulse envelope |
| **1.5C continuous** | 58 s | automotive LFP continuous discharge specs of 1–3C | [v] lower edge of the continuous envelope |

**No operating point requires "automotive LFP × continuous 6C × 60 s"** (that would indeed be the
physically infeasible point behind the 48C misreading). The design confines 6C to sub-2-second pulses
and pins the 60-second continuous point at 1.5C — two different datasheet line items, each compliant.

**Full derivation**: [`docs/whitepaper_restructured.md` §2.1.1](docs/whitepaper_restructured.md)
(topology / timing / cell operating point / GPU-coordinated ramp / anticipated mentor follow-ups — a six-layer defense).

</details>

> **License & data disclaimer**: this repo is public for academic transparency and engineering
> demonstration; see [LICENSE](LICENSE). All customer / site names in the dashboard and twin
> scenarios are **fictional personas**, not deployment data (doubly marked by the disclaimer field
> in `fleet_devices.json` and the SIMULATED DATA watermark in the UI). Submission details are in
> "Project status" above.

---

## The three-app suite

| Route | What it does | Highlights |
|---|---|---|
| [`/`](https://sysblade-atcc.vercel.app/) | Landing — 5 headline cards + section guide | values pulled dynamically from scenario JSONs |
| [`/twin`](https://sysblade-atcc.vercel.app/twin) | Battery Digital Twin | PyBaMM DFN (LFP) + **closed-form RC (LIC, Eaton XLR datasheet anchor)** + TCN RUL (LSTM baseline) + 90 % MC-Dropout PI narrowed 44 % via split conformal + oscilloscope sweep animation + **v_lic(t) chart showing UVLO headroom** |
| [`/tco`](https://sysblade-atcc.vercel.app/tco) | 10-year TCO calculator | 4 sliders × 3 presets · pure HTML/Tailwind bar chart · **payback-period tile + 5-item §G.3 source-anchor panel** |
| [`/dashboard`](https://sysblade-atcc.vercel.app/dashboard) | 1000-device fleet dashboard | US fleet map + three service tiers + per-device drilldown (SOH / RUL / thermal / operational metrics + **LIC bank envelope headroom bar**) · page-wide SIMULATED DATA watermark · fictional site personas |

![Sysblade architecture](docs/figures/architecture.png)

---

## Architecture (the key design decision)

**Python physics engine pre-computes offline → JSON → Next.js build-time `fs.readFile` → static export → Vercel CDN.**

```
PyBaMM DFN simulation (Python)            scenario JSONs in two sinks:
scripts/generate_twin_scenarios.py    ─►  ├ packages/shared/scenarios/
scripts/export_lstm_onnx.py               └ apps/web/public/scenarios/
                                                      │
                                                      │ fs.readFile (build time only)
                                                      ▼
                                          apps/web Server Components
                                            → next build (static export)
                                              → out/ → Vercel CDN
```

### Physics layering — why the LIC does not go through PyBaMM

LFP gets PyBaMM DFN (the chemistry-critical side); the LIC gets a closed-form first-order RC
equivalent anchored to the Eaton XLR datasheet. Demo-waveform worst-case droop is 2.32 V with
10.98 V of headroom to UVLO; 95 % of the droop is ESR — so paralleling modules (lowering ESR)
beats adding capacitance if production needs less droop.

<details>
<summary><b>Expand RC parameters and droop decomposition</b></summary>

**The LFP cell runs PyBaMM DFN** (most complex, most critical chemistry); **the LIC side runs a
closed-form first-order RC equivalent** (`_simulate_lic_rc()` in `scripts/generate_twin_scenarios.py`),
parameters anchored to the Eaton XLR-48-166 × 2-in-parallel datasheet:

| Parameter | Value | Source |
|---|---:|---|
| Bank capacitance C | 332 F | 166 F × 2 modules in parallel |
| Bank ESR | 2.5 mΩ | 5 mΩ × 0.5 (parallel) |
| V_nominal | 51.3 V | full-charge terminal voltage |
| V_min (datasheet UVLO) | 38.0 V | Eaton XLR discharge cutoff |

On the demo waveform: **worst-case droop 2.32 V** (51.3 → 48.98 V), **10.98 V headroom to UVLO**,
`passes_cutoff = true`. Droop decomposition: **95 % from ESR drop** (926 A peak × 2.5 mΩ), 5 % from
cumulative capacitive discharge (13.31 kJ ÷ 332 F) — i.e. if production needs lower droop, adding
parallel modules (lower ESR) beats adding capacitance. **Not modelled**: pseudo-capacitance,
temperature-dependent ESR, self-discharge, electrode kinetics (Helmholtz layer dynamics) — to be
calibrated with Eaton in-the-loop measurements at the production stage. The third ChartCard on
`/twin` renders v_lic(t) with a red dashed UVLO line a mentor can point at on screen.

</details>

---

## Quick start

```bash
# 1. Web app
cd apps/web && pnpm install
pnpm dev                                      # → http://localhost:3000

# 2. Python env (optional — only needed for PyBaMM / model training)
python -m uv venv .venv --python 3.11
.venv/Scripts/activate                        # Windows bash
python -m uv pip install -e "packages/battery-twin[dev,api]"

# 3. Regenerate the 4 scenario JSONs (after changing physics constants; writes both sinks)
pnpm scenarios                                # = scripts/generate_twin_scenarios.py

# 4. Number cross-check gate (also runs in CI)
pnpm check:numbers                            # = scripts/check_whitepaper_numbers.py

# 5. Full web check + build
cd apps/web && pnpm check                     # typecheck + lint + check:numbers
pnpm build                                    # run before pushing main
```

The Severson .mat v7.3 training data (8.3 GB) is a manual download — see
[`docs/severson_download.md`](docs/severson_download.md); `data/raw/` and `data/processed/` are
gitignored (only `.gitkeep` and 4 derived JSONs are committed for the number checker).

<details>
<summary><b>More reproducibility commands</b> (LSTM retrain / full sweep / INT8 quantization / cross-dataset / NPU static analysis)</summary>

```bash
# Retrain LSTM + export ONNX (~3 min CPU)
python scripts/export_lstm_onnx.py            # → apps/web/public/scenarios/model_validation.json

# OLS / GBT / bagged-* full sweep (the model-card table)
python scripts/eval_severson_models.py        # → data/processed/severson_model_eval.json

# INT8 dynamic-quantization check (whitepaper Appendix C.5, ~30 s)
python scripts/quantize_lstm_onnx.py          # → data/processed/lstm_quantization_report.json

# Cross-dataset (Severson → NASA NMC) cross-chemistry test
python scripts/eval_cross_dataset.py          # → data/processed/cross_dataset_mape.json

# STM32N6 NPU static graph analysis
python scripts/onnx_static_analysis.py        # → data/processed/x_cube_ai_static_analysis.json
```

</details>

---

## Model card

Two RUL pipelines run side by side — **"one model, two views"**: `/twin` and `/dashboard` consume
the same **production TCN** inference output (whitepaper §3.4.1). Headline numbers:

- **Production TCN (dilated 1D-CNN, NPU-native)**: test MAPE **18.15 % / R² 0.892**; INT8 QAT (ONNX QDQ) measured at **14.54 %**
- **Academic baseline bagged-GBT (13-feat)**: random-split **8.38 %** (meets the < 10 % commitment); cross-batch falls back to bagged-OLS at **13.9 %**
- **LSTM 19.10 %** retained as the documented baseline and the regime-augmentation counter-evidence carrier

<details>
<summary><b>Expand the full model card</b> (full Severson regression table / TCN vs LSTM / augmentation rebuttal / INT8 measurements)</summary>

### Severson cycle-life regression (random split, 10-seed median)

| Model | Random-split MAPE | Cross-batch MAPE | R² | Notes |
|---|---:|---:|---:|---|
| Variance OLS (1-feat / unfiltered) | 17.9 % | 15.8 % | 0.57 | reproduces the Severson 2019 headline |
| Discharge OLS (5-feat) | 17.5 % | 19.9 % | 0.53 | paper Table 1, 5 features |
| Full + IR OLS (13-feat) | 14.5 % | 14.5 % | +0.08 | adds internal resistance, **cross-batch R² turns positive** |
| **Full + IR bagged-GBT (K=24, xstrict ≥400, n=134)** | **8.38 %** | 17.9 % (GBT degrades) | **0.89** | **first to meet the proposal Appendix B < 10 % commitment**; per-seed [5.93, 12.91], 7/10 seeds < 10 % |
| **Full + IR bagged-OLS (13-feat / xstrict)** | 12.4 % | **13.9 %** | +0.21 | best cross-batch generalisation |

**Target met**: bagged-GBT + the xstrict cell filter pulls the random-split median MAPE from 14.51 %
down to **8.38 %**. Cross-protocol deployment uses bagged-OLS instead (13.87 %) — GBT overfits
protocol-specific features and degrades cross-batch.

### Sequence models (production = TCN, LSTM as baseline)

> **Production fleet model = TCN**: fleet inference on `/twin` and `/dashboard` runs a dilated 1D-CNN
> (NPU-native, zero recurrent ops; QAT-exported as an **ONNX QDQ artifact**
> (`models/tcn_rul.int8.qat.onnx`, QuantizeLinear/DequantizeLinear), onnxruntime measured at
> **14.54 % MAPE**, torch backend 14.68 % / R² 0.948, FP32 18.15 % / R² 0.892 — beating LSTM's
> 19.10 %). Measurements in `data/processed/tcn_rul_report.json` and whitepaper §3.4.1. The LSTM
> numbers below are retained as the documented baseline and augmentation counter-evidence.

> **Augmentation rebuttal (P1-1)**: running `python scripts/export_lstm_onnx.py --severson-only`
> with the same LSTM architecture, seed=42, and 60/20/20 random split, trained only on the 138 real
> Severson cells (dropping the 50 synthetic BBU cells) yields test MAPE **16.17 %**, R² **0.553**,
> conformal PI median width **793 cycles** (full JSON in `data/processed/lstm_severson_only_eval.json`).
> **Augmentation moves MAPE from 16.17 → 19.10 % — slightly up** (it must fit a 100–13,000-cycle
> dynamic range); R² rising 0.55 → 0.86 reflects the larger explainable variance once long-life cells
> are included. **Augmentation is purely regime coverage, not a MAPE trick** — this rebuttal lives in
> whitepaper §3.3.8 against the fair "are the synthetic BBU cells self-fulfilling?" challenge.

| Item | Value | Notes |
|---|---:|---|
| Training cells | **188** | 138 Severson 2019 fast-charge + 50 Severson-anchored synthetic BBU-duty (analytic decay, not PyBaMM aging) |
| Test MAPE (random split) | **19.1 %** | Severson-only baseline → spans both regimes after augmentation |
| Test R² | **0.86** | high explanatory power despite the cross-regime trade-off |
| ONNX size | FP32 219 KiB → **INT8 63 KiB (3.49× compression, measured)** | far below the STM32N6 1.6 MB ML FLASH; measured by `scripts/quantize_lstm_onnx.py` |
| INT8 accuracy cost | **ΔMAPE +0.10 pp** (19.10 → 19.20 %), R² unchanged | mean prediction shift 0.57 %; the go/no-go evidence for STM32N6 deployment |
| ONNX latency (laptop CPU p99) | FP32 0.44 ms / INT8 0.40 ms | ~125× inside the 50 ms spec; STM32N6 NPU estimated 27–109 µs (static graph analysis, `scripts/onnx_static_analysis.py`) |
| Uncertainty method | MC Dropout + split conformal | 100 forward passes, **raw 1910 → conformal 1075 cycles** (44 % narrower), test coverage 100 % with a ≥ 90 % guarantee, 37 held-out calibration cells |

**Production inference runs on the TCN** (§3.4.1; LSTM is the documented baseline); bagged-GBT
13-feat is the "Severson-paper-aligned" academic baseline (< 10 % commitment met).
**The MAPE increase is the price of closing the regime gap** — full discussion in whitepaper
[§3.3.5](docs/whitepaper.md).

</details>

---

## Repository layout

<details>
<summary><b>Expand the file tree</b></summary>

```
atcc/
├── docs/
│   ├── proposal_v2.2_additions/
│   │   └── Sysblade_HyperBuffer_Proposal_v2.2.docx  proposal v2.2 (2026-05-06, primary submission)
│   ├── whitepaper.md                            technical whitepaper v1.3 (canonical, full)
│   ├── whitepaper_restructured.md               condensed v1.3 (three-part)
│   ├── RD_BRIEF.md / INVESTOR_BRIEF.md           RD / investor briefs (v2.0)
│   ├── BBU_IMPLEMENTATION_PLAN.md               implementation plan v2.0 (twin-first)
│   ├── MIRROR_SETUP.md / BINDER_README.md        contingency + semifinal paper binder
│   ├── severson_download.md                     Severson 2019 .mat v7.3 download SOP
│   ├── x_cube_ai_install_sop.md                 STM32N6 X-CUBE-AI install SOP
│   └── figures/                                 architecture diagram + screenshots + BMC canvas
├── apps/
│   └── web/                                     Next.js 14 three-app suite (static export)
│       ├── src/app/
│       │   ├── page.tsx                          /
│       │   ├── twin/page.tsx + twin-client.tsx   /twin
│       │   ├── tco/page.tsx + tco-client.tsx     /tco
│       │   └── dashboard/page.tsx + ...          /dashboard
│       ├── public/scenarios/                     pre-computed PyBaMM JSONs (read at build time)
│       └── src/lib/{tco.ts, types.ts}            TCO formulas + Device types
├── packages/
│   ├── battery-twin/                             Python: physics + ML
│   │   ├── lstm_rul/                             PyTorch LSTM + linear baseline
│   │   └── data_loaders/                         Severson + NASA + CALCE parsers
│   └── shared/scenarios/                         JSON dual-write sink #2
├── notebooks/                                    EDA + training smoke tests
├── scripts/
│   ├── generate_twin_scenarios.py                4 PyBaMM scenarios + 1000-device fleet (single generator, two sinks)
│   ├── generate_full_rack_60s_sim.py             V3 full-rack 60 s graceful sim + thermal model
│   ├── generate_n_minus_1_sim.py                 V4 N-1 BBU fault-tolerance sim
│   ├── generate_adaptive_split_sim.py            V8 supervisory closed loop (SOH → τ adaptation) sim
│   ├── generate_bbu_duty_cells.py                50 Severson-anchored synthetic BBU-duty cells (analytic decay)
│   ├── eval_pybamm_lfp_fit.py                    V1 PyBaMM vs measured Severson fit (2.15 % RMS)
│   ├── eval_lic_rc_fit.py                        V2 LIC RC vs Eaton datasheet (incl. nonlinear extensions)
│   ├── eval_severson_transfer.py                 V5 cross-regime transfer MAPE
│   ├── eval_severson_models.py                   OLS / bagged-OLS / GBT / bagged-GBT / HistGBT / stack sweep
│   ├── eval_cross_dataset.py                     Severson → NASA NMC cross-chemistry test
│   ├── train_tcn_rul.py · export_tcn_onnx.py     production TCN training + ONNX (QAT / QDQ) export
│   ├── export_lstm_onnx.py                       LSTM baseline + MC Dropout + split conformal
│   ├── quantize_lstm_onnx.py                     INT8 dynamic quantization + accuracy delta + CPU latency
│   ├── onnx_static_analysis.py                   STM32N6 NPU static graph analysis
│   ├── hybrid_control_emulator.py                Python mirror of the STM32 control law (V3 baseline)
│   ├── calibrate_from_measured.py                H3 bench calibration: measured CSV → replaces datasheet anchors (pre-EVT)
│   ├── verify_all.py                             V6 orchestrator (make verify / verify-fast)
│   └── check_whitepaper_numbers.py               XCHECK: whitepaper / README / UI number cross-check gate
├── firmware/stm32_hybrid_control/                STM32F411 firmware skeleton (v1.x archive; engineering process evidence)
├── models/                                       gitignored (LSTM / TCN ONNX artifacts, regenerable by scripts)
├── data/raw/  data/processed/                    gitignored (>8 GB; only derived JSONs committed for CI)
├── Makefile                                      make verify / verify-fast / v8 entry points
└── DEPLOY.md
```

</details>

---

## Deployment

`apps/web/` auto-deploys on Vercel (build triggered by pushes to `main`).

- **build command**: `npm install --legacy-peer-deps && next build` (works around the pnpm 9 + Node 22 `ERR_INVALID_THIS` URLSearchParams bug, see `vercel.json`)
- **output**: `output: "export"` — pure static, served from the Vercel CDN
- **rollback**: one click back to the previous commit in the Vercel dashboard

Full SOP in [`DEPLOY.md`](DEPLOY.md).

---

## Documentation

Core documents:

| Document | Purpose |
|---|---|
| `docs/proposal_v2.2_additions/…Proposal_v2.2.docx` (with financials, not published) | **competition proposal v2.2** (2026-05-06, canonical business spec) |
| [`docs/whitepaper.md`](docs/whitepaper.md) | technical whitepaper **v1.3** (**canonical full version**: complete evidence + limitations + validation chains) |
| [`docs/whitepaper_restructured.md`](docs/whitepaper_restructured.md) | condensed **v1.3** (three-part quick-flip; numbers defer to the canonical version) |
| [`docs/BBU_IMPLEMENTATION_PLAN.md`](docs/BBU_IMPLEMENTATION_PLAN.md) | implementation plan **v2.0** (twin-first; the v1.x hardware track preserved as archive) |
| [`docs/RD_BRIEF.md`](docs/RD_BRIEF.md) | 2-page executive brief for RD / consultants |
| [`docs/INVESTOR_BRIEF.md`](docs/INVESTOR_BRIEF.md) | 1-page investor narrative |
| [`DEPLOY.md`](DEPLOY.md) | Vercel deployment SOP |

<details>
<summary><b>More documents</b> (handover / operations / legal / pre-EVT / historical records)</summary>

| Document | Purpose |
|---|---|
| [`docs/BBU_PROPOSAL.md`](docs/BBU_PROPOSAL.md) | submitted proposal v2.0 — twin-first validation implementation plan |
| `docs/SysBlade_HyperBuffer_複賽實作企劃_v3.1.docx` (not published) | semifinal implementation plan v3.1 (software depth + technical endorsement + business case + IP strategy) |
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | handover doc (v2.0 guide + v1.x archive; §5 numbers pinned by XCHECK) |
| [`docs/hardware_characterization_protocol.md`](docs/hardware_characterization_protocol.md) | H3 bench measurement protocol (pre-EVT, paired with `scripts/calibrate_from_measured.py`) |
| [`docs/severson_download.md`](docs/severson_download.md) | Severson 2019 three-tier download fallback SOP |
| [`docs/MIRROR_SETUP.md`](docs/MIRROR_SETUP.md) | standby mirror SOP (GitHub account contingency) |
| [`docs/BINDER_README.md`](docs/BINDER_README.md) | semifinal-day paper binder checklist (historical) |
| [`docs/IP_AUDIT.md`](docs/IP_AUDIT.md) | IP / licensing inventory (pre-legal-review draft) |
| [`docs/JOINT_PROCUREMENT_STRATEGY.md`](docs/JOINT_PROCUREMENT_STRATEGY.md) | joint-procurement four-lever supply-chain supplement |
| [`docs/x_cube_ai_install_sop.md`](docs/x_cube_ai_install_sop.md) | STM32N6 X-CUBE-AI install SOP (EVT-dependent, never started) |
| [`docs/citations_audit.md`](docs/citations_audit.md) | external-citation verification audit (targets v2.1, historical) |
| [`docs/archive_v1.x/PURCHASE_LIST.md`](docs/archive_v1.x/PURCHASE_LIST.md) | v1.x purchase list (fully returned 2026-05-27) |

</details>

---

## Acknowledgements

- **Severson, K.A. et al. (2019)** *Nature Energy* **4**, 383–391 — the 124-cell LFP fast-charge public dataset
- **Sulzer, V. et al. (2021)** *Journal of Open Research Software* **9**, 14 — PyBaMM (Doyle-Fuller-Newman PDE solver)
- **Prada, E. et al. (2013)** *J. Electrochem. Soc.* **160**, A616–A628 — the LFP-graphite DFN parameter set used here
- **Choukse, E., Buck, I., Alben, J. et al.** (Microsoft + NVIDIA, 2025), arXiv:2508.14318 — Power Stabilization for AI Training Datacenters (GB200 power-swing context; the §2.3.2 worst-case 10 C × 30 ms pulse is the team's per-cell downscaling from this paper)
- **JLL Research, Year-End 2025 Report** — North-American colo build-out baseline (the proposal §C.1 cites Texas 18.6 % / Virginia 15 %; the 1000-device fleet simulation reweights to Texas 49 % / Virginia 27 % by AI-datacenter density — **a simulation assumption, not JLL's numbers**)
- **Sysgration Ltd. (TWSE 6312)** — the ATCC C13 case sponsor
