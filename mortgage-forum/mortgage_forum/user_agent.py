"""User agent: holds the user's figures and negotiates on their behalf.

The user's income, loan and house price stay inside this object. Banks are
sent only the LTI/LTV ratios and, during negotiation, competing rates.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from .bank_agent import BankAgent, Offer
from .banks import MAX_LTI, MAX_LTV, monthly_payment, ratios, total_cost
from .llm import LLM

_PARSE_INSTRUCTIONS = (
    "Extract the user's mortgage figures from their message. Answer as "
    '{"income": <annual income>, "loan": <amount to borrow>, '
    '"house_price": <property price or null>}. Use plain numbers in full '
    "(120k -> 120000). Use null for anything not stated."
)

_EXPLAIN_INSTRUCTIONS = (
    "You are the user's private mortgage adviser. In two or three sentences, "
    "explain why the recommended offer is best for them, referring to the "
    "table. Do not invent or change any numbers."
)


@dataclass(frozen=True)
class Figures:
    """The user's private figures."""

    income: float
    loan: float
    house_price: float | None


class UserAgent:
    """Negotiates with the banks and writes the recommendation."""

    def __init__(
        self,
        llm: LLM,
        banks: list[BankAgent],
        rounds: int = 1,
        term_years: int = 25,
    ) -> None:
        self._llm = llm
        self._banks = banks
        self._rounds = rounds
        self._years = term_years

    def run(self, prompt: str) -> str:
        """Handle one chat prompt end to end and return the answer for the user."""
        figures = self.parse(prompt)
        if figures is None:
            return (
                "I need at least your **annual income** and the **amount you want "
                "to borrow** (plus the **house price** for a full quote), e.g. "
                '*"I earn £120k, house £400k, need £300k"*.'
            )

        request = ratios(figures.income, figures.loan, figures.house_price)
        if request.ltv is None and request.lti <= MAX_LTI:
            # Nothing to ask the banks yet: they would only decline for lack of it.
            return "What is the **house price**? I need it before asking the banks."
        offers = {bank.name: bank.request_quote(request) for bank in self._banks}
        first_offers = dict(offers)
        self._negotiate(offers)
        return self._recommend(figures, request, first_offers, offers)

    def parse(self, prompt: str) -> Figures | None:
        """Turn free text into figures: LLM first, regex to fill any gaps."""
        extracted = self._llm.json(_PARSE_INSTRUCTIONS, prompt) or {}
        fallback = parse_figures_regex(prompt)
        values = {
            key: _as_amount(extracted.get(key)) or fallback.get(key)
            for key in ("income", "loan", "house_price")
        }
        if values["income"] is None or values["loan"] is None:
            return None
        return Figures(values["income"], values["loan"], values["house_price"])

    def _negotiate(self, offers: dict[str, Offer]) -> None:
        """Ask trailing banks to beat the best rate. Only rates are shared."""
        by_name = {bank.name: bank for bank in self._banks}
        for _ in range(self._rounds):
            approved = [o for o in offers.values() if o.approved and o.rate is not None]
            if len(approved) < 2:
                return
            best_rate = min(o.rate for o in approved)  # type: ignore[type-var]
            improved = False
            for offer in approved:
                if offer.rate > best_rate:  # type: ignore[operator]
                    new = by_name[offer.bank].counter(best_rate)
                    if new.rate < offer.rate:  # type: ignore[operator]
                        offers[offer.bank] = new
                        improved = True
            if not improved:
                return

    def _recommend(
        self,
        figures: Figures,
        request: Any,
        first: dict[str, Offer],
        final: dict[str, Offer],
    ) -> str:
        approved = [o for o in final.values() if o.approved and o.rate is not None]
        seen = f"LTI {request.lti:.2f}x" + (
            f", LTV {request.ltv:.1f}%" if request.ltv is not None else ""
        )
        privacy = (
            f"\n\n_Privacy: the banks saw only your ratios ({seen}) and each "
            "other's rates, never your income, loan or house price._"
        )

        if not approved:
            lines = ["**No bank can offer you a mortgage on these figures.**", ""]
            for offer in final.values():
                lines.append(f"- **{offer.bank}** declined: {offer.reason}.")
            lines.append("")
            lines.append(_decline_hint(request))
            return "\n".join(lines) + privacy

        best = min(approved, key=lambda o: o.rate)  # type: ignore[arg-type,return-value]
        rows = [
            "| Bank | Rate | Monthly | Total cost |",
            "|---|---|---|---|",
        ]
        for offer in final.values():
            if offer.approved and offer.rate is not None:
                note = ""
                if first[offer.bank].rate != offer.rate:
                    note = f" (was {first[offer.bank].rate:.2f}%)"
                monthly = monthly_payment(figures.loan, offer.rate, self._years)
                total = total_cost(figures.loan, offer.rate, self._years)
                rows.append(
                    f"| {offer.bank} | {offer.rate:.2f}%{note} "
                    f"| £{monthly:,.0f} | £{total:,.0f} |"
                )
            else:
                rows.append(f"| {offer.bank} | declined: {offer.reason} | – | – |")
        table = "\n".join(rows)

        answer = [
            f"**Best offer: {best.bank} at {best.rate:.2f}%** "
            f"over {self._years} years.",
            "",
            table,
        ]
        others = [o for o in approved if o is not best]
        if others:
            runner_up = min(others, key=lambda o: o.rate)  # type: ignore[arg-type,return-value]
            saving = total_cost(figures.loan, runner_up.rate, self._years) - total_cost(
                figures.loan, best.rate, self._years
            )
            fallback_why = (
                f"{best.bank} is {runner_up.rate - best.rate:.2f} percentage points "
                f"cheaper than {runner_up.bank}, saving about £{saving:,.0f} over "
                "the term."
            )
        else:
            fallback_why = f"{best.bank} is the only bank able to lend on these figures."
        why = self._llm.text(
            _EXPLAIN_INSTRUCTIONS,
            f"{table}\n\nRecommended: {best.bank}. Key fact: {fallback_why}\n"
            f"Bank said: {best.message}",
        )
        answer += ["", why or fallback_why]
        return "\n".join(answer) + privacy


