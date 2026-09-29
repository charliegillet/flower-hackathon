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
    sheet = json.loads((ROOT / "nodes/citi/rate_sheet.json").read_text())
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
    sig = attest.sign(key, "740-759", "session-1", 2_000_000_000)
    assert attest.verify(key, "740-759", "session-1", 2_000_000_000, sig)
    assert not attest.verify(key, ">=780", "session-1", 2_000_000_000, sig)
    assert not attest.verify(key, "740-759", "session-2", 2_000_000_000, sig)  # no replay across sessions


def _cfg(node: str, role: str) -> dict:
    return {"role": role, "name": node, "data_dir": str(ROOT / "nodes" / node), "hmac_key_file": str(ROOT / "secrets/bureau.key")}


def test_bureau_rejects_unknown_token_and_bank_rejects_forged_band():
    bureau = handle_node_message({"kind": "attest_request", "session": "s", "token": "nope"}, _cfg("bureau", "bureau"), NO_LLM)
    assert bureau["kind"] == "error"
    forged = {"fico_band": ">=780", "session": "s", "expires": 2_000_000_000, "sig": "0" * 64}
    bands = {"loan_band": "$650k-$700k", "loan_mid": 675_000, "ltv_band": "75.01-80%", "dti_band": "36.01-43%",
             "horizon_years": 7, "term_years": 30}
    quote = handle_node_message({"kind": "quote_request", "session": "s", "round": 1, "bands": bands, "attestation": forged},
                                _cfg("chase", "bank"), NO_LLM)
    assert quote["kind"] == "quote" and quote["eligible"] is False and quote["attestation_ok"] is False


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
    assert sum(t == "bq.node" for t in types) == 9  # coordinator + borrower + bureau + 6 banks
    assert types[-1] == "bq.done"

    guards = [e for e in events if e["type"] == "bq.guard"]
    assert {(g["bank"], g["violation"]) for g in guards} >= {
        ("U.S. Bank", "requested_fields"), ("U.S. Bank", "apr_mismatch")}

    improves = {e["bank"] for e in events if e["type"] == "bq.improve"}
    assert "Citibank" in improves
    declines = {(e["bank"], e["round"]) for e in events if e["type"] == "bq.decline"}
    assert ("Navy Federal Credit Union", 2) in declines

    assert verdict["winner"] == "Citibank"
    assert verdict["ranking"][-1]["bank"] == "U.S. Bank"  # flagged lenders rank last
    assert verdict["savings_vs_single_quote"] > 0


def test_no_raw_personal_data_in_any_event(run_events):
    events, _ = run_events
    blob = json.dumps(events)
    for secret in ("Alex", "Rivera", "Palo Alto", "210000", "262000", "Stanford Health Care", '"score"', "752"):
        assert secret not in blob, f"raw data leaked into events: {secret}"
    ledger = next(e for e in events if e["type"] == "bq.ledger")
    banks = [p for p in ledger["parties"] if p["role"] == "bank"]
    assert banks and all("exact income" in p["never"] for p in banks)


@pytest.mark.parametrize("evil", [
    {"options": 7},
    {"options": [{"rate": 6.0, "points": 0, "fees": -500000}]},
    {"options": [{"rate": 6.0, "points": 0, "fees": 1000}], "apr_stated": float("nan")},
    {"options": [{"rate": -1200, "points": 0, "fees": 1000}]},
    {"request_fields": 5},
])
def test_hostile_bank_cannot_crash_or_win(monkeypatch, evil):
    import sim.inprocess as inproc

    real = inproc.handle_node_message

    def hostile(msg, cfg, llm):
        reply = real(msg, cfg, llm)
        if cfg.get("name") == "U.S. Bank" and reply.get("kind") == "quote":
            reply.update(evil)
        return reply

    monkeypatch.setattr(inproc, "handle_node_message", hostile)
    grid = build_federation(use_llm=False, latency=False)
    events: list[dict] = []
    verdict = Coordinator(grid, Emitter(events.append), NO_LLM, timeouts=Timeouts(5, 5, 5, 10, 10), mode="sim").run(
        "best 30-year fixed, staying about 7 years")
    grid.close()
    assert events[-1]["type"] == "bq.done"
    assert verdict["winner"] != "U.S. Bank"
    json.dumps(events, allow_nan=False)  # every event stays strict JSON


def test_node_errors_do_not_leak_values(tmp_path):
    (tmp_path / "profile.json").write_text(json.dumps({"home_price": 850000, "down_payment": 170000,
                                                       "annual_income": "$210,000", "bureau_consent_token": "t"}))
    reply = handle_node_message({"kind": "bands_request", "session": "s"},
                                {"role": "borrower", "data_dir": str(tmp_path)}, NO_LLM)
    assert reply == {"kind": "error", "message": "borrower failed: ValueError"}


