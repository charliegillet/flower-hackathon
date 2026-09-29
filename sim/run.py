"""Run one BlindQuote negotiation in-process and print events.

    uv run python -m sim.run                 # real models from .env
    uv run python -m sim.run --no-llm        # deterministic, offline
    uv run python -m sim.run --record ui/static/fixtures/sample-run.json
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

from blindquote.core.events import Emitter
from blindquote.core.roles.coordinator import Coordinator
from sim.inprocess import ROOT, build_federation, provider_llm

DEFAULT_PROMPT = "Find me the best 30-year fixed for the $850k home - I plan to stay about 7 years."


def live_fetch(url: str) -> str | None:
    import urllib.request

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 BlindQuote"})
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed public URL
        return resp.read().decode("utf-8", "replace")


def run(prompt: str, use_llm: bool, sink, fetch_market: bool = True):
    load_dotenv(ROOT / ".env")
    grid = build_federation(use_llm=use_llm)
    model = os.environ.get("COORDINATOR_MODEL", "flwrlabs/endeavor-1.0")
    llm = provider_llm("flower", model, timeout=60) if use_llm else provider_llm(None, model)
    try:
        return Coordinator(grid, Emitter(sink), llm, fetch=live_fetch if fetch_market else None, mode="sim").run(prompt)
    finally:
        grid.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", default=DEFAULT_PROMPT)
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--record", type=Path, help="write the event stream as a replay fixture")
    args = ap.parse_args()
    events: list[dict] = []

    def sink(e: dict) -> None:
        events.append(e)
        if e["type"] == "response.output_text.delta":
            print(e["delta"], end="", flush=True)
        elif e["type"].startswith("bq."):
            detail = {k: v for k, v in e.items() if k not in {"type", "ts"}}
            print(f"\n[{e['ts']:6.2f}] {e['type']:<11} {json.dumps(detail, default=str)[:220]}", flush=True)

    run(args.prompt, not args.no_llm, sink)
    print()
    if args.record:
        args.record.parent.mkdir(parents=True, exist_ok=True)
        args.record.write_text(json.dumps({"events": events}, indent=1))
        print(f"recorded {len(events)} events -> {args.record}")


if __name__ == "__main__":
    main()
