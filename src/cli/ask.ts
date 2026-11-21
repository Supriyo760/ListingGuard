import { loadEnv } from "../config.js";
import { EscrowClient } from "../telegraph/escrow.js";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: npm run ask -- <intent> [param1=value1] [param2=value2]...");
    console.log("Example: npm run ask -- TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL token=\"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 on ethereum\"");
    process.exit(1);
  }

  const intent = args[0];
  const params: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const eqIdx = args[i].indexOf("=");
    if (eqIdx !== -1) {
      const k = args[i].slice(0, eqIdx);
      const v = args[i].slice(eqIdx + 1);
      params[k] = v;
    }
  }

  const env = loadEnv();
  if (!env.PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY must be set in .env to perform paid asks.");
    process.exit(1);
  }

  console.log(`\n=== Telegraph Escrow Ask: ${intent} ===`);
  console.log("Params:", JSON.stringify(params, null, 2));

  const client = new EscrowClient({
    nodeUrl: env.TELEGRAPH_NODE,
    privateKey: env.PRIVATE_KEY as `0x${string}`,
  });

  console.log(`Payer Address: ${client.address}`);
  console.log("Sending challenge request & signing escrow authorization...");

  const startTime = Date.now();
  const res = await client.ask({
    intent,
    params: Object.keys(params).length > 0 ? params : undefined,
    maxBudgetMicro: 30000,
  });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n[Status: ${res.status}] Responded in ${duration}s`);
  console.log("\n--- RESULT ---");
  console.log(JSON.stringify(res.data, null, 2));

  if (res.receipt) {
    console.log("\n--- PAYMENT RECEIPT ---");
    console.log(JSON.stringify(res.receipt, null, 2));
  }
}

main().catch((err) => {
  console.error("\nAsk failed:", err);
  process.exit(1);
});
