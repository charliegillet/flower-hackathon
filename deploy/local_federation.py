"""Start/stop a local Flower federation for BlindQuote: 1 SuperLink + 6 SuperNodes.

    uv run python deploy/local_federation.py up      # background processes, logs in .flwr-local/
    uv run python deploy/local_federation.py status
    uv run python deploy/local_federation.py down

Every SuperNode gets its own FLWR_HOME, Runtime API port, --node-config (role,
name, data_dir, model) and upstream model provider (Flower or Nebius), exactly
like separate organisations would run them. Insecure: local development only.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".flwr-local"
PIDS = STATE / "pids.json"
FLOWER_ENDPOINT = "https://api.flower.ai/v1/responses"


def _bin(name: str) -> str:
    return str(Path(sys.executable).parent / name)


def _provider_env(provider: str | None, env: dict[str, str]) -> dict[str, str]:
    if provider in {"nebius-kimi", "nebius-minimax"}:
        key = env["NEBIUS_KIMI_API_KEY"] if provider == "nebius-kimi" else env["NEBIUS_MINIMAX_API_KEY"]
        return {"FLWR_MODEL_API_ENDPOINT": env["NEBIUS_MODEL_API_ENDPOINT"], "FLWR_MODEL_API_KEY": key}
    return {"FLWR_MODEL_API_ENDPOINT": FLOWER_ENDPOINT, "FLWR_MODEL_API_KEY": env.get("FLWR_MODEL_API_KEY", "")}


def _node_config(cfg: dict[str, str]) -> str:
    cfg = dict(cfg, data_dir=str(ROOT / cfg["data_dir"]))
    if cfg["role"] in {"bureau", "bank"}:  # only signer and verifiers hold the attestation key
        cfg["hmac_key_file"] = str(ROOT / "secrets" / "bureau.key")
    return " ".join(f"{k}={json.dumps(str(v))}" for k, v in cfg.items())


def ensure_connection() -> None:
    """Add the documented local-agent connection to ~/.flwr/config.toml if missing."""
    from flwr.cli.flower_config import read_superlink_connection

    try:
        read_superlink_connection("supergrid")  # creates the default config on first use
    except Exception:  # noqa: BLE001
        pass
    cfg = Path(os.environ.get("FLWR_HOME", Path.home() / ".flwr")) / "config.toml"
    cfg.parent.mkdir(parents=True, exist_ok=True)
    text = cfg.read_text() if cfg.exists() else ""
    if "[superlink.local-agent]" not in text:
        cfg.write_text(text + '\n[superlink.local-agent]\naddress = "127.0.0.1:8000"\ninsecure = true\n')
        print(f"added [superlink.local-agent] to {cfg}")


def up() -> None:
    if PIDS.exists():
        print("already running (run `down` first)")
        return
    env_file = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v}
    STATE.mkdir(exist_ok=True)
    (STATE / "logs").mkdir(exist_ok=True)
    ensure_connection()
    pids: dict[str, int] = {}

    base = {**os.environ, "PATH": f"{Path(sys.executable).parent}{os.pathsep}{os.environ['PATH']}"}
    link_env = {**base, **_provider_env("flower", env_file), "FLWR_HOME": str(STATE / "superlink")}
    log = open(STATE / "logs" / "superlink.log", "w")
    pids["superlink"] = subprocess.Popen(
        [_bin("flower-superlink"), "--insecure", "--database", str(STATE / "superlink.db")],
        cwd=ROOT / "blindquote", env=link_env, stdout=log, stderr=subprocess.STDOUT,
    ).pid
    time.sleep(4)

    topology = json.loads((ROOT / "deploy" / "topology.json").read_text())["nodes"]
    for i, spec in enumerate(topology):
        node_env = {**base, **_provider_env(spec.get("provider"), env_file), "FLWR_HOME": str(STATE / spec["key"])}
        log = open(STATE / "logs" / f"{spec['key']}.log", "w")
        pids[spec["key"]] = subprocess.Popen(
            [_bin("flower-supernode"), "--insecure", "--superlink", "127.0.0.1:9092",
             "--port", str(9110 + i), "--node-config", _node_config(spec["node_config"])],
            cwd=ROOT / "blindquote", env=node_env, stdout=log, stderr=subprocess.STDOUT,
        ).pid
    PIDS.write_text(json.dumps(pids, indent=2))
    print("started:", ", ".join(pids), f"\nlogs: {STATE / 'logs'}")


def down() -> None:
    if not PIDS.exists():
        print("not running")
        return
    for name, pid in json.loads(PIDS.read_text()).items():
        try:
            os.kill(pid, signal.SIGTERM)
            print("stopped", name)
        except ProcessLookupError:
            pass
    PIDS.unlink()


def status() -> None:
    if not PIDS.exists():
        print("not running")
        return
    for name, pid in json.loads(PIDS.read_text()).items():
        try:
            os.kill(pid, 0)
            state = "up"
        except ProcessLookupError:
            state = "DOWN"
        print(f"{name:10} pid={pid:<7} {state}")


if __name__ == "__main__":
    {"up": up, "down": down, "status": status}[sys.argv[1] if len(sys.argv) > 1 else "status"]()
