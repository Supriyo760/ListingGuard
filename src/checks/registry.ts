import type {
  Application,
  CheckResult,
  FieldStatus,
  NodeAskResponse,
  SpendRecord,
} from "../telegraph/types.js";
import type { AskOptions, EscrowAskResult } from "../telegraph/escrow.js";

export interface CheckDefinition {
  id: string;
  intent: string;
  subject: string;
  required: boolean;
  buildAsk(app: Application, options?: { perAskBudgetMicro?: number; deadlineMs?: number }): AskOptions;
  parseResult(askResult: EscrowAskResult, subject: string): CheckResult;
}

export function parseGenericCheckResult(
  id: string,
  intent: string,
  subject: string,
  askResult: EscrowAskResult
): CheckResult {
  const { data, receipt } = askResult;
  const fieldStatus: Record<string, FieldStatus> = data.field_status || {};
  const fields = data.result || null;

  const spend: SpendRecord[] = [];
  if (data.fulfillment?.payments && data.fulfillment.payments.length > 0) {
    for (const p of data.fulfillment.payments) {
      spend.push({
        minerId: p.miner || data.miner_id || "unknown",
        minerName: data.miner_name,
        costUsd: (p.amount_uusdc ? p.amount_uusdc / 1_000_000 : data.cost_usd) || 0.01,
        receiptHash: p.receipt_hash || receipt?.receipt_hash,
        signalHash: data.signal_hash,
        durationMs: data.duration_ms,
      });
    }
  } else {
    spend.push({
      minerId: data.miner_id || "default",
      minerName: data.miner_name,
      costUsd: data.cost_usd ?? 0.01,
      receiptHash: receipt?.receipt_hash,
      signalHash: data.signal_hash,
      durationMs: data.duration_ms,
    });
  }

  // Assess confidence:
  // If result_shape === "raw" or any field is not "ok" -> unverified
  const hasBadField = Object.values(fieldStatus).some((s) => s !== "ok");
  const isRaw = data.result_shape === "raw";
  const confidence = hasBadField || isRaw || !fields ? "unverified" : "single_source";

  return {
    id,
    intent,
    subject,
    status: "done",
    fields,
    fieldStatus,
    fulfillment: data.fulfillment?.status || (hasBadField ? "partial" : "complete"),
    confidence,
    spend,
    error: data.error,
  };
}

