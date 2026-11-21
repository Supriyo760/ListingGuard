# Troubleshooting Guide — ListingGuard & Telegraph

Common issues, node error codes, and how to resolve them when operating ListingGuard.

---

### 1. HTTP 402: "insufficient escrow"
* **Cause:** Your address does not have sufficient USDC deposited in the Telegraph Diamond escrow contract.
* **Resolution:**
  1. Check your balance: `GET https://devnode.telegraphprotocol.com/v1/ledger/account/<YOUR_ADDRESS>`
  2. If `available` is 0 or less than your budget, get test USDC from [https://anjoman.ai/dashboard/faucet](https://anjoman.ai/dashboard/faucet).
  3. Run `npm run deposit` to approve and deposit 5 USDC.

---

### 2. HTTP 402: "nonce already spent" or "expired timestamp"
* **Cause:** The signed EIP-191 payment authorization contained a previously used nonce or an expired `validBefore` timestamp.
* **Resolution:**
  * ListingGuard automatically generates a fresh `crypto.randomUUID()` on every attempt and keeps `validBefore` within 100 seconds of `now`.
  * Ensure your local system clock is synchronized via NTP.
  * The client retries automatically once with a newly signed nonce on transient 402 errors.

---

### 3. HTTP 402: "charge limit reached"
* **Cause:** Rapid consecutive queries within the same Sepolia block.
* **Resolution:**
  * The escrow client pauses for 4 seconds to wait for the next block before retrying.
  * In CLI scripts or backtests, keep concurrency <= 2 to avoid bursting.

---

### 4. HTTP 400: "invalid_params" or "schema validation error"
* **Cause:** Node parameters did not match the required schema for that Intent.
* **Resolution:**
  * Inspection: `GET https://devnode.telegraphprotocol.com/engine/v1/intents/{INTENT_NAME}`
  * Schema checks in `src/checks/registry.ts` validate parameters prior to dispatch. Note that 400 calls are **free** and never incur an escrow charge.

---

### 5. HTTP 503: "no_compatible_miner" or "could not route"
* **Cause:** Currently no miners are active or online for the specified Intent.
* **Resolution:**
  * ListingGuard gracefully records `status: "failed"` for that check and assigns confidence `unverified`.
  * The memo continues execution and flags the check under `missingEvidence` rather than crashing.
