import type Database from "better-sqlite3";

export function initAuditSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp       TEXT NOT NULL,
      event           TEXT NOT NULL,
      policy          TEXT,
      agent_id        TEXT,
      skill_id        TEXT,
      purpose         TEXT,
      token_id        TEXT,
      credential_name TEXT,
      scope           TEXT,
      context         TEXT,
      outcome         TEXT,
      approval        TEXT,
      details         TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_policy ON audit_log(policy);
  `);
}