export function buildChecksForApplication(
  app: Application,
  options: { perAskBudgetMicro?: number; deadlineMs?: number } = {}
): CheckDefinition[] {
  const checks: CheckDefinition[] = [];

  // 1. Security Review (Required)
  checks.push({
    id: "security",
    intent: "SECURITY_REVIEW_GENERAL",
    subject: `Contract: ${app.tokenAddress}`,
    required: true,
    buildAsk: (_app) => ({
      intent: "SECURITY_REVIEW_GENERAL",
      params: { target: app.tokenAddress },
      maxBudgetMicro: options.perAskBudgetMicro,
      deadlineMs: options.deadlineMs,
    }),
    parseResult: (res, subj) =>
      parseGenericCheckResult("security", "SECURITY_REVIEW_GENERAL", subj, res),
  });

  // 2. Token Holder Count (Required)
  checks.push({
    id: "holderCount",
    intent: "TOKEN_HOLDER_COUNT_GENERAL",
    subject: `Token: ${app.tokenAddress} (${app.chain})`,
    required: true,
    buildAsk: (_app) => ({
      intent: "TOKEN_HOLDER_COUNT_GENERAL",
      params: { token: app.tokenAddress, chain: app.chain },
      maxBudgetMicro: options.perAskBudgetMicro,
      deadlineMs: options.deadlineMs,
    }),
    parseResult: (res, subj) =>
      parseGenericCheckResult("holderCount", "TOKEN_HOLDER_COUNT_GENERAL", subj, res),
  });

  // 3. Total Supply Verify (Required)
  checks.push({
    id: "supply",
    intent: "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL",
    subject: `Supply for: ${app.tokenAddress}`,
    required: true,
    buildAsk: (_app) => ({
      intent: "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL",
      params: { token: `${app.tokenAddress} on ${app.chain}` },
      maxBudgetMicro: options.perAskBudgetMicro,
      deadlineMs: options.deadlineMs,
    }),
    parseResult: (res, subj) =>
      parseGenericCheckResult("supply", "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL", subj, res),
  });

  // 4. Wash Trading Detection (Required)
  checks.push({
    id: "wash",
    intent: "WASH_TRADING_DETECTION_GENERAL",
    subject: `Wash trading analysis for: ${app.tokenAddress}`,
    required: true,
    buildAsk: (_app) => ({
      intent: "WASH_TRADING_DETECTION_GENERAL",
      params: { subject: app.tokenAddress },
      maxBudgetMicro: options.perAskBudgetMicro,
      deadlineMs: options.deadlineMs,
    }),
    parseResult: (res, subj) =>
      parseGenericCheckResult("wash", "WASH_TRADING_DETECTION_GENERAL", subj, res),
  });

  // 5. Wallet Balances (For each disclosed wallet)
  if (app.disclosedWallets && app.disclosedWallets.length > 0) {
    app.disclosedWallets.forEach((w, idx) => {
      const checkId = `walletBalance_${idx}_${w.label}`;
      checks.push({
        id: checkId,
        intent: "WALLET_BALANCE_CHECK_GENERAL",
        subject: `Wallet [${w.label}]: ${w.address}`,
        required: false,
        buildAsk: (_app) => ({
          intent: "WALLET_BALANCE_CHECK_GENERAL",
          params: {
            address: w.address,
            chain: app.chain,
            token: app.tokenAddress,
          },
          maxBudgetMicro: options.perAskBudgetMicro,
          deadlineMs: options.deadlineMs,
        }),
        parseResult: (res, subj) =>
          parseGenericCheckResult(checkId, "WALLET_BALANCE_CHECK_GENERAL", subj, res),
      });
    });
  }

  // 6. Sanctions Screening (For each team name)
  if (app.teamNames && app.teamNames.length > 0) {
    app.teamNames.forEach((name, idx) => {
      const checkId = `sanctions_${idx}_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
      checks.push({
        id: checkId,
        intent: "SANCTIONS_SCREENING_MATCH_GENERAL",
        subject: `Sanctions screen: ${name}`,
        required: false,
        buildAsk: (_app) => ({
          intent: "SANCTIONS_SCREENING_MATCH_GENERAL",
          params: { name },
          maxBudgetMicro: options.perAskBudgetMicro,
          deadlineMs: options.deadlineMs,
        }),
        parseResult: (res, subj) =>
          parseGenericCheckResult(checkId, "SANCTIONS_SCREENING_MATCH_GENERAL", subj, res),
      });
    });
  }

  // 7. Social Bot Detection (If social handle provided)
  if (app.socialHandle) {
    const handle = app.socialHandle.replace(/^@/, "");
    checks.push({
      id: "social",
      intent: "SOCIAL_BOT_DETECTION_GENERAL",
      subject: `Social bot check: @${handle}`,
      required: false,
      buildAsk: (_app) => ({
        intent: "SOCIAL_BOT_DETECTION_GENERAL",
        params: { account: handle },
        maxBudgetMicro: options.perAskBudgetMicro,
        deadlineMs: options.deadlineMs,
      }),
      parseResult: (res, subj) =>
        parseGenericCheckResult("social", "SOCIAL_BOT_DETECTION_GENERAL", subj, res),
    });
  }

  // 8. Code Review (If repo provided)
  if (app.repoUrl) {
    checks.push({
      id: "codeReview",
      intent: "CODE_REVIEW_GENERAL",
      subject: `Code review: ${app.repoUrl}`,
      required: false,
      buildAsk: (_app) => ({
        intent: "CODE_REVIEW_GENERAL",
        params: { code: app.repoUrl },
        maxBudgetMicro: options.perAskBudgetMicro,
        deadlineMs: options.deadlineMs,
      }),
      parseResult: (res, subj) =>
        parseGenericCheckResult("codeReview", "CODE_REVIEW_GENERAL", subj, res),
    });
  }

  return checks;
}
