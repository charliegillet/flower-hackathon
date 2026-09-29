"""Bank agent: prices with a deterministic tool, talks with an LLM.

A BankAgent only ever receives a RatioRequest (LTI, LTV) and competitor rates.
Everything it receives or says is recorded in `transcript` so the privacy test
can audit it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .banks import BankPolicy, Quote, RatioRequest, counter_floor, quote
from .llm import LLM

_BEAT_STEP = 0.05


@dataclass(frozen=True)
class Offer:
    """What a bank puts on the table."""

    bank: str
    approved: bool
    rate: float | None
    reason: str
    message: str


class BankAgent:
    """One bank in the forum."""

    def __init__(self, policy: BankPolicy, llm: LLM) -> None:
        self.policy = policy
        self.name = policy.name
        self._llm = llm
        self._quote: Quote | None = None
        self.transcript: list[dict[str, Any]] = []

    def _log(self, direction: str, payload: Any) -> None:
        self.transcript.append({"direction": direction, "payload": payload})

    def _ask_llm(self, instructions: str, prompt: str) -> str | None:
        self._log("to_llm", {"instructions": instructions, "prompt": prompt})
        reply = self._llm.text(instructions, prompt)
        self._log("from_llm", reply)
        return reply

    def _ask_llm_json(self, instructions: str, prompt: str) -> dict[str, Any] | None:
        self._log("to_llm", {"instructions": instructions, "prompt": prompt})
        reply = self._llm.json(instructions, prompt)
        self._log("from_llm", reply)
        return reply

    def _instructions(self) -> str:
        return (
            f"You are the mortgage desk of {self.name}. Speak for the bank in one "
            "or two short, friendly sentences. Never invent numbers: use only the "
            "rate and reason you are given."
        )

    def request_quote(self, request: RatioRequest) -> Offer:
        """Price the applicant from their ratios and phrase the offer."""
        self._log("received", {"lti": request.lti, "ltv": request.ltv})
        self._quote = quote(self.policy, request)
        if self._quote.approved:
            fact = f"We can offer {self._quote.rate:.2f}% a year."
        else:
            fact = f"We must decline: {self._quote.reason}."
        message = self._ask_llm(
            self._instructions(),
            f"Tell the applicant's agent: {fact}",
        )
        offer = Offer(
            bank=self.name,
            approved=self._quote.approved,
            rate=self._quote.rate,
            reason=self._quote.reason,
            message=message or fact,
        )
        self._log("sent", offer.__dict__)
        return offer

    def counter(self, competitor_rate: float) -> Offer:
        """Answer "can you beat X%?" without going below the policy floor."""
        self._log("received", {"competitor_rate": competitor_rate})
        if self._quote is None or not self._quote.approved or self._quote.rate is None:
            raise RuntimeError("counter() needs an approved quote first")
        own = self._quote.rate
        floor = counter_floor(self.policy, own)

        rate = own
        message = None
        if floor < competitor_rate:
            decision = self._ask_llm_json(
                self._instructions()
                + ' Decide a counter-offer. Answer as {"rate": <number>, '
                '"message": "<one sentence>"}.',
                f"Our current offer is {own:.2f}%. A competitor offers "
                f"{competitor_rate:.2f}%. The lowest rate we may offer is "
                f"{floor:.2f}%. Pick a rate below {competitor_rate:.2f}% to win "
                "the business without giving away more than needed.",
            )
            proposed = _as_rate(decision.get("rate") if decision else None)
            llm_rate_used = proposed is not None and proposed < competitor_rate
            if not llm_rate_used:
                proposed = competitor_rate - _BEAT_STEP
            rate = round(max(floor, min(proposed, own)), 2)
            # Keep the LLM's wording only if it describes the rate we actually offer.
            if (
                llm_rate_used
                and rate == round(proposed, 2)
                and isinstance(decision.get("message"), str)
            ):
                message = decision["message"]
            fact = f"We can improve our offer to {rate:.2f}% a year."
        else:
            fact = (
                f"We cannot beat {competitor_rate:.2f}%; our offer stays at "
                f"{own:.2f}% a year."
            )
            message = self._ask_llm(self._instructions(), f"Tell the applicant's agent: {fact}")

        self._quote = Quote(self.name, approved=True, rate=rate)
        offer = Offer(self.name, True, rate, "", message or fact)
        self._log("sent", offer.__dict__)
        return offer


def _as_rate(value: Any) -> float | None:
    try:
        rate = float(value)
    except (TypeError, ValueError):
        return None
    return rate if 0 < rate < 20 else None
