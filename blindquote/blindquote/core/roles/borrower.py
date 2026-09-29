"""Borrower device node: turns the private profile into bands, locally."""

from __future__ import annotations

from typing import Any

from .. import pricing
from ..llm import LLM

# Reference rate used only to estimate the housing payment for the DTI band.
DTI_REFERENCE_RATE = 7.0

WITHHELD = ["name", "exact income", "assets", "exact credit score", "monthly debts", "employer", "down payment"]


def compute_bands(profile: dict[str, Any]) -> dict[str, Any]:
    price = float(profile["home_price"])
    loan = price - float(profile["down_payment"])
    term = int(profile.get("term_years", 30))
    housing = pricing.monthly_payment(loan, DTI_REFERENCE_RATE, term) + float(profile.get("taxes_insurance_monthly", 0))
    dti = (housing + float(profile.get("monthly_debts", 0))) / (float(profile["annual_income"]) / 12) * 100
    low, high = pricing.loan_band(loan)
    return {
        "loan_band": f"${low // 1000}k-${high // 1000}k",
        "loan_mid": (low + high) // 2,
        "ltv_band": pricing.ltv_band(loan / price * 100),
        "dti_band": pricing.dti_band(dti),
        "occupancy": profile.get("occupancy", "primary"),
        "term_years": term,
        "property_state": profile.get("property_state", "CA"),
        "product": profile.get("product", "30-year fixed"),
    }


def handle(msg: dict[str, Any], cfg: dict[str, Any], llm: LLM) -> dict[str, Any]:
    from . import load_json

    if msg.get("kind") != "bands_request":
        return {"kind": "error", "message": f"borrower cannot handle {msg.get('kind')!r}"}
    profile = load_json(cfg, "profile.json")
    return {
        "kind": "bands",
        "session": msg.get("session"),
        "bands": compute_bands(profile),
        # One-time consent token the borrower registered with the bureau.
        "token": profile["bureau_consent_token"],
        # For the coordinator's ranking only; it is never forwarded to a bank.
        "horizon_years": int(profile.get("horizon_years", 7)),
        "withheld": WITHHELD,
    }
