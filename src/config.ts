import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env if present
dotenv.config();

const EnvSchema = z.object({
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "PRIVATE_KEY must be a 32-byte hex string starting with 0x")
    .optional(),
  TELEGRAPH_NODE: z.string().url().default("https://devnode.telegraphprotocol.com"),
  SEPOLIA_RPC: z.string().url().default("https://ethereum-sepolia-rpc.publicnode.com"),
  DIAMOND: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b"),
  USDC: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0xcc194e1a843B658526D0D5C431f670028582Ae17"),
  PORT: z.coerce.number().default(8787),
});

export const VerdictConfigSchema = z.object({
  _note: z.string().optional(),
  sanctions: z.object({
    reviewScore: z.number().min(0).max(1).default(0.85),
  }),
  security: z.object({
    rejectCount: z.number().int().nonnegative().default(5),
    reviewCount: z.number().int().nonnegative().default(1),
    rejectVerdicts: z.array(z.string()),
    reviewVerdicts: z.array(z.string()),
  }),
  concentration: z.object({
    reject: z.number().min(0).max(1).default(0.5),
    review: z.number().min(0).max(1).default(0.2),
  }),
  wash: z.object({
    rejectPct: z.number().min(0).max(100).default(40),
    reviewPct: z.number().min(0).max(100).default(15),
    rejectVerdicts: z.array(z.string()),
    reviewVerdicts: z.array(z.string()),
  }),
  social: z.object({
    reviewScore: z.number().min(0).max(1).default(0.7),
    reviewVerdicts: z.array(z.string()),
  }),
  holders: z.object({
    minReview: z.number().int().nonnegative().default(100),
  }),
  codeReview: z.object({
    reviewVerdicts: z.array(z.string()),
  }),
  defaults: z.object({
    perAskBudgetMicro: z.number().int().positive().default(30000),
    deadlineMs: z.number().int().min(2000).max(60000).default(20000),
    concurrency: z.number().int().positive().default(6),
    memoBudgetUsd: z.number().positive().default(1.0),
  }),
  unknownVerdictStringsAre: z.enum(["review", "reject", "pass"]).default("review"),
});

export type VerdictConfig = z.infer<typeof VerdictConfigSchema>;

export function loadVerdictConfig(customPath?: string): VerdictConfig {
  const resolvedPath =
    customPath || path.resolve(process.cwd(), "config", "verdict.config.json");
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Verdict config file not found at: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = JSON.parse(raw);
  return VerdictConfigSchema.parse(parsed);
}

export function loadEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Environment configuration error:\n${errorDetails}`);
  }
  return result.data;
}
