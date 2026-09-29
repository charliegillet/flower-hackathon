#!/usr/bin/env bash
# List models the key can see: GET {base}/models
set -u
cd "$(dirname "$0")"
source ./_common.sh

if ! has_key; then
  echo "FLWR_MODEL_API_KEY is not set — see ../.env.example" >&2
  exit 1
fi

echo "GET $BASE_URL/models"
curl -sS --max-time 60 -H "$(auth_header)" "$BASE_URL/models" \
  | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit("non-JSON response (see raw output by piping curl manually)")
ids = [m.get("id") for m in d.get("data", [])]
print("\n".join(ids) if ids else json.dumps(d, indent=2)[:3000])'
