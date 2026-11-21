import type {
  Application,
  CheckResult,
  Reason,
  Verdict,
} from "../telegraph/types.js";
import type { VerdictConfig } from "../config.js";
import { REQUIRED_INTENTS } from "../telegraph/discovery.js";

export interface VerdictEngineResult {
  verdict: Verdict;
  reasons: Reason[];
  missingEvidence: string[];
}

export function evaluateVerdict(
  app: Application,
  checks: CheckResult[],
  config: VerdictConfig
): VerdictEngineResult {
  const reasons: Reason[] = [];
  const missingEvidence: string[] = [];

  // Index checks by ID or Intent
  const checksById = new Map<string, CheckResult>();
  const checksByIntent = new Map<string, CheckResult[]>();

  for (const c of checks) {
    checksById.set(c.id, c);
    const existing = checksByIntent.get(c.intent) || [];
    existing.push(c);
    checksByIntent.set(c.intent, existing);
  }

  // Rule 8: Required Checks completeness
  for (const reqIntent of REQUIRED_INTENTS) {
    const matching = checksByIntent.get(reqIntent) || [];
    const validMatch = matching.find(
      (c) => c.status === "done" && c.confidence !== "unverified" && c.fields !== null
    );

    if (!validMatch) {
      missingEvidence.push(reqIntent);
      reasons.push({
        rule: "Required Evidence Missing",
        level: "REVIEW",
        detail: `Required check '${reqIntent}' is missing, failed, or unverified.`,
        checkId: matching[0]?.id || reqIntent,
      });
    }
  }

  // 1. Sanctions Screening
  const sanctionsChecks = checks.filter((c) =>
    c.intent.includes("SANCTIONS_SCREENING_MATCH")
  );
  for (const sc of sanctionsChecks) {
    if (sc.status !== "done" || !sc.fields) {
      reasons.push({
        rule: "Sanctions Incomplete",
        level: "REVIEW",
        detail: `Sanctions check for ${sc.subject} did not complete successfully.`,
        checkId: sc.id,
      });
      continue;
    }

    const matched = Boolean(sc.fields.matched);
    const matchScore = Number(sc.fields.match_score || 0);

    if (matched) {
      reasons.push({
        rule: "Sanctions Match Found",
        level: "REJECT",
        detail: `Sanctions match confirmed for ${sc.subject} (score: ${matchScore}). Lists: ${JSON.stringify(sc.fields.lists || [])}`,
        checkId: sc.id,
      });
    } else if (matchScore >= config.sanctions.reviewScore) {
      reasons.push({
        rule: "High Sanctions Match Score",
        level: "REVIEW",
        detail: `Potential sanctions similarity detected for ${sc.subject} (score: ${matchScore} >= threshold: ${config.sanctions.reviewScore}).`,
        checkId: sc.id,
      });
    }
  }

  // 2. Security Review
  const secCheck = checks.find((c) => c.intent === "SECURITY_REVIEW_GENERAL");
  if (secCheck && secCheck.status === "done" && secCheck.fields) {
    const rawVerdict = String(secCheck.fields.verdict || "").trim().toLowerCase();
    const vulnCount = Number(secCheck.fields.vulnerability_count || 0);

    const isRejectVerdict = config.security.rejectVerdicts.some((v) =>
      rawVerdict.includes(v.toLowerCase())
    );
    const isReviewVerdict = config.security.reviewVerdicts.some((v) =>
      rawVerdict.includes(v.toLowerCase())
    );

    if (isRejectVerdict || vulnCount >= config.security.rejectCount) {
      reasons.push({
        rule: "Critical Security Flaws",
        level: "REJECT",
        detail: `Security review flagged: verdict='${secCheck.fields.verdict}', vulnerabilities=${vulnCount} (reject threshold: ${config.security.rejectCount}).`,
        checkId: secCheck.id,
      });
    } else if (isReviewVerdict || vulnCount >= config.security.reviewCount) {
      reasons.push({
        rule: "Security Review Warnings",
        level: "REVIEW",
        detail: `Security review flagged potential issues: verdict='${secCheck.fields.verdict}', vulnerabilities=${vulnCount}.`,
        checkId: secCheck.id,
      });
    } else if (rawVerdict !== "pass" && rawVerdict !== "clean" && rawVerdict !== "safe" && rawVerdict !== "ok") {
      // Unknown verdict string handling per spec
      reasons.push({
        rule: "Unknown Security Verdict",
        level: "REVIEW",
        detail: `Unknown security verdict string received: '${secCheck.fields.verdict}'. Treating as review for safety.`,
        checkId: secCheck.id,
      });
    }
  }

  // 3. Concentration Analysis: sum(disclosed wallet balances) / total_supply
  const supplyCheck = checks.find(
    (c) => c.intent === "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL"
  );
  const walletChecks = checks.filter((c) =>
    c.intent.includes("WALLET_BALANCE_CHECK")
  );

  let totalSupplyNum: number | null = null;
  if (supplyCheck?.fields?.total_supply) {
    const cleaned = String(supplyCheck.fields.total_supply).replace(/,/g, "");
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed > 0) {
      totalSupplyNum = parsed;
    }
  }

  if (app.disclosedWallets && app.disclosedWallets.length > 0) {
    if (!totalSupplyNum) {
      reasons.push({
        rule: "Total Supply Unavailable",
        level: "REVIEW",
        detail: "Cannot calculate disclosed holder concentration because total supply was not verified.",
        checkId: supplyCheck?.id || "supply",
      });
    } else {
      let totalDisclosedBalance = 0;
      let allBalancesOk = true;

      for (const wc of walletChecks) {
        if (wc.status === "done" && wc.fields?.balance !== undefined) {
          const bal = parseFloat(String(wc.fields.balance).replace(/,/g, ""));
          if (!isNaN(bal)) {
            totalDisclosedBalance += bal;
          } else {
            allBalancesOk = false;
          }
        } else {
          allBalancesOk = false;
        }
      }

      if (!allBalancesOk) {
        reasons.push({
          rule: "Partial Wallet Balances",
          level: "REVIEW",
          detail: "Some disclosed wallet balances could not be verified.",
          checkId: "walletBalances",
        });
      }

      const concentrationRatio = totalDisclosedBalance / totalSupplyNum;
      const concentrationPct = Number((concentrationRatio * 100).toFixed(2));

      if (concentrationRatio >= config.concentration.reject) {
        reasons.push({
          rule: "Extreme Insider Concentration",
          level: "REJECT",
          detail: `Disclosed insider wallets hold ${concentrationPct}% of total supply (reject threshold: ${config.concentration.reject * 100}%).`,
          checkId: "concentration",
        });
      } else if (concentrationRatio >= config.concentration.review) {
        reasons.push({
          rule: "High Insider Concentration",
          level: "REVIEW",
          detail: `Disclosed insider wallets hold ${concentrationPct}% of total supply (review threshold: ${config.concentration.review * 100}%).`,
          checkId: "concentration",
        });
      } else {
        reasons.push({
          rule: "Acceptable Concentration",
          level: "INFO",
          detail: `Disclosed insider wallets hold ${concentrationPct}% of total supply.`,
          checkId: "concentration",
        });
      }
    }
  }

  // 4. Wash Trading Detection
  const washCheck = checks.find((c) => c.intent === "WASH_TRADING_DETECTION_GENERAL");
  if (washCheck && washCheck.status === "done" && washCheck.fields) {
    const washPct = Number(washCheck.fields.wash_volume_pct || 0);
    const rawWashVerdict = String(washCheck.fields.verdict || "").trim().toLowerCase();

    const isRejectWash =
      washPct >= config.wash.rejectPct ||
      config.wash.rejectVerdicts.some((v) => rawWashVerdict.includes(v.toLowerCase()));

    const isReviewWash =
      washPct >= config.wash.reviewPct ||
      config.wash.reviewVerdicts.some((v) => rawWashVerdict.includes(v.toLowerCase()));

    if (isRejectWash) {
      reasons.push({
        rule: "Severe Wash Trading",
        level: "REJECT",
        detail: `Wash trading detected at ${washPct}% (verdict: '${washCheck.fields.verdict}', reject threshold: ${config.wash.rejectPct}%).`,
        checkId: washCheck.id,
      });
    } else if (isReviewWash) {
      reasons.push({
        rule: "Suspicious Trading Patterns",
        level: "REVIEW",
        detail: `Elevated wash trading detected at ${washPct}% (verdict: '${washCheck.fields.verdict}').`,
        checkId: washCheck.id,
      });
    }
  }

  // 5. Social Bot Detection
  const socialCheck = checks.find((c) => c.intent === "SOCIAL_BOT_DETECTION_GENERAL");
  if (socialCheck && socialCheck.status === "done" && socialCheck.fields) {
    const botScore = Number(socialCheck.fields.bot_score || 0);
    const rawBotVerdict = String(socialCheck.fields.verdict || "").trim().toLowerCase();

    const isBot =
      botScore >= config.social.reviewScore ||
      config.social.reviewVerdicts.some((v) => rawBotVerdict.includes(v.toLowerCase()));

    if (isBot) {
      // Social never rejects alone, only reviews
      reasons.push({
        rule: "Artificial Social Following",
        level: "REVIEW",
        detail: `Social bot activity detected: verdict='${socialCheck.fields.verdict}', bot_score=${botScore} (threshold: ${config.social.reviewScore}).`,
        checkId: socialCheck.id,
      });
    }
  }

  // 6. Token Holder Breadth
  const holderCheck = checks.find((c) => c.intent === "TOKEN_HOLDER_COUNT_GENERAL");
  if (holderCheck && holderCheck.status === "done" && holderCheck.fields) {
    const holdersCount = Number(holderCheck.fields.holders_count || 0);
    if (holdersCount < config.holders.minReview) {
      reasons.push({
        rule: "Low Holder Count",
        level: "REVIEW",
        detail: `Holder count is ${holdersCount}, below the recommended minimum of ${config.holders.minReview} unique holders.`,
        checkId: holderCheck.id,
      });
    }
  }

  // 7. Code Review
  const codeCheck = checks.find((c) => c.intent === "CODE_REVIEW_GENERAL");
  if (codeCheck && codeCheck.status === "done" && codeCheck.fields) {
    const codeVerdict = String(codeCheck.fields.verdict || "").trim();
    if (
      config.codeReview.reviewVerdicts.some(
        (rv) => rv.toLowerCase() === codeVerdict.toLowerCase()
      )
    ) {
      reasons.push({
        rule: "Repository Changes Requested",
        level: "REVIEW",
        detail: `Code review verdict returned '${codeVerdict}'.`,
        checkId: codeCheck.id,
      });
    }
  }

  // Compute final verdict:
  // Any REJECT -> REJECT
  // Else any REVIEW (or missing required check) -> REVIEW
  // Else -> LIST (only if missingEvidence is empty!)
  let finalVerdict: Verdict = "LIST";
  if (reasons.some((r) => r.level === "REJECT")) {
    finalVerdict = "REJECT";
  } else if (reasons.some((r) => r.level === "REVIEW") || missingEvidence.length > 0) {
    finalVerdict = "REVIEW";
  }

  return {
    verdict: finalVerdict,
    reasons,
    missingEvidence,
  };
}