def _decline_hint(request: Any) -> str:
    if request.lti > MAX_LTI:
        max_share = MAX_LTI / request.lti
        return (
            f"The banks lend at most {MAX_LTI}x income, so you would need to "
            f"borrow about {max_share:.0%} of what you asked for (or have a "
            "higher income) to qualify."
        )
    if request.ltv is None:
        return "Tell me the house price and I will ask again."
    return (
        f"A larger deposit would help: the banks lend at most {MAX_LTV:.0f}% of "
        "the property value."
    )


def _as_amount(value: Any) -> float | None:
    """Accept only plausible positive money amounts."""
    if isinstance(value, str):
        return _money(value)
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if amount >= 1000 else None


_AMOUNT = re.compile(
    r"£?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|grand|million|mil)?\b",
    re.IGNORECASE,
)
_KEYWORDS = {
    "income": ("earn", "income", "salary", "make", "paid"),
    "house_price": (
        "house", "home", "property", "flat", "place", "worth", "price", "buy", "cost",
    ),
    "loan": ("need", "borrow", "loan", "mortgage", "lend"),
}
_KEYWORD_WINDOW = 40  # a keyword must be this close before the amount


def _money(text: str) -> float | None:
    match = _AMOUNT.search(text)
    if match is None:
        return None
    value = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "").lower()
    if unit in {"k", "thousand", "grand"}:
        value *= 1_000
    elif unit in {"m", "million", "mil"}:
        value *= 1_000_000
    return value if value >= 1000 else None


def parse_figures_regex(text: str) -> dict[str, float]:
    """Deterministic fallback: match each amount to the keyword just before it."""
    found: dict[str, float] = {}
    for match in _AMOUNT.finditer(text):
        amount = _money(match.group(0))
        if amount is None:
            continue
        before = text[max(0, match.start() - _KEYWORD_WINDOW) : match.start()].lower()
        best_key, best_pos = None, -1
        for key, words in _KEYWORDS.items():
            if key in found:
                continue
            for word in words:
                pos = before.rfind(word)
                if pos > best_pos:
                    best_key, best_pos = key, pos
        if best_key is not None:
            found[best_key] = amount
    return found
