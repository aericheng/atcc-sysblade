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

## ❌ Not searched in this pass — pending external verification

These remain on the [`project_citation_verification_pre_rematch`](../.claude/projects/.../memory/project_citation_verification_pre_rematch.md) backlog:

| # | Citation | Status |
|---|---|---|
| 2 | Severson 2019 *Nature Energy* paper — verify Variance 15.0% in Figure 2c / Table 1; Discharge 9.1% in Table 1 + Figure 2c | Pending WebFetch <https://www.nature.com/articles/s41560-019-0356-8> |
| 3 | Wang et al. 2019 *Prog. Energy Combust. Sci.* 73 §2.1 Table 2 — LFP 230–270 °C / NMC 150–210 °C thermal-runaway onset | Pending WebFetch DOI |
| 3 | Bandhauer 2011 *J. Electrochem. Soc.* 158 R1 §3 — thermal runaway comparison | Pending WebFetch DOI |
| 4 | Eaton XLR-48-166 module datasheet — 53 Wh / ESR ≈ 5 mΩ / ≥ 100k cycles | Pending Eaton website lookup (model number `-166` suffix unverified) |
| 4 | JM Energy ULTIMO 3300F cell datasheet — 10–30 Wh/kg / 5–10 kW/kg | Pending JM Energy datasheet |
| 5 | NASA PCoE Battery Data Set — Saha & Goebel 2007 README, B0005-B0018 specs 2.0 Ah / 2.5 V cutoff | Pending WebFetch NASA PCoE repo |
| 6 | Marquis 2019 *J. Electrochem. Soc.* 166 A3693 — SPM 5–10× benchmark | Pending DOI <https://doi.org/10.1149/2.0341915jes> |
| 8 | ST AN5354 §Performance + §Power-aware ML — NPU 30–60% peak GOPS / NPU vs CPU 5× 功耗比 | Pending ST login + AN5354 PDF |
| 8 | ST RM0498 — STM32N6 NPU 1.6 MB ML FLASH / 1 MB ML SRAM / 300 GOPS | Pending ST login + RM0498 PDF |
| 9 | BloombergNEF Lithium-Ion Battery Price Survey 2023–2024 — LFP 95 → 65 USD/kWh | Pending WebFetch <https://about.bnef.com/> latest survey |

**Recommendation**: assign one team member 4–6 hours during the week before
the 複賽 to walk these 9 line items; each gets either a "verified ✓" mark with
DOI + page + verbatim excerpt, or a citation rewrite to remove the specific
section number that doesn't exist.

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
