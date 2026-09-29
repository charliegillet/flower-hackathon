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
from ..intake import IntakeError, normalize, parse_request
from ..protocol import GuardViolation, check, decode, encode, requested_fields_violation

COORD = "coordinator"
APR_TOLERANCE = 0.125  # TILA tolerance for regular transactions (1/8 point)
RUN_BUDGET_S = 240.0  # whole run, well inside Flower's 5-minute task window
VERDICT_RESERVE_S = 25.0  # always kept back for ranking + explanation


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
    attested: bool | None = None
    final: dict[str, Any] | None = None
    flags: list[str] = field(default_factory=list)


class _BankTagging:
    """Adds ``bank_id`` to every event that names a bank, so UIs can key on a stable id."""

    def __init__(self, ev: Emitter, ids: dict[str, str]) -> None:
        self._ev, self._ids = ev, ids

    def emit(self, type_: str, **fields: Any) -> None:
        if "bank" in fields and fields["bank"] in self._ids:
            fields.setdefault("bank_id", self._ids[fields["bank"]])
        self._ev.emit(type_, **fields)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._ev, name)


class Coordinator:
    def __init__(
        self,
        grid: Grid,
        emitter: Emitter,
        llm: LLM,
        fetch: Callable[[str], str | None] | None = None,
        timeouts: Timeouts | None = None,
        mode: str = "flower",
        budget_s: float = RUN_BUDGET_S,
    ) -> None:
        self.grid = grid
        self.bank_ids: dict[str, str] = {}
        self.ev = _BankTagging(emitter, self.bank_ids)
        self.llm = llm
        self.fetch = fetch
        self.t = timeouts or Timeouts()
        self.mode = mode
        self.budget_s = budget_s
        self.session = secrets.token_hex(6)
        self.ledger = Ledger()
        self.nodes: dict[str, dict[str, Any]] = {}
        self.bureau_name = "Credit Bureau"
        # The borrower's stay horizon: used here to rank offers, never sent to a bank.
        self.horizon = 7

    # ------------------------------------------------------------------ grid
    def _exchange(self, sends: list[tuple[str, dict[str, Any]]], timeout: float, on_reply: Callable[[str, dict[str, Any]], None]) -> list[str]:
        """Push messages, then poll so replies surface as they arrive.

        Returns node ids that never replied: rejected by the grid or timed out.
        """
        ids = self.grid.push([(dst, encode(msg)) for dst, msg in sends])
        rejected = [dst for mid, (dst, _) in zip(ids, sends) if not mid]
        pending = {mid: dst for mid, (dst, _) in zip(ids, sends) if mid}
        # Never let one stage eat the time reserved for the verdict.
        timeout = max(min(timeout, self.remaining - VERDICT_RESERVE_S), 1.0)
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
        return rejected + list(pending.values())

    @property
    def remaining(self) -> float:
        return self.budget_s - self.ev.elapsed

    def _isolated(self, states: dict[str, BankState], rnd: int, handler: Callable[[str, dict[str, Any]], None]) -> Callable[[str, dict[str, Any]], None]:
        """One misbehaving bank declines; it never crashes the negotiation."""

        def wrapped(nid: str, msg: dict[str, Any]) -> None:
            try:
                handler(nid, msg)
            except Exception as exc:  # noqa: BLE001
                self.ev.emit("bq.decline", bank=states[nid].name, round=rnd, reason="invalid reply",
                             message=f"reply rejected ({type(exc).__name__})")

        return wrapped

    def _of_role(self, role: str) -> list[str]:
        return [nid for nid, n in self.nodes.items() if n.get("role") == role]

    # ------------------------------------------------------------------- run
    def run(self, prompt: str) -> dict[str, Any]:
        ev = self.ev
        request = parse_request(prompt)
        horizon_hint = None if request else _horizon_from_prompt(prompt)
        # Never echo a structured request back: it carries the consent token.
        ev.emit("bq.run", prompt="(bands from the borrower's device)" if request else prompt,
                mode=self.mode, horizon_years=horizon_hint)
        ev.emit("bq.node", node_id=COORD, role="coordinator", name="BlindQuote Coordinator",
                org_kind="Neutral broker (SuperGrid)", model=self.llm.model, location=None)
        self.ledger.party("BlindQuote Coordinator", "coordinator")

        self._discover()
        borrowers, bureaus, banks = self._of_role("borrower"), self._of_role("bureau"), self._of_role("bank")
        if not banks or not bureaus or not (borrowers or request):
            raise RuntimeError(
                f"Need a bureau, at least one bank and a borrower (node or device bands); found "
                f"{len(borrowers)} borrower, {len(bureaus)} bureau, {len(banks)} bank"
            )

        if request is not None:
            bands, token, claimed = self._device_bands(request)
            attestation = self._attest(bureaus[0], token, fallback_band=claimed)
            if attestation is None:  # bureau has no file: banks price a self-reported band
                bands["fico_self_reported"] = claimed
        else:
            bands, token = self._bands(borrowers[0], horizon_hint)
            attestation = self._attest(bureaus[0], token)
        states = {nid: BankState(nid, self.nodes[nid]["name"], self.nodes[nid].get("model")) for nid in banks}
        self._round1(states, bands, attestation)
        self._round2(states, bands, attestation)
        market = market_context(self.fetch if self.remaining > 45 else None)
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
                "bank_id": msg.get("bank_id"),
            }
            self.nodes[nid] = info
            if info["role"] == "bank" and info["bank_id"]:
                self.bank_ids[str(info["name"])] = str(info["bank_id"])
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
        self.horizon = int(horizon_hint or out.get("horizon_years") or 7)
        shown = {k: bands[k] for k in ("loan_band", "ltv_band", "dti_band", "occupancy", "term_years", "property_state")}
        ev.msg(borrower, COORD, "bands", f"Loan {bands['loan_band']}, LTV {bands['ltv_band']}, DTI {bands['dti_band']}",
               list(shown))
        ev.emit("bq.bands", bands=shown, withheld=out.get("withheld", []))
        for item in (f"loan {bands['loan_band']}", f"LTV {bands['ltv_band']}", f"DTI {bands['dti_band']}"):
            self.ledger.learn("BlindQuote Coordinator", item)
        self.ledger.learn(self.nodes[borrower]["name"], "every quote and the final ranking")
        ev.stage("bands", "done", "Only bands left the borrower device")
        return bands, str(out["token"])

    def _device_bands(self, request: dict[str, Any]) -> tuple[dict[str, Any], str | None, str]:
        """Bands computed on the borrower's own device (browser); nothing raw arrives."""
        ev = self.ev
        ev.stage("bands", "start", "Bands arrive from the borrower's device")
        try:
            bands, token, horizon, claimed = normalize(request)
        except IntakeError as exc:
            raise RuntimeError(f"Cannot price this request: {exc}") from exc
        self.horizon = horizon
        shown = {k: bands[k] for k in ("loan_band", "ltv_band", "dti_band", "occupancy", "term_years") if k in bands}
        ev.emit("bq.bands", bands=shown, withheld=["name", "exact income", "assets", "exact credit score",
                                                   "monthly debts", "employer", "address", "stay horizon"])
        for item in (f"loan {bands['loan_band']}", f"LTV {bands['ltv_band']}", f"DTI {bands['dti_band']}",
                     f"stay horizon {horizon} years (for ranking only, never forwarded)"):
            self.ledger.learn("BlindQuote Coordinator", item)
        self.ledger.party("Your device", "borrower")
        self.ledger.learn("Your device", "every quote and the final ranking")
        ev.stage("bands", "done", "Only bands left your device")
        return bands, token, claimed

    def _attest(self, bureau: str, token: str | None, fallback_band: str | None = None) -> dict[str, Any] | None:
        ev = self.ev
        ev.stage("attest", "start", "Credit bureau attests the credit band")
        ev.msg(COORD, bureau, "attest_request", "Attest credit band for consent token", ["token"])
        out: dict[str, Any] = {}

        def on_reply(nid: str, msg: dict[str, Any]) -> None:
            if msg.get("kind") != "attestation":
                raise RuntimeError(f"Bureau node error: {msg.get('message', msg)}")
            try:
                check(msg)
            except GuardViolation as exc:
                ev.emit("bq.guard", bank=self.nodes[nid]["name"], node_id=nid, round=0,
                        violation="outbound_blocked", requested=exc.fields, detail=exc.detail, action="blocked")
                raise RuntimeError("Bureau reply blocked by guard") from exc
            out.update(msg)

        if fallback_band is not None:
            # Device-bands mode: a missing bureau file is not fatal; the band stays self-reported.
            strict = on_reply

            def on_reply(nid: str, msg: dict[str, Any]) -> None:  # noqa: F811
                if msg.get("kind") == "attestation":
                    strict(nid, msg)

        if token:
            self._exchange([(bureau, {"kind": "attest_request", "session": self.session, "token": token})],
                           self.t.attest, on_reply)
        if not out and fallback_band is not None:
            self.bureau_name = self.nodes[bureau]["name"]
            ev.emit("bq.attest", bureau=self.bureau_name, fico_band=fallback_band, signature_ok=None, verified_by=0,
                    self_reported=True)
            self.ledger.learn("BlindQuote Coordinator", f"FICO band {fallback_band} (self-reported)")
            ev.stage("attest", "done", f"No bureau file: FICO band {fallback_band} stays self-reported")
            return None
        if not out:
            raise RuntimeError("Bureau node did not reply in time")
        # Banks get a session-bound, expiring attestation, never the consent token.
        att = {k: out[k] for k in ("fico_band", "session", "expires", "sig")}
        self.bureau_name = out.get("bureau", self.nodes[bureau]["name"])
        ev.msg(bureau, COORD, "attestation", f"FICO {out['fico_band']} (signed)", ["fico_band", "sig"])
        # The coordinator holds no verification key: banks verify, and report back in round 1.
        ev.emit("bq.attest", bureau=self.bureau_name, fico_band=out["fico_band"], signature_ok=None, verified_by=0)
        self.ledger.learn("BlindQuote Coordinator", f"FICO band {out['fico_band']}")
        self.ledger.learn(self.nodes[bureau]["name"], "a one-time consent token")
        ev.stage("attest", "done", f"FICO band {out['fico_band']} attested")
        return att

    def _evaluate(self, options: Any, bands: dict[str, Any]) -> pricing.Offer | None:
        """Cheapest valid option over the borrower's horizon (pure: no events)."""
        loan = float(bands["loan_mid"])
        if not isinstance(options, list):
            return None
        best = None
        for opt in options:
            if not isinstance(opt, dict):
                continue
            try:
                rate, points, fees = float(opt["rate"]), float(opt["points"]), float(opt["fees"])
            except (KeyError, TypeError, ValueError):
                continue
            # Sanity ranges: a bank cannot win with an impossible offer.
            if not (0 < rate < 20 and 0 <= points <= 10 and 0 <= fees <= 50_000):
                continue
            try:
                o = pricing.make_offer(loan, rate, points, fees, self.horizon, int(bands.get("term_years", 30)))
            except ArithmeticError:
                continue
            if best is None or o.total_cost < best.total_cost:
                best = o
        return best

    def _accept_offer(self, st: BankState, msg: dict[str, Any], bands: dict[str, Any], rnd: int) -> dict[str, Any] | None:
        """Validate a bank's options, recompute APR, emit guard flags; return the best option."""
        best = self._evaluate(msg.get("options"), bands)
        if best is None:
            return None
        stated = msg.get("apr_stated")
        numeric = isinstance(stated, (int, float)) and not isinstance(stated, bool)
        if not numeric or abs(float(stated) - best.apr) > APR_TOLERANCE:
            flag = (f"stated APR {float(stated):.3f}% vs actual {best.apr:.3f}%" if numeric
                    else f"no numeric APR disclosed (actual {best.apr:.3f}%)")
            if "misleading APR" not in st.flags:
                st.flags.append("misleading APR")
                self.ev.emit("bq.guard", bank=st.name, node_id=st.node_id, round=rnd, violation="apr_mismatch",
                             requested=[], detail=flag, action="flagged")
        offer = best.to_dict() | {"apr_stated": float(stated) if numeric else None,
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
            credit = (f"FICO band {att['fico_band']} (attested for this session only)" if att
                      else f"FICO band {bands.get('fico_self_reported')} (self-reported)")
            for item in (f"loan {bands['loan_band']}", f"LTV {bands['ltv_band']}", f"DTI {bands['dti_band']}", credit):
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
            st.attested = msg.get("attestation_ok") is True
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
                    horizon_years=self.horizon, **offer)

        sends = [(nid, {"kind": "quote_request", "session": self.session, "bands": wire_bands, "attestation": att, "round": 1})
                 for nid in states]
        for nid in self._exchange(sends, self.t.quote, self._isolated(states, 1, on_reply)):
            ev.emit("bq.decline", bank=states[nid].name, round=1, reason="timeout", message="No reply before the deadline")
        reported = [st.attested for st in states.values() if st.attested is not None]
        if reported and att:
            ev.emit("bq.attest", bureau=self.bureau_name, fico_band=att["fico_band"],
                    signature_ok=all(reported), verified_by=sum(reported))
        ev.stage("round1", "done", f"{sum(1 for s in states.values() if s.round1)} sealed quotes")

    def _round2(self, states: dict[str, BankState], bands: dict[str, Any], att: dict[str, Any]) -> None:
        """Each bank hears only its rank and how far behind the best offer it is (as a %).

        It answers with a price ladder; the coordinator takes the smallest rung that
        beats the best competing offer, or the deepest rung if none does. Banks never
        learn the borrower's horizon, a competitor's price, or who the competitor is.
        """
        ev = self.ev
        live = {nid: st for nid, st in states.items() if st.round1}
        ev.stage("round2", "start", "Round 2: rank and gap only")
        if len(live) < 2:
            ev.stage("round2", "done", "Not enough quotes to negotiate")
            return
        order = sorted(live, key=lambda k: live[k].round1["total_cost"])
        ev.emit("bq.round2", best_total=live[order[0]].round1["total_cost"], banks=len(live))
        targets: dict[str, float] = {}
        sends = []
        for nid, st in live.items():
            own = st.round1["total_cost"]
            targets[nid] = min(o.round1["total_cost"] for k, o in live.items() if k != nid)
            gap = round(max((own - targets[nid]) / own * 100, 0.0), 2)
            rank = order.index(nid) + 1
            ev.msg(COORD, nid, "counter_request", f"You rank {rank} of {len(live)}; best offer is {gap:.1f}% cheaper",
                   ["rank", "gap_pct"], sealed=True)
            self.ledger.learn(st.name, "its rank and % gap to the best offer (no competitor named, no horizon)")
            sends.append((nid, {"kind": "counter_request", "session": self.session, "bands": bands, "attestation": att,
                                "round": 2, "rank": rank, "of": len(live), "gap_pct": gap,
                                "your_offer": {k: st.round1[k] for k in ("rate", "points", "fees")}}))

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
            ev.msg(nid, COORD, "counter", "Sealed price ladder", ["decision", "ladder"], sealed=True)
            self._check_requests(st, msg, 2)
            ladder = msg.get("ladder")
            if msg.get("decision") != "improve" or not isinstance(ladder, list):
                ev.emit("bq.decline", bank=st.name, round=2, reason="held price", message=str(msg.get("note") or ""))
                return
            rungs = []
            for rung in ladder:
                if not isinstance(rung, dict):
                    continue
                best = self._evaluate(rung.get("options"), bands)
                if best is not None:
                    rungs.append((float(rung.get("discount_pts") or 0), best, rung))
            rungs.sort(key=lambda r: r[0])
            chosen = next((r for r in rungs if r[1].total_cost < targets[nid] - 250), None)
            if chosen is None and rungs:
                chosen = min(rungs, key=lambda r: r[1].total_cost)
            offer = self._accept_offer(st, chosen[2], bands, 2) if chosen else None
            if offer is None or offer["total_cost"] >= st.round1["total_cost"] - 1:
                ev.emit("bq.decline", bank=st.name, round=2, reason="no improvement", message=str(msg.get("note") or ""))
                return
            took = f"took the {chosen[0]:.2f}-point rung of a {len(rungs)}-rung ladder"
            ev.emit("bq.improve", bank=st.name, from_total=st.round1["total_cost"], to_total=offer["total_cost"],
                    delta=round(st.round1["total_cost"] - offer["total_cost"], 2),
                    message=(str(msg.get("note") or "") + f" (coordinator {took})").strip())
            st.final = offer
            ev.emit("bq.quote", bank=st.name, node_id=nid, round=2, model=st.model,
                    horizon_years=self.horizon, **offer)

        for nid in self._exchange(sends, self.t.counter, self._isolated(live, 2, on_reply)):
            ev.emit("bq.decline", bank=live[nid].name, round=2, reason="timeout", message="No reply before the deadline")
        ev.stage("round2", "done", "Negotiation closed")

    def _verdict(self, states: dict[str, BankState], bands: dict[str, Any]) -> dict[str, Any]:
        ev = self.ev
        ev.stage("verdict", "start", "Ranking by total cost over your horizon")
        finals = [s for s in states.values() if s.final]
        if not finals:
            raise RuntimeError("No bank returned a valid quote")
        ranking = sorted(
            ({"bank": s.name, "bank_id": self.bank_ids.get(s.name), "model": s.model, "flags": list(s.flags),
              **{k: s.final[k] for k in ("rate", "points", "fees", "apr", "total_cost", "monthly_pi")}}
             for s in finals),
            key=lambda r: (bool(r["flags"]), r["total_cost"]),
        )
        winner = ranking[0]
        # "Typical single quote" = median round-1 total among lenders that played fair.
        fair = [s.round1["total_cost"] for s in states.values() if s.round1 and not s.flags]
        typical = statistics.median(fair or [s.round1["total_cost"] for s in states.values() if s.round1])
        verdict = {
            "ranking": ranking,
            "winner": winner["bank"],
            "savings_vs_single_quote": round(max(typical - winner["total_cost"], 0.0), 2),
            "savings_vs_worst": round(max(r["total_cost"] for r in ranking) - winner["total_cost"], 2),
            "horizon_years": self.horizon,
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
        prompt = json.dumps({"verdict": verdict, "bands": {k: bands[k] for k in ("loan_band", "ltv_band")},
                             "market_30y_avg": market}, default=str)
        wrote = False
        stream = None
        if self.remaining > 20:
            self.llm.timeout = min(self.llm.timeout, self.remaining - 10)
            stream = self.llm.stream(instructions, prompt)
        if stream is not None:
            try:
                for event in stream:
                    if self.remaining < 5:
                        break
                    etype = event.get("type")
                    if etype == "response.output_text.delta":
                        wrote = True
                        self.ev.raw(event)
                    elif etype == "response.completed":
                        break  # a single completion is emitted below
                    elif etype in {"error", "response.failed", "response.incomplete"}:
                        break
            except Exception:  # noqa: BLE001 - fall back to deterministic text
                pass
        if not wrote:
            w = verdict["ranking"][0]
            saving = verdict["savings_vs_single_quote"]
            vs = (f"${saving:,.0f} less than a typical single quote" if saving > 0
                  else "in line with a typical single quote")
            self._text(
                f"{w['bank']} wins at {w['rate']:.3f}% with {w['points']:.2f} points: about "
                f"${w['total_cost']:,.0f} over {verdict['horizon_years']} years, {vs}. "
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
