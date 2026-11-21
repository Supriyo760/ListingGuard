import type { NodeAskResponse, CheckResult } from "./types.js";
import { EscrowClient, type AskOptions, type EscrowAskResult } from "./escrow.js";
import { getAccountLedger, getMinersForIntent, getLeaderboard } from "./discovery.js";

export interface ITelegraphProvider {
  ask(options: AskOptions): Promise<EscrowAskResult>;
  directAsk(minerId: string, options: AskOptions): Promise<EscrowAskResult>;
  getBalance(address: string): Promise<number>; // in micro USDC
  getTopMiners(intent: string, count?: number): Promise<string[]>;
}

export class LiveTelegraphProvider implements ITelegraphProvider {
  private escrowClient: EscrowClient;
  private nodeUrl: string;

  constructor(nodeUrl: string, privateKey: `0x${string}`) {
    this.nodeUrl = nodeUrl;
    this.escrowClient = new EscrowClient({ nodeUrl, privateKey });
  }

  public get address(): `0x${string}` {
    return this.escrowClient.address;
  }

  public async ask(options: AskOptions): Promise<EscrowAskResult> {
    return this.escrowClient.ask(options);
  }

  public async directAsk(minerId: string, options: AskOptions): Promise<EscrowAskResult> {
    return this.escrowClient.ask({ ...options, minerId });
  }

  public async getBalance(address: string): Promise<number> {
    const ledger = await getAccountLedger(this.nodeUrl, address);
    if (!ledger || !ledger.available) return 0;
    return parseInt(ledger.available, 10);
  }

  public async getTopMiners(intent: string, count = 2): Promise<string[]> {
    const miners = await getMinersForIntent(this.nodeUrl, intent);
    if (!miners || miners.length === 0) return [];
    // Sort or return the top miners
    return miners.slice(0, count).map((m: any) => m.miner_id || m.id || String(m));
  }
}

export interface MockScenario {
  intent: string;
  response: NodeAskResponse;
  status?: number;
  delayMs?: number;
  shouldFail?: boolean;
  failureError?: string;
  receipt?: any;
}

export class MockTelegraphProvider implements ITelegraphProvider {
  private scenarios: Map<string, MockScenario> = new Map();
  private defaultBalanceMicro = 5000000; // 5 USDC
  public callHistory: AskOptions[] = [];

  constructor(scenarios?: MockScenario[]) {
    if (scenarios) {
      for (const s of scenarios) {
        this.scenarios.set(s.intent, s);
      }
    }
  }

  public setScenario(intent: string, scenario: MockScenario) {
    this.scenarios.set(intent, scenario);
  }

  public setBalance(microUsdc: number) {
    this.defaultBalanceMicro = microUsdc;
  }

