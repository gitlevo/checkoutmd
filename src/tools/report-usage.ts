import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuditLogger } from "../audit/logger.js";
import type { TokenStore } from "../token-store.js";

export function registerReportUsage(
  server: McpServer,
  deps: { auditLogger: AuditLogger; tokenStore: TokenStore }
): void {
  server.tool(
    "checkout_report_usage",
    "Report that a credential token was used. Marks the token as consumed and logs the outcome.",
    {
      token_id: z.string().describe("The token ID that was used"),
      amount: z.number().optional().describe("Actual amount spent"),
      currency: z.string().optional().describe("Currency of the amount"),
      outcome: z.string().optional().describe("Outcome description (e.g. 'success', 'failed')"),
      details: z.string().optional().describe("Additional details about usage"),
    },
    async (params) => {
      const token = deps.tokenStore.get(params.token_id);
      if (!token) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                status: "error",
                reason: "Token not found or expired.",
              }),
            },
          ],
        };
      }

      deps.tokenStore.markUsed(params.token_id);

      deps.auditLogger.log({
        timestamp: new Date().toISOString(),
        event: "credential_used",
        policy: token.policy_name,
        agent_id: token.agent_id,
        skill_id: token.skill_id,
        credential_name: token.credential_name,
        token_id: token.token_id,
        scope: token.scope,
        outcome: params.outcome ?? "used",
        details: params.amount != null
          ? JSON.stringify({
              amount: params.amount,
              currency: params.currency ?? "USD",
              details: params.details,
            })
          : params.details ?? undefined,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "recorded",
              token_id: params.token_id,
            }),
          },
        ],
      };
    }
  );
}
