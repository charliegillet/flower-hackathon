"""Deterministic mortgage math: rate sheets, payments, total cost, APR.

All money is in dollars, rates and points in percent (6.875 means 6.875%).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

# Fannie Mae LLPA matrix (Purchase money, Classic FICO x LTV), effective
# 09.09.2026: https://singlefamily.fanniemae.com/media/9391/display
LTV_BANDS = [
    "<=30%",
    "30.01-60%",
    "60.01-70%",
    "70.01-75%",
    "75.01-80%",
    "80.01-85%",
    "85.01-90%",
    "90.01-95%",
    ">95%",
]
FICO_BANDS = [
    ">=780",
    "760-779",
    "740-759",
    "720-739",
    "700-719",
    "680-699",
    "660-679",
    "640-659",
    "<=639",
]
LLPA_PURCHASE = [
    [0.000, 0.000, 0.000, 0.000, 0.375, 0.375, 0.250, 0.250, 0.125],
    [0.000, 0.000, 0.000, 0.250, 0.625, 0.625, 0.500, 0.500, 0.250],
    [0.000, 0.000, 0.125, 0.375, 0.875, 1.000, 0.750, 0.625, 0.500],
    [0.000, 0.000, 0.250, 0.750, 1.250, 1.250, 1.000, 0.875, 0.750],
    [0.000, 0.000, 0.375, 0.875, 1.375, 1.500, 1.250, 1.125, 0.875],
    [0.000, 0.000, 0.625, 1.125, 1.750, 1.875, 1.500, 1.375, 1.125],
    [0.000, 0.000, 0.750, 1.375, 1.875, 2.125, 1.750, 1.625, 1.250],
    [0.000, 0.000, 1.125, 1.500, 2.250, 2.500, 2.000, 1.875, 1.500],
    [0.000, 0.125, 1.500, 2.125, 2.750, 2.875, 2.625, 2.250, 1.750],
]

DTI_BANDS = ["<=28%", "28.01-36%", "36.01-43%", "43.01-50%", ">50%"]
LOAN_BAND_STEP = 50_000


def ltv_band(ltv_pct: float) -> str:
    """Map an LTV percentage to a Fannie Mae LTV band label."""
    edges = [30, 60, 70, 75, 80, 85, 90, 95]
    for edge, label in zip(edges, LTV_BANDS):
        if ltv_pct <= edge:
            return label
    return LTV_BANDS[-1]


def fico_band(score: int) -> str:
    """Map an exact credit score to a Fannie Mae FICO band label."""
    lows = [780, 760, 740, 720, 700, 680, 660, 640]
    for low, label in zip(lows, FICO_BANDS):
        if score >= low:
            return label
    return FICO_BANDS[-1]


def dti_band(dti_pct: float) -> str:
    """Map a debt-to-income percentage to a coarse band."""
    edges = [28, 36, 43, 50]
    for edge, label in zip(edges, DTI_BANDS):
        if dti_pct <= edge:
            return label
    return DTI_BANDS[-1]


def loan_band(amount: float) -> tuple[int, int]:
    """Bucket a loan amount into a $50k range (low, high)."""
    low = int(amount // LOAN_BAND_STEP) * LOAN_BAND_STEP
    return low, low + LOAN_BAND_STEP


def llpa_points(fico: str, ltv: str) -> float:
    """Fannie Mae loan-level price adjustment (points) for a FICO x LTV band."""
    return LLPA_PURCHASE[FICO_BANDS.index(fico)][LTV_BANDS.index(ltv)]


def dti_upper(dti: str) -> float:
    """Upper bound of a DTI band (for overlay checks)."""
    return {"<=28%": 28, "28.01-36%": 36, "36.01-43%": 43, "43.01-50%": 50}.get(dti, 100)


def fico_lower(fico: str) -> int:
    """Lower bound of a FICO band (for overlay checks)."""
    if fico.startswith(">="):
        return int(fico[2:])
    if fico.startswith("<="):
        return 300
    return int(fico.split("-")[0])


def monthly_payment(principal: float, rate_pct: float, term_years: int = 30) -> float:
    """Level monthly principal and interest payment."""
    n = term_years * 12
    r = rate_pct / 100 / 12
    if r == 0:
        return principal / n
    return principal * r / (1 - (1 + r) ** -n)


def balance_after(principal: float, rate_pct: float, months: int, term_years: int = 30) -> float:
    """Remaining balance after ``months`` payments."""
    r = rate_pct / 100 / 12
    pmt = monthly_payment(principal, rate_pct, term_years)
    if r == 0:
        return principal - pmt * months
    return principal * (1 + r) ** months - pmt * ((1 + r) ** months - 1) / r


def total_cost(
    principal: float,
    rate_pct: float,
    points_pct: float,
    fees: float,
    horizon_years: int,
    term_years: int = 30,
) -> float:
    """Cost of borrowing over the borrower's stay horizon.

    Upfront points and fees plus all interest paid during the horizon (principal
    repaid is excluded because every offer repays the same principal).
    """
    months = horizon_years * 12
    pmt = monthly_payment(principal, rate_pct, term_years)
    principal_repaid = principal - balance_after(principal, rate_pct, months, term_years)
    interest = pmt * months - principal_repaid
    return principal * points_pct / 100 + fees + interest


def apr(principal: float, rate_pct: float, points_pct: float, fees: float, term_years: int = 30) -> float:
    """Annual percentage rate: the rate that equates payments to net proceeds."""
    pmt = monthly_payment(principal, rate_pct, term_years)
    net = principal - principal * points_pct / 100 - fees
    n = term_years * 12
    lo, hi = 0.0, 0.05
    for _ in range(100):
        mid = (lo + hi) / 2
        pv = pmt * (1 - (1 + mid) ** -n) / mid if mid else pmt * n
        if pv > net:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2 * 12 * 100, 3)


@dataclass
class Offer:
    """One priced mortgage option."""

    rate: float
    points: float
    fees: float
    monthly_pi: float
    total_cost: float
    apr: float

    def to_dict(self) -> dict[str, Any]:
        return {k: round(v, 3) if isinstance(v, float) else v for k, v in asdict(self).items()}


def make_offer(principal: float, rate: float, points: float, fees: float, horizon: int | None, term: int = 30) -> Offer:
    """Price one option. ``horizon=None`` (a bank, which never learns it) costs the full term."""
    rate = round(rate * 8) / 8  # rates move in 1/8ths
    points = round(max(points, 0.0), 3)
    return Offer(
        rate=rate,
        points=points,
        fees=float(fees),
        monthly_pi=round(monthly_payment(principal, rate, term), 2),
        total_cost=round(total_cost(principal, rate, points, fees, horizon or term, term), 2),
        apr=apr(principal, rate, points, fees, term),
    )


def price_from_sheet(sheet: dict[str, Any], bands: dict[str, Any], fico: str, extra_discount_pts: float = 0.0) -> dict[str, Any]:
    """Price a request from a private rate sheet.

    Returns ``{"eligible": bool, "reason": str, "options": [Offer...], "margin": float}``.
    Two options are produced: a no-points option (costs rolled into the rate)
    and a buy-down option. ``extra_discount_pts`` reduces the bank's margin and
    is clamped so the margin never goes below the sheet's floor.
    """
    ov = sheet.get("overlays", {})
    if fico_lower(fico) < ov.get("min_fico", 0):
        return {"eligible": False, "reason": f"min credit score {ov['min_fico']}", "options": []}
    if dti_upper(bands["dti_band"]) > ov.get("max_dti", 100):
        return {"eligible": False, "reason": f"max DTI {ov['max_dti']}%", "options": []}
    if LTV_BANDS.index(bands["ltv_band"]) > LTV_BANDS.index(ov.get("max_ltv_band", ">95%")):
        return {"eligible": False, "reason": f"max LTV {ov['max_ltv_band']}", "options": []}

    principal = float(bands["loan_mid"])
    # Banks never see the borrower's stay horizon; only the coordinator ranks by it.
    horizon = int(bands["horizon_years"]) if bands.get("horizon_years") else None
    term = int(bands.get("term_years", 30))
    margin = max(sheet["margin_pts"] - max(extra_discount_pts, 0.0), sheet["floor_pts"])
    cost_pts = llpa_points(fico, bands["ltv_band"]) + margin
    if bands.get("derogatory"):  # bankruptcy or late payments in 7 years (a yes/no flag only)
        cost_pts += sheet.get("derogatory_pts", 0.5)
    if bands.get("fico_self_reported"):  # bureau had no file: price the unverified risk
        cost_pts += sheet.get("unverified_pts", 0.375)
    for adj in sheet.get("appetite", []):
        if principal >= adj.get("min_loan", 0):
            cost_pts += adj.get("pts", 0.0)
    ratio = sheet["rate_per_point"]  # rate change (%) per point of price
    par = sheet["par_rate"]
    fees = sheet["fees"]

    def ladder(points_target: float) -> Offer:
        # The rate absorbs the rest of the cost, rounded up to the next 1/8;
        # whatever the rate does not absorb is paid as discount points.
        raw = par + max(cost_pts - points_target, 0.0) * ratio
        rate = math.ceil(raw * 8 - 1e-9) / 8
        points = max(cost_pts - (rate - par) / ratio, 0.0)
        return make_offer(principal, rate, points, fees, horizon, term)

    no_points = ladder(0.0)
    buydown = ladder(sheet.get("buydown_pts", 1.0))
    return {"eligible": True, "reason": "", "options": [no_points, buydown], "margin": margin}


def best_option(options: list[Offer]) -> Offer:
    return min(options, key=lambda o: o.total_cost)
