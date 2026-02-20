import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { stringify as yamlStringify } from "yaml";
import { Vault } from "../src/vault/vault.js";
import { PolicyLoader } from "../src/policy/loader.js";
import { PolicyEngine } from "../src/policy/engine.js";
import { AuditLogger } from "../src/audit/logger.js";
import { TokenStore } from "../src/token-store.js";

describe("Integration: full credential request flow", () => {
  const id = randomUUID();
  const vaultPath = join(tmpdir(), `int-vault-${id}.db`);
  const auditPath = join(tmpdir(), `int-audit-${id}.db`);
  const policyPath = join(tmpdir(), `int-policy-${id}.yaml`);
  const passphrase = "integration-test-pass";

  let vault: Vault;
  let auditLogger: AuditLogger;
  let policyLoader: PolicyLoader;
  let policyEngine: PolicyEngine;
  let tokenStore: TokenStore;

  beforeAll(async () => {
    // Write policy file
    const policyData = {
      version: "1",
      policies: [
        {
          name: "test-stripe",
          credential: "stripe-key",
          grant_to: { agent_id: ["test-agent"] },
          actions: ["charge"],
          budget: { max_per_transaction: 100, max_per_month: 500 },
          approval_threshold: 75,
          ttl: 60,
        },
      ],
    };
    writeFileSync(policyPath, yamlStringify(policyData));

    // Init vault
    vault = new Vault(vaultPath);
    await vault.initialize(passphrase);
    vault.addCredential("stripe-key", "api_key", "test-credential-value-abc123");

    // Init other components
    auditLogger = new AuditLogger(auditPath);
    policyLoader = new PolicyLoader();
    policyLoader.loadFromFile(policyPath);
    policyEngine = new PolicyEngine();
    tokenStore = new TokenStore();
  });

  afterAll(() => {
    vault.close();
    auditLogger.close();
    for (const p of [vaultPath, auditPath, policyPath]) {
      try { unlinkSync(p); } catch {}
      try { unlinkSync(p + "-wal"); } catch {}
      try { unlinkSync(p + "-shm"); } catch {}
    }
  });

  it("grants credential and issues token", () => {
    const request = {
      credential_name: "stripe-key",
      agent_id: "test-agent",
      purpose: "charge customer",
      amount: 25,
      action: "charge",
    };

    // Evaluate policy
    const policies = policyLoader.listPoliciesForAgent(request.agent_id);
    const result = policyEngine.evaluateFirst(policies, request, {
      monthlySpending: auditLogger.getMonthlySpending("stripe-key"),
    });

    expect(result.decision).toBe("allow");

    // Get credential
    const cred = vault.getCredential("stripe-key");
    expect(cred).not.toBeNull();
    expect(cred!.value).toBe("test-credential-value-abc123");

    // Issue token
    const token = tokenStore.issue({
      credential_name: cred!.name,
      credential_value: cred!.value,
      policy_name: result.policy_name!,
      agent_id: request.agent_id,
      ttl: 60,
    });

    expect(token.token_id).toBeTruthy();
    expect(token.credential_value).toBe("test-credential-value-abc123");
    expect(token.expires_at).toBeGreaterThan(Date.now());

    // Verify token retrieval
    const retrieved = tokenStore.get(token.token_id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.credential_value).toBe("test-credential-value-abc123");

    // Report usage
    tokenStore.markUsed(token.token_id);
    auditLogger.log({
      timestamp: new Date().toISOString(),
      event: "credential_used",
      policy: token.policy_name,
      agent_id: token.agent_id,
      credential_name: token.credential_name,
      token_id: token.token_id,
      outcome: "success",
      details: JSON.stringify({ amount: 25, currency: "USD" }),
    });

    // Verify audit trail
    const entries = auditLogger.query({ event: "credential_used" });
    expect(entries).toHaveLength(1);
    expect(entries[0].token_id).toBe(token.token_id);
  });

  it("denies unauthorized agent", () => {
    const request = {
      credential_name: "stripe-key",
      agent_id: "unauthorized-agent",
      purpose: "steal money",
    };

    const policies = policyLoader.listPoliciesForAgent(request.agent_id);
    const result = policyEngine.evaluateFirst(policies, request);
    expect(result.decision).toBe("deny");
  });

  it("requires approval for large amounts", () => {
    const request = {
      credential_name: "stripe-key",
      agent_id: "test-agent",
      purpose: "big purchase",
      amount: 80,
      action: "charge",
    };

    const policies = policyLoader.listPoliciesForAgent(request.agent_id);
    const result = policyEngine.evaluateFirst(policies, request);
    expect(result.decision).toBe("require_approval");
  });

  it("denies over-budget transaction", () => {
    const request = {
      credential_name: "stripe-key",
      agent_id: "test-agent",
      purpose: "too expensive",
      amount: 150,
      action: "charge",
    };

    const policies = policyLoader.listPoliciesForAgent(request.agent_id);
    const result = policyEngine.evaluateFirst(policies, request);
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("max per transaction");
  });

  it("token expires and becomes inaccessible", () => {
    const token = tokenStore.issue({
      credential_name: "stripe-key",
      credential_value: "test-credential-expired",
      policy_name: "test-stripe",
      agent_id: "test-agent",
      ttl: 0, // expire immediately
    });

    // Tiny delay to ensure expiry
    const retrieved = tokenStore.get(token.token_id);
    expect(retrieved).toBeNull();
  });
});
