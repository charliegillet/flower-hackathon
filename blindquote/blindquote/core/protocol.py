"""Wire protocol and the allowlist guard.

Every grid payload is a JSON object with a ``kind``. The guard enforces, in
code, which fields each kind may carry. Anything else is blocked and recorded.
"""

from __future__ import annotations

import json
from typing import Any

# Fields each message kind may carry across the grid.
ALLOWED_FIELDS: dict[str, set[str]] = {
    "hello": {"kind"},
    "hello_reply": {"kind", "role", "name", "org_kind", "model", "location"},
    "bands_request": {"kind", "session"},
    "bands": {"kind", "session", "bands", "token", "withheld"},
    "attest_request": {"kind", "session", "token"},
    "attestation": {"kind", "session", "fico_band", "token", "sig", "bureau"},
    "quote_request": {"kind", "session", "bands", "attestation", "round"},
    "quote": {
        "kind", "session", "round", "bank", "eligible", "reason", "options",
        "apr_stated", "note", "request_fields", "model",
    },
    "counter_request": {"kind", "session", "bands", "attestation", "round", "best_competing_total", "your_offer"},
    "counter": {
        "kind", "session", "round", "bank", "decision", "options", "apr_stated",
        "note", "request_fields", "model",
    },
    "error": {"kind", "message"},
}

# Band fields the borrower may disclose; anything else in `bands` is blocked.
ALLOWED_BAND_FIELDS = {
    "loan_band", "loan_mid", "ltv_band", "dti_band", "occupancy",
    "term_years", "property_state", "horizon_years", "product",
}

# Raw fields that must never cross the grid in any payload.
FORBIDDEN_FIELDS = {
    "exact_income", "income", "annual_income", "assets", "exact_assets", "borrower_name", "full_name",
    "ssn", "dob", "credit_score", "exact_credit_score", "address", "employer",
    "account_numbers", "monthly_debts", "down_payment",
}

# Fields a bank may ask the borrower for (bands only).
ALLOWED_REQUEST_FIELDS: set[str] = set()


class GuardViolation(Exception):
    """A payload tried to carry fields that are not allowed."""

    def __init__(self, kind: str, fields: list[str], detail: str):
        super().__init__(detail)
        self.kind = kind
        self.fields = fields
        self.detail = detail


def _walk_keys(obj: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.add(k)
            keys |= _walk_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            keys |= _walk_keys(item)
    return keys


def check(msg: dict[str, Any]) -> None:
    """Raise ``GuardViolation`` if ``msg`` carries anything not allowlisted."""
    kind = msg.get("kind")
    if kind not in ALLOWED_FIELDS:
        raise GuardViolation(str(kind), [], f"unknown message kind {kind!r}")
    extra = sorted(set(msg) - ALLOWED_FIELDS[kind])
    if extra:
        raise GuardViolation(kind, extra, f"{kind} carried non-allowlisted fields: {', '.join(extra)}")
    forbidden = sorted(_walk_keys(msg) & FORBIDDEN_FIELDS)
    if forbidden:
        raise GuardViolation(kind, forbidden, f"{kind} carried raw personal data: {', '.join(forbidden)}")
    bands = msg.get("bands")
    if isinstance(bands, dict):
        extra_bands = sorted(set(bands) - ALLOWED_BAND_FIELDS)
        if extra_bands:
            raise GuardViolation(kind, extra_bands, f"bands carried non-band fields: {', '.join(extra_bands)}")


def requested_fields_violation(msg: dict[str, Any]) -> list[str]:
    """Fields a bank asked for beyond bands (the greedy-bank check)."""
    requested = msg.get("request_fields") or []
    return sorted(f for f in requested if f not in ALLOWED_REQUEST_FIELDS)


def encode(msg: dict[str, Any]) -> str:
    """Guard-check then serialize an outbound payload."""
    check(msg)
    return json.dumps(msg, separators=(",", ":"), sort_keys=True)


def decode(payload: str | None) -> dict[str, Any]:
    if not payload:
        return {"kind": "error", "message": "empty payload"}
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return {"kind": "error", "message": "payload is not JSON"}
    return obj if isinstance(obj, dict) else {"kind": "error", "message": "payload is not an object"}