  public async ask(options: AskOptions): Promise<EscrowAskResult> {
    this.callHistory.push(options);
    const scenario = this.scenarios.get(options.intent);

    if (scenario?.delayMs) {
      await new Promise((r) => setTimeout(r, scenario.delayMs));
    }

    if (scenario?.shouldFail) {
      throw new Error(scenario.failureError || `Simulated failure for ${options.intent}`);
    }

    if (scenario) {
      return {
        status: scenario.status || 200,
        data: scenario.response,
        receipt: scenario.receipt || {
          receipt_hash: `0xmockreceipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          epoch_id: "123456",
          amount: 10000,
        },
      };
    }

    // Default mock response per intent
    const defaultData = this.generateDefaultMockResponse(options);
    return {
      status: 200,
      data: defaultData,
      receipt: {
        receipt_hash: `0xmockreceipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        epoch_id: "123456",
        amount: 10000,
      },
    };
  }

  public async directAsk(minerId: string, options: AskOptions): Promise<EscrowAskResult> {
    return this.ask({ ...options, minerId });
  }

  public async getBalance(_address: string): Promise<number> {
    return this.defaultBalanceMicro;
  }

  public async getTopMiners(_intent: string, count = 2): Promise<string[]> {
    return Array.from({ length: count }, (_, i) => `mock_miner_${i + 1}`);
  }

  private generateDefaultMockResponse(options: AskOptions): NodeAskResponse {
    const intent = options.intent;
    const base = {
      miner_id: options.minerId || "mock_miner_alpha",
      miner_name: "Mock Intelligence Provider",
      result_shape: "intent" as const,
      cost_usd: 0.01,
      duration_ms: 120,
      intent,
      signal_hash: `0xmocksignal_${Date.now()}`,
      fulfillment: {
        status: "complete" as const,
        payments: [
          {
            miner: options.minerId || "mock_miner_alpha",
            intent,
            amount_uusdc: 10000,
            receipt_hash: `0xmockreceipt_${Date.now()}`,
          },
        ],
      },
    };

    switch (intent) {
      case "SECURITY_REVIEW_GENERAL":
        return {
          ...base,
          field_status: {
            verdict: "ok",
            vulnerability_count: "ok",
            issues: "ok",
            summary: "ok",
          },
          result: {
            verdict: "pass",
            vulnerability_count: 0,
            issues: [],
            summary: "No critical or high vulnerabilities detected in contract audit.",
          },
        };

      case "TOKEN_HOLDER_COUNT_GENERAL":
        return {
          ...base,
          field_status: {
            holders_count: "ok",
            token_symbol: "ok",
            token: "ok",
            chain: "ok",
          },
          result: {
            token: options.params?.token,
            chain: options.params?.chain || "ethereum",
            holders_count: 1420,
            token_symbol: "GUARD",
          },
        };

      case "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL":
        return {
          ...base,
          field_status: {
            total_supply: "ok",
          },
          result: {
            total_supply: "1000000000",
          },
        };

      case "WALLET_BALANCE_CHECK_GENERAL":
        return {
          ...base,
          field_status: {
            balance: "ok",
            token_symbol: "ok",
            address: "ok",
            as_of: "ok",
          },
          result: {
            address: options.params?.address,
            chain: options.params?.chain,
            balance: "50000000", // 5% of 1B supply
            token_symbol: "GUARD",
            as_of: new Date().toISOString(),
          },
        };

      case "SANCTIONS_SCREENING_MATCH_GENERAL":
        return {
          ...base,
          field_status: {
            name: "ok",
            matched: "ok",
            matches: "ok",
            lists: "ok",
            match_score: "ok",
          },
          result: {
            name: options.params?.name,
            matched: false,
            matches: [],
            lists: ["OFAC", "EU", "UN"],
            match_score: 0.05,
          },
        };

      case "SOCIAL_BOT_DETECTION_GENERAL":
        return {
          ...base,
          field_status: {
            account: "ok",
            verdict: "ok",
            bot_score: "ok",
            signals: "ok",
          },
          result: {
            account: options.params?.account,
            verdict: "human",
            bot_score: 0.12,
            signals: ["organic_follower_growth", "high_interaction_diversity"],
          },
        };

      case "WASH_TRADING_DETECTION_GENERAL":
        return {
          ...base,
          field_status: {
            subject: "ok",
            verdict: "ok",
            wash_volume_pct: "ok",
            signals: "ok",
            summary: "ok",
          },
          result: {
            subject: options.params?.subject,
            verdict: "clean",
            wash_volume_pct: 4.2,
            signals: ["normal_order_decay", "no_circular_matching"],
            summary: "Trading volume matches natural market maker behavior.",
          },
        };

      case "CODE_REVIEW_GENERAL":
        return {
          ...base,
          field_status: {
            code: "ok",
            verdict: "ok",
            findings: "ok",
            summary: "ok",
          },
          result: {
            code: options.params?.code,
            verdict: "Approve",
            findings: [],
            summary: "Clean codebase structure, comprehensive test suite.",
          },
        };

      default:
        return {
          ...base,
          field_status: {},
          result: { raw: "ok" },
        };
    }
  }
}
