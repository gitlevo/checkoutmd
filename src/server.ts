import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Vault } from "./vault/vault.js";
import { PolicyLoader } from "./policy/loader.js";
import { PolicyEngine } from "./policy/engine.js";
import { AuditLogger } from "./audit/logger.js";
import { TokenStore } from "./token-store.js";
import { registerAllTools } from "./tools/register.js";
import { VERSION } from "./index.js";

export interface ServerOptions {
  vaultPath: string;
  policyPath: string;
  auditPath: string;
  passphrase: string;
}

export async function createServer(options: ServerOptions): Promise<{
  server: McpServer;
  vault: Vault;
  auditLogger: AuditLogger;
  cleanup: () => void;
}> {
  // Initialize components
  const vault = new Vault(options.vaultPath);
  await vault.unlock(options.passphrase);

  const policyLoader = new PolicyLoader();
  policyLoader.loadFromFile(options.policyPath);

  const policyEngine = new PolicyEngine();
  const auditLogger = new AuditLogger(options.auditPath);
  const tokenStore = new TokenStore();

  // Create MCP server
  const server = new McpServer({
    name: "checkout-wallet",
    version: VERSION,
  });

  // Register tools
  registerAllTools(server, {
    vault,
    policyLoader,
    policyEngine,
    auditLogger,
    tokenStore,
  });

  // Periodic token cleanup
  const purgeInterval = setInterval(() => {
    tokenStore.purgeExpired();
  }, 60_000);

  const cleanup = () => {
    clearInterval(purgeInterval);
    vault.close();
    auditLogger.close();
  };

  return { server, vault, auditLogger, cleanup };
}

export async function startServer(options: ServerOptions): Promise<void> {
  const { server, cleanup } = await createServer(options);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  const shutdown = () => {
    cleanup();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
