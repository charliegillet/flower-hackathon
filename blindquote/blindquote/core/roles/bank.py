"""Bank node: verifies the attestation, prices from its private sheet, negotiates.

The model only proposes (a short pitch, a round-2 discount); code decides:
prices come from the rate sheet and every discount is clamped to the floor.
"""

from __future__ import annotations

import time
from typing import Any

from .. import attest, pricing
from ..llm import LLM


def _verify(msg: dict[str, Any], cfg: dict[str, Any]) -> str | None:
    """Return the attested FICO band, or None if the signature does not verify."""
    att = msg.get("attestation") or {}
    try:
        key = attest.load_key(cfg.get("hmac_key_file"))
    except RuntimeError:
        return None
    band = str(att.get("fico_band", ""))
    session = str(att.get("session", ""))
    try:
        expires = int(att.get("expires", 0))
    except (TypeError, ValueError):
        return None
    if session != str(msg.get("session", "")) or expires < time.time():
        return None  # attestation from another session, or expired
    if band and attest.verify(key, band, session, expires, str(att.get("sig", ""))):
        return band
    return None


def _pitch(llm: LLM, sheet: dict[str, Any], offer: pricing.Offer, bands: dict[str, Any], greedy: bool) -> str:
    persona = sheet.get("persona", "a mortgage lender")
    fallback = sheet.get("pitch", f"{sheet['name']}: {offer.rate:.3f}% with {offer.points:.2f} points.")
    instructions = (
        f"You are the pricing agent for {sheet['name']}, {persona}. Write ONE short sentence (max 25 words) "
        "pitching your mortgage offer to a borrower you only know by bands. Do not invent numbers other than "
        "the ones given."
    )
    if greedy:
        instructions += " Also say you need the borrower's exact income and full asset statements to finalize."
    prompt = (
        f"Offer: {offer.rate:.3f}% rate, {offer.points:.2f} points, ${offer.fees:,.0f} lender fees. "
        f"Borrower bands: loan {bands['loan_band']}, LTV {bands['ltv_band']}, product {bands.get('product')}."
    )
    text = llm.complete(instructions, prompt, max_tokens=800)
    if not text:
        return fallback
    return text.strip().strip('"').splitlines()[0][:220]


def _quote_reply(kind: str, msg: dict[str, Any], sheet: dict[str, Any], cfg: dict[str, Any], **extra: Any) -> dict[str, Any]:
    reply = {
        "kind": kind,
        "session": msg.get("session"),
        "round": msg.get("round", 1),
        "bank": sheet["name"],
        "model": cfg.get("model") or None,
        "attestation_ok": _verify(msg, cfg) is not None,
        **extra,
    }
    greedy = bool(sheet.get("greedy"))
    if greedy:
        reply["request_fields"] = ["exact_income", "assets"]
    return reply


def _stated_apr(sheet: dict[str, Any], offer: pricing.Offer) -> float:
    # A misleading lender advertises its note rate as the APR.
    return offer.rate if sheet.get("misleading_apr") else offer.apr


def handle(msg: dict[str, Any], cfg: dict[str, Any], llm: LLM) -> dict[str, Any]:
    from . import load_json

    sheet = load_json(cfg, "rate_sheet.json")
    kind = msg.get("kind")
    bands = msg.get("bands") or {}
    fico = _verify(msg, cfg)
    if kind not in {"quote_request", "counter_request"}:
        return {"kind": "error", "message": f"bank cannot handle {kind!r}"}
    reply_kind = "quote" if kind == "quote_request" else "counter"
    if fico is None:
        extra = {"eligible": False, "reason": "credit attestation did not verify"} if reply_kind == "quote" else {
            "decision": "hold", "note": "credit attestation did not verify"}
        return _quote_reply(reply_kind, msg, sheet, cfg, **extra)

    if reply_kind == "quote":
        priced = pricing.price_from_sheet(sheet, bands, fico)
        if not priced["eligible"]:
            return _quote_reply("quote", msg, sheet, cfg, eligible=False, reason=priced["reason"], options=[])
        best = pricing.best_option(priced["options"])
        return _quote_reply(
            "quote", msg, sheet, cfg,
            eligible=True, reason="",
            options=[o.to_dict() for o in priced["options"]],
            apr_stated=_stated_apr(sheet, best),
            note=_pitch(llm, sheet, best, bands, bool(sheet.get("greedy"))),
        )

    # Round 2: decide whether to improve against the best competing total cost.
    your = msg.get("your_offer") or {}
    target = float(msg.get("best_competing_total") or 0)
    current_total = float(your.get("total_cost") or 0)
    headroom = max(sheet["margin_pts"] - sheet["floor_pts"], 0.0)
    if not sheet.get("reprice", True):  # bank policy, enforced in code
        return _quote_reply("counter", msg, sheet, cfg, decision="hold",
                            note=sheet.get("round2_message", "Holding our round-1 price."))

    # Code computes the exact outcome of each choice; the model only picks one.
    def total_at(discount: float) -> float:
        return pricing.best_option(pricing.price_from_sheet(sheet, bands, fico, extra_discount_pts=discount)["options"]).total_cost

    steps = [round(i * 0.05, 3) for i in range(int(headroom / 0.05) + 1)] + [headroom]
    win = next((d for d in steps if total_at(d) < target - 250), None)
    at_max = total_at(headroom)
    choices = {"hold": 0.0, "max": headroom}
    lines = [f"A) hold: total ${current_total:,.0f} (loses by ${max(current_total - target, 0):,.0f})" if current_total > target
             else f"A) hold: total ${current_total:,.0f} (already best)"]
    if win is not None:
        choices["win"] = win
        lines.append(f"B) win: discount {win:.2f} points -> total ${total_at(win):,.0f} (beats the best competitor)")
    lines.append(f"C) max: discount {headroom:.2f} points (your floor) -> total ${at_max:,.0f}"
                 + (" (still loses)" if at_max >= target else ""))
    proposal = llm.complete_json(
        f"You are the round-2 pricing strategist for {sheet['name']}, {sheet.get('persona', 'a lender')}. "
        f"Strategy: {sheet.get('strategy', 'compete when profitable')}. Pick exactly one option. "
        'Return {"choice": "hold"|"win"|"max", "message": "one short sentence to the borrower"}.',
        "Best competing total cost (sealed, lender not named): " + f"${target:,.0f}\n" + "\n".join(lines),
        max_tokens=900,
    )
    choice = str((proposal or {}).get("choice", "")).lower()
    if choice not in choices:  # no or invalid model answer: deterministic policy
        choice = "win" if "win" in choices else ("hold" if current_total <= target else "max")
    discount = min(max(choices[choice], 0.0), headroom)  # code enforces the floor
    message = str((proposal or {}).get("message") or "")[:220]
    if discount <= 0:
        reason = "at floor - cannot go lower" if headroom <= 0.05 else "holding round-1 price"
        return _quote_reply("counter", msg, sheet, cfg, decision="hold", note=message or reason)

    priced = pricing.price_from_sheet(sheet, bands, fico, extra_discount_pts=discount)
    best = pricing.best_option(priced["options"])
    if current_total and best.total_cost >= current_total - 1:
        return _quote_reply("counter", msg, sheet, cfg, decision="hold", note=message or "no meaningful improvement available")
    return _quote_reply(
        "counter", msg, sheet, cfg,
        decision="improve",
        options=[o.to_dict() for o in priced["options"]],
        apr_stated=_stated_apr(sheet, best),
        note=message or f"Improved by {discount:.2f} points of margin.",
    )
