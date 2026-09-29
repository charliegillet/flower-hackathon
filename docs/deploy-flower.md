# Deploying the Flower integration (flower.zfloo.com)

The live site already runs the Node backend (`flower-finance-backend`, port 4000), the Vite build behind
nginx, and MongoDB. The Flower integration adds two services on the same host:

| Service | What | Listens |
|---|---|---|
| `flower-bq-federation` | Local Flower SuperLink + 8 SuperNodes (bureau, borrower, 6 banks), each with its own model provider | 127.0.0.1 only: :8000 (Control/Runtime), :9092 (Fleet, `--fleet-api-address`), :9110-9118 (SuperNodes) |
| `flower-bq-bridge` | Starts Flower runs from sealed bands and streams events | 127.0.0.1:8765 |

Both services bind to loopback only. The SuperLink Fleet API defaults to 0.0.0.0:9092 and the launcher runs it
`--insecure`, so it is pinned to `127.0.0.1:9092`; anyone who could reach it could register a SuperNode as
bureau/bank. Do not change these addresses, and keep ports 8000, 8765, 9092 and 9110-9118 closed in the firewall
or cloud security group (only 80/443 and SSH should be reachable; verify with `ss -ltnp | grep -E ':(8000|9092|91[0-9]{2}|8765)'`,
every line must show 127.0.0.1). The browser calls `/api/flower/*` on the Node backend (JWT-protected),
which relays to the bridge. nginx needs no change; the backend sets `X-Accel-Buffering: no` for the stream.

## Steps (on the server, in the repo checkout)

```bash
git fetch && git checkout <branch-or-main> && git pull
curl -LsSf https://astral.sh/uv/install.sh | sh          # if uv is missing
uv sync                                                   # Python 3.12 + flwr 1.39.0
cp -n .env.example .env                                   # then fill FLWR_MODEL_API_KEY and the Nebius keys
uv run python scripts/gen_nodes.py                        # node data + secrets/bureau.key
uv run pytest -q                                          # offline sanity check

# systemd: the units run as an unprivileged `flower` user (edit /srv/flower-finance and User/Group if needed)
sudo useradd --system --create-home --shell /usr/sbin/nologin flower
sudo chown -R flower:flower /srv/flower-finance           # the federation writes .flwr-local/ and ~flower/.flwr
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
tail -n 30 .flwr-local/logs/superlink.log      # per-process logs are appended across restarts
```

In the app: New application, "Fill with sample data", seal, approve. The Banks tab shows "Live on Flower · 8 SuperNodes".
If the bridge is down, the app still works and says "Simulated in your browser (Flower bridge offline)".

## SuperGrid instead of the local federation

Set `BQ_MODE=supergrid` and `BQ_FEDERATION=@<account>/<federation>` for the bridge, log in once as the `flower` service
user (`uvx --from flwr==1.39.0 flwr login supergrid`), and run the six bank + bureau SuperNodes from
`deploy/compose.supergrid.yaml` (see `uv run python deploy/gen_supergrid.py`).
