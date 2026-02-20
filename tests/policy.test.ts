import { describe, it, expect } from "vitest";
import { PolicyLoader } from "../src/policy/loader.js";
import { PolicyEngine } from "../src/policy/engine.js";
import type { Policy, CredentialRequest } from "../src/types.js";

const samplePolicies = {
  version: "1",
  policies: [
    {
      name: "stripe-dev",
      description: "Stripe test key for dev agents",
      credential: "stripe-key",
      grant_to: { agent_id: ["agent-1", "agent-2"], skill_id: "payments" },
      deny: ["agent-blocked"],
      actions: ["charge", "refund"],
      budget: { max_per_transaction: 100, max_per_month: 1000 },
      approval_threshold: 50,
      ttl: 300,
    },
    {
      name: "github-token",
      description: "GitHub API token for all agents",
      credential: "github-token",
      grant_to: { agent_id: "*" },
    },
    {
      name: "cel-policy",
      description: "Policy with CEL condition",
      credential: "special-key",
      grant_to: { agent_id: "*" },
      condition: 'purpose.contains("deploy")',
    },
  ],
};

describe("PolicyLoader", () => {
  it("loads policies from object", () => {
    const loader = new PolicyLoader();
    loader.loadFromObject(samplePolicies);

    expect(loader.listPolicies()).toHaveLength(3);
    expect(loader.getPolicy("stripe-dev")).toBeDefined();
    expect(loader.getPolicy("nonexistent")).toBeUndefined();
  });

  it("filters policies for agent", () => {
    const loader = new PolicyLoader();
    loader.loadFromObject(samplePolicies);

    const agent1 = loader.listPoliciesForAgent("agent-1", "payments");
    expect(agent1.map((p) => p.name)).toContain("stripe-dev");
    expect(agent1.map((p) => p.name)).toContain("github-token");

    // Blocked agent should not see stripe-dev
    const blocked = loader.listPoliciesForAgent("agent-blocked");
    expect(blocked.map((p) => p.name)).not.toContain("stripe-dev");
    expect(blocked.map((p) => p.name)).toContain("github-token");
  });

  it("filters by skill", () => {
    const loader = new PolicyLoader();
    loader.loadFromObject(samplePolicies);

    // agent-1 with wrong skill
    const wrongSkill = loader.listPoliciesForAgent("agent-1", "wrong-skill");
    expect(wrongSkill.map((p) => p.name)).not.toContain("stripe-dev");
  });

  it("rejects invalid policy files", () => {
    const loader = new PolicyLoader();
    expect(() => loader.loadFromObject({ version: "1" })).toThrow();
    expect(() => loader.loadFromObject({ version: "1", policies: [{}] })).toThrow();
  });
});

describe("PolicyEngine", () => {
  const engine = new PolicyEngine();

  function makeRequest(overrides: Partial<CredentialRequest> = {}): CredentialRequest {
    return {
      credential_name: "stripe-key",
      agent_id: "agent-1",
      skill_id: "payments",
      purpose: "process payment",
      amount: 25,
      action: "charge",
      ...overrides,
    };
  }

  const stripePolicy = samplePolicies.policies[0] as Policy;

  it("allows valid request", () => {
    const result = engine.evaluate(stripePolicy, makeRequest());
    expect(result.decision).toBe("allow");
  });

  it("denies blocked agent", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ agent_id: "agent-blocked" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("explicitly denied");
  });

  it("denies ungranted agent", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ agent_id: "agent-unknown" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("not granted");
  });

  it("denies wrong skill", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ skill_id: "wrong-skill" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("Skill");
  });

  it("denies disallowed action", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ action: "delete" }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("not allowed");
  });

  it("denies over max_per_transaction", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ amount: 150 }));
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("max per transaction");
  });

  it("denies when monthly budget would be exceeded", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ amount: 50 }), {
      monthlySpending: 960,
    });
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("monthly budget");
  });

  it("requires approval above threshold", () => {
    const result = engine.evaluate(stripePolicy, makeRequest({ amount: 75 }));
    expect(result.decision).toBe("require_approval");
    expect(result.reason).toContain("approval threshold");
  });

  it("evaluates CEL condition — pass", () => {
    const celPolicy = samplePolicies.policies[2] as Policy;
    const result = engine.evaluate(celPolicy, {
      credential_name: "special-key",
      agent_id: "agent-1",
      purpose: "deploy to production",
    });
    expect(result.decision).toBe("allow");
  });

  it("evaluates CEL condition — fail", () => {
    const celPolicy = samplePolicies.policies[2] as Policy;
    const result = engine.evaluate(celPolicy, {
      credential_name: "special-key",
      agent_id: "agent-1",
      purpose: "random task",
    });
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("CEL condition");
  });

  it("evaluateFirst finds matching policy", () => {
    const allPolicies = samplePolicies.policies as Policy[];
    const result = engine.evaluateFirst(allPolicies, {
      credential_name: "github-token",
      agent_id: "any-agent",
      purpose: "read repos",
    });
    expect(result.decision).toBe("allow");
    expect(result.policy_name).toBe("github-token");
  });

  it("evaluateFirst returns deny when no policy matches credential", () => {
    const allPolicies = samplePolicies.policies as Policy[];
    const result = engine.evaluateFirst(allPolicies, {
      credential_name: "nonexistent",
      agent_id: "agent-1",
      purpose: "test",
    });
    expect(result.decision).toBe("deny");
    expect(result.reason).toContain("No policy found");
  });
});
