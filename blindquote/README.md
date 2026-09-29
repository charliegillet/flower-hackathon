# BlindQuote

Shop every mortgage lender without becoming a lead. A coordinator AgentApp on the SuperLink runs a sealed-bid negotiation over `agent.grid`:
- a **borrower** SuperNode shares only bands;
- a **credit bureau** SuperNode signs a credit-score band;
- **bank** SuperNodes price from private rate sheets, then negotiate in round 2 against the best competing total cost.

A code-enforced guard blocks any request for raw data. Offers are ranked by total cost over the borrower's stay horizon, and Endeavor explains the result.

## Run

One FAB serves both roles:
- **On the SuperLink** it coordinates.
- **On a SuperNode** it answers as the role given in `--node-config`:

```bash
flower-supernode ... --node-config 'role="bank" name="Cardinal Bank" model="flwrlabs/endeavor-1.0" data_dir="/data" hmac_key_file="/secrets/bureau.key"'
```

Each node's `data_dir` holds its private file:
- borrower: `profile.json`
- bureau: `credit_files.json`
- bank: `rate_sheet.json`

Chat with it via `flwr chat` → `/load .` in a federation that contains the nodes.

Configuration (`run_config`): `coordinator-model` (default `flwrlabs/endeavor-1.0`).

Full setup, synthetic data generator, UI and deployment: https://github.com/charliegillet/flower-hackathon
