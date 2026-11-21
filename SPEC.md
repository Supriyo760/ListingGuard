# SPEC — ListingGuard

Precedence: live node behaviour > this spec > PROJECT_CONTEXT. If a live response differs, save a redacted copy in
`fixtures/`, update this file, then continue.

## 1. Repository layout
```
listingguard/
  AGENTS.md  .env.example  .gitignore  README.md
  config/verdict.config.json
  data/backtest.json            # labelled tokens (see data/backtest.template.json)
  data/memos/                   # generated, git-ignored
  fixtures/                     # redacted real node responses for tests
  src/
    config.ts                   # env + verdict config loading (zod)
    telegraph/
      escrow.ts                 # signing + ask() with fresh nonce, retries
      discovery.ts              # intents, miners, leaderboard, ledger balance
      types.ts                  # zod schemas for node responses
      provider.ts               # Provider interface + LiveProvider + MockProvider
    checks/
      registry.ts               # list of checks -> intent + param builder + parser
      security.ts holders.ts sanctions.ts social.ts wash.ts codeReview.ts audit.ts
    engine/
      desk.ts                   # runs checks in parallel, budget cap, timeouts
      reconcile.ts              # confidence, cross-check
      verdict.ts                # rules -> Verdict + reasons
      memo.ts                   # build, canonical JSON, sign, verify
    server.ts                   # hono app: /api/*, SSE, static web/
    cli/ deposit.ts ask.ts memo.ts backtest.ts verify.ts
  web/index.html
  test/                         # vitest
```

## 2. Inputs
```ts
type Chain = "ethereum" | "polygon" | "arbitrum";
interface Application {
  chain: Chain;
  tokenAddress: string;              // 0x… contract
  tokenSymbol?: string;
  disclosedWallets: { label: string; address: string }[]; // team/treasury/insiders
  teamNames: string[];               // people/entities to sanction-screen
  socialHandle?: string;             // project X/Twitter handle
  repoUrl?: string;                  // GitHub repo/PR link
}
interface RunOptions { budgetUsd: number /* per memo cap */; crosscheck: boolean; perAskBudgetMicro: number /* default 30000 */ }
```
Validate with zod (address regex, chain enum). Never accept private data.

## 3. Checks → Intents (use the `_GENERAL` names; verify `miner_count > 0` at startup)
| Check id | Intent | Params | Used result fields | Required? |
|---|---|---|---|---|
| security | SECURITY_REVIEW_GENERAL | `{target: tokenAddress}` | verdict, vulnerability_count, issues, summary | yes |
| holderCount | TOKEN_HOLDER_COUNT_GENERAL | `{token: tokenAddress, chain}` | holders_count, token_symbol | yes |
| supply | TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL | `{token: "<addr> on <chain>"}` (confirm format) | total_supply | yes |
| walletBalance (xN) | WALLET_BALANCE_CHECK_GENERAL | `{address, chain, token: tokenAddress}` per disclosed wallet | balance, token_symbol, as_of | if wallets given |
| sanctions (xN) | SANCTIONS_SCREENING_MATCH_GENERAL | `{name}` per team name | matched, matches, lists, match_score | if names given |
| social | SOCIAL_BOT_DETECTION_GENERAL | `{account: socialHandle}` | verdict, bot_score, signals | if handle given |
| wash | WASH_TRADING_DETECTION_GENERAL | `{subject: tokenAddress}` | verdict, wash_volume_pct, signals, summary | yes |
| codeReview | CODE_REVIEW_GENERAL | `{code: repoUrl}` | verdict, findings, summary | if repo given (optional) |
| audit | SMART_CONTRACT_AUDIT_GENERAL | **no schema** → `{query: "..."}` only | raw | experimental, off by default |

Each check returns:
```ts
type FieldStatus = "ok" | "missing" | "rejected" | "unavailable";
interface CheckResult {
  id: string; intent: string; subject: string;           // e.g. wallet label / name checked
  status: "done" | "failed" | "skipped";
  fields: Record<string, unknown> | null;                  // node `result`
  fieldStatus: Record<string, FieldStatus>;
  fulfillment?: "complete" | "partial" | "unverifiable" | "unavailable";
  confidence: "agreed" | "single_source" | "conflicting" | "unverified";
  spend: { minerId: string; minerName?: string; costUsd: number; receiptHash?: string; signalHash?: string; durationMs?: number }[];
  error?: string;                                          // never throw out of a check
}
```

