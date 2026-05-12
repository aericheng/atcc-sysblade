# Citation backing — verification audit

**Audit date**: 2026-05-12
**Method**: Read `docs/Sysblade_HyperBuffer_Proposal_v2.1.pdf` (18 pages) via
`pypdf`, grep for each cited §-anchor and verify the referenced text exists
verbatim with the claimed numbers. External citations (Severson Nature paper,
NVIDIA arXiv, Eaton datasheet, etc.) require WebFetch and are listed under
"Pending" if not verified here.

This audit closes part of the deferred work flagged in the
[`project_citation_verification_pre_rematch`](.) memory note.

---

## ✅ Verified — citation IS present and number matches

| Claim in our repo | v2.1 PDF location | Verified text |
|---|---|---|
| §G.3 TCO Table 6 numbers (5760 / 8640 / 4800 / 5000 / 1800 / 1200 / 29000 / 19400) | p15 §G.3 | 「初次採購 USD 5,760 / USD 8,640 +2,880; 電池組更換 8,640 / 5,760 −2,880; 瞬態事件 4,800 / 1,200 −3,600; 維運人力 5,000 / 2,000 −3,000; HVDC 4,800 / 1,800 −3,000; 10 年 TCO 29,000 / 19,400 −9,600 (−33%)」 — exact match |
| §G.3 「替換 1.5 vs 1」footnote | p15 §G.3 | 「『電池更換次數 1.5 vs 1』係依 LFP 在 BBU 浮充應用實測 8–12 年壽命估算」— this is the canonical source for the 「8–12 yr LFP 浮充壽命」claim |
| §G.3 Severson [12] cycle-loss model | p15 §G.3 | 「『瞬態壽命衰減』採 Severson [12] 推導之循環損耗模型」 |
| §E.1 Tier-B: LFP 15S × 3.2 V = 48 V | p7 §E.1 | 「採車規 LFP 整合 pack (2.5 kWh, 15S 配置)。15S 為 LFP 化學體系 (3.2V 標稱) 達 48V 標稱所需的合理串聯數 (3.2 × 15 = 48V),最高充電 3.65 × 15 = 54.75V 落在 OCP ORV3 v1.4 60V 上限內」 |
| §E.1 Tier-B: 60 sec graceful @ 120 kW | p7 §E.1 | 「2.5 kWh ÷ 120 kW = 75 秒理論最大值;實務以 80% DoD 操作 → 60 秒有效備援,落在規格 30–90 秒區間內」— matches our README headline #4 |
| §E.1 LIC: 2× Eaton XLR 並聯 + 10⁷ cycles | p7 §E.1 | 「LIC 工作於『淺充淺放』區間,規格 100 萬次循環可實際延伸至 10⁷ 次以上, 跨越 BBU 10 年服役期」+ 「Eaton XLR 是市售最小可採購單元」 |
| §C.2: 15S LFP + 60 V upper bound | p4 §C.2 | 「OCP ORV3 v1.4 BBU 規格 [7] 採 48V 標稱、最高 60V 直流。若以 LFP 化學體系 (3.2V 標稱) 配置,合理串聯數為 15S(3.2V × 15 = 48V,最高充電電壓 3.65V × 15 ≈ 54.75V,落在 60V 上限內)」 |
| §E.2: MAPE < 10 % goal, Severson 9.1 % anchor | p8 §E.2 | 「誤差目標 MAPE < 10% (對標 Severson [12] 9.1% 早期預測誤差;Attia 2020 [13] 達 9.0%)」 |
| §E.2: 「未上實機資料前不承諾 < 5%」 | p16 (附錄) | 「誤差目標 MAPE < 10% (Severson [12] 早期 9.1% 為對標,未上實機資料前不承諾 < 5%)」 |
| §B.1: NVIDIA GB300 PSU caps for 30 % swing | p3 §B.1 | 「NVIDIA GB300 已在 PSU 中整合電容儲能以實現 30% 削峰 [3]」 |
| arXiv:2508.14318 attribution = Microsoft Azure | (was verified 2026-05-04 via WebFetch — see citation_verification memory) | Paper title "Power Stabilization for AI Training Datacenters", Choukse et al. Microsoft+NVIDIA 2025 |
| §3.4.2 三家競品 2024 財報 (Eaton $24.9B / Vertiv $8.0B / Schneider €38.2B) | (verified 2026-05-04 — see memory) | All verified |

---

## ⚠️ Citation needs rewording — text exists but claim attribution is off

| Original claim | What's actually in v2.1 PDF | Fix |
|---|---|---|
| 「BBU duty averages ~50 cycles/yr (**v2.2 §B.2**)」(dashboard SOH Disclosure + drilldown text + /twin aging hint) | v2.1 §B.2 (p3) covers market positioning + 5% market share goal, NOT duty cadence. Search of full 18-page PDF for 「年循環」/「cycles per year」/「每年循環」returns **zero hits**. The 「50 cycles/yr」 is an engineering estimate not stated in §B.2. | ✅ Fixed in commit (this audit run): reword to 「engineering estimate anchored to v2.1 §G.3 footnote + §E.1 Tier-B 『LFP BBU 浮充 8-12 yr life』」 instead of citing §B.2 verbatim. |

---

## External citations — 2026-05-12 WebFetch round outcome

Attempted WebFetch on 8 external citations. Results below; **2 fully verified,
2 partially verified, 4 blocked by paywall / vendor-page timeout / authentication**.

### ✅ Fully verified

