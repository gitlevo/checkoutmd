import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Vault } from "../vault/vault.js";
import type { PolicyLoader } from "../policy/loader.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { AuditLogger } from "../audit/logger.js";
import type { TokenStore } from "../token-store.js";

export function registerRequestCredential(
  server: McpServer,
  deps: {
    vault: Vault;
    policyLoader: PolicyLoader;
    policyEngine: PolicyEngine;
    auditLogger: AuditLogger;
    tokenStore: TokenStore;
  }
): void {
  server.tool(
    "checkout_request_credential",
    "Request a scoped credential token. The policy engine evaluates the request and returns a short-lived token if approved.",
    {
      credential_name: z.string().describe("Name of the credential to request"),
      agent_id: z.string().describe("ID of the requesting agent"),
      skill_id: z.string().optional().describe("ID of the skill making the request"),
      purpose: z.string().describe("Why the credential is needed"),
      amount: z.number().optional().describe("Transaction amount (for budget checks)"),
      currency: z.string().optional().describe("Currency code (e.g. USD)"),
      action: z.string().optional().describe("Action type (e.g. charge, refund)"),
    },
    async (params) => {
      const request = {
        credential_name: params.credential_name,
        agent_id: params.agent_id,
        skill_id: params.skill_id,
        purpose: params.purpose,
        amount: params.amount,
        currency: params.currency,
        action: params.action,
      };

      // Log the request
      deps.auditLogger.log({
        timestamp: new Date().toISOString(),
        event: "credential_requested",
        agent_id: request.agent_id,
        skill_id: request.skill_id,
        credential_name: request.credential_name,
        purpose: request.purpose,
      });

      // Find matching policies
      const policies = deps.policyLoader.listPoliciesForAgent(
        request.agent_id,
        request.skill_id
      );

      // Get monthly spending for budget checks
      const monthlySpending = deps.auditLogger.getMonthlySpending(request.credential_name);

      // Evaluate
      const result = deps.policyEngine.evaluateFirst(policies, request, { monthlySpending });

      if (result.decision === "deny") {
        deps.auditLogger.log({
          timestamp: new Date().toISOString(),
          event: "credential_denied",
          policy: result.policy_name,
          agent_id: request.agent_id,
          skill_id: request.skill_id,
          credential_name: request.credential_name,
          purpose: request.purpose,
          outcome: "denied",
          details: result.reason,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "denied",
                reason: result.reason,
              }),
            },
          ],
        };
      }

      if (result.decision === "require_approval") {
        deps.auditLogger.log({
          timestamp: new Date().toISOString(),
          event: "approval_required",
          policy: result.policy_name,
          agent_id: request.agent_id,
          skill_id: request.skill_id,
          credential_name: request.credential_name,
          purpose: request.purpose,
          outcome: "pending_approval",
          details: result.reason,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "require_approval",
                reason: result.reason,
                policy: result.policy_name,
              }),
            },
          ],
        };
      }

      // Allowed — fetch credential and issue token
      const credential = deps.vault.getCredential(request.credential_name);
      if (!credential) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                reason: `Credential '${request.credential_name}' not found in vault.`,
              }),
            },
          ],
        };
      }

      // Find the matching policy to get TTL
      const matchingPolicy = deps.policyLoader.getPolicy(result.policy_name!);
      const token = deps.tokenStore.issue({
        credential_name: credential.name,
        credential_value: credential.value,
        policy_name: result.policy_name!,
        agent_id: request.agent_id,
        skill_id: request.skill_id,
        scope: result.scope,
        ttl: matchingPolicy?.ttl,
      });

      deps.auditLogger.log({
        timestamp: new Date().toISOString(),
        event: "credential_granted",
        policy: result.policy_name,
        agent_id: request.agent_id,
        skill_id: request.skill_id,
        credential_name: request.credential_name,
        purpose: request.purpose,
        token_id: token.token_id,
        scope: token.scope,
        outcome: "granted",
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "granted",
              token_id: token.token_id,
              credential_value: token.credential_value,
              expires_at: new Date(token.expires_at).toISOString(),
              scope: token.scope,
            }),
          },
        ],
      };
    }
  );
}