def test_apr_sent_as_text_is_flagged(monkeypatch):
    import sim.inprocess as inproc

    real = inproc.handle_node_message

    def sneaky(msg, cfg, llm):
        reply = real(msg, cfg, llm)
        if cfg.get("name") == "Chase" and reply.get("kind") == "quote":
            reply["apr_stated"] = "6.5"
        return reply

    monkeypatch.setattr(inproc, "handle_node_message", sneaky)
    grid = build_federation(use_llm=False, latency=False)
    events: list[dict] = []
    Coordinator(grid, Emitter(events.append), NO_LLM, timeouts=Timeouts(5, 5, 5, 10, 10), mode="sim").run("x")
    grid.close()
    assert any(e["type"] == "bq.guard" and e["bank"] == "Chase" and e["violation"] == "apr_mismatch" for e in events)


def test_banks_never_see_the_consent_token_and_verify_the_band(run_events):
    events, _ = run_events
    assert "consent_7f3a9c2e41" not in json.dumps(events)
    attests = [e for e in events if e["type"] == "bq.attest"]
    assert attests[0]["signature_ok"] is None and attests[-1]["signature_ok"] is True
    assert attests[-1]["verified_by"] == 6


def test_run_budget_is_respected_when_a_bank_is_silent(monkeypatch):
    import sim.inprocess as inproc

    real = inproc.handle_node_message

    def silent_bank(msg, cfg, llm):
        if cfg.get("name") == "Navy Federal Credit Union" and msg.get("kind") == "quote_request":
            import time as _t
            _t.sleep(4)  # never answers within the (tiny) budget
        return real(msg, cfg, llm)

    monkeypatch.setattr(inproc, "handle_node_message", silent_bank)
    grid = build_federation(use_llm=False, latency=False)
    events: list[dict] = []
    Coordinator(grid, Emitter(events.append), NO_LLM, timeouts=Timeouts(30, 30, 30, 90, 90), mode="sim",
                budget_s=28.0).run("x")
    grid.close()
    assert events[-1]["type"] == "bq.done" and events[-1]["elapsed_s"] < 28.0
    assert any(e["type"] == "bq.decline" and e["reason"] == "timeout" for e in events)


def test_stay_horizon_never_reaches_a_bank(monkeypatch):
    import sim.inprocess as inproc

    real = inproc.handle_node_message
    seen: list[dict] = []

    def spy(msg, cfg, llm):
        if cfg.get("role") == "bank":
            seen.append(msg)
        return real(msg, cfg, llm)

    monkeypatch.setattr(inproc, "handle_node_message", spy)
    grid = build_federation(use_llm=False, latency=False)
    events: list[dict] = []
    verdict = Coordinator(grid, Emitter(events.append), NO_LLM, timeouts=Timeouts(5, 5, 5, 10, 10), mode="sim").run(
        "best 30-year fixed, I plan to stay about 12 years")
    grid.close()
    assert verdict["horizon_years"] == 12
    assert seen and all("horizon" not in json.dumps(m) for m in seen)
    assert any(m.get("kind") == "counter_request" and "gap_pct" in m and "best_competing_total" not in m for m in seen)


DEVICE_BANDS = {
    "token": "random-token", "dtiBand": "30–35%", "ltvBand": "75.01–80%", "assetBand": "$200k–$250k",
    "loanBand": "$650k–$700k", "ficoBand": "740–759", "tenureBand": "2–5 years", "employmentStatus": "employed",
    "purpose": "home", "termMonths": 360, "occupancy": "Primary home", "residency": "US citizen", "state": "CA",
    "derogatory": False,
}


def _device_run(request: dict) -> tuple[list[dict], dict]:
    grid = build_federation(use_llm=False, latency=False)
    events: list[dict] = []
    prompt = json.dumps({"blindquote_request": request})
    try:
        verdict = Coordinator(grid, Emitter(events.append), NO_LLM, timeouts=Timeouts(5, 5, 5, 10, 10), mode="sim").run(prompt)
    finally:
        grid.close()
    return events, verdict


def test_device_bands_with_bureau_consent_are_attested():
    events, verdict = _device_run({"bands": DEVICE_BANDS, "consent_token": "consent_demo_maya", "horizon_years": 7})
    attests = [e for e in events if e["type"] == "bq.attest"]
    assert attests[-1]["signature_ok"] is True
    assert verdict["winner"] and verdict["horizon_years"] == 7
    assert "consent_demo_maya" not in json.dumps(events)


def test_device_bands_without_bureau_file_are_self_reported():
    events, verdict = _device_run({"bands": DEVICE_BANDS, "horizon_years": 7})
    attest = next(e for e in events if e["type"] == "bq.attest")
    assert attest.get("self_reported") is True
    assert sum(e["type"] == "bq.quote" for e in events) >= 3  # banks still quote, with an unverified charge
    assert verdict["winner"]


@pytest.mark.parametrize("bad", [dict(DEVICE_BANDS, annualIncome=142000), dict(DEVICE_BANDS, purpose="auto")])
def test_device_bands_reject_raw_fields_and_non_home_loans(bad):
    with pytest.raises(RuntimeError, match="Cannot price"):
        _device_run({"bands": bad, "horizon_years": 7})
