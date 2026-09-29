#!/usr/bin/env bash
# Map the Flower model API surface: hits /models, /responses, /chat/completions
# and prints HTTP status + a body snippet. Runs unauthenticated first, then
# with FLWR_MODEL_API_KEY if it is set. Safe to run with no key.
set -u
cd "$(dirname "$0")"
source ./_common.sh

echo "Endpoint : $RESPONSES_URL"
echo "Base     : $BASE_URL"
echo "Model    : $MODEL"
echo "Key      : $(mask "${FLWR_MODEL_API_KEY:-}")"
echo

req() { # req <label> <method> <url> [json-body]
  local label="$1" method="$2" url="$3" body="${4:-}"
  local args=(-sS -o /tmp/flwr_probe_body -w '%{http_code}' -X "$method" --max-time 30)
  has_key && args+=(-H "$(auth_header)")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  local code
  code=$(curl "${args[@]}" "$url" 2>/tmp/flwr_probe_err) || { echo "$label  CURL-FAIL  $(cat /tmp/flwr_probe_err)"; return; }
  printf '%-34s HTTP %s\n' "$label" "$code"
  head -c 400 /tmp/flwr_probe_body | tr '\n' ' '; echo; echo '---'
}

req "GET  /models"            GET  "$BASE_URL/models"
req "POST /responses"         POST "$RESPONSES_URL" "{\"model\":\"$MODEL\",\"input\":\"say hi\",\"max_output_tokens\":16}"
req "POST /chat/completions"  POST "$BASE_URL/chat/completions" "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}],\"max_tokens\":16}"
