# Sysblade HyperBuffer — Twin-first validation gate (v2.0)
#
# Single-command reproducibility for RD reviewers. Each `make` target maps to
# one V chain in docs/BBU_IMPLEMENTATION_PLAN.md v2.0 § 摘要 V1-V6.
#
# Usage (Windows powershell with mingw32-make or WSL):
#     make verify        # run V1-V6 + cross-check, output verify_all_report.json
#     make verify-fast   # skip V1 (Severson .mat load is the slow part)
#     make v1            # PyBaMM vs Severson LFP fit only
#     make v2 v3 v4 v5   # individual chains
#     make clean         # remove generated JSON artifacts
#
# All chains write JSON artifacts to data/processed/ or apps/web/public/scenarios/.

PYTHON := .venv/Scripts/python

.PHONY: verify verify-fast v1 v2 v3 v4 v5 v6 xcheck clean help

help:
	@echo "Sysblade HyperBuffer — Twin-first validation gate"
	@echo ""
	@echo "  make verify        - run V1-V6 + cross-check (~3-5 min cold, ~1 min warm)"
	@echo "  make verify-fast   - skip V1 Severson load, run V2-V6 + cross-check"
	@echo "  make v1            - PyBaMM Prada2013 vs Severson LFP fit error"
	@echo "  make v2            - LIC RC closed-form vs Maxwell nonlinear extensions"
	@echo "  make v3            - Rack 60s graceful integrated sim + thermal model"
	@echo "  make v4            - N-1 BBU failure redundancy sim"
	@echo "  make v5            - Severson -> BBU duty transfer MAPE"
	@echo "  make v6            - One-command verify_all_report.json"
	@echo "  make xcheck        - Whitepaper headline number cross-check (38 assertions)"
	@echo "  make clean         - remove generated JSON artifacts (keeps Severson cache)"

verify:
	$(PYTHON) scripts/verify_all.py

verify-fast:
	$(PYTHON) scripts/verify_all.py --skip-v1

v1:
	$(PYTHON) scripts/eval_pybamm_lfp_fit.py --n-cells 3

v2:
	$(PYTHON) scripts/eval_lic_rc_fit.py

v3:
	$(PYTHON) scripts/generate_full_rack_60s_sim.py

v4:
	$(PYTHON) scripts/generate_n_minus_1_sim.py

v5:
	$(PYTHON) scripts/eval_severson_transfer.py

v6: verify

xcheck:
	$(PYTHON) scripts/check_whitepaper_numbers.py

clean:
	-rm -f data/processed/pybamm_lfp_fit_error.json
	-rm -f data/processed/pybamm_lfp_fit_error.png
	-rm -f data/processed/lic_rc_fit_error.json
	-rm -f data/processed/lic_rc_fit_error.png
	-rm -f data/processed/severson_transfer_mape.json
	-rm -f data/processed/severson_transfer_mape.png
	-rm -f data/processed/rack_60s_graceful.png
	-rm -f data/processed/rack_n_minus_1.png
	-rm -f data/processed/verify_all_report.json
	-rm -f apps/web/public/scenarios/rack_60s_graceful.json
	-rm -f apps/web/public/scenarios/rack_n_minus_1.json
	-rm -f packages/shared/scenarios/rack_60s_graceful.json
	-rm -f packages/shared/scenarios/rack_n_minus_1.json
