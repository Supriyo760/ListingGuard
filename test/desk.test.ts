import { describe, it, expect } from "vitest";
import { Desk } from "../src/engine/desk.js";
import { MockTelegraphProvider } from "../src/telegraph/provider.js";
import type { Application } from "../src/telegraph/types.js";

describe("Desk Engine & Fault Tolerance", () => {
  const app: Application = {
    chain: "ethereum",
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    socialHandle: "circle",
    repoUrl: "https://github.com/circlefin/stablecoin-evm",
    disclosedWallets: [
      { label: "Treasury", address: "0x1111111111111111111111111111111111111111" },
    ],
    teamNames: ["Alice"],
  };

  it("runs all checks in parallel and collects results", async () => {
    const mock = new MockTelegraphProvider();
    const desk = new Desk(mock);

    const result = await desk.run(app, { budgetUsd: 1.0 });

    expect(result.checks.length).toBeGreaterThanOrEqual(4);
    expect(result.totalSpentUsd).toBeGreaterThan(0);
    expect(result.checks.every((c) => c.status === "done")).toBe(true);
  });

  it("gracefully isolates check failures without crashing the desk", async () => {
    const mock = new MockTelegraphProvider();
    // Simulate failure on WASH_TRADING_DETECTION_GENERAL
    mock.setScenario("WASH_TRADING_DETECTION_GENERAL", {
      intent: "WASH_TRADING_DETECTION_GENERAL",
      response: {} as any,
      shouldFail: true,
      failureError: "503 Miner unreachable",
    });

    const desk = new Desk(mock);
    const result = await desk.run(app, { budgetUsd: 1.0 });

    const failedCheck = result.checks.find((c) => c.id === "wash");
    expect(failedCheck).toBeDefined();
    expect(failedCheck?.status).toBe("failed");
    expect(failedCheck?.error).toContain("503 Miner unreachable");

    // Other checks must still succeed!
    const passingCheck = result.checks.find((c) => c.id === "security");
    expect(passingCheck?.status).toBe("done");
  });

  it("drops optional checks to respect budget cap", async () => {
    const mock = new MockTelegraphProvider();
    const desk = new Desk(mock);

    // Very tight budget (0.13 USD with 0.03 per check allows only ~4 checks)
    const result = await desk.run(app, {
      budgetUsd: 0.13,
      perAskBudgetMicro: 30000,
    });

    expect(result.skipped.length).toBeGreaterThan(0);
    // Required checks must never be skipped
    expect(result.skipped).not.toContain("security");
    expect(result.skipped).not.toContain("wash");
    expect(result.skipped).not.toContain("supply");
    expect(result.skipped).not.toContain("holderCount");
  });
});
