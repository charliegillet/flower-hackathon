"""Generate synthetic private data for every BlindQuote node.

Rate sheets are anchored on real public data:
- par rates = Freddie Mac PMMS 30-year average (7.03%, week of 2026-09-24) + a per-bank spread
- loan-level price adjustments = Fannie Mae LLPA matrix (09.09.2026), in blindquote.core.pricing

Usage: uv run python scripts/gen_nodes.py [--pmms 7.03]
"""

from __future__ import annotations

import argparse
import json
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NODES = ROOT / "nodes"

PROFILE = {
    "name": "Alex Rivera",
    "employer": "Stanford Health Care",
    "annual_income": 210000,
    "monthly_debts": 1150,
    "assets": 262000,
    "home_price": 850000,
    "down_payment": 170000,
    "taxes_insurance_monthly": 1050,
    "property_state": "CA",
    "occupancy": "primary",
    "term_years": 30,
    "horizon_years": 7,
    "product": "30-year fixed",
    "bureau_consent_token": "consent_7f3a9c2e41",
}

CREDIT_FILES = {
    "consents": {
        "consent_7f3a9c2e41": {"subject": "Alex Rivera", "score": 752, "tradelines": 11, "inquiries_12m": 1},
    }
}


def sheets(pmms: float) -> dict[str, dict]:
    return {
        "bank-a": {
            "name": "Cardinal Bank",
            "persona": "a regional relationship bank that competes selectively",
            "par_rate": round(pmms - 0.20, 3),
            "rate_per_point": 0.20,
            "margin_pts": 0.60,
            "floor_pts": 0.30,
            "fees": 1495,
            "buydown_pts": 1.0,
            "overlays": {"min_fico": 660, "max_dti": 45, "max_ltv_band": "90.01-95%"},
            "strategy": "match competitors when still profitable",
            "pitch": "Cardinal Bank: steady local servicing and a clean closing.",
        },
        "bank-b": {
            "name": "Golden Gate Credit Union",
            "persona": "a member-owned credit union with thin margins that never negotiates",
            "par_rate": round(pmms - 0.30, 3),
            "rate_per_point": 0.22,
            "margin_pts": 0.35,
            "floor_pts": 0.30,
            "fees": 995,
            "buydown_pts": 1.0,
            "overlays": {"min_fico": 680, "max_dti": 43, "max_ltv_band": "85.01-90%"},
            "strategy": "never reprice",
            "reprice": False,
            "round2_message": "Our member pricing is already at its floor.",
            "pitch": "Golden Gate CU: member pricing with low fees.",
        },
        "bank-c": {
            "name": "Bay Mortgage Co.",
            "persona": "an aggressive online lender that wants volume on larger loans",
            "par_rate": round(pmms - 0.30, 3),
            "rate_per_point": 0.20,
            "margin_pts": 1.60,
            "floor_pts": 0.15,
            "fees": 1895,
            "buydown_pts": 1.0,
            "appetite": [{"min_loan": 600000, "pts": -0.125}],
            "overlays": {"min_fico": 640, "max_dti": 50, "max_ltv_band": ">95%"},
            "strategy": "win the deal: undercut the best competitor whenever headroom allows",
            "pitch": "Bay Mortgage: fast digital closing, priced to win.",
        },
        "bank-d": {
            "name": "Rapid Lending Co.",
            "persona": "a high-pressure lender that advertises a teaser rate and harvests borrower data",
            "par_rate": round(pmms - 0.45, 3),
            "rate_per_point": 0.25,
            "margin_pts": 1.40,
            "floor_pts": 1.20,
            "fees": 2995,
            "buydown_pts": 1.5,
            "overlays": {"min_fico": 620, "max_dti": 55, "max_ltv_band": ">95%"},
            "greedy": True,
            "misleading_apr": True,
            "strategy": "hold price and push for more borrower data",
            "reprice": False,
            "pitch": "Rapid Lending: our lowest advertised rate in the Bay Area!",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pmms", type=float, default=7.03, help="PMMS 30-year average (%%)")
    args = parser.parse_args()

    def write(rel: str, obj: dict) -> None:
        path = NODES / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(obj, indent=2) + "\n")
        print("wrote", path.relative_to(ROOT))

    write("borrower/profile.json", PROFILE)
    write("bureau/credit_files.json", CREDIT_FILES)
    for node, sheet in sheets(args.pmms).items():
        write(f"{node}/rate_sheet.json", sheet)

    key = ROOT / "secrets" / "bureau.key"
    if not key.exists():
        key.parent.mkdir(exist_ok=True)
        key.write_text(secrets.token_hex(32) + "\n")
        key.chmod(0o600)
        print("wrote", key.relative_to(ROOT), "(gitignored)")


if __name__ == "__main__":
    main()
