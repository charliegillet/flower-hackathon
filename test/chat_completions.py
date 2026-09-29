#!/usr/bin/env python3
"""Check whether the Flower endpoint also speaks the /chat/completions shape —
this is what the backend uses (backend/src/agents/llm.js). If it works, the
backend can point LLM_BASE_URL at Flower directly.

Usage: python3 chat_completions.py ["prompt"]
"""
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import BASE_URL, KEY, MODEL, die_no_key


def main() -> int:
    prompt = " ".join(sys.argv[1:]) or "Reply with exactly: chat completions ok."
    die_no_key()

    url = f"{BASE_URL}/chat/completions"
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 100,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {KEY}",
        },
        method="POST",
    )
    print(f"POST {url}\nmodel={MODEL}\n")
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            payload = json.loads(res.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}\n{e.read().decode()[:3000]}")
        print("\n=> /chat/completions is NOT supported here; use /responses "
              "(see responses_api.py).")
        return 1

    print("--- reply ---")
    print(payload["choices"][0]["message"]["content"])
    print("\n--- meta ---")
    for k in ("id", "model", "usage"):
        if k in payload:
            print(f"{k}: {json.dumps(payload[k])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
