# PLAN — ListingGuard (deadline 1 Dec 2026, 23:59 UTC)

Phases 1–6 are the product. 7–9 are what judges score on top (reproducibility, proof, growth). Do not start a phase
before the previous one's acceptance criteria pass. Each phase ends with: tests green, a demo command run, a commit.

## Day-by-day (from 22 Nov; ~9 days)
| Day | Phase |
|---|---|
| 22 Nov | P0 setup + first paid ask + public update #1 |
| 23 | P1 telegraph client + typed checks |
| 24 | P2 desk (parallel) + P3 reconcile/failure |
| 25 | P4 verdict + memo + signing |
| 26 | P5 API/SSE + web UI |
| 27–28 | P6 backtest + tuning; public update #2 |
| 29 | P7 README, tutorial, outside tester |
| 30 | P8 demo video, evidence pack; public update #3 |
| 1 Dec | P9 submit early (target before 12:00 UTC); buffer only |

## P0 — Human setup (user does this; agent only guides)
- [ ] Register on the H2 site; join Discord; **star github.com/telegraphprotocol/bounties**.
- [ ] Throwaway Sepolia wallet; Sepolia ETH (faucet); test USDC (anjoman.ai/dashboard/faucet). Node >= 20.
- [ ] `.env` from `.env.example`. `npm run deposit` (5 USDC) → check `GET /v1/ledger/account/<addr>` shows `available`.
- [ ] Ask in Discord: (1) SMART_CONTRACT_AUDIT_GENERAL schema? (2) is `_GENERAL` the intended family for Mission 01?
- [ ] Post public update #1 (template below).
**Acceptance:** escrow balance > 0.

## P1 — Telegraph client + first purchase
Tasks: scaffold TS project (strict, vitest, tsx, hono, viem, zod); `config.ts`; `telegraph/discovery.ts`; `telegraph/escrow.ts`
(SPEC 4.3); zod schemas for responses; `cli/deposit.ts`, `cli/ask.ts`.
Run a real ask for `TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL` (try `"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 on ethereum"`) with
`max_budget_usdc: 30000`. Save the redacted response to `fixtures/`. Resolve the unknowns in PROJECT_CONTEXT section 8.
**Acceptance:** one real paid call returns `field_status.total_supply === "ok"` plus a receipt hash; fixture saved; unit tests for
message templating (lowercase from, fresh nonce, window < 120 s, amount parsing).

## P2 — Checks registry + desk
Tasks: all checks in SPEC section 3 (param builders validated by zod, parsers); `provider.ts` (Live + Mock);
`engine/desk.ts` with concurrency limit, per-ask deadlines, budget planning, SSE-friendly event emitter.
**Acceptance:** `npm run memo -- <token>` runs all required checks in parallel against the live node, prints per-check results and
total cost; skipped/failed checks are reported, never thrown.

## P3 — Reconciliation, cross-check, failure handling
Tasks: confidence assignment; opt-in cross-check for security + sanctions via direct asks to top-2 ranked miners; error matrix (SPEC 4.5);
Mock-based tests for partial failure, all failed, conflicting, budget exhausted, insufficient escrow.
**Acceptance:** forcing a failure (Mock or invalid miner id) yields a valid partial memo that says what is missing; tests green.

## P4 — Verdict + memo + signature
Tasks: `config/verdict.config.json` loader; rules (SPEC 7) with unknown-enum handling; concentration math; memo builder (SPEC 8);
canonical JSON; sign/verify; text/HTML renderer with cost line; `cli/verify.ts`.
**Acceptance:** tampering with any memo field makes `npm run verify` fail; a memo missing a required check can never be `LIST`.

## P5 — API + web UI
Tasks: hono routes and SSE (SPEC 9); `web/index.html` with form, live cards, verdict badge, reasons, cost line, verify button;
health endpoint; local rate limit. **Acceptance:** from a clean checkout, `npm run dev` + browser → paste a token → live progress →
signed memo; works on a phone-width screen.

## P6 — Backtest and tuning
Tasks: build `data/backtest.json` (real mainnet tokens, each label with a `source` URL, `verified` flag); `cli/backtest.ts`;
report generator. Tune thresholds in config only, then **freeze** and re-run once for the reported numbers.
**Acceptance:** `npm run backtest` writes `backtest-report.md` with confusion matrix, FP/FN, cost per correct verdict, per-check failure
rates, and an honest limitations paragraph. Minimum 10 verified cases (more if budget allows).

## P7 — Reproducibility and education (20 growth points live here)
Tasks: README per SPEC 12; architecture diagram (mermaid); a tutorial post "Buy a token-risk check from Telegraph in 20 lines"
(escrow flow explained for developers who have never used Telegraph); `docs/TROUBLESHOOTING.md`; get one **independent developer** to
run it from the README and report (issue/PR/message) — keep that evidence; link Telegraph docs/Intents/bounties in posts.
**Acceptance:** a person who has never seen the repo reproduces a memo in < 15 minutes.

## P8 — Demo and evidence
Demo video 2–5 min, in this order: problem → Telegraph request (show 402 → escrow sign → 200) → provider evidence (miner, receipt, signal hash)
→ observed cost → completed memo → forced failure (partial memo) → how to try it. Evidence pack: receipts list, signal hashes,
backtest report, test output, one `/v1/blocks/{epoch}/deliveries/{receipt}` proof (available after the epoch block is recorded).
Prepare the five commercial answers (below).