## 4. Telegraph client

### 4.1 Discovery (free, no payment)
- `GET {NODE}/engine/v1/intents` → check each required intent has `miner_count>0`; if not, mark its check `skipped` with reason.
- `GET {NODE}/engine/v1/intents/{INTENT}` → request/response schema (cache; compare with this spec at startup, warn on drift).
- `GET {NODE}/engine/v1/intents/{INTENT}/miners` → ids/slugs (for cross-check). `GET {NODE}/leaderboard/miners` → ranks.
- `GET {NODE}/v1/ledger/account/{address}` → `available` (µUSDC string). Refuse to start a memo if available < budget.

### 4.2 Funding (one-time) — `npm run deposit`
`USDC.approve(DIAMOND, amount)` then `Diamond.depositUSDC(amount)` with viem on Sepolia (6 decimals). Default 5 USDC.
ABI fragments: `approve(address,uint256) returns (bool)`, `depositUSDC(uint256)`.

### 4.3 Paid ask via escrow (reference implementation, adapted from the official docs)
Flow per ask: (1) POST body with no payment → 402 JSON; (2) find `accepts[]` entry with `scheme==="escrow"`;
(3) fill `extra.message` template; (4) `personal_sign`; (5) re-POST the **identical body** with `X-PAYMENT`.
```ts
export async function askIntent(i: { intent: string; params?: object; query?: string; maxBudgetMicro?: number; deadlineMs?: number }) {
  const body = JSON.stringify({ intent: i.intent, params: i.params, query: i.query,
                                max_budget_usdc: i.maxBudgetMicro, deadline_ms: i.deadlineMs });
  const headers = { "Content-Type": "application/json" };
  const ch = await fetch(`${NODE}/engine/v1/ask`, { method: "POST", headers, body });
  if (ch.status === 400) throw new InvalidParams(await ch.json());           // free; fix params, don't retry
  const challenge = await ch.json();
  const escrow = challenge.accepts?.find((a: any) => a.scheme === "escrow");
  if (!escrow) throw new Error("node does not accept escrow");
  const now = Math.floor(Date.now() / 1000);
  const auth = {
    from: account.address.toLowerCase(), to: escrow.payTo,
    value: escrow.extra.message.match(/Amount:\s*(\d+)\s*uUSDC/)![1],
    validAfter: String(now - 5), validBefore: String(now + 100), nonce: crypto.randomUUID(),
  };
  const message = escrow.extra.message.replace("{from}", auth.from).replace("{nonce}", auth.nonce)
    .replace("{validAfter}", auth.validAfter).replace("{validBefore}", auth.validBefore);
  const signature = await wallet.signMessage({ message });
  const payment = Buffer.from(JSON.stringify({ x402Version: 2, scheme: "escrow", network: escrow.network,
                    payload: { signature, authorization: auth } })).toString("base64");
  const res = await fetch(`${NODE}/engine/v1/ask`, { method: "POST", headers: { ...headers, "X-PAYMENT": payment }, body });
  // 402 => read `reason`; retry ONCE with a fresh nonce for nonce/expiry/recording errors; never retry "insufficient escrow"
  const receiptHeader = res.headers.get("X-PAYMENT-RESPONSE");
  return { status: res.status, json: await res.json(), receipt: receiptHeader ? JSON.parse(Buffer.from(receiptHeader, "base64").toString()) : null };
}
```
Gotchas (from the docs): header is `X-PAYMENT`; `from` lowercase; window <= 2 min; nonce unique per attempt; amount read from the
template's `Amount:` line (a budgeted ask quotes its budget); `resource`/`Network` are inside the signed text so sign verbatim;
a malformed body is refused *after* payment acceptance (nonce spent) so validate params locally first with zod.
Direct ask (cross-check): same flow against `/engine/v1/ask/{minerId}`; the template then reads `Resource: /v1/ask/{minerId}`.

