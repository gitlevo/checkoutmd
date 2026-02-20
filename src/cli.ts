#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { VERSION } from "./index.js";
import { initCommand } from "./commands/init.js";
import { serveCommand } from "./commands/serve.js";
import { addCredentialCommand } from "./commands/add-credential.js";
import { listCredentialsCommand } from "./commands/list-credentials.js";
import { auditCommand } from "./commands/audit.js";

const DEFAULT_VAULT = join(homedir(), ".checkout", "vault.db");
const DEFAULT_AUDIT = join(homedir(), ".checkout", "audit.db");

const program = new Command();

program
  .name("checkout-wallet")
  .description("checkout.md — the credential wallet for the open agent ecosystem")
  .version(VERSION);

program
  .command("init")
  .description("Initialize a new credential vault")
  .option("--vault <path>", "Path to the vault database file", DEFAULT_VAULT)
  .option("--policy <path>", "Path for the policy YAML file")
  .action(initCommand);

program
  .command("serve")
  .description("Start the MCP server (agents connect via STDIO)")
  .option("--vault <path>", "Path to the vault database file", DEFAULT_VAULT)
  .option("--policy <path>", "Path to the policy YAML file")
  .option("--audit <path>", "Path to the audit database file")
  .action(serveCommand);

program
  .command("add-credential")
  .description("Add a credential to the vault")
  .option("--vault <path>", "Path to the vault database file", DEFAULT_VAULT)
  .option("--name <name>", "Credential name")
  .option("--type <type>", "Credential type (api_key, payment_token, oauth_token, secret, certificate)")
  .option("--value <value>", "Credential value (will prompt if not provided)")
  .option("--metadata <json>", "JSON metadata object")
  .action(addCredentialCommand);

program
  .command("list-credentials")
  .description("List stored credentials (names and types only)")
  .option("--vault <path>", "Path to the vault database file", DEFAULT_VAULT)
  .action(listCredentialsCommand);

program
  .command("audit")
  .description("Query the audit log")
  .option("--audit <path>", "Path to the audit database file", DEFAULT_AUDIT)
  .option("--event <type>", "Filter by event type")
  .option("--agent <id>", "Filter by agent ID")
  .option("--policy <name>", "Filter by policy name")
  .option("--since <timestamp>", "Filter entries after this ISO timestamp")
  .option("--limit <n>", "Max number of entries to show", "50")
  .option("--json", "Output as JSON")
  .action(auditCommand);

program.parse();
