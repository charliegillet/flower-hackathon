# Shared helpers. Sourced by the test scripts — not meant to run directly.
#
# Env vars used (see ../.env.example):
#   FLWR_MODEL_API_KEY       Bearer key (flower.ai -> Profile -> Settings -> API Keys)
#   FLWR_MODEL_API_ENDPOINT  Optional full ".../v1/responses" URL.
#                            Default: https://api.flower.ai/v1/responses
#                            Nebius:  https://api.tokenfactory.tf-ca1.nebius.com/v1/responses
#   MODEL                    Model ID. Default: openai/gpt-5.6-sol
#                            Others: openai/gpt-5-nano, flwrlabs/endeavor-1.0,
#                            dedicated/flowerai/Kimi-K2.7-Code-1OUHWL (Nebius),
#                            dedicated/flowerai/MiniMax-M3-OOLI9o (Nebius)

RESPONSES_URL="${FLWR_MODEL_API_ENDPOINT:-https://api.flower.ai/v1/responses}"
# Base URL = endpoint with the /responses suffix stripped (for /models, /chat/completions)
BASE_URL="${RESPONSES_URL%/responses}"
MODEL="${MODEL:-openai/gpt-5.6-sol}"

has_key() { [ -n "${FLWR_MODEL_API_KEY:-}" ]; }

auth_header() {
  if has_key; then printf 'Authorization: Bearer %s' "$FLWR_MODEL_API_KEY"; fi
}

mask() {
  # print only last 4 chars of a secret
  local v="$1"
  if [ -z "$v" ]; then echo "(unset)"; else echo "…${v: -4}"; fi
}