### 4.4 Parsing a response
`result`, `result_shape` (`intent`|`raw`), `field_status`, `miner_id`, `miner_name`, `cost_usd`, `duration_ms`, `signal_hash`,
`fulfillment` (maybe absent). If `result_shape==="raw"` or any needed field `!== "ok"` → that field is **unverified**.
Receipts: for budgeted asks use `fulfillment.payments[].receipt_hash`; else header `X-PAYMENT-RESPONSE.receipt_hash`.

### 4.5 Error handling matrix
| Situation | Behaviour |
|---|---|
| 400 invalid_params / no_input_schema | Bug in our param builder: mark check failed, log, no retry |
| 402 with `reason` nonce/expiry/"could not be recorded" | retry once, fresh nonce |
| 402 "insufficient escrow" | stop the memo early; tell user to deposit |
| 402 "charge limit reached" | wait for next block (~few s), retry once |
| 429 | back off 5 s, retry once |
| 503 no_compatible_miner / could not route | check failed ("no live miner") — not billed |
| 5xx upstream / timeout | not billed; fall back (budgeted ask already does) else failed |
| 200 but `fulfillment.status` != complete or fields not ok | keep result, confidence `unverified` for those fields |
Always: one failed check never throws out of the desk; memo records `status:"failed"` + error text.

## 5. Desk (engine/desk.ts)
- Build the list of asks from `Application` + checks registry; compute worst-case cost = sum(perAskBudgetMicro).
  If it exceeds `budgetUsd`, drop optional checks in this order: codeReview, social, walletBalance extras, audit.
- Run with a concurrency limit (default 6) using `Promise.allSettled`; per-ask `deadline_ms` default 20000 (min 2000).
- Stream progress events (SSE): `check_started`, `check_done`, `check_failed`, `memo_ready` with partial spend totals.
- Track `totalCostUsd` = sum of billed rows. Memo shows budget, spent, skipped-for-budget.

## 6. Reconciliation & confidence
- Default: `single_source` when one miner answered with all needed fields `ok`; `unverified` otherwise.
- **Cross-check** (opt-in, only for `security` and `sanctions`): take the top 2 ranked miners for the intent
  (leaderboard rank, ids from `/intents/{I}/miners`), call each via direct ask, compare normalized outputs
  (security verdict category and vulnerability_count bucket; sanctions `matched` boolean). Equal → `agreed`;
  different → `conflicting` and the **more cautious** result wins; record both miners and both receipts.
- If a miner answers `rejected/missing` for a needed field → `unverified`, verdict treats it as "Review".

## 7. Verdict engine (engine/verdict.ts) — thresholds only from `config/verdict.config.json`
Signals → rules → decision. Any `reject` → **Reject**; else any `review` → **Review**; else **List**.
Mapping of node `verdict` strings (security, wash) is config-driven, case-insensitive; **unknown strings → review + note**.
Rules (default thresholds in config; tune with the backtest, never hardcode):
1. Sanctions: any `matched===true` → reject; `match_score >= sanctions.reviewScore` → review.
2. Security: verdict in `security.rejectVerdicts` or `vulnerability_count >= security.rejectCount` → reject; in `reviewVerdicts` or `>= reviewCount` → review.
3. Concentration = sum(balances of disclosed wallets in token units) / total_supply. `> concentration.reject` → reject; `> concentration.review` → review. Missing supply/balances → unverified → review.
4. Wash trading: `wash_volume_pct >= wash.rejectPct` → reject; `>= wash.reviewPct` → review.
5. Social: `bot_score >= social.reviewScore` or verdict in (bot, likely_bot) → review (never reject alone).
6. holders_count `< holders.minReview` → review (breadth signal).
7. Code review (if run): `Request changes` → review (info-level; never reject alone).
8. Any required check failed/unverified → review with reason "incomplete evidence". Never output **List** with a required check missing.
Output: `{ verdict, reasons: {rule, level, detail, checkId}[], missingEvidence: string[] }`.

