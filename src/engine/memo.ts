import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { keccak256, toHex, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  Application,
  CheckResult,
  Memo,
  Verdict,
  Reason,
} from "../telegraph/types.js";

export const STATIC_LIMITATIONS = [
  "Concentration is computed strictly from disclosed wallets provided by the applicant, not exhaustive on-chain cluster analysis.",
  "Results are derived from judgment-class miner intents and subject to competitive evaluation, not absolute formal verification.",
  "All intelligence purchase micropayments were executed on Ethereum Sepolia testnet escrow.",
  "Telegraph queries are public on the protocol feed; no confidential data was transmitted.",
];

/**
 * Produces deterministic, canonical JSON with recursively sorted keys, compact spacing,
 * and standard UTF-8 escaping.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJson(item)).join(",") + "]";
  }

  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return (
    "{" +
    entries
      .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
      .join(",") +
    "}"
  );
}

export function computeContentHash(memoWithoutSignatures: Record<string, unknown>): `0x${string}` {
  const canonical = canonicalJson(memoWithoutSignatures);
  return keccak256(toHex(canonical));
}

export interface BuildMemoParams {
  application: Application;
  checks: CheckResult[];
  verdict: Verdict;
  reasons: Reason[];
  missingEvidence: string[];
  budgetUsd: number;
  spentUsd: number;
  skipped: string[];
  durationMs: number;
  privateKey: `0x${string}`;
}

export async function createAndSignMemo(params: BuildMemoParams): Promise<Memo> {
  const account = privateKeyToAccount(params.privateKey);
  const id = `memo_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const createdAt = new Date().toISOString();

  const signalHashes: string[] = [];
  const receiptHashes: string[] = [];

  for (const c of params.checks) {
    for (const sp of c.spend) {
      if (sp.signalHash && !signalHashes.includes(sp.signalHash)) {
        signalHashes.push(sp.signalHash);
      }
      if (sp.receiptHash && !receiptHashes.includes(sp.receiptHash)) {
        receiptHashes.push(sp.receiptHash);
      }
    }
  }

  const perCheckCost = params.checks.map((c) => ({
    checkId: c.id,
    usd: Number(c.spend.reduce((acc, s) => acc + s.costUsd, 0).toFixed(4)),
  }));

  const unsignedMemo = {
    version: 1 as const,
    id,
    createdAt,
    network: {
      payments: "ethereum-sepolia (testnet, escrow)" as const,
      data: `${params.application.chain} mainnet`,
    },
    application: params.application,
    checks: params.checks,
    verdict: params.verdict,
    reasons: params.reasons,
    missingEvidence: params.missingEvidence,
    cost: {
      budgetUsd: params.budgetUsd,
      spentUsd: params.spentUsd,
      perCheck: perCheckCost,
      skipped: params.skipped,
    },
    limitations: STATIC_LIMITATIONS,
    verification: {
      signalHashes,
      receiptHashes,
      howTo: [
        "Signal inspection: GET https://devnode.telegraphprotocol.com/engine/v1/signal/{signalHash}",
        "Escrow receipt delivery: GET https://devnode.telegraphprotocol.com/v1/blocks/{epochId}/deliveries/{receiptHash}",
        "Memo authenticity verify: npm run verify -- data/memos/{id}.json",
      ],
    },
    signer: account.address,
  };

  const contentHash = computeContentHash(unsignedMemo);

  // Sign EIP-191 personal_sign over the contentHash string
  const signature = await account.signMessage({
    message: contentHash,
  });

  const fullMemo: Memo = {
    ...unsignedMemo,
    contentHash,
    signature,
  };

  return fullMemo;
}

export async function verifyMemo(memo: Memo): Promise<{
  valid: boolean;
  signer: string;
  expectedSigner: string;
  contentHashMatches: boolean;
  signatureMatches: boolean;
  error?: string;
}> {
  try {
    const { signature, contentHash, signer, ...unsignedPart } = memo;
    const computedHash = computeContentHash({ ...unsignedPart, signer });

    const contentHashMatches = computedHash === contentHash;

    const recovered = await recoverMessageAddress({
      message: contentHash,
      signature: signature as `0x${string}`,
    });

    const signatureMatches =
      recovered.toLowerCase() === signer.toLowerCase();

    return {
      valid: contentHashMatches && signatureMatches,
      signer: recovered,
      expectedSigner: signer,
      contentHashMatches,
      signatureMatches,
    };
  } catch (err: any) {
    return {
      valid: false,
      signer: "0x0",
      expectedSigner: memo.signer || "0x0",
      contentHashMatches: false,
      signatureMatches: false,
      error: err.message,
    };
  }
}

export function saveMemoToFile(memo: Memo, dir = "data/memos"): string {
  const targetDir = path.resolve(process.cwd(), dir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const filePath = path.join(targetDir, `${memo.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(memo, null, 2), "utf-8");
  return filePath;
}

export function renderMemoText(memo: Memo, durationSeconds?: number): string {
  const line = "=".repeat(78);
  const divider = "-".repeat(78);

  const verdictBadge =
    memo.verdict === "LIST"
      ? "[ VERDICT: LIST - APPROVED ]"
      : memo.verdict === "REVIEW"
      ? "[ VERDICT: REVIEW - CAUTION ]"
      : "[ VERDICT: REJECT - HIGH RISK ]";

  const totalPaidCalls = memo.checks.reduce((acc, c) => acc + c.spend.length, 0);
  const timeTaken = durationSeconds ?? 90;

  let text = `\n${line}\n`;
  text += `   LISTINGGUARD - TOKEN LISTING RISK MEMO\n`;
  text += `   Memo ID: ${memo.id} | Date: ${memo.createdAt}\n`;
  text += `${line}\n\n`;

  text += `APPLICATION:\n`;
  text += `  Target Token : ${memo.application.tokenAddress} (${memo.application.chain})\n`;
  if (memo.application.tokenSymbol) text += `  Symbol       : ${memo.application.tokenSymbol}\n`;
  if (memo.application.socialHandle) text += `  Social Handle: @${memo.application.socialHandle}\n`;
  if (memo.application.repoUrl) text += `  Repository   : ${memo.application.repoUrl}\n`;
  text += `  Disclosed Wallets: ${memo.application.disclosedWallets.length}\n`;
  text += `  Screened Team    : ${memo.application.teamNames.length}\n\n`;

  text += `${divider}\n`;
  text += `DECISION: ${verdictBadge}\n`;
  text += `${divider}\n`;

  if (memo.reasons.length > 0) {
    text += `KEY FINDINGS & REASONS:\n`;
    for (const r of memo.reasons) {
      const tag = r.level === "REJECT" ? " [!] REJECT" : r.level === "REVIEW" ? " [?] REVIEW" : " [i] INFO";
      text += `  ${tag} ${r.rule}: ${r.detail}\n`;
    }
    text += "\n";
  }

  if (memo.missingEvidence.length > 0) {
    text += `MISSING / UNVERIFIED EVIDENCE:\n`;
    for (const me of memo.missingEvidence) {
      text += `  [-] Required check incomplete: ${me}\n`;
    }
    text += "\n";
  }

  text += `CHECK BREAKDOWN:\n`;
  for (const c of memo.checks) {
    const cost = c.spend.reduce((acc, s) => acc + s.costUsd, 0);
    const miner = c.spend[0]?.minerName || c.spend[0]?.minerId || "unknown";
    text += `  • [${c.status.toUpperCase()}] ${c.id.padEnd(20)} | Confidence: ${c.confidence.padEnd(13)} | Miner: ${miner} | $${cost.toFixed(4)}\n`;
  }
  text += "\n";

  text += `CRYPTOGRAPHIC PROOF & ATTESTATION:\n`;
  text += `  Signer Address : ${memo.signer}\n`;
  text += `  Content Hash   : ${memo.contentHash}\n`;
  text += `  Signature      : ${memo.signature.slice(0, 32)}...${memo.signature.slice(-16)}\n`;
  text += `  Receipt Hashes : ${memo.verification.receiptHashes.length} delivery proofs recorded\n\n`;

  text += `${line}\n`;
  text += `COST LINE: Total spend $${memo.cost.spentUsd.toFixed(4)} across ${totalPaidCalls} paid calls in ${timeTaken} seconds\n`;
  text += `${line}\n`;

  return text;
}
