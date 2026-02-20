import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { AuditLogger } from "../src/audit/logger.js";

describe("AuditLogger", () => {
  const dbPaths: string[] = [];

  function tmpDb(): string {
    const p = join(tmpdir(), `audit-test-${randomUUID()}.db`);
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

  it("logs and queries entries", () => {
    const logger = new AuditLogger(tmpDb());

    const id = logger.log({
      timestamp: "2025-01-15T10:00:00Z",
      event: "credential_requested",
      policy: "stripe-policy",
      agent_id: "agent-1",
      purpose: "process payment",
      credential_name: "stripe-key",
    });

    expect(id).toBeGreaterThan(0);

    const entries = logger.query();
    expect(entries).toHaveLength(1);
    expect(entries[0].event).toBe("credential_requested");
    expect(entries[0].policy).toBe("stripe-policy");
    expect(entries[0].agent_id).toBe("agent-1");
    expect(entries[0].credential_name).toBe("stripe-key");

    logger.close();
  });

  it("filters by event type", () => {
    const logger = new AuditLogger(tmpDb());

    logger.log({ timestamp: "2025-01-15T10:00:00Z", event: "credential_requested" });
    logger.log({ timestamp: "2025-01-15T10:01:00Z", event: "credential_granted" });
    logger.log({ timestamp: "2025-01-15T10:02:00Z", event: "credential_denied" });

    const granted = logger.query({ event: "credential_granted" });
    expect(granted).toHaveLength(1);
    expect(granted[0].event).toBe("credential_granted");

    logger.close();
  });

  it("filters by agent_id", () => {
    const logger = new AuditLogger(tmpDb());

    logger.log({ timestamp: "2025-01-15T10:00:00Z", event: "credential_requested", agent_id: "a1" });
    logger.log({ timestamp: "2025-01-15T10:01:00Z", event: "credential_requested", agent_id: "a2" });

    const result = logger.query({ agent_id: "a1" });
    expect(result).toHaveLength(1);
    expect(result[0].agent_id).toBe("a1");

    logger.close();
  });

  it("filters by since timestamp", () => {
    const logger = new AuditLogger(tmpDb());

    logger.log({ timestamp: "2025-01-10T10:00:00Z", event: "credential_requested" });
    logger.log({ timestamp: "2025-01-20T10:00:00Z", event: "credential_granted" });

    const result = logger.query({ since: "2025-01-15T00:00:00Z" });
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe("credential_granted");

    logger.close();
  });

  it("respects limit", () => {
    const logger = new AuditLogger(tmpDb());

    for (let i = 0; i < 5; i++) {
      logger.log({ timestamp: `2025-01-1${i}T10:00:00Z`, event: "credential_requested" });
    }

    const result = logger.query({ limit: 2 });
    expect(result).toHaveLength(2);

    logger.close();
  });

  it("tracks monthly spending", () => {
    const logger = new AuditLogger(tmpDb());

    logger.log({
      timestamp: "2025-01-15T10:00:00Z",
      event: "credential_used",
      credential_name: "stripe-key",
      details: JSON.stringify({ amount: 25.50 }),
    });
    logger.log({
      timestamp: "2025-01-20T10:00:00Z",
      event: "credential_used",
      credential_name: "stripe-key",
      details: JSON.stringify({ amount: 14.50 }),
    });
    // Different month
    logger.log({
      timestamp: "2025-02-01T10:00:00Z",
      event: "credential_used",
      credential_name: "stripe-key",
      details: JSON.stringify({ amount: 100 }),
    });

    expect(logger.getMonthlySpending("stripe-key", "2025-01")).toBe(40);
    expect(logger.getMonthlySpending("stripe-key", "2025-02")).toBe(100);

    logger.close();
  });

  it("stores and retrieves scope and context as JSON", () => {
    const logger = new AuditLogger(tmpDb());

    logger.log({
      timestamp: "2025-01-15T10:00:00Z",
      event: "credential_granted",
      scope: { max_amount: 100, actions: ["charge"] },
      context: { ip: "127.0.0.1" },
    });

    const entries = logger.query();
    expect(entries[0].scope).toEqual({ max_amount: 100, actions: ["charge"] });
    expect(entries[0].context).toEqual({ ip: "127.0.0.1" });

    logger.close();
  });
});
