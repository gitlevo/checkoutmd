import Database from "better-sqlite3";
import { initAuditSchema } from "./schema.js";
import type { AuditEntry, AuditQuery } from "../types.js";

export class AuditLogger {
  private db: Database.Database;
  private insertStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    initAuditSchema(this.db);

    this.insertStmt = this.db.prepare(`
      INSERT INTO audit_log (timestamp, event, policy, agent_id, skill_id, purpose, token_id, credential_name, scope, context, outcome, approval, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Append an audit entry. This is INSERT-only — no UPDATE or DELETE.
   */
  log(entry: AuditEntry): number {
    const result = this.insertStmt.run(
      entry.timestamp || new Date().toISOString(),
      entry.event,
      entry.policy ?? null,
      entry.agent_id ?? null,
      entry.skill_id ?? null,
      entry.purpose ?? null,
      entry.token_id ?? null,
      entry.credential_name ?? null,
      entry.scope ? JSON.stringify(entry.scope) : null,
      entry.context ? JSON.stringify(entry.context) : null,
      entry.outcome ?? null,
      entry.approval ?? null,
      entry.details ?? null
    );
    return result.lastInsertRowid as number;
  }

  /**
   * Query audit entries with optional filters.
   */
  query(filters: AuditQuery = {}): AuditEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.event) {
      conditions.push("event = ?");
      params.push(filters.event);
    }
    if (filters.policy) {
      conditions.push("policy = ?");
      params.push(filters.policy);
    }
    if (filters.agent_id) {
      conditions.push("agent_id = ?");
      params.push(filters.agent_id);
    }
    if (filters.since) {
      conditions.push("timestamp >= ?");
      params.push(filters.since);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ? `LIMIT ${filters.limit}` : "";

    const sql = `SELECT * FROM audit_log ${where} ORDER BY id DESC ${limit}`;
    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      timestamp: string;
      event: string;
      policy: string | null;
      agent_id: string | null;
      skill_id: string | null;
      purpose: string | null;
      token_id: string | null;
      credential_name: string | null;
      scope: string | null;
      context: string | null;
      outcome: string | null;
      approval: string | null;
      details: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      event: row.event as AuditEntry["event"],
      policy: row.policy ?? undefined,
      agent_id: row.agent_id ?? undefined,
      skill_id: row.skill_id ?? undefined,
      purpose: row.purpose ?? undefined,
      token_id: row.token_id ?? undefined,
      credential_name: row.credential_name ?? undefined,
      scope: row.scope ? JSON.parse(row.scope) : undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      outcome: row.outcome ?? undefined,
      approval: row.approval ?? undefined,
      details: row.details ?? undefined,
    }));
  }

  /**
   * Get total spending for a credential in a given month.
   * Looks at credential_granted events with amount in details.
   */
  getMonthlySpending(credentialName: string, month?: string): number {
    const targetMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM
    const rows = this.db
      .prepare(
        `SELECT details FROM audit_log
         WHERE event = 'credential_used'
         AND credential_name = ?
         AND timestamp LIKE ?`
      )
      .all(credentialName, `${targetMonth}%`) as Array<{ details: string | null }>;

    let total = 0;
    for (const row of rows) {
      if (row.details) {
        try {
          const parsed = JSON.parse(row.details);
          if (typeof parsed.amount === "number") {
            total += parsed.amount;
          }
        } catch {
          // skip malformed details
        }
      }
    }
    return total;
  }

  close(): void {
    this.db.close();
  }
}
