import { Vault } from "../vault/vault.js";

export async function listCredentialsCommand(options: { vault: string }): Promise<void> {
  const passphrase = process.env.CHECKOUT_PASSPHRASE;
  if (!passphrase) {
    console.error("Error: CHECKOUT_PASSPHRASE environment variable is required.");
    process.exit(1);
  }

  const vault = new Vault(options.vault);
  await vault.unlock(passphrase);

  const credentials = vault.listCredentials();
  if (credentials.length === 0) {
    console.log("No credentials stored.");
  } else {
    console.log(`\n  ${"Name".padEnd(30)} ${"Type".padEnd(20)} ${"Created"}`);
    console.log(`  ${"─".repeat(30)} ${"─".repeat(20)} ${"─".repeat(24)}`);
    for (const cred of credentials) {
      console.log(`  ${cred.name.padEnd(30)} ${cred.type.padEnd(20)} ${cred.created_at}`);
    }
    console.log(`\n  ${credentials.length} credential(s) total.\n`);
  }

  vault.close();
}
