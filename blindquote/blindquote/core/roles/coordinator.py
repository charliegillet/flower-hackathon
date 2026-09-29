"""Coordinator (SuperLink): neutral broker that runs the sealed-bid negotiation.

Grid routing, pricing checks and the guard are deterministic code. The model
(Endeavor on SuperGrid) only writes the final explanation.
"""

from __future__ import annotations

import json
import secrets
import statistics
from dataclasses import dataclass, field
from typing import Any, Callable

from .. import pricing
from ..events import Emitter
from ..grid import Grid
from ..ledger import Ledger
from ..llm import LLM
from ..market import market_context
from ..protocol import GuardViolation, check, decode, encode, requested_fields_violation

COORD = "coordinator"
APR_TOLERANCE = 0.125  # TILA tolerance for regular transactions (1/8 point)


@dataclass
class Timeouts:
    hello: float = 30
    bands: float = 30
    attest: float = 30
    quote: float = 90
    counter: float = 90


@dataclass
class BankState:
    node_id: str
    name: str
    model: str | None
    round1: dict[str, Any] | None = None
    final: dict[str, Any] | None = None
    flags: list[str] = field(default_factory=list)


class Coordinator:
    def __init__(
        self,
        grid: Grid,
        emitter: Emitter,
        llm: LLM,
        fetch: Callable[[str], str | None] | None = None,
        timeouts: Timeouts | None = None,
        mode: str = "flower",
    ) -> None:
        self.grid = grid
        self.ev = emitter
        self.llm = llm
        self.fetch = fetch
        self.t = timeouts or Timeouts()
        self.mode = mode
        self.session = secrets.token_hex(6)
        self.ledger = Ledger()
        self.nodes: dict[str, dict[str, Any]] = {}

    # ------------------------------------------------------------------ grid
    def _exchange(self, sends: list[tuple[str, dict[str, Any]]], timeout: float, on_reply: Callable[[str, dict[str, Any]], None]) -> list[str]:
        """Push messages, then poll so replies surface as they arrive. Returns node ids that timed out."""
        ids = self.grid.push([(dst, encode(msg)) for dst, msg in sends])
        pending = {mid: dst for mid, (dst, _) in zip(ids, sends) if mid}
        deadline = self.ev.elapsed + timeout
        while pending and self.ev.elapsed < deadline:
            replies, _ = self.grid.pull(list(pending), timeout=min(2.0, max(deadline - self.ev.elapsed, 0)))
            for rep in replies:
                dst = pending.pop(str(rep.get("reply_to_message_id")), None)
                if dst is None:
                    continue
                if rep.get("error"):
                    on_reply(dst, {"kind": "error", "message": str(rep["error"])})
                else:
                    on_reply(dst, decode(rep.get("payload")))
        return list(pending.values())

    def _of_role(self, role: str) -> list[str]:
        return [nid for nid, n in self.nodes.items() if n.get("role") == role]

    # ------------------------------------------------------------------- run
    def run(self, prompt: str) -> dict[str, Any]:
        ev = self.ev
        horizon_hint = _horizon_from_prompt(prompt)
        ev.emit("bq.run", prompt=prompt, mode=self.mode, horizon_years=horizon_hint)
        ev.emit("bq.node", node_id=COORD, role="coordinator", name="BlindQuote Coordinator",
                org_kind="Neutral broker (SuperGrid)", model=self.llm.model, location=None)
        self.ledger.party("BlindQuote Coordinator", "coordinator")

        self._discover()
        borrowers, bureaus, banks = self._of_role("borrower"), self._of_role("bureau"), self._of_role("bank")
        if not borrowers or not bureaus or not banks:
            raise RuntimeError(
                f"Need a borrower, a bureau and at least one bank node; found "
                f"{len(borrowers)} borrower, {len(bureaus)} bureau, {len(banks)} bank"
            )

        bands, token = self._bands(borrowers[0], horizon_hint)
        attestation = self._attest(bureaus[0], token)
        states = {nid: BankState(nid, self.nodes[nid]["name"], self.nodes[nid].get("model")) for nid in banks}
        self._round1(states, bands, attestation)
        self._round2(states, bands, attestation)
        market = market_context(self.fetch)
        ev.emit("bq.market", pmms_30y=market["pmms_30y"], as_of=market["as_of"], source=market["source"])
        verdict = self._verdict(states, bands)
        ev.raw(self.ledger.to_event() | {"ts": ev.elapsed})
        self._narrate(verdict, bands, market)
        ev.emit("bq.done", elapsed_s=ev.elapsed)
        return verdict

    # ---------------------------------------------------------------- stages
    def _discover(self) -> None:
        ev = self.ev
        ev.stage("discover", "start", "Discovering SuperNodes on the federation")
        grid_nodes = self.grid.get_nodes()
        meta = {str(n["id"]): n for n in grid_nodes}
        for nid in meta:
            ev.msg(COORD, nid, "hello", "Who are you?", ["kind"])

        def on_reply(nid: str, msg: dict[str, Any]) -> None:
            if msg.get("kind") != "hello_reply":
                return
            info = {
                "role": msg.get("role"),
                "name": msg.get("name") or meta[nid].get("name") or f"node {nid[-4:]}",
                "org_kind": msg.get("org_kind"),
                "model": msg.get("model"),
                "location": msg.get("location") or meta[nid].get("location"),
            }
            self.nodes[nid] = info
            ev.msg(nid, COORD, "hello_reply", f"{info['name']} ({info['role']})", ["role", "name", "org_kind", "model"])
            ev.emit("bq.node", node_id=nid, **info)
            self.ledger.party(info["name"], str(info["role"]))

        self._exchange([(nid, {"kind": "hello"}) for nid in meta], self.t.hello, on_reply)
        ev.stage("discover", "done", f"{len(self.nodes)} nodes ready")

    def _bands(self, borrower: str, horizon_hint: int | None) -> tuple[dict[str, Any], str]:
        ev = self.ev
        ev.stage("bands", "start", "Borrower device computes bands locally")
        ev.msg(COORD, borrower, "bands_request", "Send bands only", ["session"])
        out: dict[str, Any] = {}

        def on_reply(nid: str, msg: dict[str, Any]) -> None:
            if msg.get("kind") != "bands":
                raise RuntimeError(f"Borrower node error: {msg.get('message', msg)}")
            try:
                check(msg)
            except GuardViolation as exc:
                ev.emit("bq.guard", bank=self.nodes[nid]["name"], node_id=nid, round=0,
                        violation="outbound_blocked", requested=exc.fields, detail=exc.detail, action="blocked")
                raise RuntimeError("Borrower reply blocked by guard") from exc
            out.update(msg)

        self._exchange([(borrower, {"kind": "bands_request", "session": self.session})], self.t.bands, on_reply)
        if not out:
            raise RuntimeError("Borrower node did not reply in time")
        bands = dict(out["bands"])
        if horizon_hint:
            bands["horizon_years"] = horizon_hint
        shown = {k: bands[k] for k in ("loan_band", "ltv_band", "dti_band", "occupancy", "term_years", "property_state")}
        ev.msg(borrower, COORD, "bands", f"Loan {bands['loan_band']}, LTV {bands['ltv_band']}, DTI {bands['dti_band']}",
               list(shown))
        ev.emit("bq.bands", bands=shown, withheld=out.get("withheld", []))
        for item in (f"loan {bands['loan_band']}", f"LTV {bands['ltv_band']}", f"DTI {bands['dti_band']}"):
            self.ledger.learn("BlindQuote Coordinator", item)
        self.ledger.learn(self.nodes[borrower]["name"], "every quote and the final ranking")
        ev.stage("bands", "done", "Only bands left the borrower device")
        return bands, str(out["token"])

    def _attest(self, bureau: str, token: str) -> dict[str, Any]:
        ev = self.ev
        ev.stage("attest", "start", "Credit bureau attests the credit band")
        ev.msg(COORD, bureau, "attest_request", "Attest credit band for consent token", ["token"])
        out: dict[str, Any] = {}

        def on_reply(nid: str, msg: dict[str, Any]) -> None:
            if msg.get("kind") != "attestation":
                raise RuntimeError(f"Bureau node error: {msg.get('message', msg)}")
            out.update(msg)

        self._exchange([(bureau, {"kind": "attest_request", "session": self.session, "token": token})], self.t.attest, on_reply)
        if not out:
            raise RuntimeError("Bureau node did not reply in time")
        att = {k: out[k] for k in ("fico_band", "token", "sig")}
        ev.msg(bureau, COORD, "attestation", f"FICO {out['fico_band']} (signed)", ["fico_band", "sig"])
        ev.emit("bq.attest", bureau=out.get("bureau", self.nodes[bureau]["name"]), fico_band=out["fico_band"],
                signature_ok=bool(out.get("sig")))
        self.ledger.learn("BlindQuote Coordinator", f"FICO band {out['fico_band']}")
        self.ledger.learn(self.nodes[bureau]["name"], "a one-time consent token")
        ev.stage("attest", "done", f"FICO band {out['fico_band']} attested")
        return att

    def _accept_offer(self, st: BankState, msg: dict[str, Any], bands: dict[str, Any], rnd: int) -> dict[str, Any] | None:
        """Validate a bank's options, recompute APR, emit guard flags; return the best option."""
        loan = float(bands["loan_mid"])
        options = msg.get("options") or []
        best = None
        for opt in options:
            try:
                o = pricing.make_offer(loan, float(opt["rate"]), float(opt["points"]), float(opt["fees"]),
                                       int(bands["horizon_years"]), int(bands.get("term_years", 30)))
            except (KeyError, TypeError, ValueError):
                continue
            if best is None or o.total_cost < best.total_cost:
                best = o
        if best is None:
            return None
        stated = msg.get("apr_stated")
        if isinstance(stated, (int, float)) and abs(float(stated) - best.apr) > APR_TOLERANCE:
            flag = f"stated APR {float(stated):.3f}% vs actual {best.apr:.3f}%"
            if "misleading APR" not in st.flags:
                st.flags.append("misleading APR")
                self.ev.emit("bq.guard", bank=st.name, node_id=st.node_id, round=rnd, violation="apr_mismatch",
                             requested=[], detail=flag, action="flagged")
        offer = best.to_dict() | {"apr_stated": stated if isinstance(stated, (int, float)) else None,
                                  "note": msg.get("note") or ""}
        return offer

    def _check_requests(self, st: BankState, msg: dict[str, Any], rnd: int) -> None:
        requested = requested_fields_violation(msg)
        if requested:
            if "requested raw data (blocked)" not in st.flags:
                st.flags.append("requested raw data (blocked)")
            self.ev.emit("bq.guard", bank=st.name, node_id=st.node_id, round=rnd, violation="requested_fields",
                         requested=requested,
                         detail=f"{st.name} requested {', '.join(requested)}. Blocked: banks receive attested bands only.",
                         action="blocked")
            self.ledger.learn(st.name, f"request for {', '.join(requested)} was refused")

    def _round1(self, states: dict[str, BankState], bands: dict[str, Any], att: dict[str, Any]) -> None:
        ev = self.ev
        ev.stage("round1", "start", "Round 1: sealed bids")
        wire_bands = {k: bands[k] for k in bands}
        for nid in states:
            ev.msg(COORD, nid, "quote_request", "Sealed quote request", ["bands", "attestation"], sealed=True)
            for item in (f"loan {bands['loan_band']}", f"LTV {bands['ltv_band']}", f"DTI {bands['dti_band']}",
                         f"FICO band {att['fico_band']} (attested)"):
                self.ledger.learn(states[nid].name, item)

        def on_reply(nid: str, msg: dict[str, Any]) -> None:
            st = states[nid]
            if msg.get("kind") != "quote":
                ev.emit("bq.decline", bank=st.name, round=1, reason="error", message=str(msg.get("message", ""))[:200])
                return
            try:
                check(msg)
            except GuardViolation as exc:
                ev.emit("bq.guard", bank=st.name, node_id=nid, round=1, violation="outbound_blocked",
                        requested=exc.fields, detail=exc.detail, action="blocked")
                return
            ev.msg(nid, COORD, "quote", "Sealed quote", ["options", "note"], sealed=True)
            self._check_requests(st, msg, 1)
            if not msg.get("eligible"):
                ev.emit("bq.decline", bank=st.name, round=1, reason=str(msg.get("reason", "ineligible")),
                        message=str(msg.get("note") or msg.get("reason") or ""))
                return
            offer = self._accept_offer(st, msg, bands, 1)
            if offer is None:
                ev.emit("bq.decline", bank=st.name, round=1, reason="invalid offer", message="")
                return
            st.round1 = st.final = offer
            ev.emit("bq.quote", bank=st.name, node_id=nid, round=1, model=st.model,
                    horizon_years=bands["horizon_years"], **offer)

        sends = [(nid, {"kind": "quote_request", "session": self.session, "bands": wire_bands, "attestation": att, "round": 1})
                 for nid in states]
        for nid in self._exchange(sends, self.t.quote, on_reply):
            ev.emit("bq.decline", bank=states[nid].name, round=1, reason="timeout", message="No reply before the deadline")
        ev.stage("round1", "done", f"{sum(1 for s in states.values() if s.round1)} sealed quotes")

    def _round2(self, states: dict[str, BankState], bands: dict[str, Any], att: dict[str, Any]) -> None:
        ev = self.ev
        live = {nid: st for nid, st in states.items() if st.round1}
        ev.stage("round2", "start", "Round 2: best competing total cost only")
        if len(live) < 2:
            ev.stage("round2", "done", "Not enough quotes to negotiate")
            return
        sends = []
        for nid, st in live.items():
            others = [o.round1["total_cost"] for k, o in live.items() if k != nid and o.round1]
            best_other = round(min(others), 2)
            ev.msg(COORD, nid, "counter_request", f"Best competing total: ${best_other:,.0f}", ["best_competing_total"], sealed=True)
            self.ledger.learn(st.name, "best competing total cost (no bank named)")
            sends.append((nid, {"kind": "counter_request", "session": self.session, "bands": bands, "attestation": att,
                                "round": 2, "best_competing_total": best_other,
                                "your_offer": {k: st.round1[k] for k in ("rate", "points", "fees", "total_cost")}}))

        def on_reply(nid: str, msg: dict[str, Any]) -> None:
            st = live[nid]
            if msg.get("kind") != "counter":
                ev.emit("bq.decline", bank=st.name, round=2, reason="error", message=str(msg.get("message", ""))[:200])
                return
            try:
                check(msg)
            except GuardViolation as exc:
                ev.emit("bq.guard", bank=st.name, node_id=nid, round=2, violation="outbound_blocked",
                        requested=exc.fields, detail=exc.detail, action="blocked")
                return
            ev.msg(nid, COORD, "counter", "Sealed counter", ["decision", "options"], sealed=True)
            self._check_requests(st, msg, 2)
            if msg.get("decision") != "improve":
                ev.emit("bq.decline", bank=st.name, round=2, reason="held price", message=str(msg.get("note") or ""))
                return
            offer = self._accept_offer(st, msg, bands, 2)
            if offer is None or offer["total_cost"] >= st.round1["total_cost"]:
                ev.emit("bq.decline", bank=st.name, round=2, reason="no improvement", message=str(msg.get("note") or ""))
                return
            ev.emit("bq.improve", bank=st.name, from_total=st.round1["total_cost"], to_total=offer["total_cost"],
                    delta=round(st.round1["total_cost"] - offer["total_cost"], 2), message=str(msg.get("note") or ""))
            st.final = offer
            ev.emit("bq.quote", bank=st.name, node_id=nid, round=2, model=st.model,
                    horizon_years=bands["horizon_years"], **offer)

        for nid in self._exchange(sends, self.t.counter, on_reply):
            ev.emit("bq.decline", bank=live[nid].name, round=2, reason="timeout", message="No reply before the deadline")
        ev.stage("round2", "done", "Negotiation closed")

    def _verdict(self, states: dict[str, BankState], bands: dict[str, Any]) -> dict[str, Any]:
        ev = self.ev
        ev.stage("verdict", "start", "Ranking by total cost over your horizon")
        finals = [s for s in states.values() if s.final]
        if not finals:
            raise RuntimeError("No bank returned a valid quote")
        ranking = sorted(
            ({"bank": s.name, "model": s.model, "flags": list(s.flags),
              **{k: s.final[k] for k in ("rate", "points", "fees", "apr", "total_cost", "monthly_pi")}}
             for s in finals),
            key=lambda r: (bool(r["flags"]), r["total_cost"]),
        )
        winner = ranking[0]
        round1_totals = [s.round1["total_cost"] for s in states.values() if s.round1]
        typical = statistics.median(round1_totals)
        verdict = {
            "ranking": ranking,
            "winner": winner["bank"],
            "savings_vs_single_quote": round(typical - winner["total_cost"], 2),
            "savings_vs_worst": round(max(r["total_cost"] for r in ranking) - winner["total_cost"], 2),
            "horizon_years": bands["horizon_years"],
        }
        ev.emit("bq.verdict", **verdict)
        ev.stage("verdict", "done", f"Best: {winner['bank']}")
        return verdict

    def _narrate(self, verdict: dict[str, Any], bands: dict[str, Any], market: dict[str, Any]) -> None:
        table = _markdown_table(verdict)
        self._text(f"### BlindQuote result\n\n{table}\n\n")
        instructions = (
            "You are BlindQuote, a neutral mortgage-shopping agent. Explain the result to the borrower in 4-6 short "
            "sentences of plain English: who wins and why on total cost over their horizon (not headline rate), "
            "how points vs rate trade off, what the market average is, and any flagged lender behaviour. "
            "Use only the numbers provided. Do not use headings."
        )
        prompt = json.dumps({"verdict": verdict, "bands": {k: bands[k] for k in ("loan_band", "ltv_band", "horizon_years")},
                             "market_30y_avg": market}, default=str)
        stream = self.llm.stream(instructions, prompt)
        wrote = False
        if stream is not None:
            try:
                for event in stream:
                    etype = event.get("type")
                    if etype == "response.output_text.delta":
                        wrote = True
                        self.ev.raw(event)
                    elif etype == "response.completed" and wrote:
                        self.ev.raw(event)
                    elif etype in {"error", "response.failed", "response.incomplete"}:
                        break
            except Exception:  # noqa: BLE001 - fall back to deterministic text
                pass
        if not wrote:
            w = verdict["ranking"][0]
            self._text(
                f"{w['bank']} wins at {w['rate']:.3f}% with {w['points']:.2f} points: about "
                f"${w['total_cost']:,.0f} over {verdict['horizon_years']} years, "
                f"${verdict['savings_vs_single_quote']:,.0f} less than a typical single quote. "
                f"The 30-year market average is {market['pmms_30y']:.2f}% ({market['as_of']})."
            )
        self.ev.raw({"type": "response.completed", "response": {"output": []}})

    def _text(self, text: str) -> None:
        self.ev.raw({"type": "response.output_text.delta", "delta": text})


def _markdown_table(verdict: dict[str, Any]) -> str:
    rows = ["| # | Lender | Rate | Points | Fees | APR | Total cost | Flags |", "|---|---|---|---|---|---|---|---|"]
    for i, r in enumerate(verdict["ranking"], 1):
        rows.append(
            f"| {i} | {r['bank']} | {r['rate']:.3f}% | {r['points']:.2f} | ${r['fees']:,.0f} | {r['apr']:.3f}% | "
            f"${r['total_cost']:,.0f} | {', '.join(r['flags']) or '-'} |"
        )
    return "\n".join(rows)


def _horizon_from_prompt(prompt: str) -> int | None:
    import re

    # "stay about 7 years", "keep it for 10 years"; ignores "30-year fixed" / "30 year term".
    match = re.search(r"(?:stay|keep|live|hold|own|for)\D{0,20}?(\d{1,2})\s*(?:years|yrs)\b", prompt or "", re.I)
    if match and 1 <= int(match.group(1)) <= 30:
        return int(match.group(1))
    return None
