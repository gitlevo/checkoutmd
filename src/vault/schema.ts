import type Database from "better-sqlite3";

export function initVaultSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL UNIQUE,
      type           TEXT NOT NULL,
      encrypted_data BLOB NOT NULL,
      iv             BLOB NOT NULL,
      auth_tag       BLOB NOT NULL,
      metadata       TEXT NOT NULL DEFAULT '{}',
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
  `);
}
