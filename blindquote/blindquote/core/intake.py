"""Intake for bands computed on the borrower's own device (flower-finance trust flow).

The browser turns the applicant's answers into ranges and sends only those, so no
exact value ever reaches the Flower side. This module normalises that bands object
(`frontend/src/core/bands.js::computeBands`) onto the Fannie Mae grid bands the
bank nodes price from, and rejects anything outside the allowlist.

Request shape (sent as the AgentApp run prompt):

    {"blindquote_request": {"bands": {...computeBands output...},
                            "consent_token": "...", "horizon_years": 7}}
"""

from __future__ import annotations

import json
import re
from typing import Any

from . import pricing

# Keys the browser may send (camelCase, as produced by computeBands). Anything else is refused.
BROWSER_KEYS = {
    "token", "dtiBand", "ltvBand", "assetBand", "loanBand", "ficoBand", "tenureBand",
    "employmentStatus", "purpose", "termMonths", "occupancy", "residency", "state", "derogatory",
}
OCCUPANCY = {"primary home": "primary", "second home": "second", "investment": "investment"}
MAX_LABEL = 40

_NUM = re.compile(r"\$?\s*([\d.,]+)\s*([kKmM]?)")


class IntakeError(ValueError):
    """The request cannot be priced (missing band, unsupported loan, or a disallowed field)."""


def parse_request(prompt: str) -> dict[str, Any] | None:
    """Return the ``blindquote_request`` object if the prompt carries one."""
    try:
        obj = json.loads(prompt)
    except (TypeError, ValueError):
        return None
    req = obj.get("blindquote_request") if isinstance(obj, dict) else None
    return req if isinstance(req, dict) else None


def _numbers(label: Any) -> list[float]:
    """Numbers in a band label, e.g. '$650k–$700k' -> [650000, 700000], '75.01–80%' -> [75.01, 80]."""
    out = []
    for value, unit in _NUM.findall(str(label or "")):
        try:
            n = float(value.replace(",", ""))
        except ValueError:
            continue
        out.append(n * {"k": 1e3, "m": 1e6}.get(unit.lower(), 1))
    return out


def _label(value: Any) -> str | None:
    if value is None or value == "":
        return None
    text = str(value)
    if len(text) > MAX_LABEL:
        raise IntakeError("band label too long")
    return text


def normalize(request: dict[str, Any]) -> tuple[dict[str, Any], str | None, int, str]:
    """Return ``(wire_bands, consent_token, horizon_years, claimed_fico_band)``."""
    raw = request.get("bands")
    if not isinstance(raw, dict):
        raise IntakeError("missing bands")
    extra = sorted(set(raw) - BROWSER_KEYS)
    if extra:
        raise IntakeError(f"disallowed fields: {', '.join(extra)}")
    purpose = str(raw.get("purpose") or "home")
    if purpose != "home":
        raise IntakeError("BlindQuote prices home loans only")

    loan = _numbers(raw.get("loanBand"))
    ltv = _numbers(raw.get("ltvBand"))
    dti = _numbers(raw.get("dtiBand"))
    fico = _numbers(raw.get("ficoBand"))
    if len(loan) < 2 or not ltv or not dti or not fico:
        raise IntakeError("loan, loan-to-value, debt-to-income and credit bands are required")

    lo, hi = int(loan[0]), int(loan[1])
    term_years = max(1, round(int(raw.get("termMonths") or 360) / 12))
    bands = {
        "loan_band": f"${lo // 1000}k-${hi // 1000}k",
        "loan_mid": (lo + hi) // 2,
        "ltv_band": pricing.ltv_band(max(ltv)),  # upper edge of the browser's range
        "dti_band": pricing.dti_band(max(dti)),
        "occupancy": OCCUPANCY.get(str(raw.get("occupancy") or "").lower(), "primary"),
        "term_years": term_years,
        "property_state": _label(raw.get("state")),
        "product": f"{term_years}-year fixed",
        "asset_band": _label(raw.get("assetBand")),
        "tenure_band": _label(raw.get("tenureBand")),
        "employment_status": _label(raw.get("employmentStatus")),
        "residency": _label(raw.get("residency")),
        "purpose": purpose,
        "derogatory": bool(raw.get("derogatory")),
    }
    bands = {k: v for k, v in bands.items() if v is not None}
    try:
        horizon = int(request.get("horizon_years") or 7)
    except (TypeError, ValueError):
        horizon = 7
    token = request.get("consent_token") or raw.get("token")
    return bands, (str(token) if token else None), min(max(horizon, 1), 30), pricing.fico_band(int(min(fico)))