## 8. Memo (engine/memo.ts)
```ts
interface Memo {
  version: 1; id: string; createdAt: string;          // ISO
  network: { payments: "ethereum-sepolia (testnet, escrow)"; data: string };
  application: Application;
  checks: CheckResult[];
  verdict: "LIST" | "REVIEW" | "REJECT"; reasons: Reason[]; missingEvidence: string[];
  cost: { budgetUsd: number; spentUsd: number; perCheck: { checkId: string; usd: number }[]; skipped: string[] };
  limitations: string[];       // static honest list (disclosed wallets only; judgment-class; testnet; public requests)
  verification: { signalHashes: string[]; receiptHashes: string[]; howTo: string[] };
  signer: string; signature: string; contentHash: string;
}
```
- `contentHash = keccak256(canonicalJson(memoWithoutSignatureFields))` (sorted keys, compact, UTF-8).
- `signature = wallet.signMessage({ message: { raw: contentHash } })`; `verify` recovers signer and compares.
- Render also as readable text/HTML with the **cost line** at the bottom: `Total spend $X.XXX across N paid calls in S seconds`.
- `verification.howTo` includes: signal lookup `GET /engine/v1/signal/{hash}`; receipt proof
  `GET /v1/blocks/{epochId}/deliveries/{receiptHash}` (available after the epoch block is recorded, up to ~1 h); memo verify `npm run verify -- memo.json`.

## 9. HTTP API (hono)
- `GET /api/health` → node reachable, required intents' miner counts, escrow `available`, signer address.
- `POST /api/memo` body `{application, options}` → 202 `{id}`; `GET /api/memo/:id/events` (SSE); `GET /api/memo/:id` (JSON); `GET /api/memo/:id/view` (HTML).
- `POST /api/verify` body = memo JSON → `{valid, signer}`.
- Static: `web/index.html` form (address, chain, wallets, names, handle, repo, budget slider, crosscheck toggle), live check cards
  (miner, cost, confidence), verdict badge, reasons, cost line, verify button. Vanilla JS + EventSource.
- Rate-limit locally (e.g., 1 memo / 5 s) to protect the wallet; validate all input with zod.

## 10. Backtest (cli/backtest.ts)
- Dataset `data/backtest.json`: `[{id, chain, tokenAddress, label: "good"|"bad", expected: "LIST"|"REJECT"|"REVIEW"?, disclosedWallets?, teamNames?, socialHandle?, source, verified}]`.
  Use **real mainnet tokens** with documented outcomes; every label needs a `source` URL; unverified ones excluded from metrics.
- For each case run the desk with a fixed budget; record verdict, cost, duration, per-check status.
- Metrics: confusion matrix (expected vs predicted), accuracy, false-positive rate (good→REJECT), false-negative rate
  (bad→LIST), review rate, mean cost per memo, **cost per correct verdict**, per-check failure rate. Write `backtest-report.md` + JSON.
- Be honest: small N, judgment-class intents, testnet payments. No cherry-picking; report all runs.
- Concurrency low (<=2 memos at once) to respect the 60 new questions/min limit.

## 11. Testing (vitest)
- Unit: verdict rules incl. unknown enum strings and missing evidence; concentration math; canonical JSON stability; memo sign/verify;
  escrow message templating (lowercase from, fresh nonce each call, window < 120 s); amount parsing from template.
- Integration with `MockProvider` + recorded fixtures: partial failure, all-failed, conflicting cross-check, budget exhaustion.
- One opt-in live smoke test (`LIVE=1`) that makes a real $0.01 purchase.

## 12. README must include (judged for reproducibility/adoption)
Problem · architecture diagram · prerequisites (Node 20+, Sepolia ETH, test USDC) · exact setup commands for Windows/macOS/Linux ·
sample request + expected result · actual networks · spend limits/costs · how to verify a memo and a receipt · failure demo ·
limitations (disclosed wallets only, judgment-class intents, shaped results are not independent proof, public requests, testnet) ·
troubleshooting (402 reasons, no miners, insufficient escrow, nonce errors) · how to contribute.
