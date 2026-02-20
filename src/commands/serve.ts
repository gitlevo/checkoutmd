import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { startServer } from "../server.js";

export async function serveCommand(options: {
  vault: string;
  policy?: string;
  audit?: string;
}): Promise<void> {
  const passphrase = process.env.CHECKOUT_PASSPHRASE;
  if (!passphrase) {
    console.error(
      "Error: CHECKOUT_PASSPHRASE environment variable is required.\n" +
      "stdin is consumed by MCP transport, so the passphrase must be set via env var.\n\n" +
      "  CHECKOUT_PASSPHRASE=your-passphrase checkout-wallet serve --vault ~/.checkout/vault.db"
    );
    process.exit(1);
  }

  if (!existsSync(options.vault)) {
    console.error(`Vault not found at ${options.vault}. Run 'checkout-wallet init' first.`);
    process.exit(1);
  }

  // Default policy and audit paths relative to vault directory
  const vaultDir = dirname(options.vault);
  const policyPath = options.policy || join(vaultDir, "checkout.policies.yaml");
  const auditPath = options.audit || join(vaultDir, "audit.db");

  if (!existsSync(policyPath)) {
    console.error(`Policy file not found at ${policyPath}. Run 'checkout-wallet init' first.`);
    process.exit(1);
  }

  await startServer({
    vaultPath: options.vault,
    policyPath,
    auditPath,
    passphrase,
  });
}
