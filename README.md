# checkout.md

The credential wallet for the open agent ecosystem.

AI agents need real-world credentials — API keys, payment tokens, OAuth tokens — to act on your behalf. Today, you paste raw secrets into config files with no scoping, no audit trail, and no spending limits. checkout.md fixes this.

**checkout.md** is an open-source, MCP-native credential wallet. It's the governance layer where humans define what their agents can and cannot do.

- **Local-first encryption** — AES-256-GCM vault on your machine. Credentials never leave unencrypted.
- **Policy-driven access** — YAML policies define which agents access which credentials, with budget limits and action constraints.
- **Scoped, short-lived tokens** — Agents never get raw credentials. They get tokens that expire in minutes.
- **Append-only audit trail** — Every request, grant, denial, and usage is logged.
- **MCP-native** — Standard MCP server. Works with OpenClaw, Claude Code, Cursor, and any MCP-compatible agent.

## Quick Start

```bash
# Install
npm install -g @checkoutmd/wallet

# Initialize (creates ~/.checkout/ with vault, policies, and checkout.md)
checkout-wallet init

# Add a credential
CHECKOUT_PASSPHRASE=your-passphrase checkout-wallet add-credential \
  --name stripe-key --type api_key --value sk_test_...

# Start the MCP server
CHECKOUT_PASSPHRASE=your-passphrase checkout-wallet serve
```

## Agent Configuration

### OpenClaw

```yaml
mcp:
  servers:
    checkout:
      command: checkout-wallet serve
      args: ["--vault", "~/.checkout/vault.db"]
```

### Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "checkout": {
      "command": "checkout-wallet",
      "args": ["serve", "--vault", "~/.checkout/vault.db"],
      "env": {
        "CHECKOUT_PASSPHRASE": "your-passphrase"
      }
    }
  }
}
```

## Policies

Policies live in `checkout.policies.yaml` (created by `init` next to your vault). Each policy controls access to one credential:

```yaml
version: "1"

policies:
  - name: stripe-shopping
    description: "Shopping skill can charge up to $50/tx, $200/month"
    credential: stripe-key
    grant_to:
      agent_id: "*"
      skill_id: "shopping"
    actions:
      - charge
      - refund
    budget:
      max_per_transaction: 50
      max_per_month: 200
      currency: USD
    approval_threshold: 25
    ttl: 300

  - name: github-readonly
    credential: github-token
    grant_to:
      agent_id: "*"
    actions:
      - read
```

### Policy fields

| Field | Description |
|---|---|
| `name` | Unique policy name |
| `credential` | Name of the credential in the vault |
| `grant_to.agent_id` | Agent(s) allowed access. `"*"` for all. |
| `grant_to.skill_id` | Skill(s) allowed access (optional) |
| `deny` | Agent IDs explicitly blocked |
| `actions` | Allowed action types |
| `budget.max_per_transaction` | Max amount per request |
| `budget.max_per_month` | Monthly spending cap |
| `approval_threshold` | Amount above which the agent should seek human approval |
| `condition` | CEL expression for custom logic |
| `ttl` | Token lifetime in seconds (default 300) |

## checkout.md (the file)

When you run `checkout-wallet init`, it creates a `checkout.md` file alongside your vault. This file is the agent instruction set — the equivalent of `heartbeat.md` or `soul.md` in OpenClaw. It tells agents:

- What tools are available
- The request/use/report protocol
- Rules: don't cache credentials, respect denials, report all usage

Place it where your agent framework reads instruction files, or it will be picked up automatically from `~/.checkout/checkout.md`.

## CLI Reference

```
checkout-wallet init                  Initialize vault + policies + checkout.md
checkout-wallet serve                 Start MCP server
checkout-wallet add-credential        Add a credential to the vault
checkout-wallet list-credentials      List stored credentials (names only)
checkout-wallet audit                 Query the audit log
```

All commands default to `~/.checkout/vault.db`. Override with `--vault <path>`.

The `serve` command requires `CHECKOUT_PASSPHRASE` as an environment variable (stdin is consumed by MCP transport).

## How It Works

```
  Agent                    checkout-wallet                  Vault
    |                           |                            |
    |-- request_credential ---->|                            |
    |                           |-- evaluate policy          |
    |                           |-- check budget             |
    |                           |-- check deny list          |
    |                           |                            |
    |                           |------- get credential ---->|
    |                           |<------ encrypted value ----|
    |                           |                            |
    |<-- scoped token ---------|                            |
    |   (expires in 5 min)     |-- log to audit             |
    |                           |                            |
    |-- report_usage ---------->|                            |
    |                           |-- log outcome              |
```

1. Agent calls `checkout_request_credential`
2. Policy engine evaluates: grant check, deny list, actions, budget, approval threshold, CEL condition
3. If allowed, vault decrypts the credential and issues a short-lived scoped token
4. Agent uses the token and calls `checkout_report_usage`
5. Everything is logged to the append-only audit database

## License

Apache 2.0 — open-source, free forever.
