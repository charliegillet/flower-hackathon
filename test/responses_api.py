#!/usr/bin/env python3
"""Non-streaming call to the Flower model API (Open Responses shape).

Reads FLWR_MODEL_API_KEY / FLWR_MODEL_API_ENDPOINT / MODEL from the env.
Usage: python3 responses_api.py ["prompt"] [--raw]
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ENDPOINT, KEY, MODEL, die_no_key


def extract_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    parts = []
    for item in payload.get("output") or []:
        for content in item.get("content") or []:
            if content.get("type") in ("output_text", "text"):
                parts.append(content.get("text", ""))
    return "".join(parts)


def main() -> int:
    raw = "--raw" in sys.argv
    prompt = " ".join(a for a in sys.argv[1:] if a != "--raw") or \
        "Reply with exactly: Flower API is working."
    die_no_key()

    body = {"model": MODEL, "input": prompt}
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {KEY}",
        },
        method="POST",
    )
    print(f"POST {ENDPOINT}\nmodel={MODEL}\ninput={prompt!r}\n")
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            payload = json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}\n{e.read().decode()[:3000]}")
        return 1

    if raw:
        print(json.dumps(payload, indent=2))
    else:
        print("--- output text ---")
        print(extract_text(payload) or "(no text found)")
        print("\n--- meta ---")
        for k in ("id", "status", "model", "usage"):
            if k in payload:
                print(f"{k}: {json.dumps(payload[k])}")
        print("\n(re-run with --raw for the full payload)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
