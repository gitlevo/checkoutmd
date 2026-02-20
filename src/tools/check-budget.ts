import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PolicyLoader } from "../policy/loader.js";
import type { AuditLogger } from "../audit/logger.js";

export function registerCheckBudget(
  server: McpServer,
  deps: { policyLoader: PolicyLoader; auditLogger: AuditLogger }
): void {
  server.tool(
    "checkout_check_budget",
    "Check remaining budget for a credential based on its policy and current month spending.",
    {
      credential_name: z.string().describe("Name of the credential"),
      policy_name: z.string().optional().describe("Specific policy to check (auto-detected if omitted)"),
    },
    async (params) => {
      const policy = params.policy_name
        ? deps.policyLoader.getPolicy(params.policy_name)
        : deps.policyLoader
            .listPolicies()
            .find((p) => p.credential === params.credential_name);

      if (!policy) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: `No policy found for credential '${params.credential_name}'.`,
              }),
            },
          ],
        };
      }

      if (!policy.budget?.max_per_month) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                policy: policy.name,
                credential: params.credential_name,
                budget: "unlimited",
                message: "No monthly budget limit configured.",
              }),
            },
          ],
        };
      }

      const spent = deps.auditLogger.getMonthlySpending(params.credential_name);
      const remaining = Math.max(0, policy.budget.max_per_month - spent);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              policy: policy.name,
              credential: params.credential_name,
              max_per_month: policy.budget.max_per_month,
              spent_this_month: spent,
              remaining,
              currency: policy.budget.currency ?? "USD",
              max_per_transaction: policy.budget.max_per_transaction,
            }),
          },
        ],
      };
    }
  );
}
