# PROJECT_CONTEXT — everything learned so far

Written 22 Nov 2026. Source: the planning conversation plus pages/outputs the team supplied.
Items marked **[UNVERIFIED]** have not been confirmed against live behaviour.

## 1. The event
- **Telegraph Hackathon Season II**, https://hackathon.telegraphprotocol.com — 1 Nov → **1 Dec 2026, 23:59 UTC** (hard deadline).
- Prize pool $10,000 ($7,000 main competition + $3,000 reserved for separate December challenges).
  Apps & Agents track: $3,000 = 8 "verified delivery" awards of $225 + excellence awards $700 / $350 / $150.
- Three tracks: Apps & Agents (ours), Miners/Providers, Evaluators. One registration covers all.
- 14 Nov integration milestone was a progress check only (not a disqualifier). 20 Nov community showcase has passed.
  Judging 2–8 Dec (planned); provisional results from 9 Dec; 72 h appeal window.
- Team: the user plus AI tooling; working on Windows, in India. **[team size UNVERIFIED]**

## 2. Rules that shape the build (Apps & Agents)
- Must show **at least one genuinely autonomous machine-to-machine purchase** through the supported Telegraph flow,
  then use the intelligence for a meaningful task. Testnet qualifies.
- "Mission acceptance": a reviewer must be able to (1) run it with a new realistic input, (2) check the result,
  (3) inspect the real Telegraph request + transaction/accounting evidence, (4) test a reasonable failure case,
  (5) reproduce it from our instructions.
- Must **star** github.com/telegraphprotocol/bounties and give the GitHub username in the submission.
- Posts promoting the entry must **disclose hackathon participation and the prize incentive**; tag @Telegraphprotoc on X.
- No fake receipts, manufactured adoption, self-dealing presented as external demand, bought engagement.
- Be explicit about network (testnet vs production) and what was actually verified.

### Scoring (100; need >=70 and >=24/35 technical, plus a working purchase)
| Category | Pts |
|---|---|
| Technical quality & mainnet readiness | 35 (min 24) |
| Commercial viability (clear buyer, real problem, sensible costs, adoption path) | 25 |
| Organic growth / education / developer activation | 20 (content 5, ease of adoption 5, distribution 5, community activation 5) |
| Independent adoption & retention | 10 |
| Telegraph integration & usage quality | 5 |
| Reproducibility, demo/tutorial, verifiable proof | 5 |

Growth points need: >=3 original public updates on separate dates, a tutorial/walkthrough, a runnable example, and
evidence that an independent developer reproduced/tested it (issue, PR, report beats likes/stars).

### Submission (by the deadline, via the H2 website)
Project details (+ GitHub username that starred the repo) · 2–5 min demo video · how-to-run steps · evidence
(receipts, requests, tests) · short public summary with links to updates/tutorial/independent testing · showcase
permissions · five short commercial answers (who is it for, what does it improve, what does it do today,
why adopt, how to try). Demo flow: problem → Telegraph request → intelligence + provider evidence → observed cost →
completed result → how to try it.

## 3. Mission chosen
**Mission 01 — Exchange** ("autonomous listings desk"): listing reviews take weeks of analyst time; the desk buys
contract audit, contributor authenticity, holder concentration and sanctions exposure in parallel and returns a
**signed listing risk memo with a verification hash and a cost line**. Target: a few dollars and ~90 seconds vs weeks.
Example buyers named (not affiliated): Kraken, Gate.io, Binance. Optional extension: Mission 14 (Web3/DeFi) "pre-trade" mode.
Many teams may build the example as written, so we differentiate (see section 6).

## 4. How Telegraph/Anjoman works (docs read: introduction, start-here, intent-schema, x402, escrow, engine-ask)
- Telegraph ranks competing "miners" per **Intent** (task). Anjoman is the product/API on top.
- Node (testnet): `https://devnode.telegraphprotocol.com`. Engine: `POST /engine/v1/ask`.
- Request forms: `{query}` | `{intent, params}` (validated *before* payment; free if invalid) | both.
  Direct: `POST /engine/v1/ask/{minerId}` (no fallback, no budget).
