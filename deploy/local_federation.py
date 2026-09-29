"""Start/stop a local Flower federation for BlindQuote: 1 SuperLink + 6 SuperNodes.

    uv run python deploy/local_federation.py up      # background processes, logs in .flwr-local/
    uv run python deploy/local_federation.py status
    uv run python deploy/local_federation.py down
    uv run python deploy/local_federation.py run     # foreground (systemd): supervises, stops all on SIGTERM

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


def _required_env(provider: str | None) -> list[str]:
    if provider == "nebius-kimi":
        return ["NEBIUS_MODEL_API_ENDPOINT", "NEBIUS_KIMI_API_KEY"]
    if provider == "nebius-minimax":
        return ["NEBIUS_MODEL_API_ENDPOINT", "NEBIUS_MINIMAX_API_KEY"]
    return []


def _check_env(topology: list[dict], env: dict[str, str]) -> None:
    """Fail before spawning anything if a node's provider variables are missing from .env."""
    missing = sorted({k for spec in topology for k in _required_env(spec.get("provider")) if not env.get(k)})
    if missing:
        raise SystemExit(f"missing in .env (needed by the node providers): {', '.join(missing)}")


def _minimal_env(extra: dict[str, str]) -> dict[str, str]:
    """A node sees PATH/HOME/locale plus its own variables, never the launcher's other secrets."""
    keep = {k: os.environ[k] for k in ("HOME", "LANG", "LC_ALL") if k in os.environ}
    path = f"{Path(sys.executable).parent}{os.pathsep}{os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin')}"
    return {**keep, "PATH": path, **extra}


def _spawn(name: str, cmd: list[str], env: dict[str, str], pids: dict[str, int]) -> None:
    with open(STATE / "logs" / f"{name}.log", "a") as log:
        log.write(f"\n=== {time.strftime('%Y-%m-%dT%H:%M:%S%z')} starting {name} ===\n")
        log.flush()
        pids[name] = subprocess.Popen(
            cmd, cwd=ROOT / "blindquote", env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
        ).pid
    PIDS.write_text(json.dumps(pids, indent=2))  # incremental, so down() can always clean up


def up(foreground: bool = False) -> None:
    if PIDS.exists() and not foreground:
        print("already running (run `down` first)")
        return
    env_file = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v}
    topology = json.loads((ROOT / "deploy" / "topology.json").read_text())["nodes"]
    _check_env(topology, env_file)
    STATE.mkdir(exist_ok=True)
    (STATE / "logs").mkdir(exist_ok=True)
    ensure_connection()
    pids: dict[str, int] = {}

    try:
        # Fleet API bound to loopback: the default is 0.0.0.0 and this launcher runs --insecure.
        _spawn("superlink", [
            _bin("flower-superlink"), "--insecure", "--database", str(STATE / "superlink.db"),
            "--fleet-api-address", "127.0.0.1:9092", "--host", "127.0.0.1",
        ], _minimal_env({**_provider_env("flower", env_file), "FLWR_HOME": str(STATE / "superlink")}), pids)
        time.sleep(4)
        for i, spec in enumerate(topology):
            _spawn(spec["key"], [
                _bin("flower-supernode"), "--insecure", "--superlink", "127.0.0.1:9092",
                "--host", "127.0.0.1", "--port", str(9110 + i), "--node-config", _node_config(spec["node_config"]),
            ], _minimal_env({**_provider_env(spec.get("provider"), env_file), "FLWR_HOME": str(STATE / spec["key"])}), pids)
    except BaseException:
        down()
        raise
    print("started:", ", ".join(pids), f"\nlogs: {STATE / 'logs'}", flush=True)
    if foreground:
        _supervise(pids)


def _supervise(pids: dict[str, int]) -> None:
    """Stay in the foreground (for systemd): stop every process on SIGTERM, exit if one dies."""
    stopping = False

    def stop(*_: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while not stopping:
        time.sleep(2)
        dead = []
        for name, pid in pids.items():
            try:
                os.kill(pid, 0)
                if os.waitpid(pid, os.WNOHANG)[0] == pid:
                    dead.append(name)
            except (ProcessLookupError, ChildProcessError):
                dead.append(name)
        if dead:
            print("exited:", ", ".join(dead), "- stopping the federation", flush=True)
            break
    down()
    if not stopping:
        sys.exit(1)  # let systemd restart the whole federation


def down() -> None:
    if not PIDS.exists():
        print("not running")
        return
    pids = json.loads(PIDS.read_text())
    # Each process leads its own group, so its SuperExec/task children stop with it.
    for name, pid in pids.items():
        try:
            os.killpg(pid, signal.SIGTERM)
            print("stopped", name)
        except ProcessLookupError:
            pass
    deadline = time.time() + 10
    while time.time() < deadline and any(_alive(pid) for pid in pids.values()):
        time.sleep(0.5)
    for name, pid in pids.items():  # some SuperNodes ignore SIGTERM mid-task
        if _alive(pid):
            try:
                os.killpg(pid, signal.SIGKILL)
                print("killed", name)
            except ProcessLookupError:
                pass
    PIDS.unlink()


def _alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    try:
        return os.waitpid(pid, os.WNOHANG)[0] != pid  # reap if it is our exited child
    except ChildProcessError:
        return True


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
    {"up": up, "run": lambda: up(foreground=True), "down": down, "status": status}[
        sys.argv[1] if len(sys.argv) > 1 else "status"]()
