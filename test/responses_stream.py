#!/usr/bin/env python3
"""Streaming call to the Flower model API — parses SSE events, prints text
deltas as they arrive and a tally of every event type seen. This mirrors what
an AgentApp does with client.responses.create(..., stream=True).

Usage: python3 responses_stream.py ["prompt"]
"""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ENDPOINT, KEY, MODEL, die_no_key


def main() -> int:
    prompt = " ".join(sys.argv[1:]) or \
        "Explain what the Flower API is in two sentences."
    die_no_key()

    body = {"model": MODEL, "input": prompt, "stream": True}
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {KEY}",
            "Accept": "text/event-stream",
        },
        method="POST",
    )
    print(f"POST {ENDPOINT}  (stream)\nmodel={MODEL}\ninput={prompt!r}\n")
    try:
        res = urllib.request.urlopen(req, timeout=180)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}\n{e.read().decode()[:3000]}")
        return 1

    counts: Counter = Counter()
    text = []
    print("--- stream ---")
    for raw in res:
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            continue
        etype = event.get("type", "?")
        counts[etype] += 1
        if etype == "response.output_text.delta":
            delta = event.get("delta", "")
            text.append(delta)
            print(delta, end="", flush=True)
        elif etype == "response.completed":
            usage = (event.get("response") or {}).get("usage")
            if usage:
                print(f"\n\nusage: {json.dumps(usage)}")
        elif etype in ("error", "response.failed"):
            print(f"\n\nERROR EVENT: {json.dumps(event)[:1000]}")

    print("\n\n--- event tally ---")
    for etype, n in counts.most_common():
        print(f"{n:4d}  {etype}")
    print(f"\nchars of text received: {sum(len(t) for t in text)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
