export const VERSION = "0.1.0";
export const PACKAGE_NAME = "@checkoutmd/wallet";

// Types
export type {
  CredentialType,
  CredentialRecord,
  Credential,
  CredentialSummary,
  EncryptedPayload,
  PolicyScope,
  PolicyBudget,
  Policy,
  PolicyFile,
  ScopedToken,
  PolicyDecision,
  PolicyEvalResult,
  CredentialRequest,
  AuditEvent,
  AuditEntry,
  AuditQuery,
  WalletConfig,
} from "./types.js";

// Vault
export { Vault } from "./vault/vault.js";
export { generateSalt, deriveKey, encrypt, decrypt } from "./vault/crypto.js";
export { initVaultSchema } from "./vault/schema.js";

// Audit
export { AuditLogger } from "./audit/logger.js";
export { initAuditSchema } from "./audit/schema.js";

// Policy
export { PolicyLoader } from "./policy/loader.js";
export { PolicyEngine } from "./policy/engine.js";
export { PolicyFileSchema, PolicySchema, PolicyScopeSchema, PolicyBudgetSchema } from "./policy/types.js";

// Token Store
export { TokenStore } from "./token-store.js";

// Server
export { createServer, startServer } from "./server.js";
export type { ServerOptions } from "./server.js";

// Tool registration
export { registerAllTools } from "./tools/register.js";
export type { ToolDependencies } from "./tools/register.js";