| # | Citation | Verification |
|---|---|---|
| 6 | **Marquis 2019** *J. Electrochem. Soc.* 166 A3693 — "An Asymptotic Derivation of a Single Particle Model with Electrolyte", Marquis / Sulzer / Timms / Please / Chapman | DOI <https://doi.org/10.1149/2.0341915jes> WebFetch returned full match. Paper IS the SPM/SPMe derivation. **Benchmark wording note**: paper reports "order of magnitude (~10×) decrease in computation time" (Model Comparisons § / Figure 4) + "SPMe requires just over 10% of the memory required by the DFN model" (900 → 110 states). Our repo's "5–10×" framing is in range but cherry-picks the upper end; "~10× faster + 10× memory reduction" is the more honest reading. **whitepaper.md:165 wording acceptable, optionally tighten to ~10×**. |
| 7 | **arXiv:2508.14318** — Choukse et al. Microsoft+NVIDIA 2025 "Power Stabilization for AI Training Datacenters" | Verified 2026-05-04 via earlier WebFetch (see memory) |
| extra | Severson 2019 paper identity + Variance/Discharge model methodology | Fetched Nature SI PDF directly (4.6 MB, 62 pages, pypdf-parsed locally). Confirmed title/authors/journal/year exact match; "Variance" model exists (as classifier), "Discharge" model exists (as regression); paper uses "Mean Percent Error" terminology (not "MAPE"). Supplementary Table 4 lists regression MPE values: Constant 29.6/34.9/36.1, Discharge@100 25.0/26.4/45.3, Slope@91-100 25.1/26.1/33.7, Multivariate@100 18.8/78.5/50.0, Multivariate@300 12.5/(26.9)/45.5. |

### 🟡 Partially verified — identity confirmed, headline numbers paywalled

| # | Citation | Verification |
|---|---|---|
| 2 | **Severson 2019** main-paper "9.1%" Discharge test error headline | **Not verifiable from SI alone** — the Nature SI PDF (62 pages) doesn't include the abstract or main results section; "9.1" string is zero hits in SI text. Main paper text is behind Nature paywall (idp.nature.com auth redirect). The "9.1%" headline is widely cited externally and likely correct, but cannot verbatim-confirm via WebFetch. **Recommendation**: team gets Nature subscription / interlibrary loan to confirm before 複賽. Closest SI-verifiable models report 12.5–78.5% MPE across feature sets — well-known headline is the elastic-net 5-feature "Discharge" model. |
| 5 | **NASA PCoE Battery Data Set** | Dataset existence + download link confirmed on NASA page. **README + B0005-B0018 / 2.0 Ah / 2.5 V specs in the dataset ZIP** (not on the index page); requires download + extraction to verify verbatim. |

### ❌ Blocked — could not verify this round

| # | Citation | Block reason |
|---|---|---|
| 3 | Wang et al. 2019 *Prog. Energy Combust. Sci.* 73 — LFP 230–270 °C / NMC 150–210 °C thermal-runaway onset | ScienceDirect 403; not in PubMed |
| 3 | Bandhauer 2011 *J. Electrochem. Soc.* 158 R1 | Not attempted (paywall expected) |
| 4 | **Eaton XLR-48-166** module — 53 Wh / ESR ≈ 5 mΩ / ≥ 100k cycles | Eaton vendor pages repeatedly timed out (60s budget); Mouser distributor page timeout |
| 4 | **JM Energy ULTIMO 3300F** — 10–30 Wh/kg / 5–10 kW/kg | TDK product page ECONNREFUSED; Wikipedia confirms JM Energy + ULTIMO existed but doesn't carry specific specs |
| 8 | ST AN5354 § Performance / § Power-aware ML | st.com PDF timeout (likely needs ST account login for full access) |
| 8 | ST RM0498 — STM32N6 NPU 1.6 MB FLASH / 1 MB SRAM / 300 GOPS | st.com product page + PDF timeout |
| 9 | BloombergNEF 2024 Battery Price Survey — LFP $95 → $65/kWh | All BNEF blog URLs tried returned 404 / blog index empty; specific 2024 release URL pattern unknown |

### Verification toolkit notes

- **What worked**: open-access DOIs (Marquis paper), open NASA pages (PCoE index), arXiv abstract pages, Nature **supplementary** PDFs (the Severson SI was 4.6 MB and pypdf parsed it locally). Wikipedia for context.
- **What didn't**: Nature main-paper PDF (paywall redirect), ScienceDirect (paywall 403), vendor PDF downloads from Eaton / ST / TDK (timeouts), BloombergNEF (URL pattern + paywall).
- **For the 4 blocked sources**: complete-verification requires either (a) Nature / Elsevier subscription, (b) direct vendor datasheet downloads (manual browser, not WebFetch), or (c) ST account login + AN5354/RM0498 PDF mirror.

### Recommendation

The 2026-05-12 round consumed ~30 minutes of WebFetch budget and verified 3
of 9 line items, partially verified 2 more, leaving 4 blocked. The remaining
4 should be hit during the dedicated 複賽 prep week (4–6 h budget per the
[memory note](../.claude/projects/.../memory/project_citation_verification_pre_rematch.md))
using a browser with manual paywall / vendor portal access — not WebFetch.

---

## Memory note discrepancy resolution

The original [memory](../.claude/projects/.../memory/project_citation_verification_pre_rematch.md)
flagged §1.4 STM32N6 as 「此編號最可能錯」. **This audit found §1.4 IS not a
real section in v2.1** — STM32N6 references in v2.1 PDF appear in §C.2 (54V
context, p4), §E.1 Tier-C (BMS + Edge AI MCU), and the architecture
discussion in §E.3 / §F. None of those are 「§1.4」. Any whitepaper /
PRESENTATION_GUIDE citation pointing to 「v2.1 §1.4」for STM32N6 needs
re-anchoring to §E.1 Tier-C or §C.2.

(2026-05-12: No active citation in current repo points to 「§1.4 STM32N6」 —
all such references were corrected in earlier waves. Logged here for
future regression detection.)
