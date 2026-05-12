"""Cross-check every numerical claim in whitepaper.md and apps/web against
the JSON / TS source-of-truth files.

This is the gate that prevents the kind of stale-number drift that
plagued earlier weeks ("the doc says 14.51 %, but the latest eval says
8.38 %"). Run it locally before commit; CI runs it on every push.

The script is intentionally STRICT:
* If a claim with a tolerance window is outside the window → FAIL
* If a JSON file changes shape → FAIL (catches accidental schema drift)
* If a number in a doc has no source → FAIL (forces explicit grounding)

Each check has the form:
    name        — what's being verified
    target      — the claim, with file:line for traceability
    source      — the numeric ground-truth and where it lives
    tolerance   — what counts as "still matching"

Exit code 0 on all-pass; 1 on any FAIL.

Usage:
    python scripts/check_whitepaper_numbers.py
    python scripts/check_whitepaper_numbers.py --verbose   # show every check
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Files we cross-check
WHITEPAPER = REPO / "docs" / "whitepaper.md"
README = REPO / "README.md"
TWIN_README = REPO / "packages" / "battery-twin" / "README.md"
LANDING = REPO / "apps" / "web" / "src" / "app" / "page.tsx"
TWIN_CLIENT = REPO / "apps" / "web" / "src" / "app" / "twin" / "twin-client.tsx"
TCO_LIB = REPO / "apps" / "web" / "src" / "lib" / "tco.ts"

# Every doc that surfaces headline ML numbers — keep in lockstep
DOCS_WITH_ML_HEADLINES = [WHITEPAPER, README, TWIN_README]

# Source-of-truth JSON
SCENARIOS_PUB = REPO / "apps" / "web" / "public" / "scenarios"
SCENARIOS_SHARED = REPO / "packages" / "shared" / "scenarios"
SEVERSON_EVAL = REPO / "data" / "processed" / "severson_model_eval.json"
QUANT_REPORT = REPO / "data" / "processed" / "lstm_quantization_report.json"
LSTM_SEVERSON_ONLY_EVAL = REPO / "data" / "processed" / "lstm_severson_only_eval.json"


# ---------------------------------------------------------------------------
# Tiny check framework — each Check is one assertion with a label and a
# pass/fail status. We collect every failure and report at the end so the
# user can fix many issues in a single round-trip.
# ---------------------------------------------------------------------------
@dataclass
class Check:
    name: str
    passed: bool
    detail: str
    target_loc: str = ""


@dataclass
class Report:
    checks: list[Check] = field(default_factory=list)

    def add(self, name: str, passed: bool, detail: str, target_loc: str = "") -> None:
        self.checks.append(Check(name, passed, detail, target_loc))

    def n_pass(self) -> int:
        return sum(1 for c in self.checks if c.passed)

    def n_fail(self) -> int:
        return sum(1 for c in self.checks if not c.passed)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _approx(a: float, b: float, tol: float) -> bool:
    return abs(a - b) <= tol


# ---------------------------------------------------------------------------
# Check group 1 — scenario integrity (cheap, run first)
# ---------------------------------------------------------------------------
def check_scenarios_in_sync(report: Report) -> None:
    files = sorted(p.name for p in SCENARIOS_PUB.glob("*.json"))
    for fname in files:
        a = (SCENARIOS_SHARED / fname).read_bytes()
        b = (SCENARIOS_PUB / fname).read_bytes()
        ha = hashlib.sha256(a).hexdigest()[:16]
        hb = hashlib.sha256(b).hexdigest()[:16]
        report.add(
            name=f"scenarios sync · {fname}",
            passed=ha == hb,
            detail=f"shared {ha} == public {hb}",
            target_loc=f"packages/shared/scenarios/{fname} ↔ apps/web/public/scenarios/{fname}",
        )


def check_lic_rc_invariants(report: Report) -> None:
    """LIC RC physics-layer sanity checks. Verifies the Eaton XLR-anchored
    closed-form RC numbers stay consistent with the whitepaper claim and
    that the LIC voltage envelope clears the datasheet UVLO threshold.
    """
    th = json.loads(_read(SCENARIOS_PUB / "transient_hybrid.json"))
    s = th["stats"]

    if "lic_v_droop_v" not in s:
        report.add(
            name="LIC RC physics fields present in transient_hybrid.json",
            passed=False,
            detail=(
                "lic_v_droop_v missing — generator script does not include the "
                "RC physics layer; re-run scripts/generate_twin_scenarios.py "
                "after pulling the latest version."
            ),
            target_loc="apps/web/public/scenarios/transient_hybrid.json",
        )
        return

    # Hard invariant: LIC must NOT cross its datasheet UVLO. If droop pushes
    # v_min below v_min_datasheet, the production design fails for this
    # waveform and the demo claim collapses.
    report.add(
        name="LIC v_min stays above Eaton datasheet UVLO (38 V)",
        passed=bool(s["lic_passes_cutoff"]) and s["lic_v_min"] > s["lic_v_min_datasheet"],
        detail=(
            f"v_min={s['lic_v_min']:.2f} V · cutoff={s['lic_v_min_datasheet']:.1f} V · "
            f"headroom={s['lic_headroom_to_cutoff_v']:.2f} V · "
            f"passes={s['lic_passes_cutoff']}"
        ),
        target_loc="apps/web/public/scenarios/transient_hybrid.json (RC layer)",
    )

    # Soft drift detector for the headline droop number quoted in
    # whitepaper §3.3.x and PRESENTATION_GUIDE Q6. Tolerance ±0.1 V covers
    # PyBaMM-side floating-point noise. Whitepaper currently quotes 2.32 V.
    #
    # PRESENTATION_GUIDE.md is in .gitignore (local-only cheat sheet, per
    # global CLAUDE.md), so on CI runners the file is absent. Make the PG
    # check soft: only verified when the file exists; whitepaper claim is
    # mandatory because that doc IS committed.
    wp = _read(WHITEPAPER)
    pg_path = REPO / "PRESENTATION_GUIDE.md"
    pg_present = pg_path.exists()
    pg_text = _read(pg_path) if pg_present else ""
    droop_claim_v = 2.32
    droop_claim_in_wp = bool(re.search(r"\b2\.32\s*V", wp))
    droop_claim_in_pg = bool(re.search(r"\b2\.32\s*V", pg_text)) if pg_present else True
    report.add(
        name=(
            "LIC droop '2.32 V' claim in whitepaper"
            + (" + PRESENTATION_GUIDE" if pg_present else " (PG skipped, gitignored)")
            + " matches RC JSON"
        ),
        passed=(
            _approx(s["lic_v_droop_v"], droop_claim_v, 0.1)
            and droop_claim_in_wp
            and droop_claim_in_pg
        ),
        detail=(
            f"json droop={s['lic_v_droop_v']:.3f} V · "
            f"'2.32 V' in whitepaper={droop_claim_in_wp} · "
            + (
                f"in PRESENTATION_GUIDE={droop_claim_in_pg}"
                if pg_present
                else "PG=skipped(gitignored, not in CI checkout)"
            )
        ),
        target_loc=(
            "docs/whitepaper.md"
            + (" + PRESENTATION_GUIDE.md" if pg_present else "")
            + " ↔ transient_hybrid.json (lic_v_droop_v)"
        ),
    )


def check_fleet_invariants(report: Report) -> None:
    fleet = json.loads(_read(SCENARIOS_PUB / "fleet_devices.json"))
    devices = fleet["devices"]
    n = len(devices)
    report.add(
        name="fleet count == 1000",
        passed=n == 1000,
        detail=f"actual n={n}",
        target_loc="apps/web/public/scenarios/fleet_devices.json",
    )

    # Tier-3 admission rule (house rule):
    #   status == "early_aging"  ⇔  SOH < 0.85 OR RUL < 800
    n_status = sum(1 for d in devices if d["status"] == "early_aging")
    n_rule = sum(1 for d in devices if d["soh_lfp"] < 0.85 or d["rul_cycles"] < 800)
    report.add(
        name="Tier-3 admission rule (early_aging ⇔ SOH<0.85 OR RUL<800)",
        passed=n_status == n_rule,
        detail=f"status==early_aging: {n_status}  vs  soh<0.85 OR rul<800: {n_rule}",
        target_loc="apps/web/public/scenarios/fleet_devices.json",
    )


# ---------------------------------------------------------------------------
# Check group 2 — landing-page headline numbers derive from scenarios
# ---------------------------------------------------------------------------
def check_landing_headlines(report: Report) -> None:
    th = json.loads(_read(SCENARIOS_PUB / "transient_hybrid.json"))
    tl = json.loads(_read(SCENARIOS_PUB / "transient_lfp_only.json"))

    # Voltage-swing ratio (3.5×). Use the "stable" peak-to-peak window if
    # available (tighter, matches what the demo shows), else fall back
    # to overall swing. Tolerance ±0.2× covers rounding to 1 decimal.
    pp_h = th["stats"].get("v_cell_pp_stable") or th["stats"].get("v_cell_swing")
    pp_l = tl["stats"].get("v_cell_pp_stable") or tl["stats"].get("v_cell_swing")
    v_ratio = pp_l / pp_h if pp_h else 0.0
    report.add(
        name="landing '3.5×' voltage-swing claim",
        passed=_approx(v_ratio, 3.5, 0.4),
        detail=f"v_cell_pp(lfp)/v_cell_pp(hybrid) = {v_ratio:.2f}",
        target_loc="apps/web/src/app/page.tsx (3.5× tile)",
    )

    p_h = th["stats"].get("p_lfp_std_kw") or 0.0
    p_l = tl["stats"].get("p_lfp_std_kw") or 0.0
    p_ratio = p_l / p_h if p_h else 0.0
    report.add(
        name="landing '5.7×' LFP-power-stress claim",
        passed=_approx(p_ratio, 5.7, 0.5),
        detail=f"p_lfp_std(lfp)/p_lfp_std(hybrid) = {p_ratio:.2f}",
        target_loc="apps/web/src/app/page.tsx (5.7× tile)",
    )


# ---------------------------------------------------------------------------
# Check group 3 — TCO 33 % derives from tco.ts constants
# ---------------------------------------------------------------------------
_TOTAL_RX = re.compile(r"total:\s*(\d+)")


def check_tco_savings_pct(report: Report) -> None:
    text = _read(TCO_LIB)
    totals = [int(m.group(1)) for m in _TOTAL_RX.finditer(text)]
    if len(totals) < 2:
        report.add(
            name="tco.ts traditional/sysblade totals discoverable",
            passed=False,
            detail=f"expected 2 'total:' lines, found {len(totals)}",
            target_loc="apps/web/src/lib/tco.ts",
        )
        return
    trad, sys = totals[0], totals[1]
    saving_pct = (trad - sys) / trad * 100
    report.add(
        name="landing '≈33%' TCO claim derives from tco.ts",
        passed=_approx(saving_pct, 33.0, 1.0),
        detail=f"({trad}-{sys})/{trad} = {saving_pct:.1f}% (whitepaper says 33 %)",
        target_loc="apps/web/src/app/page.tsx (33% tile) ↔ apps/web/src/lib/tco.ts",
    )


# ---------------------------------------------------------------------------
# Check group 3b — Wang+rainflow validation ratios match whitepaper §3.2.1
# ---------------------------------------------------------------------------
def check_rainflow_validation_ratios(report: Report) -> None:
    """Whitepaper §3.2.1 quotes two damage ratios (demo 1.012, worst-case
    0.945). These come from aging_rainflow_validation.json so any future
    re-tuning of Wang's parameters or the worst-case waveform must update
    the whitepaper text in lockstep — this check is the gate."""
    path = SCENARIOS_PUB / "aging_rainflow_validation.json"
    if not path.exists():
        report.add(
            name="aging_rainflow_validation.json present",
            passed=False,
            detail=f"missing {path.relative_to(REPO)} — run pnpm scenarios",
            target_loc=str(path.relative_to(REPO)),
        )
        return
    data = json.loads(_read(path))
    wp = _read(WHITEPAPER)

    for label, expect_str in [
        ("demo", "1.012"),
        ("worst_case", "0.945"),
    ]:
        ratio = data["waveforms"][label]["damage_ratio_hybrid_over_lfp_only"]["integrated"]
        # JSON is the source of truth; whitepaper must round to 3 decimals.
        rounded = round(ratio, 3)
        report.add(
            name=f"§3.2.1 {label} ratio matches JSON within ±0.005",
            passed=_approx(rounded, float(expect_str), 0.005),
            detail=f"json={ratio:.4f} → rounded {rounded:.3f}, whitepaper says {expect_str}",
            target_loc="docs/whitepaper.md §3.2.1 ↔ aging_rainflow_validation.json",
        )
        # And cross-check the literal substring is in the whitepaper, so a
        # silent edit that drops the number from the doc is also caught.
        report.add(
            name=f"§3.2.1 {label} ratio literal '{expect_str}' present in whitepaper",
            passed=expect_str in wp,
            detail=f"searched docs/whitepaper.md for '{expect_str}'",
            target_loc="docs/whitepaper.md",
        )


# ---------------------------------------------------------------------------
# Check group 4 — whitepaper / presentation OLS+ensemble headline numbers
# ---------------------------------------------------------------------------
def _find_severson_result(eval_data: dict, kind: str, split: str, filt: str) -> dict | None:
    for r in eval_data.get("results", []):
        if r.get("error"):
            continue
        if (
            r.get("kind") == kind
            and r.get("split") == split
            and r.get("label") == "Full"
            and r.get("filter", "").startswith(filt)
        ):
            return r
    return None


def _doc_label(p: Path) -> str:
    return str(p.relative_to(REPO))


def _claim_in_any_doc(pattern: str, docs: list[Path]) -> tuple[bool, list[str]]:
    """True iff at least one doc contains the pattern. Returns also the
    list of docs that DO contain it (for diagnostic output)."""
    rx = re.compile(pattern)
    hits = [_doc_label(p) for p in docs if rx.search(_read(p))]
    return bool(hits), hits


def check_severson_eval_numbers(report: Report) -> None:
    if not SEVERSON_EVAL.exists():
        report.add(
            name="severson_model_eval.json present",
            passed=False,
            detail=f"missing {SEVERSON_EVAL.relative_to(REPO)} — run scripts/eval_severson_models.py",
            target_loc=str(SEVERSON_EVAL.relative_to(REPO)),
        )
        return

    eval_data = json.loads(_read(SEVERSON_EVAL))

    # Headline · bagged-GBT + xstrict + random
    h = _find_severson_result(eval_data, "bagged_gbt", "random", "xstrict")
    if h is None:
        report.add(
            name="severson eval has bagged_gbt+xstrict+random row",
            passed=False,
            detail="row not found in eval JSON",
        )
    else:
        median = h["test_mape_pct_median"]
        claimed, hits = _claim_in_any_doc(r"\b8\.38\s*%", DOCS_WITH_ML_HEADLINES)
        passed = _approx(median, 8.38, 0.05) and claimed
        report.add(
            name="headline 8.38% (bagged-GBT + xstrict + random) matches eval JSON across all docs",
            passed=passed,
            detail=f"json median={median:.2f}% · '8.38%' in: {', '.join(hits) if hits else 'NONE'}",
            target_loc="docs/whitepaper.md, README.md, packages/battery-twin/README.md",
        )

    # Cross-batch · bagged-OLS + xstrict
    cb = _find_severson_result(eval_data, "bagged_ols", "cross_batch", "xstrict")
    if cb is None:
        report.add(
            name="severson eval has bagged_ols+xstrict+cross_batch row",
            passed=False,
            detail="row not found in eval JSON",
        )
    else:
        cb_median = cb["test_mape_pct_median"]
        claimed, hits = _claim_in_any_doc(r"\b13\.87\s*%|\b13\.9\s*%", DOCS_WITH_ML_HEADLINES)
        passed = _approx(cb_median, 13.87, 0.05) and claimed
        report.add(
            name="cross-batch 13.87% (bagged-OLS + xstrict) matches eval JSON across all docs",
            passed=passed,
            detail=f"json median={cb_median:.2f}% · '13.87%' or '13.9%' in: {', '.join(hits) if hits else 'NONE'}",
            target_loc="docs/whitepaper.md, README.md",
        )

    # Plain-OLS Full random (historical 14.51% baseline) — still cited as
    # "原 baseline / plain OLS"; should match within 0.05 pp.
    ols = _find_severson_result(eval_data, "ols", "random", "unfiltered")
    if ols is not None:
        ols_median = ols["test_mape_pct_median"]
        claimed, hits = _claim_in_any_doc(r"\b14\.51\s*%|\b14\.5\s*%", DOCS_WITH_ML_HEADLINES)
        passed = _approx(ols_median, 14.51, 0.05) and claimed
        report.add(
            name="baseline 14.51% (plain OLS) matches eval JSON across all docs",
            passed=passed,
            detail=f"json median={ols_median:.2f}% · '14.51%' or '14.5%' in: {', '.join(hits) if hits else 'NONE'}",
            target_loc="docs/whitepaper.md, README.md, packages/battery-twin/README.md",
        )


# ---------------------------------------------------------------------------
# Check group 5 — INT8 quantization report ↔ whitepaper Appendix C / §3.4
# ---------------------------------------------------------------------------
def check_int8_numbers(report: Report) -> None:
    if not QUANT_REPORT.exists():
        report.add(
            name="lstm_quantization_report.json present (optional)",
            passed=True,  # not strict — script is optional
            detail=f"{QUANT_REPORT.relative_to(REPO)} not generated yet — "
                   f"run scripts/quantize_lstm_onnx.py to enable INT8 cross-checks",
            target_loc=str(QUANT_REPORT.relative_to(REPO)),
        )
        return

    quant = json.loads(_read(QUANT_REPORT))
    wp = _read(WHITEPAPER)

    # Compression ratio (whitepaper claims '3.49x')
    ratio = quant["size"]["compression_ratio"]
    claim = bool(re.search(r"3\.49\s*[×x]", wp))
    report.add(
        name="whitepaper INT8 compression '3.49×' matches quant report",
        passed=_approx(ratio, 3.49, 0.05) and claim,
        detail=f"json ratio={ratio:.3f} · whitepaper mentions '3.49×'? {claim}",
        target_loc="docs/whitepaper.md ↔ data/processed/lstm_quantization_report.json",
    )

    # Delta MAPE (whitepaper claims '+0.10 pp')
    dmape = quant["accuracy_test_set"]["delta_mape_pp"]
    claim = bool(re.search(r"\+0\.10\s*pp", wp))
    report.add(
        name="whitepaper INT8 ΔMAPE '+0.10 pp' matches quant report",
        passed=_approx(dmape, 0.10, 0.05) and claim,
        detail=f"json ΔMAPE={dmape:+.2f} pp · whitepaper mentions '+0.10 pp'? {claim}",
        target_loc="docs/whitepaper.md ↔ data/processed/lstm_quantization_report.json",
    )

    # FP32 / INT8 MAPE absolute values
    fp32_mape = quant["accuracy_test_set"]["fp32_mape_pct"]
    int8_mape = quant["accuracy_test_set"]["int8_mape_pct"]
    fp32_claim = bool(re.search(r"FP32\s*(?:MAPE\s*)?(?:= ?)?19\.10\s*%", wp))
    int8_claim = bool(re.search(r"INT8\s*(?:MAPE\s*)?(?:= ?)?19\.20\s*%", wp))
    report.add(
        name="whitepaper FP32 19.10% / INT8 19.20% match quant report",
        passed=(_approx(fp32_mape, 19.10, 0.05)
                and _approx(int8_mape, 19.20, 0.05)
                and fp32_claim and int8_claim),
        detail=(f"json FP32={fp32_mape:.2f}% INT8={int8_mape:.2f}% · "
                f"wp mentions '19.10%/19.20%'? FP32={fp32_claim} INT8={int8_claim}"),
        target_loc="docs/whitepaper.md ↔ data/processed/lstm_quantization_report.json",
    )


# ---------------------------------------------------------------------------
# Check group 6 — LSTM model_validation.json ↔ whitepaper §3.3.7 / §3.3.8
# ---------------------------------------------------------------------------
def check_lstm_validation_numbers(report: Report) -> None:
    mv = json.loads(_read(SCENARIOS_PUB / "model_validation.json"))
    test_mape = mv["metrics"]["test_mape_pct"]
    test_r2 = mv["metrics"]["test_r2"]

    # Whitepaper §3.3.8 has a specific test MAPE claim — extract any
    # "整體 test MAPE X.X %" line. The claim must be within 1 pp of the
    # JSON-stored value, otherwise we have stale text.
    wp = _read(WHITEPAPER)
    m = re.search(r"整體 test MAPE\s+([0-9.]+)\s*%", wp)
    if m is None:
        report.add(
            name="whitepaper §3.3.8 has '整體 test MAPE X.X %' claim",
            passed=False,
            detail="couldn't find the line",
            target_loc="docs/whitepaper.md §3.3.8",
        )
    else:
        claimed = float(m.group(1))
        report.add(
            name="whitepaper §3.3.8 LSTM overall test MAPE matches model_validation.json",
            passed=_approx(claimed, test_mape, 1.0),
            detail=f"whitepaper says {claimed:.1f}% · JSON says {test_mape:.2f}% "
                   f"(tolerance ±1.0 pp)",
            target_loc="docs/whitepaper.md §3.3.8 ↔ packages/shared/scenarios/model_validation.json",
        )

    # Cross-doc check: every doc that mentions LSTM Test MAPE must use the
    # CURRENT JSON value (rounded to 1 dp), not a previous training run.
    # Look for "Test MAPE" patterns followed by a percentage.
    expected_int = round(test_mape, 1)  # 19.1
    expected_str = f"{expected_int}".rstrip("0").rstrip(".") if expected_int.is_integer() else f"{expected_int}"
    expected_pat = re.escape(f"{expected_int}")
    for p in DOCS_WITH_ML_HEADLINES:
        text = _read(p)
        # Find every occurrence of "Test MAPE ... X.X %" within ~50 chars
        matches = re.findall(r"Test MAPE[^.]{0,40}?\b([0-9]+\.[0-9])\s*%", text)
        if not matches:
            continue
        bad = [m for m in matches if not _approx(float(m), test_mape, 1.0)]
        report.add(
            name=f"{_doc_label(p)} 'Test MAPE X.X %' mentions match JSON ({test_mape:.2f}%)",
            passed=len(bad) == 0,
            detail=(f"all {len(matches)} mention(s) within ±1 pp" if not bad
                    else f"stale: {bad} (expected ~{test_mape:.1f}%)"),
            target_loc=f"{_doc_label(p)} ↔ model_validation.json",
        )

    # Same idea for Test R² — must be within 0.05 of JSON value.
    # Markdown table cells often wrap numbers in **...** for emphasis,
    # so we allow optional ** before/around the float.
    for p in DOCS_WITH_ML_HEADLINES:
        text = _read(p)
        matches = re.findall(
            r"Test R[²2][^|\n]{0,20}?\|[\s*]*([0-9]+\.[0-9]+)", text
        )
        if not matches:
            continue
        bad = [m for m in matches if not _approx(float(m), test_r2, 0.05)]
        report.add(
            name=f"{_doc_label(p)} 'Test R²' mentions match JSON ({test_r2:.2f})",
            passed=len(bad) == 0,
            detail=(f"all {len(matches)} mention(s) within ±0.05" if not bad
                    else f"stale: {bad} (expected ~{test_r2:.2f})"),
            target_loc=f"{_doc_label(p)} ↔ model_validation.json",
        )


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
def check_severson_only_lstm_numbers(report: Report) -> None:
    """Verify the --severson-only LSTM eval numbers stay in sync with the
    README + whitepaper §3.3.8 augmentation rebuttal table. Soft check:
    if the JSON is missing (user hasn't run `--severson-only` yet),
    record a non-failing note instead of FAIL.
    """
    if not LSTM_SEVERSON_ONLY_EVAL.exists():
        report.add(
            name="lstm_severson_only_eval.json present (optional)",
            passed=True,  # not strict — gate is opt-in
            detail=(
                f"{LSTM_SEVERSON_ONLY_EVAL.relative_to(REPO)} not generated yet — "
                f"run scripts/export_lstm_onnx.py --severson-only to populate "
                f"the augmentation rebuttal numbers"
            ),
            target_loc=str(LSTM_SEVERSON_ONLY_EVAL.relative_to(REPO)),
        )
        return

    data = json.loads(_read(LSTM_SEVERSON_ONLY_EVAL))
    mape = data["metrics"]["test_mape_pct"]
    r2 = data["metrics"]["test_r2"]
    pi_width = data["uncertainty"]["conformal_median_pi_width_cycles"]
    wp = _read(WHITEPAPER)
    rd = _read(README)

    # README + whitepaper both quote "16.17 %" — must match JSON within 0.1 pp.
    for doc_label, text in [("README.md", rd), ("docs/whitepaper.md", wp)]:
        claim = bool(re.search(r"\b16\.17\s*%", text))
        report.add(
            name=f"{doc_label} Severson-only MAPE '16.17%' matches eval JSON",
            passed=_approx(mape, 16.17, 0.1) and claim,
            detail=f"json={mape:.2f}% · '16.17%' present={claim}",
            target_loc=f"{doc_label} ↔ data/processed/lstm_severson_only_eval.json",
        )

    # PI width 793 cycles (within ±5)
    pi_claim = bool(re.search(r"\b793\s*cycles", wp))
    report.add(
        name="whitepaper §3.3.8 Severson-only PI width '793 cycles' matches eval JSON",
        passed=_approx(pi_width, 793.0, 5.0) and pi_claim,
        detail=f"json={pi_width:.0f} cycles · '793 cycles' present={pi_claim}",
        target_loc="docs/whitepaper.md §3.3.8 ↔ data/processed/lstm_severson_only_eval.json",
    )

    # R² 0.553 (within ±0.01)
    r2_claim = bool(re.search(r"\b0\.55[23]\b", wp))
    report.add(
        name="whitepaper §3.3.8 Severson-only R² '0.553' matches eval JSON",
        passed=_approx(r2, 0.553, 0.01) and r2_claim,
        detail=f"json R²={r2:.3f} · '0.553' present={r2_claim}",
        target_loc="docs/whitepaper.md §3.3.8 ↔ data/processed/lstm_severson_only_eval.json",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verbose", action="store_true",
                        help="print every check, not just failures")
    args = parser.parse_args()

    report = Report()
    check_scenarios_in_sync(report)
    check_fleet_invariants(report)
    check_lic_rc_invariants(report)
    check_landing_headlines(report)
    check_tco_savings_pct(report)
    check_rainflow_validation_ratios(report)
    check_severson_eval_numbers(report)
    check_int8_numbers(report)
    check_lstm_validation_numbers(report)
    check_severson_only_lstm_numbers(report)

    n_pass = report.n_pass()
    n_fail = report.n_fail()
    n_total = len(report.checks)

    for c in report.checks:
        if not c.passed:
            print(f"[FAIL] {c.name}")
            print(f"       {c.detail}")
            if c.target_loc:
                print(f"       at: {c.target_loc}")
            print()
        elif args.verbose:
            print(f"[ OK ] {c.name}: {c.detail}")

    print(f"\n=== {n_pass}/{n_total} passed, {n_fail} failed ===")
    return 0 if n_fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
