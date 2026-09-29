"""BlindQuote UI server.

    uv run uvicorn ui.server:app --port 8765        (then open http://127.0.0.1:8765)

Modes:
- ``sim``       in-process federation (same role code), real models from .env
- ``local``     a real Flower run on a local SuperLink (connection ``local-agent``)
- ``supergrid`` a real Flower run on SuperGrid (federation from ``BQ_FEDERATION``)

For Flower modes the server does what ``flwr chat`` does: it builds the local
AgentApp, starts a run with the prompt, and relays the run-event stream.
"""

from __future__ import annotations

import json
import os
import queue
import socket
import threading
import uuid
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent / "static"
APP_DIR = ROOT / "blindquote"
load_dotenv(ROOT / ".env")

app = FastAPI(title="BlindQuote")


@app.middleware("http")
async def no_cache(request, call_next):
    """Always serve fresh UI assets (edits show up on reload during the demo)."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-cache"
    return response
_runs: dict[str, queue.Queue] = {}
FORWARD_PREFIXES = ("bq.", "response.output_text.delta", "response.completed")


class RunRequest(BaseModel):
    mode: str
    prompt: str


def _port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.3):
            return True
    except OSError:
        return False


def _connection_configured(name: str) -> bool:
    try:
        from flwr.cli.flower_config import read_superlink_connection

        read_superlink_connection(name)
        return True
    except Exception:  # noqa: BLE001
        return False


@app.get("/api/status")
def status() -> dict[str, Any]:
    return {
        "modes": {
            "sim": True,
            # local SuperLink Control API listens on 127.0.0.1:8000 (so the UI uses 8765)
            "local": _connection_configured("local-agent") and _port_open("127.0.0.1", 8000),
            "supergrid": _connection_configured("supergrid") and bool(os.environ.get("BQ_FEDERATION")),
        },
        "models": {
            "coordinator": os.environ.get("COORDINATOR_MODEL", "flwrlabs/endeavor-1.0"),
            "llm_keys": {
                "flower": bool(os.environ.get("FLWR_MODEL_API_KEY")),
                "nebius_kimi": bool(os.environ.get("NEBIUS_KIMI_API_KEY")),
                "nebius_minimax": bool(os.environ.get("NEBIUS_MINIMAX_API_KEY")),
            },
        },
        "federation": os.environ.get("BQ_FEDERATION"),
    }


def _run_sim(prompt: str, q: queue.Queue) -> None:
    from sim.run import run

    run(prompt, use_llm=True, sink=q.put)


def _run_flower(prompt: str, connection: str, federation: str | None, q: queue.Queue) -> None:
    from flwr.cli.chat.chat_app import parse_task_event, start_chat_run
    from flwr.cli.chat.chat_local_agent import build_local_agent
    from flwr.cli.flower_config import read_superlink_connection
    from flwr.cli.utils import init_http_client_from_connection
    from flwr.proto.control_pb2 import StreamRunEventsRequest  # pylint: disable=no-name-in-module

    local_agent = build_local_agent(APP_DIR)
    conn = read_superlink_connection(connection)
    stub = init_http_client_from_connection(conn)
    try:
        run_id, _ = start_chat_run(
            stub, prompt, federation or conn.federation, None,
            local_agent.app_spec, local_agent.fab_hash, local_agent.fab_content,
        )
        q.put({"type": "bq.flower_run", "ts": 0, "run_id": run_id, "connection": connection})
        for res in stub.StreamRunEvents(StreamRunEventsRequest(run_id=run_id)):
            event_type, payload = parse_task_event(res.task_event)
            if event_type in {"error", "response.failed"}:
                q.put({"type": "bq.error", "ts": payload.get("ts", 0), "message": json.dumps(payload)[:400]})
                return
            if event_type.startswith(FORWARD_PREFIXES):
                payload.setdefault("type", event_type)
                q.put(payload)
                if event_type in {"bq.done", "bq.error"}:
                    return
    finally:
        stub.close()


def _worker(mode: str, prompt: str, q: queue.Queue) -> None:
    try:
        if mode == "sim":
            _run_sim(prompt, q)
        elif mode == "local":
            _run_flower(prompt, "local-agent", None, q)
        elif mode == "supergrid":
            _run_flower(prompt, "supergrid", os.environ.get("BQ_FEDERATION"), q)
        else:
            raise ValueError(f"unknown mode {mode!r}")
    except Exception as exc:  # noqa: BLE001 - surface every failure to the UI
        q.put({"type": "bq.error", "ts": 0, "message": f"{type(exc).__name__}: {exc}"[:500]})
    finally:
        q.put(None)


@app.post("/api/runs")
def create_run(req: RunRequest) -> dict[str, str]:
    if req.mode not in {"sim", "local", "supergrid"}:
        raise HTTPException(400, f"unknown mode {req.mode!r}")
    run_id = uuid.uuid4().hex[:12]
    q: queue.Queue = queue.Queue()
    _runs[run_id] = q
    threading.Thread(target=_worker, args=(req.mode, req.prompt, q), daemon=True).start()
    return {"run_id": run_id}


@app.get("/api/runs/{run_id}/events")
def run_events(run_id: str) -> StreamingResponse:
    q = _runs.get(run_id)
    if q is None:
        raise HTTPException(404, "unknown run")

    def stream() -> Iterator[str]:
        while True:
            try:
                event = q.get(timeout=15)
            except queue.Empty:
                yield ": keep-alive\n\n"
                continue
            if event is None:
                _runs.pop(run_id, None)
                return
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


app.mount("/", StaticFiles(directory=STATIC), name="static")
