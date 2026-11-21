import fs from "node:fs";
import path from "node:path";
import { verifyMemo } from "../engine/memo.js";
import type { Memo } from "../telegraph/types.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: npm run verify -- <path/to/memo.json>");
    console.log("Example: npm run verify -- data/memos/memo_1732238400000_abc123.json");
    process.exit(1);
  }

  const memoPath = path.resolve(process.cwd(), args[0]);
  if (!fs.existsSync(memoPath)) {
    console.error(`Error: File not found at ${memoPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(memoPath, "utf-8");
  let memo: Memo;
  try {
    memo = JSON.parse(raw);
  } catch (err: any) {
    console.error(`Error: Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  console.log(`\n=== Verifying Listing Risk Memo: ${memo.id || args[0]} ===`);
  console.log(`Reported Signer : ${memo.signer}`);
  console.log(`Content Hash    : ${memo.contentHash}`);
  console.log(`Target Token    : ${memo.application?.tokenAddress} (${memo.application?.chain})`);
  console.log(`Verdict Stamped : ${memo.verdict}`);

  const result = await verifyMemo(memo);

  console.log("\n--- VERIFICATION AUDIT ---");
  console.log(`• Canonical Content Hash Matches : ${result.contentHashMatches ? "YES (Integrity Valid)" : "FAILED (Content was tampered!)"}`);
  console.log(`• EIP-191 Signature Matches      : ${result.signatureMatches ? "YES (Authentic Signer)" : "FAILED (Signature does not match signer!)"}`);
  console.log(`• Recovered Signer Address       : ${result.signer}`);

  if (result.valid) {
    console.log("\n>>> [PASSED] MEMO IS AUTHENTIC, UNALTERED, AND VERIFIED <<<\n");
    process.exit(0);
  } else {
    console.error(`\n>>> [FAILED] INVALID OR TAMPERED MEMO! <<<\nReason: ${result.error || "Hash/Signature mismatch"}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
