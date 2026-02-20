import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import type { EncryptedPayload } from "../types.js";

const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AES_KEY_LENGTH = 32; // 256 bits
const ALGORITHM = "aes-256-gcm";

// HKDF info for deriving the AES key from Argon2 output
const HKDF_INFO = Buffer.from("checkout-wallet-v1");

export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/**
 * Derive an AES-256 key from a passphrase using Argon2id + HKDF.
 * Argon2id produces a 32-byte hash, then HKDF extracts a key suitable for AES.
 */
export async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  // Argon2id with recommended parameters
  const argon2Hash = await hash(passphrase, {
    salt,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
    algorithm: 2, // Argon2id
  });

  // Extract the raw hash bytes from the encoded string
  // Argon2 encoded format: $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>
  const parts = argon2Hash.split("$");
  const rawHash = Buffer.from(parts[parts.length - 1], "base64");

  // HKDF to derive the final AES key
  const aesKey = hkdfSync("sha256", rawHash, salt, HKDF_INFO, AES_KEY_LENGTH);
  return Buffer.from(aesKey);
}

/**
 * Encrypt plaintext with AES-256-GCM.
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv,
    authTag,
  };
}

/**
 * Decrypt AES-256-GCM encrypted data.
 */
export function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(payload.authTag);

  const decrypted = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
