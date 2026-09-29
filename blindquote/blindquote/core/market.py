"""Market context: Freddie Mac PMMS 30-year average."""

from __future__ import annotations

import re
from typing import Any, Callable

PMMS_URL = "https://www.freddiemac.com/pmms"
# Last verified value (used when live fetch is unavailable).
PMMS_FALLBACK = {"pmms_30y": 7.03, "as_of": "2026-09-24", "source": PMMS_URL}

_RATE = re.compile(r"averaged\s+(\d+\.\d+)\s*%\s+as of\s+([A-Z][a-z]+ \d{1,2}, \d{4})")


def parse_pmms(text: str) -> dict[str, Any] | None:
    match = _RATE.search(text or "")
    if not match:
        return None
    return {"pmms_30y": float(match.group(1)), "as_of": match.group(2), "source": PMMS_URL}


def market_context(fetch: Callable[[str], str | None] | None) -> dict[str, Any]:
    """Try a live fetch of PMMS; fall back to the last verified value."""
    if fetch is not None:
        try:
            parsed = parse_pmms(fetch(PMMS_URL) or "")
            if parsed:
                return {**parsed, "live": True}
        except Exception:  # noqa: BLE001
            pass
    return {**PMMS_FALLBACK, "live": False}
