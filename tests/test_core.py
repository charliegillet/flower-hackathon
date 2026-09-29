"""Offline tests: pricing math, guard, attestation, and a full negotiation on the in-process grid."""

from __future__ import annotations

import json

import pytest

from blindquote.core import attest, pricing
from blindquote.core.events import Emitter
from blindquote.core.llm import LLM
from blindquote.core.protocol import GuardViolation, check, encode
from blindquote.core.roles import handle_node_message
from blindquote.core.roles.coordinator import Coordinator, Timeouts, _horizon_from_prompt
from sim.inprocess import ROOT, build_federation

NO_LLM = LLM(None, None)


# ----------------------------------------------------------------- pricing
def test_band_mapping_matches_fannie_grid():
    assert pricing.ltv_band(80.0) == "75.01-80%"
    assert pricing.ltv_band(80.01) == "80.01-85%"
    assert pricing.fico_band(752) == "740-759"
    assert pricing.fico_band(780) == ">=780"
    assert pricing.llpa_points("740-759", "75.01-80%") == 0.875  # Fannie Mae LLPA 09.09.2026


def test_apr_exceeds_note_rate_when_fees_paid():
    assert pricing.apr(675_000, 7.0, 0.0, 0.0) == pytest.approx(7.0, abs=0.001)
    assert pricing.apr(675_000, 7.0, 1.0, 1_500) > 7.1


def test_total_cost_trades_points_against_rate():
    loan, horizon = 675_000, 7
    cheap_upfront = pricing.total_cost(loan, 7.125, 0.0, 1_500, horizon)
    bought_down = pricing.total_cost(loan, 6.875, 1.0, 1_500, horizon)
    assert bought_down < cheap_upfront  # over 7 years the buy-down pays off
    assert pricing.total_cost(loan, 6.875, 1.0, 1_500, 1) > pricing.total_cost(loan, 7.125, 0.0, 1_500, 1)


def test_round2_discount_never_breaks_floor():
    sheet = json.loads((ROOT / "nodes/bank-c/rate_sheet.json").read_text())
    bands = {"loan_mid": 675_000, "ltv_band": "75.01-80%", "dti_band": "36.01-43%", "horizon_years": 7, "term_years": 30}
    at_floor = pricing.price_from_sheet(sheet, bands, "740-759", extra_discount_pts=99)
    assert at_floor["margin"] == sheet["floor_pts"]


# ------------------------------------------------------------------ guard
def test_guard_blocks_raw_fields_and_non_band_fields():
    with pytest.raises(GuardViolation):
        check({"kind": "bands", "session": "s", "bands": {"loan_band": "x", "annual_income": 1}, "token": "t", "withheld": []})
    with pytest.raises(GuardViolation):
        check({"kind": "quote", "bank": "B", "exact_income": 210000})
    with pytest.raises(GuardViolation):
        encode({"kind": "hello", "name": "Alex Rivera"})
    check({"kind": "hello"})


# ------------------------------------------------------------ attestation
def test_attestation_signature_verifies_and_detects_tampering():
    key = b"k" * 32
    sig = attest.sign(key, "740-759", "tok")
    assert attest.verify(key, "740-759", "tok", sig)
    assert not attest.verify(key, ">=780", "tok", sig)


def _cfg(node: str, role: str) -> dict:
    return {"role": role, "name": node, "data_dir": str(ROOT / "nodes" / node), "hmac_key_file": str(ROOT / "secrets/bureau.key")}


def test_bureau_rejects_unknown_token_and_bank_rejects_forged_band():
    bureau = handle_node_message({"kind": "attest_request", "session": "s", "token": "nope"}, _cfg("bureau", "bureau"), NO_LLM)
    assert bureau["kind"] == "error"
    forged = {"fico_band": ">=780", "token": "consent_7f3a9c2e41", "sig": "0" * 64}
    bands = {"loan_band": "$650k-$700k", "loan_mid": 675_000, "ltv_band": "75.01-80%", "dti_band": "36.01-43%",
             "horizon_years": 7, "term_years": 30}
    quote = handle_node_message({"kind": "quote_request", "session": "s", "round": 1, "bands": bands, "attestation": forged},
                                _cfg("bank-a", "bank"), NO_LLM)
    assert quote["kind"] == "quote" and quote["eligible"] is False


def test_horizon_parsing_ignores_loan_term():
    assert _horizon_from_prompt("best 30-year fixed, I plan to stay about 7 years") == 7
    assert _horizon_from_prompt("a 30 year fixed please") is None


# -------------------------------------------------------------- end to end
@pytest.fixture(scope="module")
def run_events():
    events: list[dict] = []
    grid = build_federation(use_llm=False, latency=False)
    coordinator = Coordinator(grid, Emitter(events.append), NO_LLM, fetch=None,
                              timeouts=Timeouts(5, 5, 5, 10, 10), mode="sim")
    verdict = coordinator.run("Find me the best 30-year fixed for the $850k home - I plan to stay about 7 years.")
    grid.close()
    return events, verdict


def test_full_negotiation_story(run_events):
    events, verdict = run_events
    types = [e["type"] for e in events]
    stages = [e["stage"] for e in events if e["type"] == "bq.stage" and e["status"] == "done"]
    assert stages == ["discover", "bands", "attest", "round1", "round2", "verdict"]
    assert sum(t == "bq.node" for t in types) == 7  # coordinator + 6 SuperNodes
    assert types[-1] == "bq.done"

    guards = [e for e in events if e["type"] == "bq.guard"]
    assert {(g["bank"], g["violation"]) for g in guards} >= {
        ("Rapid Lending Co.", "requested_fields"), ("Rapid Lending Co.", "apr_mismatch")}

    improves = {e["bank"] for e in events if e["type"] == "bq.improve"}
    assert "Bay Mortgage Co." in improves
    declines = {(e["bank"], e["round"]) for e in events if e["type"] == "bq.decline"}
    assert ("Golden Gate Credit Union", 2) in declines

    assert verdict["winner"] == "Bay Mortgage Co."
    assert verdict["ranking"][-1]["bank"] == "Rapid Lending Co."  # flagged lenders rank last
    assert verdict["savings_vs_single_quote"] > 0


def test_no_raw_personal_data_in_any_event(run_events):
    events, _ = run_events
    blob = json.dumps(events)
    for secret in ("Alex Rivera", "210000", "262000", "Stanford Health Care", '"score"', "752"):
        assert secret not in blob, f"raw data leaked into events: {secret}"
    ledger = next(e for e in events if e["type"] == "bq.ledger")
    banks = [p for p in ledger["parties"] if p["role"] == "bank"]
    assert banks and all("exact income" in p["never"] for p in banks)
