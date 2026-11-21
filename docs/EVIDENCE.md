# Submission Evidence Pack — ListingGuard

This document records cryptographic evidence, verification trails, and reproducible artifacts for Telegraph Hackathon Season II judges.

---

### 1. Mandatory Submission Checklist
- [x] **Track:** Apps & Agents
- [x] **Mission:** Mission 01 — Exchange (Autonomous Listings Desk)
- [x] **Official Bounties Repo Starred:** `https://github.com/telegraphprotocol/bounties` (Starred by `@Supriyo760`)
- [x] **Testnet Escrow Contract:** `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b` (Diamond on Ethereum Sepolia)
- [x] **Testnet USDC Token:** `0xcc194e1a843B658526D0D5C431f670028582Ae17`
- [x] **Reproducible Without Proprietary State:** Yes (`npm install && npm test && npm run dev`)

---

### 2. Autonomous Purchase Verification Trail (Live Sepolia Testnet)
ListingGuard demonstrates genuine machine-to-machine micropayments via EIP-191 signatures:
* **Protocol Endpoint:** `POST https://devnode.telegraphprotocol.com/engine/v1/ask`
* **Authorization Scheme:** `escrow` (x402 version 2)
* **Payer Address:** `0x709D05a45Df8fc2619D807eeBE0fE3b5a2DB3148`
* **Deposit Tx (Sepolia):** [`0x71007f762e5b371d077212984c673c1dbc1b48ed411dcc794a503ad6cc86a94e`](https://sepolia.etherscan.io/tx/0x71007f762e5b371d077212984c673c1dbc1b48ed411dcc794a503ad6cc86a94e)
* **Approve Tx (Sepolia):** [`0xf73fff732bfbab473437aa36f21e3dfd0b7d2fe7510e3097618c01129d9024d2`](https://sepolia.etherscan.io/tx/0xf73fff732bfbab473437aa36f21e3dfd0b7d2fe7510e3097618c01129d9024d2)
* **Live Purchased Intent:** `TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL`
* **Serving Miner:** `PREFLIGHT Infrastructure Signals` (ID: `20260828` / `a1-preflight`)
* **Receipt Hash:** `0x5cce57c8e358ab05035446d6046879da92de0bbac29689a03523872580d14c1e`
* **Signal Hash:** `0x2b6f9c33ee49538fbbe464d282fcc912438c85895d80af7b09b77807d0479aee`
* **Epoch ID:** `34`
* **Cost:** `10000 uUSDC` ($0.01)
* **Receipt Proof Inspection:**
  ```http
  GET https://devnode.telegraphprotocol.com/v1/blocks/34/deliveries/0x5cce57c8e358ab05035446d6046879da92de0bbac29689a03523872580d14c1e
  ```
* **Signal Audit:**
  ```http
  GET https://devnode.telegraphprotocol.com/engine/v1/signal/0x2b6f9c33ee49538fbbe464d282fcc912438c85895d80af7b09b77807d0479aee
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
