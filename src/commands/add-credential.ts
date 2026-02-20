import { createInterface } from "node:readline";
import { Vault } from "../vault/vault.js";
import type { CredentialType } from "../types.js";

const VALID_TYPES: CredentialType[] = ["api_key", "payment_token", "oauth_token", "secret", "certificate"];

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

export async function addCredentialCommand(options: {
  vault: string;
  name?: string;
  type?: string;
  value?: string;
  metadata?: string;
}): Promise<void> {
  const passphrase = process.env.CHECKOUT_PASSPHRASE;
  if (!passphrase) {
    // Interactive mode — prompt for passphrase
    const pp = await prompt("Vault passphrase: ", true);
    if (!pp) {
      console.error("Passphrase cannot be empty.");
      process.exit(1);
    }
    process.env.CHECKOUT_PASSPHRASE = pp;
  }

  const vault = new Vault(options.vault);
  await vault.unlock(process.env.CHECKOUT_PASSPHRASE!);

  const name = options.name || (await prompt("Credential name: "));
  if (!name) {
    console.error("Name is required.");
    vault.close();
    process.exit(1);
  }

  const typeStr = options.type || (await prompt(`Type (${VALID_TYPES.join(", ")}): `));
  if (!VALID_TYPES.includes(typeStr as CredentialType)) {
    console.error(`Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
    vault.close();
    process.exit(1);
  }

  const value = options.value || (await prompt("Credential value: ", true));
  if (!value) {
    console.error("Value is required.");
    vault.close();
    process.exit(1);
  }

  let metadata: Record<string, string> = {};
  if (options.metadata) {
    try {
      metadata = JSON.parse(options.metadata);
    } catch {
      console.error("Invalid metadata JSON.");
      vault.close();
      process.exit(1);
    }
  }

  const id = vault.addCredential(name, typeStr as CredentialType, value, metadata);
  console.log(`Credential '${name}' added (id: ${id})`);

  vault.close();
}
