import { AuditLogger } from "../audit/logger.js";
import type { AuditEvent } from "../types.js";

export function auditCommand(options: {
  audit: string;
  event?: string;
  agent?: string;
  policy?: string;
  since?: string;
  limit?: string;
  json?: boolean;
}): void {
  const logger = new AuditLogger(options.audit);

  const entries = logger.query({
    event: options.event as AuditEvent | undefined,
    agent_id: options.agent,
    policy: options.policy,
    since: options.since,
    limit: options.limit ? parseInt(options.limit, 10) : 50,
  });

  if (options.json) {
    console.log(JSON.stringify(entries, null, 2));
  } else if (entries.length === 0) {
    console.log("No audit entries found.");
  } else {
    console.log(`\n  ${"Timestamp".padEnd(24)} ${"Event".padEnd(22)} ${"Agent".padEnd(16)} ${"Credential".padEnd(20)} ${"Outcome"}`);
    console.log(`  ${"─".repeat(24)} ${"─".repeat(22)} ${"─".repeat(16)} ${"─".repeat(20)} ${"─".repeat(12)}`);
    for (const entry of entries) {
      console.log(
        `  ${(entry.timestamp || "").padEnd(24)} ` +
        `${(entry.event || "").padEnd(22)} ` +
        `${(entry.agent_id || "-").padEnd(16)} ` +
        `${(entry.credential_name || "-").padEnd(20)} ` +
        `${entry.outcome || "-"}`
      );
    }
    console.log(`\n  ${entries.length} entries shown.\n`);
  }

  logger.close();
}
