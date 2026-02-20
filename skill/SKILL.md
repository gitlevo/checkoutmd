---
name: checkout-wallet
description: >
  Secure credential wallet. When you need API keys, payment tokens, or secrets to
  complete a task, use checkout-wallet to request scoped, short-lived tokens. Never
  use raw credentials directly. Enforces spending limits and logs all access.
homepage: https://checkout.md
user-invocable: true
metadata: |
  {
    "openclaw": {
      "emoji": "🔐",
      "primaryEnv": "CHECKOUT_PASSPHRASE",
      "requires": {
        "bins": ["checkout-wallet"],
        "env": ["CHECKOUT_PASSPHRASE"]
      },
      "install": [
        {
          "id": "npm",
          "kind": "node",
          "package": "@checkoutmd/wallet",
          "bins": ["checkout-wallet"],
          "label": "Install checkout-wallet (npm)"
        }
      ],
      "homepage": "https://checkout.md"
    }
  }
---

# checkout-wallet

You have access to a credential wallet. This is the governance layer between you and real-world credentials (API keys, payment tokens, secrets). You do not have direct access to credentials — you request scoped, short-lived tokens through the wallet.

## Protocol

**Always follow this sequence:**

1. **Check what you can access** — Call `checkout_list_available_policies` with your agent ID before requesting any credential. This tells you which credentials you're allowed to use, what actions are permitted, and what budget limits apply.

2. **Request a credential** — Call `checkout_request_credential` with the credential name, your purpose, and the amount (if applicable). Be specific and honest about the purpose — it's logged.

3. **Handle the response:**
   - `granted` — You receive a short-lived token with the credential value. Use it immediately for the stated purpose only. The token expires in minutes.
   - `require_approval` — A human needs to approve this. Inform the user that their approval is needed and why. Do not retry automatically.
   - `denied` — You are not allowed this credential for this purpose. Do not attempt to work around the denial. Inform the user of the reason.

4. **Report usage** — After using a credential, call `checkout_report_usage` with the token ID, the actual amount spent (if applicable), and the outcome. This completes the audit trail.

## Tools

### checkout_list_available_policies
Check which credentials and actions are available to you.
```
agent_id: your agent identifier
skill_id: (optional) your current skill/task identifier
```

### checkout_request_credential
Request a scoped credential token.
```
credential_name: name of the credential you need
agent_id: your agent identifier
skill_id: (optional) current skill identifier
purpose: why you need this credential (be specific)
amount: (optional) transaction amount for budget checks
currency: (optional) currency code, e.g. "USD"
action: (optional) action type, e.g. "charge", "refund", "read"
```

### checkout_check_budget
Check remaining budget before making a request.
```
credential_name: name of the credential
policy_name: (optional) specific policy to check
```

### checkout_report_usage
Report that you used a credential token.
```
token_id: the token ID you received
amount: (optional) actual amount spent
currency: (optional) currency code
outcome: (optional) "success", "failed", etc.
details: (optional) additional context
```

## Rules

- **Never cache or store credential values.** Use them immediately and discard.
- **Never request credentials speculatively.** Only request what you need for an immediate, specific task.
- **Never request credentials you weren't asked to use.** If the user asks you to read a file, don't request a payment token.
- **Respect denials.** A denial is final for that request. Explain the denial to the user — do not retry with altered parameters to circumvent it.
- **Report all usage.** Always call `checkout_report_usage` after using a token, even if the operation failed.
- **Be transparent.** Tell the user when you're requesting a credential and why. Tell them the outcome.
- **Budget awareness.** Check your budget before large transactions. If you're close to a limit, inform the user before proceeding.

## Examples

### Charging a customer
```
User: "Charge the customer $25 for their order"

1. checkout_list_available_policies(agent_id: "main")
   → sees stripe-key with charge action allowed, $50/tx limit

2. checkout_request_credential(
     credential_name: "stripe-key",
     agent_id: "main",
     skill_id: "shopping",
     purpose: "charge customer for order #1234",
     amount: 25,
     currency: "USD",
     action: "charge"
   )
   → granted, token_id: "abc-123", credential_value: "sk_...", expires in 5min

3. Use the credential to call the Stripe API

4. checkout_report_usage(
     token_id: "abc-123",
     amount: 25,
     currency: "USD",
     outcome: "success"
   )
```

### Denied request
```
User: "Delete the production database"

1. checkout_request_credential(
     credential_name: "aws-key",
     agent_id: "main",
     purpose: "delete production database",
     action: "delete"
   )
   → denied: "Action 'delete' is not allowed by policy 'aws-readonly'."

2. Tell the user: "I don't have permission to delete resources with the AWS key.
   The policy only allows read actions."
```
