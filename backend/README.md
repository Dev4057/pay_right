# Backend — Code Map

Plain-language guide to every file. Read this before diving into the code.
(What the product does → [../WORKING.md](../WORKING.md) · API endpoints → [API.md](API.md))

## The big picture

```
  User's repo ──> Analyzer Agent ──> Requirements Report ──> Infra Agent ──> Proposal
                     (AI reads code,      (facts + evidence)     (AI compares      │
                      asks questions)                             real plans)      ▼
                                                                          User approves?
                                                                                   │
  Receipt <── Prava payment <── RULES LAYER (plain code, no AI) <──────────────────┘
```

One design rule explains everything: **the AI reasons, deterministic code enforces.**
Anywhere a wrong answer could cost money, there is a plain-code check the AI cannot
override. When the AI produces invalid output, we don't crash — we send the errors
back and it retries (the "validation-retry loop").

## `src/core/` — the deterministic heart (no AI here)

| File | What it is |
|---|---|
| `contract.ts` | **The shared language.** Schemas for the report, proposal, decision, rules result, and receipt. Every finding is `{id, value, confidence, evidence}` — the `id` (F1, F2…) is what everything else points at (the "paper trail"). Also rejects duplicate ids and reasons that cite findings which don't exist. |
| `interview.ts` | The question bank for the Load Interview (fixed ids like `Q_USERS`, fixed options). The AI picks *which* questions to ask; it can never invent its own canonical ids. |
| `load-math.ts` | Pure math: interview answers → load class (XS/S/M/L) using standard capacity formulas. The AI must copy this result verbatim — it cannot invent load estimates. Also flags contradictions (e.g. "expects 10K users but code uses SQLite"). |
| `catalog.json` | The 6 real hosting plans (Railway/Render/DigitalOcean) with prices, specs, and a `tier` (entry/standard/pro). Hand-verified — the agent can ONLY recommend from here. |
| `catalog.ts` | Loads + validates the catalog; `findPlan()` lookup. |
| `proposal-checks.ts` | **The anti-hallucination gate.** Rejects proposals that: name a plan not in the catalog, get a price wrong by a cent, cite fake finding ids, or recommend a plan that isn't the *cheapest eligible one* (eligibility computed from the report's needs + load class in pure code). |
| `rules.ts` | **The four purchase rules**: spend-ceiling, price-match, category-lock, traceability. Money is compared in integer cents (no float bugs). Also `decisionAuthorizes()` — a decision only unlocks the exact proposal it names. |
| `fixtures/` | Realistic example report + proposal JSON. The frontend was built against these; tests use them too. |
| `*.test.ts` | 26 unit tests over all of the above. `npm test`. |

## `src/agents/` — the AI layer

| File | What it is |
|---|---|
| `analyzer.ts` | **Agent 1.** Reads the repo with read-only tools, runs the Load Interview, emits the report. Its 5 tools: `list_files`, `read_file`, `search_code`, `ask_user`, `emit_report`. The emit tool carries the full JSON schema so the model knows the exact shape upfront. |
| `infra.ts` | **Agent 2.** Gets the report + catalog injected as its whole world; its single tool is `emit_proposal` (forced — it can't reply with chat). Every emit runs through `proposal-checks`; violations are fed back until clean. |
| `repo-tools.ts` | The analyzer's filesystem tools, sandboxed: paths can't escape the repo, files are size-capped, results are count-capped, and there is **no write/network capability at all** — the agent that reads your code physically cannot spend money. |
| `llm.ts` | Shared OpenAI client: hard timeouts, retries, reasoning-effort setting, and progress logging so a stuck agent is visible, never silent. |

## `src/payments/` — the money path (no AI here either)

| File | What it is |
|---|---|
| `prava.ts` | Prava sandbox client: create session → poll until the user approves with card + passkey → receive the **one-time virtual Visa card** (token + one-time CVV, locked to exact merchant + amount) → report the outcome (required). Card numbers never touch our code. |
| `executor.ts` | **The only road to Prava.** Fixed order: decision check → four rules → session → poll → report outcome. Any failure = a `HALTED` receipt with the reason, and **no retry, ever**. |

## `src/api/` + `src/server.ts` — how the frontend talks to all this

| File | What it is |
|---|---|
| `run-manager.ts` | One "run" = one full pipeline execution, tracked as a state machine: `cloning → exploring → awaiting_answers → analyzing → proposing → awaiting_decision → executing → completed/halted/rejected`. When the AI needs a human (interview answers, approval), the run *pauses* on a stored promise that the HTTP endpoint resolves later. Also keeps the `activity` feed — the live "code rail" the UI shows. Accepts local paths or public GitHub URLs (shallow-cloned). |
| `server.ts` | The Express API: start a run, poll it, submit answers, submit decision, plus health/catalog/fixture endpoints. The frontend just polls `GET /api/runs/:id` and renders by `state`. |

## `src/scripts/` — run things from the terminal

`run-analyzer.ts` (analyze + interview in terminal) · `run-infra.ts` (report → proposal) ·
`run-purchase.ts` (approve → rules → Prava) · `test-infra-behavior.ts` (3 contrasting
scenarios prove decisions change with requirements) · `spike-session.ts` (raw Prava
end-to-end) · `smoke-repo-tools.ts` (sandbox check) · `validate-fixtures.ts` (contract check).

## Setup & commands

```bash
npm install
cp .env.example .env     # then fill in the keys (ask the team — never commit .env)
npm run dev              # API on http://localhost:4000
npm test                 # 26 deterministic tests, no API keys needed
npm run analyze          # watch the analyzer work in your terminal
```
