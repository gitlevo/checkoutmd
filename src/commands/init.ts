import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { stringify as yamlStringify } from "yaml";
import { Vault } from "../vault/vault.js";

const CHECKOUT_MD_CONTENT = `# checkout.md

You have access to a credential wallet. This is the governance layer between you and real-world credentials (API keys, payment tokens, secrets). You do not have direct access to credentials — you request scoped, short-lived tokens through the wallet.

## Protocol

**Always follow this sequence:**

1. **Check what you can access** — Call \`checkout_list_available_policies\` with your agent ID before requesting any credential. This tells you which credentials you're allowed to use, what actions are permitted, and what budget limits apply.

2. **Request a credential** — Call \`checkout_request_credential\` with the credential name, your purpose, and the amount (if applicable). Be specific and honest about the purpose — it's logged.

3. **Handle the response:**
   - \`granted\` — You receive a short-lived token with the credential value. Use it immediately for the stated purpose only. The token expires in minutes.
   - \`require_approval\` — A human needs to approve this. Inform the user that their approval is needed and why. Do not retry automatically.
   - \`denied\` — You are not allowed this credential for this purpose. Do not attempt to work around the denial. Inform the user of the reason.

4. **Report usage** — After using a credential, call \`checkout_report_usage\` with the token ID, the actual amount spent (if applicable), and the outcome. This completes the audit trail.

## Tools

### checkout_list_available_policies
Check which credentials and actions are available to you.
\`\`\`
agent_id: your agent identifier
skill_id: (optional) your current skill/task identifier
\`\`\`

### checkout_request_credential
Request a scoped credential token.
\`\`\`
credential_name: name of the credential you need
agent_id: your agent identifier
skill_id: (optional) current skill identifier
purpose: why you need this credential (be specific)
amount: (optional) transaction amount for budget checks
currency: (optional) currency code, e.g. "USD"
action: (optional) action type, e.g. "charge", "refund", "read"
\`\`\`

### checkout_check_budget
Check remaining budget before making a request.
\`\`\`
credential_name: name of the credential
policy_name: (optional) specific policy to check
\`\`\`

### checkout_report_usage
Report that you used a credential token.
\`\`\`
token_id: the token ID you received
amount: (optional) actual amount spent
currency: (optional) currency code
outcome: (optional) "success", "failed", etc.
details: (optional) additional context
\`\`\`

## Rules

- **Never cache or store credential values.** Use them immediately and discard.
- **Never request credentials speculatively.** Only request what you need for an immediate, specific task.
- **Never request credentials you weren't asked to use.** If the user asks you to read a file, don't request a payment token.
- **Respect denials.** A denial is final for that request. Explain the denial to the user — do not retry with altered parameters to circumvent it.
- **Report all usage.** Always call \`checkout_report_usage\` after using a token, even if the operation failed.
- **Be transparent.** Tell the user when you're requesting a credential and why. Tell them the outcome.
- **Budget awareness.** Check your budget before large transactions. If you're close to a limit, inform the user before proceeding.
`;

const DEFAULT_POLICY_YAML = `# checkout.policies.yaml — Credential access policies
# Each policy defines who can access a credential, what they can do, and spending limits.
#
# See https://checkout.md for full documentation.

version: "1"

policies:
  # Example: Stripe test key for a shopping agent
  # Uncomment and customize for your use case.
  #
  # - name: stripe-shopping
  #   description: "Shopping skill can charge up to $50/tx, $200/month"
  #   credential: stripe-key
  #   grant_to:
  #     agent_id: "*"              # or specific: ["shopping-agent", "order-agent"]
  #     skill_id: "shopping"       # only this skill can use it
  #   deny:
  #     - untrusted-agent          # explicitly block specific agents
  #   actions:
  #     - charge
  #     - refund
  #   budget:
  #     max_per_transaction: 50
  #     max_per_month: 200
  #     currency: USD
  #   approval_threshold: 25       # human approval needed above $25
  #   ttl: 300                     # token expires in 5 minutes
  #
  # Example: GitHub token — read-only, any agent
  #
  # - name: github-readonly
  #   description: "Read-only GitHub access for all agents"
  #   credential: github-token
  #   grant_to:
  #     agent_id: "*"
  #   actions:
  #     - read
  #   ttl: 600
  #
  # Example: Deploy key with CEL condition
  #
  # - name: deploy-staging
  #   description: "Deploy to staging only when purpose mentions staging"
  #   credential: deploy-key
  #   grant_to:
  #     agent_id: ["deploy-agent"]
  #   condition: 'purpose.contains("staging")'
  #   ttl: 120

  - name: example-policy
    description: "Example — replace with your real policies"
    credential: your-credential-name
    grant_to:
      agent_id: "*"
    budget:
      max_per_transaction: 10
      max_per_month: 100
    ttl: 300
`;

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    if (hidden) {
      process.stderr.write(question);
      let input = "";
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on("data", (char) => {
        const c = char.toString();
        if (c === "\n" || c === "\r") {
          process.stdin.setRawMode?.(false);
          process.stderr.write("\n");
          rl.close();
          resolve(input);
        } else if (c === "\u0003") {
          process.exit(1);
        } else if (c === "\u007f") {
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

export async function initCommand(options: { vault: string; policy?: string }): Promise<void> {
  const vaultPath = options.vault;
  const vaultDir = dirname(vaultPath);
  const policyPath = options.policy || join(vaultDir, "checkout.policies.yaml");
  const checkoutMdPath = join(vaultDir, "checkout.md");

  // Ensure the directory exists
  if (!existsSync(vaultDir)) {
    mkdirSync(vaultDir, { recursive: true });
  }

  if (existsSync(vaultPath)) {
    console.error(`Vault already exists at ${vaultPath}`);
    process.exit(1);
  }

  // Get passphrase from env var or prompt interactively
  let passphrase = process.env.CHECKOUT_PASSPHRASE;
  if (!passphrase) {
    passphrase = await prompt("Enter vault passphrase: ", true);
    if (!passphrase) {
      console.error("Passphrase cannot be empty.");
      process.exit(1);
    }
    const confirm = await prompt("Confirm passphrase: ", true);
    if (passphrase !== confirm) {
      console.error("Passphrases do not match.");
      process.exit(1);
    }
  }

  // Create vault
  const vault = new Vault(vaultPath);
  await vault.initialize(passphrase);
  vault.close();
  console.log(`  vault     ${vaultPath}`);

  // Create policy file
  if (!existsSync(policyPath)) {
    writeFileSync(policyPath, DEFAULT_POLICY_YAML);
    console.log(`  policies  ${policyPath}`);
  }

  // Create checkout.md agent instruction file
  if (!existsSync(checkoutMdPath)) {
    writeFileSync(checkoutMdPath, CHECKOUT_MD_CONTENT);
    console.log(`  checkout  ${checkoutMdPath}`);
  }

  console.log("\nDone. Next steps:\n");
  console.log(`  1. Edit ${policyPath}`);
  console.log(`  2. Add credentials:`);
  console.log(`     CHECKOUT_PASSPHRASE=... checkout-wallet add-credential --vault ${vaultPath} \\`);
  console.log(`       --name stripe-key --type api_key --value sk_test_...`);
  console.log(`  3. Add to your agent config:`);
  console.log(`     mcp:`);
  console.log(`       servers:`);
  console.log(`         checkout:`);
  console.log(`           command: checkout-wallet serve`);
  console.log(`           args: ["--vault", "${vaultPath}"]`);
}
