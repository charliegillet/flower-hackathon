"""Bank node: verifies the attestation, prices from its private sheet, negotiates.

The model only proposes (a short pitch, a round-2 discount); code decides:
prices come from the rate sheet and every discount is clamped to the floor.
"""

from __future__ import annotations

import time
from typing import Any

from .. import attest, pricing
from ..llm import LLM

LADDER_STEP = 0.05  # points of margin between ladder rungs


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
    if fico is None and msg.get("attestation") is None and bands.get("fico_self_reported"):
        # No bureau file: price the borrower's self-reported band with an unverified-credit charge.
        fico = str(bands["fico_self_reported"])
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

    # Round 2. The bank never learns the borrower's horizon or any competitor's price:
    # only its rank and how far behind the best offer it is (as a %). It opens a
    # price ladder as deep as it chooses; the coordinator takes the smallest rung
    # that wins, so a deep ladder only costs margin when it is needed to win.
    rank, of = msg.get("rank"), msg.get("of")
    try:
        gap = max(float(msg.get("gap_pct") or 0.0), 0.0)
    except (TypeError, ValueError):
        gap = 0.0
    headroom = max(sheet["margin_pts"] - sheet["floor_pts"], 0.0)
    if not sheet.get("reprice", True):  # bank policy, enforced in code
        return _quote_reply("counter", msg, sheet, cfg, decision="hold",
                            note=sheet.get("round2_message", "Holding our round-1 price."))
    if gap <= 0:
        return _quote_reply("counter", msg, sheet, cfg, decision="hold", note="We already hold the best offer.")
    if headroom <= 0.05:
        return _quote_reply("counter", msg, sheet, cfg, decision="hold", note="We are at our floor and cannot go lower.")

    depths = {"hold": 0.0, "moderate": round(headroom / 2, 3), "floor": headroom}
    proposal = llm.complete_json(
        f"You are the round-2 pricing strategist for {sheet['name']}, {sheet.get('persona', 'a lender')}. "
        f"Strategy: {sheet.get('strategy', 'compete when profitable')}. Decide how deep a price ladder to open. "
        "The neutral coordinator only takes the smallest rung that wins, so a deeper ladder costs margin only "
        "when it is needed to win. "
        'Return {"choice": "hold"|"moderate"|"floor", "message": "one short sentence to the borrower"}.',
        f"You rank {rank} of {of}. The best competing offer costs the borrower {gap:.1f}% less over their "
        f"horizon (competitor not named). Your margin headroom: {headroom:.2f} points. "
        f"moderate = up to {depths['moderate']:.2f} points, floor = up to {headroom:.2f} points.",
        max_tokens=900,
    )
    choice = str((proposal or {}).get("choice", "")).lower()
    if choice not in depths:  # no or invalid model answer: deterministic policy
        choice = "floor"
    limit = min(depths[choice], headroom)  # code enforces the floor
    message = str((proposal or {}).get("message") or "")[:220]
    if limit <= 0:
        return _quote_reply("counter", msg, sheet, cfg, decision="hold", note=message or "Holding our round-1 price.")

    ladder = []
    steps = [round(i * LADDER_STEP, 3) for i in range(1, int(limit / LADDER_STEP) + 1)]
    for d in sorted(set(steps + [round(limit, 3)])):
        priced = pricing.price_from_sheet(sheet, bands, fico, extra_discount_pts=d)
        best = pricing.best_option(priced["options"])
        ladder.append({"discount_pts": d, "options": [o.to_dict() for o in priced["options"]],
                       "apr_stated": _stated_apr(sheet, best)})
    return _quote_reply(
        "counter", msg, sheet, cfg,
        decision="improve",
        ladder=ladder,
        note=message or f"Opened a price ladder down to {limit:.2f} points of margin.",
    )
