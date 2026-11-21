import { z } from "zod";

export const ChainSchema = z.enum(["ethereum", "polygon", "arbitrum"]);
export type Chain = z.infer<typeof ChainSchema>;

export const DisclosedWalletSchema = z.object({
  label: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
});
export type DisclosedWallet = z.infer<typeof DisclosedWalletSchema>;

export const ApplicationSchema = z.object({
  chain: ChainSchema.default("ethereum"),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid token contract address"),
  tokenSymbol: z.string().optional(),
  disclosedWallets: z.array(DisclosedWalletSchema).default([]),
  teamNames: z.array(z.string().min(1)).default([]),
  socialHandle: z.string().optional(),
  repoUrl: z.string().url().optional(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const RunOptionsSchema = z.object({
  budgetUsd: z.number().positive().default(1.0),
  crosscheck: z.boolean().default(false),
  perAskBudgetMicro: z.number().int().positive().default(30000),
  deadlineMs: z.number().int().min(2000).max(60000).default(20000),
});
export type RunOptions = z.infer<typeof RunOptionsSchema>;

export const FieldStatusSchema = z.enum(["ok", "missing", "rejected", "unavailable"]);
export type FieldStatus = z.infer<typeof FieldStatusSchema>;

export const ConfidenceSchema = z.enum(["agreed", "single_source", "conflicting", "unverified"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SpendRecordSchema = z.object({
  minerId: z.string(),
  minerName: z.string().optional(),
  costUsd: z.number().nonnegative(),
  receiptHash: z.string().optional(),
  signalHash: z.string().optional(),
  durationMs: z.number().optional(),
});
export type SpendRecord = z.infer<typeof SpendRecordSchema>;

export const CheckResultSchema = z.object({
  id: z.string(),
  intent: z.string(),
  subject: z.string(),
  status: z.enum(["done", "failed", "skipped"]),
  fields: z.record(z.unknown()).nullable(),
  fieldStatus: z.record(FieldStatusSchema).default({}),
  fulfillment: z.enum(["complete", "partial", "unverifiable", "unavailable"]).optional(),
  confidence: ConfidenceSchema,
  spend: z.array(SpendRecordSchema).default([]),
  error: z.string().optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const VerdictSchema = z.enum(["LIST", "REVIEW", "REJECT"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const ReasonSchema = z.object({
  rule: z.string(),
  level: z.enum(["REJECT", "REVIEW", "INFO"]),
  detail: z.string(),
  checkId: z.string(),
});
export type Reason = z.infer<typeof ReasonSchema>;

export const MemoCostSchema = z.object({
  budgetUsd: z.number(),
  spentUsd: z.number(),
  perCheck: z.array(z.object({ checkId: z.string(), usd: z.number() })),
  skipped: z.array(z.string()),
});

export const MemoSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  network: z.object({
    payments: z.literal("ethereum-sepolia (testnet, escrow)"),
    data: z.string(),
  }),
  application: ApplicationSchema,
  checks: z.array(CheckResultSchema),
  verdict: VerdictSchema,
  reasons: z.array(ReasonSchema),
  missingEvidence: z.array(z.string()),
  cost: z.object({
    budgetUsd: z.number(),
    spentUsd: z.number(),
    perCheck: z.array(z.object({ checkId: z.string(), usd: z.number() })),
    skipped: z.array(z.string()),
  }),
  limitations: z.array(z.string()),
  verification: z.object({
    signalHashes: z.array(z.string()),
    receiptHashes: z.array(z.string()),
    howTo: z.array(z.string()),
  }),
  signer: z.string(),
  contentHash: z.string(),
  signature: z.string(),
});
export type Memo = z.infer<typeof MemoSchema>;

export const EscrowAcceptOptionSchema = z.object({
  scheme: z.literal("escrow"),
  network: z.string(),
  payTo: z.string(),
  extra: z.object({
    message: z.string(),
  }),
});
export type EscrowAcceptOption = z.infer<typeof EscrowAcceptOptionSchema>;

export const Challenge402Schema = z.object({
  accepts: z.array(z.record(z.unknown())),
  error: z.string().optional(),
  reason: z.string().optional(),
});
export type Challenge402 = z.infer<typeof Challenge402Schema>;

export const NodeAskResponseSchema = z.object({
  miner_id: z.string().optional(),
  miner_name: z.string().optional(),
  result: z.record(z.unknown()).optional().nullable(),
  result_shape: z.enum(["intent", "raw"]).optional(),
  field_status: z.record(FieldStatusSchema).optional(),
  cost_usd: z.number().optional(),
  duration_ms: z.number().optional(),
  intent: z.string().optional(),
  signal_hash: z.string().optional(),
  error: z.string().optional(),
  fulfillment: z
    .object({
      status: z.enum(["complete", "partial", "unverifiable", "unavailable"]).optional(),
      provenance: z.record(z.unknown()).optional(),
      payments: z
        .array(
          z.object({
            miner: z.string().optional(),
            intent: z.string().optional(),
            amount_uusdc: z.number().optional(),
            receipt_hash: z.string().optional(),
          })
        )
        .optional(),
      stopped: z.boolean().optional(),
    })
    .optional(),
});
export type NodeAskResponse = z.infer<typeof NodeAskResponseSchema>;