- `max_budget_usdc` (µUSDC, min 10000 = 1 call, **max 260000** on testnet) makes a **multi-miner ask**: if the first
  answer misses fields, next-ranked miners are asked; reply has `fulfillment` {status complete|partial|unverifiable|
  unavailable, provenance per field, payments[{miner,intent,amount_uusdc,receipt_hash}], stopped}.
  `deadline_ms` allowed 2000–60000.
- Price: ~$0.01 per miner floor × demand multiplier. Response fields: miner_id, miner_name, result (intent-shaped),
  result_shape, field_status (ok|missing|rejected|unavailable), input, cost_usd, duration_ms, intent, signal_hash.
- **Payment rails:** x402 `exact` (EIP-712/3009 via JS libs @x402/*) or **escrow** (chosen): fund the Diamond once
  (`approve` + `depositUSDC`), then each call carries an EIP-191 `personal_sign` authorization in header `X-PAYMENT`.
  Receipt comes back in `X-PAYMENT-RESPONSE` (escrow) — has `receipt_hash`, `epoch_id`, no `tx_hash`.
  Auditable later at `GET /v1/blocks/{epochId}/deliveries/{receiptHash}` (up to ~1 h after the call on testnet).
- `GET /engine/v1/signal/{signal_hash}` returns the payload so the call can be independently re-hashed (keccak256 of
  compact, key-sorted JSON; wallet lowercase; <,>,& escaped as \u003c etc.).
- A failed request (miner down/timeout) is **not billed**. A 200 with an error inside the answer **is** billed.
- Requests are **public** (Daemon feed shows the question and payer wallet).
- Rate limit: 60 new questions/min per client; an identical question within 3 min is not rate-limited.
- Discovery (free): `GET /engine/v1/intents`, `/engine/v1/intents/{INTENT}`, `/engine/v1/intents/{INTENT}/miners`,
  `/api/miners?intent=`, `/leaderboard/miners`, `/v1/ledger/account/{address}`.
- Test funds: Sepolia ETH (any faucet) + test USDC `0xcc194e1a843B658526D0D5C431f670028582Ae17` via
  https://anjoman.ai/dashboard/faucet. Diamond (escrow) `0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b`
  (docs say the previous Diamond changed — re-check "Addresses & Parameters" if a deposit reverts).
- Docs: https://anjoman.ai/docs/introduction · /docs/using/consume-intelligence · /using/intent-schema ·
  /using/engine-ask · /using/x402-inference · /using/escrow-inference · /protocol/addresses-and-params · /using/mcp-server

## 5. Live-node findings (from the user's PowerShell runs, 22 Nov 2026)
- 136 intents. The **bare names on the mission page have 0 miners**; live supply is under **`*_GENERAL`** names:
  SMART_CONTRACT_AUDIT_GENERAL (19 miners) · ONCHAIN_METRIC_VERIFY_GENERAL (45) · SANCTIONS_SCREENING_MATCH_GENERAL (29)
  · SOCIAL_BOT_DETECTION_GENERAL (16) · CODE_REVIEW_GENERAL (17). Also live: SECURITY_REVIEW_GENERAL (34),
  TOKEN_HOLDER_COUNT_GENERAL (21), TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL (26), WALLET_BALANCE_CHECK_GENERAL (22),
  WASH_TRADING_DETECTION_GENERAL (17), ONCHAIN_TX_LOOKUP_GENERAL (30), TRANSACTION_RISK_GENERAL, FRAUD_RISK_GENERAL,
  URL_SAFE_GENERAL, TWITTER_SEARCH_GENERAL, FACT_CHECK_GENERAL, CRYPTO_PRICE_USD (56).
- Schemas (typed params → result fields):
  - SECURITY_REVIEW_GENERAL: `target` → verdict(enum), vulnerability_count, issues[list], summary
  - SMART_CONTRACT_AUDIT_GENERAL: **no published schema** (query-only) — ask in Discord; treat as experimental
  - TOKEN_HOLDER_COUNT_GENERAL: `token`, `chain` → token, chain, holders_count, token_symbol
  - TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL: `token` ("symbol or contract address, and its chain") → total_supply
  - WALLET_BALANCE_CHECK_GENERAL: `address`, `chain`, `token?` → address, chain, balance, token_symbol, as_of
  - SANCTIONS_SCREENING_MATCH_GENERAL: `name` → name, matched(bool), matches[], lists[], match_score(0–1)
  - SOCIAL_BOT_DETECTION_GENERAL: `account` → account, verdict(bot|likely_bot|inconclusive|likely_human|human), bot_score, signals[]
  - WASH_TRADING_DETECTION_GENERAL: `subject` → subject, verdict(enum), wash_volume_pct, signals[], summary
  - CODE_REVIEW_GENERAL: `code` (code or link) → verdict(Approve|Request changes|Comment), findings[], summary
  - ONCHAIN_METRIC_VERIFY(_GENERAL): `address`,`block`,`chain`(ethereum|polygon|arbitrum),`metric`(balance|tx_count) —
    native coin only. **Not used.**
- Miners read **real chains** (Ethereum/Polygon/Arbitrum mainnets); payment is on Sepolia testnet.
  So the backtest must use **real mainnet tokens**, not our own Sepolia test tokens. **[miner coverage of any given token UNVERIFIED]**
- No Intent lists top holders, so "holder concentration" is computed from **disclosed wallets** (balance ÷ total supply)
  plus holders_count as a breadth signal. State this limitation plainly.
- Class labels from the node differ from the website (node says "judgment" for several). Irrelevant to the build.

## 6. Decisions and why
1. **Product: ListingGuard** — Mission 01 desk. Clear buyer, real problem, demonstrable cost line, verifiable receipts.
2. **TypeScript, not Rust.** Official examples/libs are TS; judges reward easy adoption/reproducibility; workload is
   I/O-bound; ~9 days left. (User said Rust was a preference, not a requirement.)
3. **Escrow payment, not x402 `exact`.** No SDK needed (EIP-191 sign), no facilitator, ideal for many parallel asks.
4. **Differentiators vs. the example build:** (a) per-check typed results with explicit confidence and failure handling;
   (b) optional cross-check of two named miners for high-stakes checks; (c) budget cap + cost per memo;
   (d) signed memo with per-check receipt/signal verification commands; (e) **backtest** on real tokens with accuracy and
   cost-per-correct-verdict; (f) strong README/tutorial + 3 public updates (20 growth points).
5. Out of scope: seller/miner mode, Mission 03 (needs mainnet), ONCHAIN_METRIC_VERIFY, any database.

## 7. Product in plain words
**Problem.** A crypto exchange lists new tokens. Bad listings (rugs, honeypots, sanctioned teams, fake communities, wash volume)
cost customers money and create legal exposure. Reviewing a listing today takes analysts days to weeks, mixes many vendors,
and leaves no verifiable record of who said what or what it cost.

**What we build.** ListingGuard: paste a token + the applicant's disclosed wallets/team/social/repo → the agent buys independent
checks through Telegraph in parallel, reconciles them, and returns a **signed Listing Risk Memo** (List / Review / Reject) with
reasons, confidence per finding, receipts per check, and a **cost line**.

**Why Telegraph.** Intelligence is bought from miners ranked by measured performance, paid per request, with receipts —
so every decision is attributable and priced.

## 8. Status at time of writing / open items
- Done: research, mission + stack decision, live-node schema discovery.
- Unknown/unverified: registered? repo starred? Sepolia wallet funded? escrow deposited? first paid ask done? Node >= 20?
- To resolve with the first paid ask: exact `token` string format for supply/holder Intents; whether `max_budget_usdc` works with
  `intent+params`; the real `verdict` enum values for SECURITY_REVIEW and WASH_TRADING; mainnet token coverage by miners.
- Ask in Discord: SMART_CONTRACT_AUDIT_GENERAL schema; whether `_GENERAL` is the intended Intent family for Mission 01.
- Public updates: need 3 on separate dates (draft templates in docs/PLAN.md).
