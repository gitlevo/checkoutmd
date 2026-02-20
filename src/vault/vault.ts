import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { generateSalt, deriveKey, encrypt, decrypt } from "./crypto.js";
import { initVaultSchema } from "./schema.js";
import type { CredentialType, CredentialSummary, Credential, EncryptedPayload } from "../types.js";

export class Vault {
  private db: Database.Database;
  private key: Buffer | null = null;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    initVaultSchema(this.db);
  }

  /**
   * Initialize a new vault with a passphrase. Generates a salt and stores it.
   */
  async initialize(passphrase: string): Promise<void> {
    const existing = this.db.prepare("SELECT value FROM wallet_meta WHERE key = 'salt'").get() as
      | { value: string }
      | undefined;
    if (existing) {
      throw new Error("Vault is already initialized. Use unlock() instead.");
    }

    const salt = generateSalt();
    this.key = await deriveKey(passphrase, salt);

    const upsert = this.db.prepare(
      "INSERT OR REPLACE INTO wallet_meta (key, value) VALUES (?, ?)"
    );
    const tx = this.db.transaction(() => {
      upsert.run("salt", salt.toString("base64"));
      upsert.run("version", "1");
    });
    tx();
  }

  /**
   * Unlock an existing vault with a passphrase.
   */
  async unlock(passphrase: string): Promise<void> {
    const row = this.db.prepare("SELECT value FROM wallet_meta WHERE key = 'salt'").get() as
      | { value: string }
      | undefined;
    if (!row) {
      throw new Error("Vault is not initialized. Use initialize() first.");
    }

    const salt = Buffer.from(row.value, "base64");
    this.key = await deriveKey(passphrase, salt);
  }

  private ensureUnlocked(): Buffer {
    if (!this.key) {
      throw new Error("Vault is locked. Call initialize() or unlock() first.");
    }
    return this.key;
  }

  /**
   * Add a credential to the vault.
   */
  addCredential(
    name: string,
    type: CredentialType,
    value: string,
    metadata: Record<string, string> = {}
  ): string {
    const key = this.ensureUnlocked();
    const id = randomUUID();
    const now = new Date().toISOString();
    const { ciphertext, iv, authTag } = encrypt(value, key);

    this.db
      .prepare(
        `INSERT INTO credentials (id, name, type, encrypted_data, iv, auth_tag, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, type, ciphertext, iv, authTag, JSON.stringify(metadata), now, now);

    return id;
  }

  /**
   * Get a decrypted credential by name.
   */
  getCredential(name: string): Credential | null {
    const key = this.ensureUnlocked();
    const row = this.db
      .prepare("SELECT * FROM credentials WHERE name = ?")
      .get(name) as {
        id: string;
        name: string;
        type: CredentialType;
        encrypted_data: Buffer;
        iv: Buffer;
        auth_tag: Buffer;
        metadata: string;
        created_at: string;
        updated_at: string;
      } | undefined;

    if (!row) return null;

    const payload: EncryptedPayload = {
      ciphertext: row.encrypted_data,
      iv: row.iv,
      authTag: row.auth_tag,
    };

    const value = decrypt(payload, key);

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      value,
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * List all credentials (without decrypted values).
   */
  listCredentials(): CredentialSummary[] {
    this.ensureUnlocked();
    const rows = this.db
      .prepare("SELECT id, name, type, metadata, created_at, updated_at FROM credentials")
      .all() as Array<{
        id: string;
        name: string;
        type: CredentialType;
        metadata: string;
        created_at: string;
        updated_at: string;
      }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      metadata: JSON.parse(row.metadata),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  /**
   * Remove a credential by name.
   */
  removeCredential(name: string): boolean {
    this.ensureUnlocked();
    const result = this.db.prepare("DELETE FROM credentials WHERE name = ?").run(name);
    return result.changes > 0;
  }

  /**
   * Close the database connection and clear the key from memory.
   */
  close(): void {
    this.key = null;
    this.db.close();
  }
}
