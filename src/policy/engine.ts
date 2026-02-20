import { evaluate as celEvaluate } from "@marcbachmann/cel-js";
import type { Policy, CredentialRequest, PolicyEvalResult } from "../types.js";

export class PolicyEngine {
  /**
   * Evaluate a policy against a credential request.
   *
   * Evaluation order:
   * 1. grant_to check (is this agent/skill allowed?)
   * 2. deny list (is this agent explicitly denied?)
   * 3. actions allow list (is this action type allowed?)
   * 4. budget limits (max_per_transaction, max_per_month)
   * 5. approval threshold (amount above which human approval is needed)
   * 6. CEL condition (optional custom expression)
   */
  evaluate(
    policy: Policy,
    request: CredentialRequest,
    context: { monthlySpending?: number } = {}
  ): PolicyEvalResult {
    // 1. Check deny list
    if (policy.deny?.includes(request.agent_id)) {
      return {
        decision: "deny",
        reason: `Agent '${request.agent_id}' is explicitly denied by policy '${policy.name}'.`,
        policy_name: policy.name,
      };
    }

    // 2. Check grant_to.agent_id
    const grantAgents = policy.grant_to.agent_id;
    if (grantAgents) {
      const agents = Array.isArray(grantAgents) ? grantAgents : [grantAgents];
      if (!agents.includes("*") && !agents.includes(request.agent_id)) {
        return {
          decision: "deny",
          reason: `Agent '${request.agent_id}' is not granted access by policy '${policy.name}'.`,
          policy_name: policy.name,
        };
      }
    }

    // 3. Check grant_to.skill_id
    if (request.skill_id && policy.grant_to.skill_id) {
      const skills = Array.isArray(policy.grant_to.skill_id)
        ? policy.grant_to.skill_id
        : [policy.grant_to.skill_id];
      if (!skills.includes("*") && !skills.includes(request.skill_id)) {
        return {
          decision: "deny",
          reason: `Skill '${request.skill_id}' is not granted access by policy '${policy.name}'.`,
          policy_name: policy.name,
        };
      }
    }

    // 4. Check actions allow list
    if (policy.actions && request.action) {
      if (!policy.actions.includes(request.action)) {
        return {
          decision: "deny",
          reason: `Action '${request.action}' is not allowed by policy '${policy.name}'.`,
          policy_name: policy.name,
        };
      }
    }

    // 5. Check budget: max_per_transaction
    if (policy.budget?.max_per_transaction != null && request.amount != null) {
      if (request.amount > policy.budget.max_per_transaction) {
        return {
          decision: "deny",
          reason: `Amount $${request.amount} exceeds max per transaction $${policy.budget.max_per_transaction}.`,
          policy_name: policy.name,
        };
      }
    }

    // 6. Check budget: max_per_month
    if (policy.budget?.max_per_month != null && request.amount != null) {
      const monthlySpent = context.monthlySpending ?? 0;
      if (monthlySpent + request.amount > policy.budget.max_per_month) {
        return {
          decision: "deny",
          reason: `Amount $${request.amount} would exceed monthly budget. Spent: $${monthlySpent}, limit: $${policy.budget.max_per_month}.`,
          policy_name: policy.name,
        };
      }
    }

    // 7. Check approval threshold
    if (policy.approval_threshold != null && request.amount != null) {
      if (request.amount > policy.approval_threshold) {
        return {
          decision: "require_approval",
          reason: `Amount $${request.amount} exceeds approval threshold $${policy.approval_threshold}.`,
          policy_name: policy.name,
          scope: policy.scope,
        };
      }
    }

    // 8. CEL condition (optional)
    if (policy.condition) {
      try {
        const celContext = {
          agent_id: request.agent_id,
          skill_id: request.skill_id ?? "",
          purpose: request.purpose,
          amount: request.amount ?? 0,
          currency: request.currency ?? "",
          action: request.action ?? "",
          ...(request.context ?? {}),
        };
        const result = celEvaluate(policy.condition, celContext);
        if (result !== true) {
          return {
            decision: "deny",
            reason: `CEL condition '${policy.condition}' evaluated to ${String(result)}.`,
            policy_name: policy.name,
          };
        }
      } catch (err) {
        return {
          decision: "deny",
          reason: `CEL evaluation error: ${err instanceof Error ? err.message : String(err)}`,
          policy_name: policy.name,
        };
      }
    }

    // All checks passed
    return {
      decision: "allow",
      reason: "All policy checks passed.",
      policy_name: policy.name,
      scope: policy.scope,
    };
  }

  /**
   * Find the first matching policy for a request and evaluate it.
   */
  evaluateFirst(
    policies: Policy[],
    request: CredentialRequest,
    context: { monthlySpending?: number } = {}
  ): PolicyEvalResult {
    // Find policies that match the requested credential
    const matching = policies.filter((p) => p.credential === request.credential_name);
    if (matching.length === 0) {
      return {
        decision: "deny",
        reason: `No policy found for credential '${request.credential_name}'.`,
      };
    }

    // Try each matching policy until one allows
    for (const policy of matching) {
      const result = this.evaluate(policy, request, context);
      if (result.decision === "allow") return result;
      if (result.decision === "require_approval") return result;
    }

    // All policies denied — return the last denial
    return this.evaluate(matching[matching.length - 1], request, context);
  }
}
