# Developer Tutorial: Buy Verified Intelligence from Telegraph in 20 Lines

This guide explains how to query and pay for intelligence from Telegraph's competitive miner network using the **Escrow Payment Scheme** (EIP-191 signatures on Ethereum Sepolia).

---

### The Escrow Lifecycle
Rather than requiring complex multi-step ERC-20 allowances on every HTTP call, Telegraph's escrow model lets an agent deposit USDC into the Diamond contract once, then authorize micropayments via signed HTTP headers.

```
Client                              Telegraph DevNode
  |                                         |
  |--- 1. POST /engine/v1/ask ------------->| (No payment header)
  |<-- 2. 402 Payment Required -------------| (Contains EIP-191 template & payTo)
  |                                         |
  | [Sign template verbatim with wallet]   |
  |                                         |
  |--- 3. POST /engine/v1/ask ------------->| (Carrying X-PAYMENT header)
  |<-- 4. 200 OK + Result + Receipt --------| (Miner response + X-PAYMENT-RESPONSE)
```

---

### 20-Line Minimal Implementation

```typescript
import { privateKeyToAccount } from "viem/accounts";
import crypto from "node:crypto";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const body = JSON.stringify({ intent: "SECURITY_REVIEW_GENERAL", params: { target: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" } });

// Step 1: Request 402 challenge
const ch = await fetch("https://devnode.telegraphprotocol.com/engine/v1/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body });
const challenge = await ch.json();
const escrow = challenge.accepts.find((a: any) => a.scheme === "escrow");

// Step 2: Fill template & sign with EIP-191 personal_sign
const now = Math.floor(Date.now() / 1000);
const auth = { from: account.address.toLowerCase(), to: escrow.payTo, value: escrow.extra.message.match(/Amount:\s*(\d+)\s*uUSDC/i)![1], validAfter: String(now - 5), validBefore: String(now + 100), nonce: crypto.randomUUID() };
const message = escrow.extra.message.replace("{from}", auth.from).replace("{nonce}", auth.nonce).replace("{validAfter}", auth.validAfter).replace("{validBefore}", auth.validBefore);
const signature = await account.signMessage({ message });

// Step 3: Base64 encode payment header & dispatch
const payment = Buffer.from(JSON.stringify({ x402Version: 2, scheme: "escrow", network: escrow.network, payload: { signature, authorization: auth } })).toString("base64");
const res = await fetch("https://devnode.telegraphprotocol.com/engine/v1/ask", { method: "POST", headers: { "Content-Type": "application/json", "X-PAYMENT": payment }, body });
const { result, cost_usd } = await res.json();

console.log(`Audited in seconds for $${cost_usd}:`, result);
```

---

### Key Takeaways
1. **Header Name:** Telegraph uses `X-PAYMENT` (not `PAYMENT-SIGNATURE`).
2. **Lowercase Address:** The `from` field in the authorization must be lowercase.
3. **Fresh Nonce:** Always generate a random nonce (`crypto.randomUUID()`) on every attempt.
4. **Verbatim Template:** Keep exact spacing and newlines from `extra.message` when replacing tokens.
