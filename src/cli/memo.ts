import { loadEnv, loadVerdictConfig } from "../config.js";
import { LiveTelegraphProvider, MockTelegraphProvider } from "../telegraph/provider.js";
import { Desk } from "../engine/desk.js";
import { evaluateVerdict } from "../engine/verdict.js";
import {
  createAndSignMemo,
  renderMemoText,
  saveMemoToFile,
} from "../engine/memo.js";
import type { Application, DisclosedWallet } from "../telegraph/types.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith("-")) {
    console.log("Usage: npm run memo -- <tokenAddress> [options]");
    console.log("Options:");
    console.log("  --chain=<ethereum|polygon|arbitrum>   Default: ethereum");
    console.log("  --symbol=<string>                     e.g. GUARD");
    console.log("  --budget=<number>                     e.g. 1.0 (USD cap, default 1.0)");
    console.log("  --crosscheck                          Enable dual-miner cross checking");
    console.log("  --social=<handle>                     Project Twitter/X handle");
    console.log("  --repo=<url>                          GitHub repository URL");
    console.log("  --wallets=<label:0xAddr,...>          Disclosed team/treasury wallets");
    console.log("  --names=<Name1,Name2,...>             Core team names for sanctions screening");
    console.log("  --mock                                Use offline mock provider for testing");
    process.exit(1);
  }

  const tokenAddress = args[0];
  let chain: "ethereum" | "polygon" | "arbitrum" = "ethereum";
  let tokenSymbol: string | undefined;
  let budgetUsd = 1.0;
  let crosscheck = false;
  let socialHandle: string | undefined;
  let repoUrl: string | undefined;
  const disclosedWallets: DisclosedWallet[] = [];
  const teamNames: string[] = [];
  let useMock = false;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--chain=")) chain = a.slice(8) as any;
    else if (a.startsWith("--symbol=")) tokenSymbol = a.slice(9);
    else if (a.startsWith("--budget=")) budgetUsd = parseFloat(a.slice(9));
    else if (a === "--crosscheck") crosscheck = true;
    else if (a.startsWith("--social=")) socialHandle = a.slice(9);
    else if (a.startsWith("--repo=")) repoUrl = a.slice(7);
    else if (a === "--mock") useMock = true;
    else if (a.startsWith("--wallets=")) {
      const parts = a.slice(10).split(",");
      for (const p of parts) {
        const [label, addr] = p.split(":");
        if (label && addr) disclosedWallets.push({ label, address: addr });
      }
    } else if (a.startsWith("--names=")) {
      teamNames.push(...a.slice(8).split(",").map((s) => s.trim()).filter(Boolean));
    }
  }

  const application: Application = {
    chain,
    tokenAddress,
    tokenSymbol,
    disclosedWallets,
    teamNames,
    socialHandle,
    repoUrl,
  };

  const env = loadEnv();
  const verdictConfig = loadVerdictConfig();

  let provider;
  let privateKeyToUse = env.PRIVATE_KEY;

  if (useMock || !env.PRIVATE_KEY) {
    if (!env.PRIVATE_KEY && !useMock) {
      console.log("[Notice] No PRIVATE_KEY in .env — defaulting to MockTelegraphProvider.");
      useMock = true;
    }
    provider = new MockTelegraphProvider();
    // Default throwaway key for signing the memo in mock mode
    privateKeyToUse = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  } else {
    provider = new LiveTelegraphProvider(
      env.TELEGRAPH_NODE,
      env.PRIVATE_KEY as `0x${string}`
    );
  }

  console.log(`\n=======================================================`);
  console.log(` Starting ListingGuard Desk for: ${tokenAddress}`);
  console.log(` Provider : ${useMock ? "Offline Mock Provider" : "Live Telegraph Escrow"}`);
  console.log(` Budget   : $${budgetUsd.toFixed(2)} USD | Cross-check: ${crosscheck ? "ON" : "OFF"}`);
  console.log(`=======================================================\n`);

  const desk = new Desk(provider);

  desk.on("event", (evt) => {
    if (evt.type === "check_started") {
      console.log(`[>>] Checking: ${evt.checkId.padEnd(24)} (${evt.intent})`);
    } else if (evt.type === "check_done") {
      console.log(`[OK] Finished: ${evt.checkId.padEnd(24)} | Cost: $${(evt.costUsd || 0).toFixed(4)}`);
    } else if (evt.type === "check_failed") {
      console.log(`[!!] FAILED  : ${evt.checkId.padEnd(24)} | Reason: ${(evt.data as any)?.error}`);
    } else if (evt.type === "check_skipped") {
      console.log(`[--] Skipped : ${evt.checkId.padEnd(24)} | Reason: ${(evt.data as any)?.reason}`);
    }
  });

  const runResult = await desk.run(application, {
    budgetUsd,
    crosscheck,
    perAskBudgetMicro: verdictConfig.defaults.perAskBudgetMicro,
    deadlineMs: verdictConfig.defaults.deadlineMs,
  });

  const verdictResult = evaluateVerdict(application, runResult.checks, verdictConfig);

  const memo = await createAndSignMemo({
    application,
    checks: runResult.checks,
    verdict: verdictResult.verdict,
    reasons: verdictResult.reasons,
    missingEvidence: verdictResult.missingEvidence,
    budgetUsd: runResult.budgetUsd,
    spentUsd: runResult.totalSpentUsd,
    skipped: runResult.skipped,
    durationMs: runResult.durationMs,
    privateKey: privateKeyToUse as `0x${string}`,
  });

  const savedPath = saveMemoToFile(memo);
  const textOutput = renderMemoText(memo, Number((runResult.durationMs / 1000).toFixed(1)));

  console.log(textOutput);
  console.log(`Saved Memo JSON to: ${savedPath}\n`);
}

main().catch((err) => {
  console.error("Memo generation failed:", err);
  process.exit(1);
});
