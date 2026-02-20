import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { PolicyFileSchema } from "./types.js";
import type { Policy, PolicyFile } from "../types.js";

export class PolicyLoader {
  private policies: Map<string, Policy> = new Map();

  /**
   * Load and validate policies from a YAML file.
   */
  loadFromFile(path: string): void {
    const raw = readFileSync(path, "utf8");
    const parsed = parseYaml(raw);
    const validated = PolicyFileSchema.parse(parsed) as PolicyFile;

    this.policies.clear();
    for (const policy of validated.policies) {
      this.policies.set(policy.name, policy);
    }
  }

  /**
   * Load policies from an already-parsed object (useful for testing).
   */
  loadFromObject(data: unknown): void {
    const validated = PolicyFileSchema.parse(data) as PolicyFile;
    this.policies.clear();
    for (const policy of validated.policies) {
      this.policies.set(policy.name, policy);
    }
  }

  getPolicy(name: string): Policy | undefined {
    return this.policies.get(name);
  }

  listPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  /**
   * List policies that grant access to a given agent (and optionally skill).
   */
  listPoliciesForAgent(agentId: string, skillId?: string): Policy[] {
    return this.listPolicies().filter((policy) => {
      // Check deny list first
      if (policy.deny?.includes(agentId)) return false;

      // Check grant_to.agent_id
      const grantAgents = policy.grant_to.agent_id;
      if (grantAgents) {
        const agents = Array.isArray(grantAgents) ? grantAgents : [grantAgents];
        if (!agents.includes("*") && !agents.includes(agentId)) return false;
      }

      // Check grant_to.skill_id if specified
      if (skillId && policy.grant_to.skill_id) {
        const skills = Array.isArray(policy.grant_to.skill_id)
          ? policy.grant_to.skill_id
          : [policy.grant_to.skill_id];
        if (!skills.includes("*") && !skills.includes(skillId)) return false;
      }

      return true;
    });
  }
}
