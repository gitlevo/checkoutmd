import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Vault } from "../vault/vault.js";
import type { PolicyLoader } from "../policy/loader.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { AuditLogger } from "../audit/logger.js";
import type { TokenStore } from "../token-store.js";
import { registerRequestCredential } from "./request-credential.js";
import { registerListPolicies } from "./list-policies.js";
import { registerCheckBudget } from "./check-budget.js";
import { registerReportUsage } from "./report-usage.js";

export interface ToolDependencies {
  vault: Vault;
  policyLoader: PolicyLoader;
  policyEngine: PolicyEngine;
  auditLogger: AuditLogger;
  tokenStore: TokenStore;
}

export function registerAllTools(server: McpServer, deps: ToolDependencies): void {
  registerRequestCredential(server, deps);
  registerListPolicies(server, deps);
  registerCheckBudget(server, deps);
  registerReportUsage(server, deps);
}
