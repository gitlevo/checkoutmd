// Credential types that can be stored in the vault
export type CredentialType =
  | "api_key"
  | "payment_token"
  | "oauth_token"
  | "secret"
  | "certificate";

// Stored credential metadata (never includes the decrypted value)
export interface CredentialRecord {
  id: string;
  name: string;
  type: CredentialType;
  encrypted_data: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// Decrypted credential returned to callers
export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  value: string;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// Credential listing (no value exposed)
export interface CredentialSummary {
  id: string;
  name: string;
  type: CredentialType;
  metadata: Record<string, string>;
  created_at: string;
  updated_at: string;
}

// Encrypted payload stored in vault
export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

// Policy scope: which agents/skills a policy applies to
export interface PolicyScope {
  agent_id?: string | string[];
  skill_id?: string | string[];
}

// Budget limits within a policy
export interface PolicyBudget {
  max_per_transaction?: number;
  max_per_month?: number;
  currency?: string;
}

// A single policy definition from YAML
export interface Policy {
  name: string;
  description?: string;
  credential: string; // name of the credential in the vault
  grant_to: PolicyScope;
  deny?: string[]; // list of agent IDs explicitly denied
  actions?: string[]; // allowed action types
  budget?: PolicyBudget;
  approval_threshold?: number; // amount above which human approval is needed
  condition?: string; // optional CEL expression
  scope?: Record<string, unknown>; // additional scope constraints passed to token
  ttl?: number; // token TTL in seconds (default 300)
}

// The full policy file structure
export interface PolicyFile {
  version: string;
  policies: Policy[];
}

// Scoped token issued after policy evaluation
export interface ScopedToken {
  token_id: string;
  credential_name: string;
  credential_value: string;
  policy_name: string;
  agent_id: string;
  skill_id?: string;
  scope: Record<string, unknown>;
  issued_at: number; // unix ms
  expires_at: number; // unix ms
  used: boolean;
}

// Policy evaluation result
export type PolicyDecision = "allow" | "deny" | "require_approval";

export interface PolicyEvalResult {
  decision: PolicyDecision;
  reason: string;
  scope?: Record<string, unknown>;
  policy_name?: string;
}

// Request for a credential from an agent
export interface CredentialRequest {
  credential_name: string;
  agent_id: string;
  skill_id?: string;
  purpose: string;
  amount?: number;
  currency?: string;
  action?: string;
  context?: Record<string, unknown>;
}

// Audit log event types
export type AuditEvent =
  | "credential_requested"
  | "credential_granted"
  | "credential_denied"
  | "credential_used"
  | "approval_required"
  | "token_expired"
  | "vault_unlocked"
  | "vault_locked"
  | "credential_added"
  | "credential_removed";

// Audit log entry
export interface AuditEntry {
  id?: number;
  timestamp: string;
  event: AuditEvent;
  policy?: string;
  agent_id?: string;
  skill_id?: string;
  purpose?: string;
  token_id?: string;
  credential_name?: string;
  scope?: Record<string, unknown>;
  context?: Record<string, unknown>;
  outcome?: string;
  approval?: string;
  details?: string;
}

// Audit query filters
export interface AuditQuery {
  event?: AuditEvent;
  policy?: string;
  agent_id?: string;
  since?: string;
  limit?: number;
}

// Wallet configuration (runtime)
export interface WalletConfig {
  vault_path: string;
  audit_path: string;
  policy_path: string;
  passphrase: string;
}
