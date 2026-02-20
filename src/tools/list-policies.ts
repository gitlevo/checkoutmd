import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PolicyLoader } from "../policy/loader.js";

export function registerListPolicies(
  server: McpServer,
  deps: { policyLoader: PolicyLoader }
): void {
  server.tool(
    "checkout_list_available_policies",
    "List policies available to the requesting agent. Optionally filter by skill.",
    {
      agent_id: z.string().describe("ID of the requesting agent"),
      skill_id: z.string().optional().describe("Optional skill ID to filter by"),
    },
    async (params) => {
      const policies = deps.policyLoader.listPoliciesForAgent(params.agent_id, params.skill_id);

      const summaries = policies.map((p) => ({
        name: p.name,
        description: p.description,
        credential: p.credential,
        actions: p.actions,
        budget: p.budget,
        ttl: p.ttl,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ policies: summaries }),
          },
        ],
      };
    }
  );
}