## P9 — Submit
Submit on the H2 website well before the deadline. Include: team/contact, track, project name, mission 01, working/reviewer-access link,
GitHub username that starred the repo, demo link, run instructions, evidence, public summary + links to the three updates, tutorial and
independent testing, showcase permissions. Re-run the README from scratch on a clean machine the day before.

---

## Prompts to give Antigravity (copy/paste, one at a time)
**Prompt 0 — kickoff**
> Read `AGENTS.md`, `docs/PROJECT_CONTEXT.md`, `docs/SPEC.md` and `docs/PLAN.md` fully. Reply with (1) a 10-line summary of the product,
> (2) the list of unknowns you will resolve first, (3) your plan for Phase P1. Do not write code yet.

**Prompt P1**
> Execute Phase P1 exactly as in docs/PLAN.md. Scaffold the TypeScript project, implement the escrow client per SPEC 4.3, add the
> deposit/ask CLIs and the unit tests. I will provide a funded throwaway wallet via `.env`. Make one real $0.01-scale purchase
> for TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL, save a redacted fixture, update SPEC.md with anything that differed, and report.

**Prompt P2–P3**
> Execute P2 then P3 from docs/PLAN.md. Implement every check in SPEC section 3, the desk with concurrency/deadlines/budget, the
> Mock provider, reconciliation + cross-check, and the error matrix. Show me one live run's output and the failure-case test results.

**Prompt P4**
> Execute P4. Implement verdict rules reading only `config/verdict.config.json`, the memo with canonical JSON + signature + verify CLI,
> and the text/HTML renderer with the cost line. Add tests proving tampering is detected and a memo with missing required evidence is never LIST.

**Prompt P5**
> Execute P5: hono API with SSE and the single-page `web/index.html` per SPEC 9. Keep it clean and responsive. No frameworks.

**Prompt P6**
> Execute P6. Help me assemble `data/backtest.json` from `data/backtest.template.json` using only labels with a documented source URL
> (mark anything unsure `verified:false`). Implement the backtest CLI and report. Do not tune thresholds after the final reported run.

**Prompt P7–P8**
> Write the README per SPEC 12, TROUBLESHOOTING.md, a mermaid architecture diagram and a developer tutorial. Then generate a
> demo script (shot list with exact commands) and an evidence checklist. Do not invent any result; leave placeholders for numbers.

---

## Public update templates (need 3 on separate dates; disclose participation and the prize incentive; tag @Telegraphprotoc)
**#1 (22–23 Nov) — problem + first purchase**
> Building ListingGuard for Telegraph Hackathon Season II (prize pool involved, @Telegraphprotoc): an agent that buys token-risk checks from
> ranked miners and returns a signed listing memo with a cost line. Day 1: first paid request via escrow works. Learned: Mission 01's
> Intents are served under *_GENERAL names (e.g. SANCTIONS_SCREENING_MATCH_GENERAL). Repo: <link>. Docs: https://anjoman.ai/docs

**#2 (~27–28 Nov) — progress + honest results**
> ListingGuard update (#TelegraphHackathon, prize incentive). Parallel checks + signed memos working. Early backtest: <real numbers only>.
> What broke: <real issue>. How to reproduce a memo: <steps/link>. Looking for a developer to try the README and tell me what's unclear.

**#3 (~30 Nov) — working result + tutorial**
> Final ListingGuard demo (Telegraph Hackathon, prize incentive): <demo link>. Tutorial: how to pay for Telegraph intelligence with escrow
> in ~20 lines <link>. Limits: Sepolia-paid, mainnet data, judgment-class Intents, disclosed-wallet concentration only.

## Five commercial answers (draft; edit with real numbers)
1. **Who is it for?** Listings/compliance teams at exchanges (and launchpads) who review dozens of token applications a month.
2. **What does it improve?** Cuts first-pass listing diligence from days/weeks of analyst time to ~minutes, with a priced, verifiable evidence trail.
3. **What does it do today?** Buys 6–9 independent checks via Telegraph (testnet payments, mainnet data), reconciles, signs a memo (List/Review/Reject) with receipts and a cost line.
4. **Why adopt?** Per-request pricing instead of per-seat; every finding attributable to a ranked miner; reproducible and auditable; swap providers as rankings change.
5. **How can someone try it?** Clone, add a throwaway Sepolia key, `npm run deposit`, `npm run dev`, paste a token. README has exact steps.
Label clearly: testnet payments, no paying customers yet, judgment-class intents; do not claim demand that does not exist.

## Risks and fallbacks
| Risk | Fallback |
|---|---|
| Miner coverage thin for a token | Use well-known tokens for the demo; show the failure case honestly |
| `token` param format rejected | Try address-only, "SYMBOL on chain", then query form; document the working one |
| SECURITY/WASH verdict enums unknown | Config-driven mapping; unknown → Review; record real values in fixtures |
| Escrow signature refused | Re-read the 402 `reason`; sign the template verbatim; lowercase `from`; fresh nonce |
| Not enough time | Cut in this order: web UI polish → cross-check → code review check → audit check. Keep: purchase, memo, signature, backtest (small), README, demo |
| Nov/Dec testnet instability | Cache fixtures; Mock provider for tests; show recorded run + live run in the demo |
