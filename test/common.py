"""Shared config for the Flower API test scripts (stdlib only)."""
import os
import sys

ENDPOINT = os.getenv("FLWR_MODEL_API_ENDPOINT", "https://api.flower.ai/v1/responses")
BASE_URL = ENDPOINT[: -len("/responses")] if ENDPOINT.endswith("/responses") else ENDPOINT
KEY = os.getenv("FLWR_MODEL_API_KEY", "")
MODEL = os.getenv("MODEL", "openai/gpt-5.6-sol")


def die_no_key() -> None:
    if not KEY:
        sys.exit(
            "FLWR_MODEL_API_KEY is not set.\n"
            "Get a key at flower.ai -> Profile -> Settings -> API Keys, then:\n"
            "  export FLWR_MODEL_API_KEY=...\n"
            "Optional: export FLWR_MODEL_API_ENDPOINT=https://.../v1/responses\n"
            "          export MODEL=openai/gpt-5.6-sol"
        )
