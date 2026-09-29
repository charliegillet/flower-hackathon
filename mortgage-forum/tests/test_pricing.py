"""Deterministic pricing: no LLM involved."""

import pytest

from mortgage_forum.banks import (
    HARBOUR_BANK,
    PRIME_MUTUAL,
    RatioRequest,
    counter_floor,
    monthly_payment,
    quote,
    ratios,
    total_cost,
)


def test_ratios():
    r = ratios(income=120_000, loan=300_000, house_price=400_000)
    assert r == RatioRequest(lti=2.5, ltv=75.0)
    assert ratios(40_000, 300_000, None).ltv is None


def test_high_income_favours_prime_mutual():
    r = ratios(120_000, 300_000, 400_000)
    a, b = quote(PRIME_MUTUAL, r), quote(HARBOUR_BANK, r)
    assert a.rate == pytest.approx(4.30)
    assert b.rate == pytest.approx(4.70)


def test_big_deposit_favours_harbour_bank():
    r = ratios(70_000, 250_000, 500_000)
    a, b = quote(PRIME_MUTUAL, r), quote(HARBOUR_BANK, r)
    assert a.rate == pytest.approx(5.20)
    assert b.rate == pytest.approx(4.00)


@pytest.mark.parametrize("policy", [PRIME_MUTUAL, HARBOUR_BANK])
def test_limits(policy):
    assert not quote(policy, RatioRequest(lti=7.5, ltv=None)).approved
    assert "4.5" in quote(policy, RatioRequest(lti=4.6, ltv=50)).reason
    assert quote(policy, RatioRequest(lti=4.5, ltv=90)).approved
    assert not quote(policy, RatioRequest(lti=3, ltv=90.1)).approved
    assert not quote(policy, RatioRequest(lti=3, ltv=None)).approved


def test_counter_floor_respects_policy():
    assert counter_floor(HARBOUR_BANK, 4.70) == pytest.approx(4.45)
    assert counter_floor(HARBOUR_BANK, 3.80) == pytest.approx(HARBOUR_BANK.floor_rate)


def test_monthly_payment_and_total_cost():
    # £300k over 25 years at 4.3%: known value ~ £1,633.6
    assert monthly_payment(300_000, 4.3, 25) == pytest.approx(1633.6, abs=1)
    assert total_cost(300_000, 4.3, 25) == pytest.approx(1633.6 * 300, abs=300)
    assert monthly_payment(120_000, 0, 10) == pytest.approx(1000)
