# Video Demo Script (2–5 Minutes)

Order required by hackathon submission guidelines:
1. **The Problem** (30s)
2. **The Telegraph Flow** (45s)
3. **The Provider Evidence & Verification** (45s)
4. **Observed Cost & The Risk Memo** (45s)
5. **Forced Failure / Edge Case** (30s)
6. **How to Try It** (15s)

---

### Shot 1: The Problem (0:00 – 0:30)
* **Visual:** Browser showing exchange listing submission forms and complex audit reports.
* **Voiceover:** "When a crypto exchange considers listing a new token, the diligence review takes weeks of analyst time. It involves disjoint vendor reports, expensive per-seat licenses, and leaves no cryptographic audit trail of who attested to what or what it cost. Bad listings cost users millions and expose venues to legal risk."

---

### Shot 2: The Solution & Telegraph Request Flow (0:30 – 1:15)
* **Visual:** Terminal or Web UI at `http://localhost:8787`.
* **Action:** Enter Circle USDC contract address (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`), select Ethereum mainnet, toggle dual-miner crosscheck, and click **Launch Autonomous Diligence Desk**.
* **Voiceover:** "ListingGuard turns this into an autonomous desk. In real time, it dispatches parallel intelligence checks across ranked Telegraph miners. Every request uses Telegraph's Sepolia escrow rail: our agent receives a 402 challenge, signs an EIP-191 authorization header, and settles the micropayment directly with the network Diamond."

---

### Shot 3: Intelligence & Verification Receipts (1:15 – 2:00)
* **Visual:** Web UI live progress cards transitioning to green verified pills.
* **Voiceover:** "Eight independent checks run simultaneously: smart contract vulnerability scanning, total supply verification, holder breadth, insider wallet concentration, OFAC sanctions screening, and wash trading detection. Each check returns cryptographic signal hashes and on-chain delivery receipts."

---

### Shot 4: The Listing Risk Memo & The Cost Line (2:00 – 2:45)
* **Visual:** Completed Signed Memo displayed in the Web UI and Terminal.
* **Action:** Point out the **VERDICT: LIST (APPROVED)** banner, the cryptographic signature, and the bottom cost line.
* **Voiceover:** "ListingGuard evaluates findings against strict rules and outputs a tamper-evident Listing Risk Memo signed by our agent. And at the bottom is the key line: Total spend $0.07 across 7 paid calls in 12 seconds—compared to weeks of human analyst hours."
* **Action:** Click **Verify Memo Authenticity** in the Web UI to show immediate cryptographic verification.

---

### Shot 5: Forced Failure / Edge Case (2:45 – 3:15)
* **Visual:** Terminal running against a known exploit or simulated miner timeout:
  `npm run memo -- 0xB2ED12F121995cB55dDfc2F268d1901AEC05a8dE --mock`
* **Voiceover:** "Crucially, the system fails closed. Against AnubisDAO, an infamous $60M rug pull, ListingGuard catches critical vulnerabilities and wash volume, issuing a clear REJECT verdict. Furthermore, if a required check fails or drops offline, the system never assumes safety—it flags incomplete evidence and marks the memo as REVIEW."

---

### Shot 6: How to Try It (3:15 – 3:30)
* **Visual:** GitHub repository with the README instructions.
* **Voiceover:** "You can reproduce this entire flow in under 5 minutes. Clone the repo, add a throwaway Sepolia key, run `npm run deposit`, and start the desk with `npm run dev`. All code, backtests, and tutorials are open source on GitHub."
