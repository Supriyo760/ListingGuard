# Submission Evidence Pack — ListingGuard

This document records cryptographic evidence, verification trails, and reproducible artifacts for Telegraph Hackathon Season II judges.

---

### 1. Mandatory Submission Checklist
- [x] **Track:** Apps & Agents
- [x] **Mission:** Mission 01 — Exchange (Autonomous Listings Desk)
- [x] **Official Bounties Repo Starred:** `https://github.com/telegraphprotocol/bounties`
- [x] **Testnet Escrow Contract:** `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b` (Diamond on Ethereum Sepolia)
- [x] **Testnet USDC Token:** `0xcc194e1a843B658526D0D5C431f670028582Ae17`
- [x] **Reproducible Without Proprietary State:** Yes (`npm install && npm test && npm run dev`)

---

### 2. Autonomous Purchase Verification Trail
ListingGuard demonstrates genuine machine-to-machine micropayments via EIP-191 signatures:
* **Protocol Endpoint:** `POST https://devnode.telegraphprotocol.com/engine/v1/ask`
* **Authorization Scheme:** `escrow` (x402 version 2)
* **Receipt Proof Inspection:**
  ```http
  GET https://devnode.telegraphprotocol.com/v1/blocks/{epochId}/deliveries/{receiptHash}
  ```
* **Signal Audit:**
  ```http
  GET https://devnode.telegraphprotocol.com/engine/v1/signal/{signalHash}
  ```

---

### 3. Backtest Metrics (Verified Mainnet Cases)
* **Dataset:** `data/backtest.json` (Real tokens: Circle USDC, Canonical WETH, Uniswap UNI, Chainlink LINK, Aave AAVE, AnubisDAO, Eminence, Cream Finance)
* **Accuracy:** **100.0%**
* **False Negative Rate (Bad -> List):** **0.0%** (zero dangerous passes)
* **Mean Cost Per Memo:** **$0.0588 USD**
* **Cost Per Correct Verdict:** **$0.0588 USD**

---

### 4. Verification CLI Audit
Tamper detection is baked into the canonical JSON hashing engine:
```bash
npm run verify -- data/memos/memo_1795292268417_e2fe78f3.json
```
Output:
```
=== Verifying Listing Risk Memo: memo_1795292268417_e2fe78f3 ===
Reported Signer : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Content Hash    : 0x7e300d504993018720d03b43fc39750486bc8af7e0c913e035dde6b56c3cb075
• Canonical Content Hash Matches : YES (Integrity Valid)
• EIP-191 Signature Matches      : YES (Authentic Signer)
>>> [PASSED] MEMO IS AUTHENTIC, UNALTERED, AND VERIFIED <<<
```
