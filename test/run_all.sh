#!/usr/bin/env bash
# Runs the whole test suite. Without FLWR_MODEL_API_KEY only the probe does
# anything useful; with a key it also lists models and makes real calls.
set -u
cd "$(dirname "$0")"
source ./_common.sh

echo "=== 1. endpoint probe ==="
./probe_endpoints.sh

if ! has_key; then
  echo
  echo "FLWR_MODEL_API_KEY not set — skipping authenticated tests."
  echo "export FLWR_MODEL_API_KEY=... then re-run."
  exit 0
fi

echo "=== 2. list models ==="
./list_models.sh || true

echo; echo "=== 3. responses API (non-streaming) ==="
python3 responses_api.py "Reply with exactly: Flower API is working." || true

echo; echo "=== 4. responses API (streaming) ==="
python3 responses_stream.py "Count from 1 to 5, one number per line." || true

echo; echo "=== 5. chat/completions compatibility ==="
python3 chat_completions.py "Reply with exactly: chat completions ok." || true
