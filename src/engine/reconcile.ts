import type { CheckResult, Confidence, SpendRecord } from "../telegraph/types.js";
import type { ITelegraphProvider } from "../telegraph/provider.js";
import type { AskOptions } from "../telegraph/escrow.js";
import { parseGenericCheckResult } from "../checks/registry.js";

export async function crossCheck(
  provider: ITelegraphProvider,
  intent: string,
  subject: string,
  askOptions: AskOptions
): Promise<CheckResult> {
  const topMiners = await provider.getTopMiners(intent, 2);

  // If fewer than 2 miners available, fall back to normal ask
  if (topMiners.length < 2) {
    const res = await provider.ask(askOptions);
    const parsed = parseGenericCheckResult("crosscheck_" + intent, intent, subject, res);
    return parsed;
  }

  // Ask miner 1 and miner 2 directly in parallel
  const [res1Result, res2Result] = await Promise.allSettled([
    provider.directAsk(topMiners[0], askOptions),
    provider.directAsk(topMiners[1], askOptions),
  ]);

  if (res1Result.status === "rejected" && res2Result.status === "rejected") {
    // Both failed
    return {
      id: "crosscheck_" + intent,
      intent,
      subject,
      status: "failed",
      fields: null,
      fieldStatus: {},
      confidence: "unverified",
      spend: [],
      error: `Cross-check miners both failed: ${res1Result.reason?.message || "error"}`,
    };
  }

  if (res1Result.status === "fulfilled" && res2Result.status === "rejected") {
    const parsed = parseGenericCheckResult(
      "crosscheck_" + intent,
      intent,
      subject,
      res1Result.value
    );
    parsed.confidence = "single_source";
    return parsed;
  }

  if (res1Result.status === "rejected" && res2Result.status === "fulfilled") {
    const parsed = parseGenericCheckResult(
      "crosscheck_" + intent,
      intent,
      subject,
      res2Result.value
    );
    parsed.confidence = "single_source";
    return parsed;
  }

  // Both fulfilled
  const r1 = (res1Result as PromiseFulfilledResult<any>).value;
  const r2 = (res2Result as PromiseFulfilledResult<any>).value;

  const parsed1 = parseGenericCheckResult("c1", intent, subject, r1);
  const parsed2 = parseGenericCheckResult("c2", intent, subject, r2);

  const combinedSpend: SpendRecord[] = [...parsed1.spend, ...parsed2.spend];

  let confidence: Confidence = "agreed";
  let winningResult = parsed1;

  if (intent === "SANCTIONS_SCREENING_MATCH_GENERAL") {
    const match1 = Boolean(parsed1.fields?.matched);
    const match2 = Boolean(parsed2.fields?.matched);

    if (match1 === match2) {
      confidence = "agreed";
      winningResult = parsed1;
    } else {
      confidence = "conflicting";
      // The more cautious result wins (matched = true is more cautious)
      winningResult = match1 ? parsed1 : parsed2;
    }
  } else if (intent === "SECURITY_REVIEW_GENERAL") {
    const v1 = String(parsed1.fields?.verdict || "").toLowerCase();
    const v2 = String(parsed2.fields?.verdict || "").toLowerCase();
    const count1 = Number(parsed1.fields?.vulnerability_count || 0);
    const count2 = Number(parsed2.fields?.vulnerability_count || 0);

    const isFail1 = v1.includes("fail") || v1.includes("reject") || v1.includes("critical") || count1 >= 5;
    const isFail2 = v2.includes("fail") || v2.includes("reject") || v2.includes("critical") || count2 >= 5;

    if (v1 === v2 && count1 === count2) {
      confidence = "agreed";
      winningResult = parsed1;
    } else if (isFail1 !== isFail2) {
      confidence = "conflicting";
      winningResult = isFail1 ? parsed1 : parsed2; // more cautious wins
    } else {
      confidence = "conflicting";
      // Pick higher vulnerability count
      winningResult = count1 >= count2 ? parsed1 : parsed2;
    }
  }

  return {
    ...winningResult,
    id: "crosscheck_" + intent,
    confidence,
    spend: combinedSpend,
  };
}
