import { randomUUID } from "node:crypto";
import type { ScopedToken } from "./types.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class TokenStore {
  private tokens: Map<string, ScopedToken> = new Map();

  /**
   * Issue a new scoped token.
   */
  issue(params: {
    credential_name: string;
    credential_value: string;
    policy_name: string;
    agent_id: string;
    skill_id?: string;
    scope?: Record<string, unknown>;
    ttl?: number; // seconds
  }): ScopedToken {
    const now = Date.now();
    const ttlMs = (params.ttl ?? 300) * 1000;

    const token: ScopedToken = {
      token_id: randomUUID(),
      credential_name: params.credential_name,
      credential_value: params.credential_value,
      policy_name: params.policy_name,
      agent_id: params.agent_id,
      skill_id: params.skill_id,
      scope: params.scope ?? {},
      issued_at: now,
      expires_at: now + ttlMs,
      used: false,
    };

    this.tokens.set(token.token_id, token);
    return token;
  }

  /**
   * Get a token by ID. Returns null if expired or not found.
   */
  get(tokenId: string): ScopedToken | null {
    const token = this.tokens.get(tokenId);
    if (!token) return null;
    if (Date.now() >= token.expires_at) {
      this.tokens.delete(tokenId);
      return null;
    }
    return token;
  }

  /**
   * Mark a token as used.
   */
  markUsed(tokenId: string): boolean {
    const token = this.tokens.get(tokenId);
    if (!token) return false;
    token.used = true;
    return true;
  }

  /**
   * Remove all expired tokens.
   */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [id, token] of this.tokens) {
      if (now >= token.expires_at) {
        this.tokens.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Get the number of active (non-expired) tokens.
   */
  get size(): number {
    this.purgeExpired();
    return this.tokens.size;
  }
}
