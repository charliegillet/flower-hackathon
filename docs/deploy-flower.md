# Deploying the Flower integration (flower.zfloo.com)

The live site already runs the Node backend (`flower-finance-backend`, port 4000), the Vite build behind
nginx, and MongoDB. The Flower integration adds two services on the same host:

| Service | What | Listens |
|---|---|---|
| `flower-bq-federation` | Local Flower SuperLink + 8 SuperNodes (bureau, borrower, 6 banks), each with its own model provider | 127.0.0.1:8000 (Control), :9091-9093, :9110-9118 |
| `flower-bq-bridge` | Starts Flower runs from sealed bands and streams events | 127.0.0.1:8765 |

Nothing new is exposed publicly: the browser calls `/api/flower/*` on the Node backend (JWT-protected),
which relays to the bridge. nginx needs no change; the backend sets `X-Accel-Buffering: no` for the stream.

## Steps (on the server, in the repo checkout)

```bash
git fetch && git checkout <branch-or-main> && git pull
curl -LsSf https://astral.sh/uv/install.sh | sh          # if uv is missing
uv sync                                                   # Python 3.12 + flwr 1.39.0
cp -n .env.example .env                                   # then fill FLWR_MODEL_API_KEY and the Nebius keys
uv run python scripts/gen_nodes.py                        # node data + secrets/bureau.key
uv run pytest -q                                          # offline sanity check

# systemd (edit /srv/flower-finance to the checkout path first)
sudo cp deploy/systemd/flower-bq-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now flower-bq-federation flower-bq-bridge

# backend: point it at the bridge, then restart
echo 'FLOWER_BRIDGE_URL=http://127.0.0.1:8765' >> backend/.env
sudo systemctl restart flower-finance-backend

# frontend
cd frontend && npm ci && npm run build && sudo cp -r dist/* /var/www/flower-finance/
```

## Check

```bash
curl -s 127.0.0.1:8765/api/status          # "local": true once the federation is up
journalctl -u flower-bq-federation -n 50
```

In the app: New application, "Fill with sample data", seal, approve. The Banks tab shows "Live on Flower · 8 SuperNodes".
If the bridge is down, the app still works and says "Simulated in your browser (Flower bridge offline)".

## SuperGrid instead of the local federation

Set `BQ_MODE=supergrid` and `BQ_FEDERATION=@<account>/<federation>` for the bridge, log in once as the service
user (`uvx --from flwr==1.39.0 flwr login supergrid`), and run the six bank + bureau SuperNodes from
`deploy/compose.supergrid.yaml` (see `uv run python deploy/gen_supergrid.py`).
