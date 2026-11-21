import { describe, it, expect } from "vitest";
import { evaluateVerdict } from "../src/engine/verdict.js";
import { loadVerdictConfig } from "../src/config.js";
import type { Application, CheckResult } from "../src/telegraph/types.js";

describe("Verdict Engine Rules", () => {
  const config = loadVerdictConfig();

  const baseApp: Application = {
    chain: "ethereum",
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    disclosedWallets: [],
    teamNames: [],
  };

  function createPassingChecks(): CheckResult[] {
    return [
      {
        id: "security",
        intent: "SECURITY_REVIEW_GENERAL",
        subject: "Contract",
        status: "done",
        fields: { verdict: "pass", vulnerability_count: 0 },
        fieldStatus: { verdict: "ok" },
        confidence: "single_source",
        spend: [],
      },
      {
        id: "holderCount",
        intent: "TOKEN_HOLDER_COUNT_GENERAL",
        subject: "Holders",
        status: "done",
        fields: { holders_count: 500 },
        fieldStatus: { holders_count: "ok" },
        confidence: "single_source",
        spend: [],
      },
      {
        id: "supply",
        intent: "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL",
        subject: "Supply",
        status: "done",
        fields: { total_supply: "1000000" },
        fieldStatus: { total_supply: "ok" },
        confidence: "single_source",
        spend: [],
      },
      {
        id: "wash",
        intent: "WASH_TRADING_DETECTION_GENERAL",
        subject: "Wash",
        status: "done",
        fields: { verdict: "clean", wash_volume_pct: 2.0 },
        fieldStatus: { verdict: "ok" },
        confidence: "single_source",
        spend: [],
      },
    ];
  }

  it("produces LIST when all required checks are verified and clean", () => {
    const checks = createPassingChecks();
    const result = evaluateVerdict(baseApp, checks, config);

    expect(result.verdict).toBe("LIST");
    expect(result.missingEvidence).toHaveLength(0);
  });

  it("never produces LIST if a required check is missing", () => {
    // Drop 'wash' check
    const checks = createPassingChecks().filter((c) => c.id !== "wash");
    const result = evaluateVerdict(baseApp, checks, config);

    expect(result.verdict).toBe("REVIEW");
    expect(result.missingEvidence).toContain("WASH_TRADING_DETECTION_GENERAL");
    expect(result.reasons.some((r) => r.rule === "Required Evidence Missing")).toBe(true);
  });

  it("never produces LIST if a required check has unverified confidence", () => {
    const checks = createPassingChecks();
    checks[0].confidence = "unverified"; // security unverified

    const result = evaluateVerdict(baseApp, checks, config);
    expect(result.verdict).toBe("REVIEW");
    expect(result.missingEvidence).toContain("SECURITY_REVIEW_GENERAL");
  });

  it("REJECTS immediately on sanctions match", () => {
    const checks = createPassingChecks();
    checks.push({
      id: "sanctions_1",
      intent: "SANCTIONS_SCREENING_MATCH_GENERAL",
      subject: "Alice",
      status: "done",
      fields: { matched: true, match_score: 1.0, lists: ["OFAC"] },
      fieldStatus: { matched: "ok" },
      confidence: "single_source",
      spend: [],
    });

    const result = evaluateVerdict(baseApp, checks, config);
    expect(result.verdict).toBe("REJECT");
    expect(result.reasons.some((r) => r.rule === "Sanctions Match Found")).toBe(true);
  });

  it("REJECTS on critical security vulnerability count >= 5", () => {
    const checks = createPassingChecks();
    checks[0].fields = { verdict: "fail", vulnerability_count: 5 };

    const result = evaluateVerdict(baseApp, checks, config);
    expect(result.verdict).toBe("REJECT");
    expect(result.reasons.some((r) => r.rule === "Critical Security Flaws")).toBe(true);
  });

  it("handles unknown security verdict strings as REVIEW", () => {
    const checks = createPassingChecks();
    checks[0].fields = { verdict: "exotic_miner_status_alpha", vulnerability_count: 0 };

    const result = evaluateVerdict(baseApp, checks, config);
    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons.some((r) => r.rule === "Unknown Security Verdict")).toBe(true);
  });

  it("REJECTS on insider wallet concentration > 50%", () => {
    const checks = createPassingChecks();
    const appWithWallets: Application = {
      ...baseApp,
      disclosedWallets: [{ label: "Deployer", address: "0x1234567890123456789012345678901234567890" }],
    };

    checks.push({
      id: "walletBalance_0_Deployer",
      intent: "WALLET_BALANCE_CHECK_GENERAL",
      subject: "Deployer",
      status: "done",
      fields: { balance: "600000" }, // 600k / 1M = 60% > 50%
      fieldStatus: { balance: "ok" },
      confidence: "single_source",
      spend: [],
    });

    const result = evaluateVerdict(appWithWallets, checks, config);
    expect(result.verdict).toBe("REJECT");
    expect(result.reasons.some((r) => r.rule === "Extreme Insider Concentration")).toBe(true);
  });

  it("REJECTS on wash trading >= 40%", () => {
    const checks = createPassingChecks();
    const wash = checks.find((c) => c.id === "wash")!;
    wash.fields = { verdict: "likely wash trading", wash_volume_pct: 45.0 };

    const result = evaluateVerdict(baseApp, checks, config);
    expect(result.verdict).toBe("REJECT");
  });

  it("REVIEWS on social bot activity (never rejects alone)", () => {
    const checks = createPassingChecks();
    checks.push({
      id: "social",
      intent: "SOCIAL_BOT_DETECTION_GENERAL",
      subject: "handle",
      status: "done",
      fields: { verdict: "bot", bot_score: 0.95 },
      fieldStatus: { verdict: "ok" },
      confidence: "single_source",
      spend: [],
    });

    const result = evaluateVerdict(baseApp, checks, config);
    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons.some((r) => r.rule === "Artificial Social Following")).toBe(true);
  });
});
