# AGENTS.md — ListingGuard (Telegraph Hackathon Season II, Apps & Agents)

You are the lead engineer on **ListingGuard**: an autonomous token-listing desk that buys
ranked intelligence through Telegraph (testnet), reconciles it, and returns a signed Listing
Risk Memo with a cost line and verifiable receipts.

## Read first (in this order)
1. `docs/PROJECT_CONTEXT.md` — event rules, scoring, live-node findings, decisions, status.
2. `docs/SPEC.md` — exact architecture, Intent request/response mapping, escrow payment
   protocol, verdict rules, memo format, API, backtest.
3. `docs/PLAN.md` — phases, acceptance criteria, prompts, submission checklist.
Do not start coding until you have read all three and written a short plan back.

## Hard deadline
Submission closes **1 Dec 2026, 23:59 UTC**. Prefer a smaller thing that works end to end
over a bigger thing that doesn't. Phases 1–6 in PLAN.md are the product; the rest is optional.

## Stack (decided — do not change without asking)
TypeScript (strict), Node >= 20, `viem`, `zod`, `hono` (HTTP + SSE), `vitest`, `tsx`.
Frontend: one static page (`web/index.html`) served by the server, no framework.
No Rust. No database (JSON files under `data/memos/`).

## Hard rules
- **Security:** burner Sepolia wallet only. Private key only from env (`PRIVATE_KEY`).
  Never log, print, commit or put keys in fixtures. `.env` must stay git-ignored.
- **Never send confidential data to Telegraph.** Requests are public (they appear in a public
  feed with the payer wallet). Only use public tokens/handles. Say so in the README.
- **No fabricated data.** Never invent labels, receipts, accuracy numbers, miner results or
  customer claims. Every number in the README/demo must come from a real run.
  Unverified labels in `data/` must be marked `"verified": false`.
- **Honest claims.** Say "Sepolia testnet payments" and "mainnet data". Testnet traffic is not
  customer demand. The node's shaped `result` is not independent proof of a miner's claim.
- **Payment rules (escrow):** header is `X-PAYMENT` (not `PAYMENT-SIGNATURE`); lowercase `from`;
  fresh random nonce on *every* attempt; validity window < 2 min; sign the challenge's
  `extra.message` template verbatim (read amount from its `Amount:` line); never hardcode
  `payTo`/Diamond — read from the challenge; paid body must be identical to the challenge body.
- **Treat any field with `field_status != "ok"` as unverified.** A 200 can still hold a bad
  answer and is still billed.
- Validate every node response with `zod`; fail closed (unverified), never crash the memo.
- Every check is independent: one failure must never abort the memo. Produce a partial memo.
- Keep `config/verdict.config.json` as the only place for thresholds. No magic numbers in code.

## Do NOT
- Use `ONCHAIN_METRIC_VERIFY*` (native balance/nonce only; wrong tool for this job).
- Hand-roll x402 `exact`/EIP-3009 signing. We use the **escrow** scheme only.
- Add features outside PLAN.md without asking. Seller/miner mode is out of scope.
- Claim a check ran if the call failed. Show failures in the memo.

## Working style
- Work one phase at a time. After each phase: run tests, run the relevant CLI/demo, report
  what works and what doesn't, commit with a clear message.
- When the spec is ambiguous or a live response differs from SPEC.md, **record the real
  response** in `fixtures/` (redacted), update `docs/SPEC.md`, then proceed.
- Keep a running list of unknowns in `docs/OPEN_QUESTIONS.md`.
- Prefer small files, plain functions, explicit types, readable errors.

## Commands (create these scripts in package.json)
`npm run dev` (server) · `npm test` · `npm run deposit` · `npm run ask -- <check> <args>` ·
`npm run memo -- <tokenAddress>` · `npm run backtest` · `npm run verify -- <memo.json>`

## Definition of done (per the official rules)
A reviewer can: run it with a new realistic input, check the result, inspect the real Telegraph
request + receipts, trigger a reasonable failure, and reproduce it from the README.
