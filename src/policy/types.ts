import { z } from "zod";

export const PolicyScopeSchema = z.object({
  agent_id: z.union([z.string(), z.array(z.string())]).optional(),
  skill_id: z.union([z.string(), z.array(z.string())]).optional(),
});

export const PolicyBudgetSchema = z.object({
  max_per_transaction: z.number().positive().optional(),
  max_per_month: z.number().positive().optional(),
  currency: z.string().optional(),
});

export const PolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  credential: z.string().min(1),
  grant_to: PolicyScopeSchema,
  deny: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  budget: PolicyBudgetSchema.optional(),
  approval_threshold: z.number().positive().optional(),
  condition: z.string().optional(),
  scope: z.record(z.unknown()).optional(),
  ttl: z.number().int().positive().optional(),
});

export const PolicyFileSchema = z.object({
  version: z.string(),
  policies: z.array(PolicySchema),
});
