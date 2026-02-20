import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { generateSalt, deriveKey, encrypt, decrypt } from "../src/vault/crypto.js";
import { Vault } from "../src/vault/vault.js";

describe("crypto", () => {
  it("generates a 32-byte salt", () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Buffer);
    expect(salt.length).toBe(32);
  });

  it("derives a 32-byte key", async () => {
    const salt = generateSalt();
    const key = await deriveKey("test-passphrase", salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("derives different keys for different passphrases", async () => {
    const salt = generateSalt();
    const key1 = await deriveKey("passphrase-1", salt);
    const key2 = await deriveKey("passphrase-2", salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it("derives different keys for different salts", async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = await deriveKey("same-passphrase", salt1);
    const key2 = await deriveKey("same-passphrase", salt2);
    expect(key1.equals(key2)).toBe(false);
  });

  it("encrypts and decrypts roundtrip", async () => {
    const salt = generateSalt();
    const key = await deriveKey("test-passphrase", salt);
    const plaintext = "xoxb-fake-credential-for-testing-only";

    const payload = encrypt(plaintext, key);
    expect(payload.ciphertext).toBeInstanceOf(Buffer);
    expect(payload.iv).toBeInstanceOf(Buffer);
    expect(payload.iv.length).toBe(12);
    expect(payload.authTag).toBeInstanceOf(Buffer);
    expect(payload.authTag.length).toBe(16);

    const decrypted = decrypt(payload, key);
    expect(decrypted).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", async () => {
    const salt = generateSalt();
    const key1 = await deriveKey("correct-passphrase", salt);
    const key2 = await deriveKey("wrong-passphrase", salt);

    const payload = encrypt("secret", key1);
    expect(() => decrypt(payload, key2)).toThrow();
  });
});

describe("Vault", () => {
  const dbPaths: string[] = [];

  function tmpDb(): string {
    const p = join(tmpdir(), `vault-test-${randomUUID()}.db`);
    dbPaths.push(p);
    return p;
  }

  afterEach(() => {
    for (const p of dbPaths) {
      try { unlinkSync(p); } catch {}
      try { unlinkSync(p + "-wal"); } catch {}
      try { unlinkSync(p + "-shm"); } catch {}
    }
    dbPaths.length = 0;
  });

  it("initializes and unlocks", async () => {
    const vault = new Vault(tmpDb());
    await vault.initialize("test-pass");
    vault.close();

    const vault2 = new Vault(dbPaths[0]);
    await vault2.unlock("test-pass");
    vault2.close();
  });

  it("throws if initialized twice", async () => {
    const vault = new Vault(tmpDb());
    await vault.initialize("test-pass");
    await expect(vault.initialize("test-pass")).rejects.toThrow("already initialized");
    vault.close();
  });

  it("throws if unlock on uninitialized vault", async () => {
    const vault = new Vault(tmpDb());
    await expect(vault.unlock("test-pass")).rejects.toThrow("not initialized");
    vault.close();
  });

  it("CRUD credentials", async () => {
    const vault = new Vault(tmpDb());
    await vault.initialize("test-pass");

    // Add
    const id = vault.addCredential("stripe-key", "api_key", "test-credential-123", { env: "test" });
    expect(id).toBeTruthy();

    // Get
    const cred = vault.getCredential("stripe-key");
    expect(cred).not.toBeNull();
    expect(cred!.name).toBe("stripe-key");
    expect(cred!.value).toBe("test-credential-123");
    expect(cred!.type).toBe("api_key");
    expect(cred!.metadata).toEqual({ env: "test" });

    // List
    const list = vault.listCredentials();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("stripe-key");
    expect((list[0] as any).value).toBeUndefined();

    // Remove
    const removed = vault.removeCredential("stripe-key");
    expect(removed).toBe(true);
    expect(vault.getCredential("stripe-key")).toBeNull();

    // Remove nonexistent
    expect(vault.removeCredential("nope")).toBe(false);

    vault.close();
  });

  it("getCredential returns null for missing name", async () => {
    const vault = new Vault(tmpDb());
    await vault.initialize("test-pass");
    expect(vault.getCredential("nonexistent")).toBeNull();
    vault.close();
  });

  it("throws when vault is locked", () => {
    const vault = new Vault(tmpDb());
    expect(() => vault.addCredential("x", "api_key", "y")).toThrow("locked");
    vault.close();
  });
});
