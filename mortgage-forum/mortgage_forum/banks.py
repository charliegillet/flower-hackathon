"""Bank rate policies and mortgage maths.

Everything here is deterministic so the numbers the agents quote are exact.
A bank's pricing only ever sees two ratios, never the user's raw figures:

* LTI (loan-to-income), e.g. 2.5 means the loan is 2.5x annual income.
* LTV (loan-to-value), e.g. 75.0 means the loan is 75% of the house price.
"""

from __future__ import annotations

from dataclasses import dataclass

MAX_LTI = 4.5
MAX_LTV = 90.0


@dataclass(frozen=True)
class RatioRequest:
    """The only applicant information a bank receives."""

    lti: float
    ltv: float | None  # None when the user did not give a house price


@dataclass(frozen=True)
class BankPolicy:
    """A bank's private pricing policy."""

    name: str
    base_rate: float
    # (upper bound, adjustment) pairs, checked in order; first match applies.
    lti_bands: tuple[tuple[float, float], ...]
    ltv_bands: tuple[tuple[float, float], ...]
    floor_rate: float  # never lend below this
    max_counter_discount: float  # most the bank will shave off in negotiation


@dataclass(frozen=True)
class Quote:
    """A bank's answer to a quote request."""

    bank: str
    approved: bool
    rate: float | None = None  # annual %, e.g. 4.3
    reason: str = ""


PRIME_MUTUAL = BankPolicy(
    name="Prime Mutual",
    base_rate=5.20,
    # Rewards high income: the lower the loan relative to income, the better.
    lti_bands=((2.5, -0.90), (3.0, -0.60), (3.5, -0.30), (MAX_LTI, 0.0)),
    ltv_bands=((75.0, 0.0), (MAX_LTV, 0.30)),
    floor_rate=3.80,
    max_counter_discount=0.30,
)

HARBOUR_BANK = BankPolicy(
    name="Harbour Bank",
    base_rate=5.00,
    # Rewards a big deposit: the lower the loan relative to the house, the better.
    lti_bands=((4.0, 0.0), (MAX_LTI, 0.20)),
    ltv_bands=((50.0, -1.00), (60.0, -0.70), (75.0, -0.30), (MAX_LTV, 0.0)),
    floor_rate=3.70,
    max_counter_discount=0.25,
)

POLICIES = (PRIME_MUTUAL, HARBOUR_BANK)


def ratios(income: float, loan: float, house_price: float | None) -> RatioRequest:
    """Reduce the user's figures to the two ratios a bank is allowed to see."""
    if income <= 0 or loan <= 0:
        raise ValueError("income and loan must be positive")
    ltv = None
    if house_price is not None:
        if house_price <= 0:
            raise ValueError("house price must be positive")
        ltv = round(loan / house_price * 100, 1)
    return RatioRequest(lti=round(loan / income, 2), ltv=ltv)


def _band(bands: tuple[tuple[float, float], ...], value: float) -> float:
    for upper, adjustment in bands:
        if value <= upper:
            return adjustment
    raise ValueError(f"{value} is outside every band")


def quote(policy: BankPolicy, request: RatioRequest) -> Quote:
    """Price a mortgage from the applicant's ratios."""
    if request.lti > MAX_LTI:
        return Quote(
            policy.name,
            approved=False,
            reason=f"loan is {request.lti:.2f}x income; the maximum is {MAX_LTI}x",
        )
    if request.ltv is None:
        return Quote(
            policy.name,
            approved=False,
            reason="a property value is needed to price the loan",
        )
    if request.ltv > MAX_LTV:
        return Quote(
            policy.name,
            approved=False,
            reason=f"loan is {request.ltv:.1f}% of the property value; "
            f"the maximum is {MAX_LTV:.0f}%",
        )
    rate = (
        policy.base_rate
        + _band(policy.lti_bands, request.lti)
        + _band(policy.ltv_bands, request.ltv)
    )
    return Quote(policy.name, approved=True, rate=round(max(rate, policy.floor_rate), 2))


def counter_floor(policy: BankPolicy, own_rate: float) -> float:
    """Lowest rate the bank will go to when asked to beat a competitor."""
    return round(max(policy.floor_rate, own_rate - policy.max_counter_discount), 2)


def monthly_payment(principal: float, annual_rate: float, years: int = 25) -> float:
    """Standard repayment mortgage monthly payment."""
    n = years * 12
    r = annual_rate / 100 / 12
    if r == 0:
        return principal / n
    return principal * r / (1 - (1 + r) ** -n)


def total_cost(principal: float, annual_rate: float, years: int = 25) -> float:
    """Total repaid over the full term."""
    return monthly_payment(principal, annual_rate, years) * years * 12
