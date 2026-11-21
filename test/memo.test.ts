import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  computeContentHash,
  createAndSignMemo,
  verifyMemo,
} from "../src/engine/memo.js";
import type { Application, CheckResult } from "../src/telegraph/types.js";

describe("Canonical JSON & Memo Hashing", () => {
  it("sorts object keys alphabetically regardless of insertion order", () => {
    const objA = { z: 1, a: 2, m: { y: "bar", b: "foo" } };
    const objB = { a: 2, m: { b: "foo", y: "bar" }, z: 1 };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":2,"m":{"b":"foo","y":"bar"},"z":1}');
  });

  it("produces identical content hash for reordered inputs", () => {
    const obj1 = { name: "ListingGuard", version: 1, active: true };
    const obj2 = { active: true, version: 1, name: "ListingGuard" };

    expect(computeContentHash(obj1)).toBe(computeContentHash(obj2));
  });
});

describe("Memo Signing & Verification", () => {
  const privateKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const app: Application = {
    chain: "ethereum",
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    disclosedWallets: [],
    teamNames: [],
  };

  const sampleCheck: CheckResult = {
    id: "security",
    intent: "SECURITY_REVIEW_GENERAL",
    subject: "Contract",
    status: "done",
    fields: { verdict: "pass" },
    fieldStatus: { verdict: "ok" },
    confidence: "single_source",
    spend: [{ minerId: "miner1", costUsd: 0.01 }],
  };

  it("creates a signed memo and verifies successfully", async () => {
    const memo = await createAndSignMemo({
      application: app,
      checks: [sampleCheck],
      verdict: "LIST",
      reasons: [],
      missingEvidence: [],
      budgetUsd: 1.0,
      spentUsd: 0.01,
      skipped: [],
      durationMs: 1200,
      privateKey,
    });

    expect(memo.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(memo.contentHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(memo.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

    const audit = await verifyMemo(memo);
    expect(audit.valid).toBe(true);
    expect(audit.contentHashMatches).toBe(true);
    expect(audit.signatureMatches).toBe(true);
    expect(audit.signer.toLowerCase()).toBe(memo.signer.toLowerCase());
  });

  it("fails verification if any memo field is tampered with", async () => {
    const memo = await createAndSignMemo({
      application: app,
      checks: [sampleCheck],
      verdict: "LIST",
      reasons: [],
      missingEvidence: [],
      budgetUsd: 1.0,
      spentUsd: 0.01,
      skipped: [],
      durationMs: 1200,
      privateKey,
    });

    // Tamper with verdict
    const tampered = { ...memo, verdict: "REJECT" as const };
    const audit = await verifyMemo(tampered);

    expect(audit.valid).toBe(false);
    expect(audit.contentHashMatches).toBe(false);
  });
});
