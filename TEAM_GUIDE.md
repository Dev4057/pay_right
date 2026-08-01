# Team Guide — pay_right

Welcome! This is everything you need to start working on the project. Read this once, fully, before touching code. For what we're building and why → [WORKING.md](WORKING.md). For the API you'll wire against → [backend/API.md](backend/API.md).

## What this product is (30 seconds)

An agent that reads a codebase **before deployment**, figures out what infrastructure it really needs (asking the founder a few smart business questions), compares real hosting plans, and **actually buys the right one** through Prava — with a fixed rules layer between the AI and the money. The demo story: *code findings → recommendation with reasons → approve → rules check → real payment → receipt.*

## Repo layout

```
pay_right/
├── WORKING.md        ← the product spec (read it!)
├── TEAM_GUIDE.md     ← you are here
├── backend/          ← DONE & tested: agents, rules layer, Prava, HTTP API (port 4000)
│   ├── API.md        ← ★ your integration contract — endpoint docs + UI notes
│   └── src/core/fixtures/  ← example report + proposal JSON (build screens off these)
├── frontend/         ← Next.js app — landing page exists; the DASHBOARD is what we build
└── demo-repo/        ← "quicktalk", the sample app the agent analyzes in the demo
```

## Setup (once)

1. **Requirements:** Node.js ≥ 20 (`node --version`), Git.
2. Clone the repo, then:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install     # stick to npm — if you see pnpm-lock.yaml, ignore/delete it
   ```
3. **Get the keys from Devang via DM** (never via the repo/group chats) and create `backend/.env` — copy `backend/.env.example` and fill in `OPENAI_API_KEY`, `PRAVA_SECRET_KEY`, `PRAVA_PUBLISHABLE_KEY`.
4. Run it:
   ```bash
   cd backend && npm run dev         # API on http://localhost:4000
   cd frontend && npm run dev        # app on http://localhost:3000
   ```
5. Sanity check: open http://localhost:4000/health — you should see `"ok": true` with both keys present.

## Git workflow (non-negotiable)

- **Never commit to `main` directly.** Branch per feature: `git checkout -b feature/dashboard-flow`
- Small, working commits; push your branch; open a **Pull Request**; someone else clicks merge.
- **NEVER commit `.env`** or any key/card number. `.gitignore` protects you, but check `git status` before every commit anyway.
- Pull `main` into your branch daily (`git pull origin main`) so merges stay small.
- Don't add a frontend folder from a ZIP — merge your components INTO the existing `frontend/` app on your branch.

## What we're building in the frontend

One dashboard flow that tells the whole story on screen. The backend drives it — you **start a run, poll it every 1–2 s, and render by `state`** (full table + JSON shapes in [backend/API.md](backend/API.md)):

| Run state | Screen to show |
|---|---|
| `exploring` | "Agent is reading your codebase…" (spinner, repo name) |
| `awaiting_answers` | **The Load Interview** — render `questions[]`, multiple-choice, submit answers |
| `analyzing` / `proposing` | Show the findings as they exist + "comparing real plans…" |
| `awaiting_decision` | **The proposal** — recommended plan, price, reasons (each reason links to the findings it cites via `finding_ids`), rejected alternatives, Approve / Reject buttons |
| `executing` | The 4 rules checks; when `payment_url` appears → "Complete payment" button (opens Prava) |
| `completed` | Receipt (APPROVED) + the 4 green rule checks — the money shot |
| `halted` / `rejected` | The 🛑 rule that blocked it + `receipt.halt_reason` — equally important to demo! |
| `error` | Friendly error + `run.error` |

**Design notes that matter for judging:**
- Every finding has a `confidence` tag (`derived-from-code` / `inferred` / `user-provided` / `assumption`) → give each a distinct visual badge. This is our honesty story.
- Findings have `evidence` like `server.js:12` → show it (monospace). Proposal reasons cite `finding_ids` → make the connection visible (hover/link). *"Every dollar traces to a line of code"* is our pitch.
- Build screens TODAY against `GET /api/fixtures/report` and `GET /api/fixtures/proposal` (or the JSON files in `backend/src/core/fixtures/`) — no need to wait for anything.

## Division of work (suggestion)

- **Friend A:** Interview + Report screens (`awaiting_answers` → `proposing`), landing-page polish.
- **Friend B:** Proposal + Rules + Receipt screens (`awaiting_decision` → `completed`/`halted`).
- **Devang + Claude:** backend, Prava happy-path test, demo script, deployment of the demo.

## Rules of the repo

- `backend/src/core/` (contract, rules, load-math, catalog) is **frozen** — it's tested (23 tests) and the whole system depends on those shapes. Want a field changed? Ask first, don't edit.
- Don't rename fixture files — the tests and API serve them.
- `npm test` in `backend/` must stay green. If your change breaks it, fix it before the PR.
- The Prava sandbox test card is unique to our team, has a **30 transactions/day** limit, and lives ONLY in DMs and browsers — never in code, commits, or screenshots.

## What we have built till now (detailed)

Everything below is **built, typechecked, unit-tested (23/23), and verified live** with real OpenAI + Prava sandbox calls:

**Phase 1 — The Contract** ✅
`backend/src/core/contract.ts`: zod schemas for the RequirementsReport, PurchaseProposal, ApprovalDecision, RulesCheckResult, TransactionReceipt. Every finding carries `{id, value, confidence, evidence}`; every proposal reason must cite finding ids (schema-enforced). Fixture examples in `src/core/fixtures/`.

**Phase 2 — Prava payments** ✅ (happy path pending one human step)
`backend/src/payments/prava.ts`: session create → poll for the one-time Visa token + dynamic CVV → mandatory APPROVED/DECLINED reporting. Verified live: sandbox health, real session created with our merchant account. Remaining: one browser card-entry run with the team test card.

**Phase 3 — Analyzer Agent** ✅
`backend/src/agents/analyzer.ts` + `repo-tools.ts`: reads a Node.js repo with read-only sandboxed tools (path-escape blocked, size-capped), then runs the **Load Interview** — it generates business questions FROM what it found in the code (live it asked about multer's 2MB upload limit!). Deterministic load math (`core/load-math.ts`) turns answers into a load class (XS/S/M/L) — the LLM cannot invent its own. Emits a validated report with file:line evidence.

**Phase 4 — Infra Agent** ✅
`backend/src/agents/infra.ts` + `core/catalog.json` (6 real plans: Railway/Render/DigitalOcean) + `core/proposal-checks.ts`: recommends ONLY catalog plans at exact catalog prices — hallucinated plans, price drift, and fake citations are mechanically rejected and re-prompted. Live output: Railway Hobby $5 with 5 reasons, each citing findings.

**Phase 5 — Rules layer + executor** ✅
`backend/src/core/rules.ts` + `payments/executor.ts`: the four checks (spend-ceiling, price-match, category-lock, traceability) as pure code wrapping the ONLY path to Prava; halt-and-surface on any failure, never retry. Verified live: a $5 purchase against a $4 wallet limit was HALTED before Prava was touched; a user rejection produced an auditable HALTED receipt.

**Phase 6a — HTTP API** ✅
`backend/src/server.ts` + `api/run-manager.ts`: the full pipeline as an async state machine over REST (start run → poll → answers → decision → receipt), input validation, CORS, health endpoint, fixture endpoints. Docs in `backend/API.md`. Hardened after live testing: request timeouts, progress logging, circuit breaker, schema-aware emit tools (full pipeline now runs in ~50s).

## Current status — in one line each

- ✅ **Backend: 100% of hackathon scope** — agents, interview, rules, Prava client, API
- 🔶 **Prava happy path: 95%** — only the human card-entry browser step remains
- 🔲 **Dashboard screens: 0%** (← you! everything you need is ready)
- 🔲 **Git repo + first push** (Devang, today)
- 🔲 **Demo video + submission**

Questions → team chat. Build fast, commit small, never touch the money path. 🚀
