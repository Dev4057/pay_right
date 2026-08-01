# pay_right Backend API

Base URL (dev): `http://localhost:4000`
Start it: `cd backend && npm run dev` (needs `backend/.env` — ask the team for keys, never commit them).

The frontend's whole job: **start a run, poll it, and render by `state`.**

## The run lifecycle

```
(cloning →) exploring → awaiting_answers → analyzing → proposing → awaiting_decision → executing → completed
                                                                                                ↘ halted
                                                                        (rejected decision) → rejected
                                                          (any stage) → error
```

| `state` | What the UI shows |
|---|---|
| `cloning` | GitHub URL runs only: "Cloning repository…" (treat like `exploring`) |
| `exploring` | "Analyzer is reading the codebase…" (spinner + repo name) |
| `awaiting_answers` | The Load Interview: render `run.questions`, POST answers |
| `analyzing` | "Building the requirements report…" |
| `proposing` | Show `run.report` (findings!) + "Comparing real plans…" |
| `awaiting_decision` | Show `run.proposal` — approve / reject buttons |
| `executing` | Rules passed; when `run.payment_url` appears, show "Complete payment" link/QR |
| `completed` | Show `run.rules` (4 green checks) + `run.receipt` (APPROVED) |
| `halted` | Show `run.rules` — at least one 🛑 — + `run.receipt.halt_reason` |
| `rejected` | User said no; show the HALTED receipt (audit trail) |
| `error` | Show `run.error` |

## Endpoints

### `GET /health`
```json
{ "ok": true, "openai_key_present": true, "prava_reachable": true,
  "wallet_limit_usd": "30.00", "assigned_category": "hosting", "model": "gpt-5-mini" }
```

### `POST /api/runs` — start a run
Body (all optional): `{ "repo_path": "...", "mode": "approval" | "autonomy" }`
`repo_path` accepts three forms:
- **blank/omitted** → the bundled `demo-repo`
- **a local path** — absolute, or relative to the project root (e.g. `"demo-repo"`)
- **a public GitHub URL** (`https://github.com/owner/repo`) → shallow-cloned server-side; the run starts in state `cloning`, then proceeds normally
Defaults: the bundled `demo-repo`, `approval`.
Returns `201` with the run object (see below). `503` if the backend has no OpenAI key.

### `GET /api/runs/:id` — poll this (~every 1-2s)
Returns the full run object:
```json
{
  "id": "run_ab12cd34",
  "state": "awaiting_decision",
  "mode": "approval",
  "repo_name": "demo-repo",
  "questions": [ { "q_id": "Q_USERS", "question": "...", "options": ["<100 (pilot)", "..."] } ],
  "report":   { "...": "RequirementsReport — same shape as src/core/fixtures/report.example.json" },
  "proposal": { "...": "PurchaseProposal — same shape as src/core/fixtures/proposal.example.json" },
  "decision": null,
  "rules":    { "passed": true, "checks": [ { "rule": "spend-ceiling", "passed": true, "detail": "..." } ] },
  "receipt":  { "status": "APPROVED | DECLINED | HALTED", "plan": "Hobby",
                "halt_reason": "human text", "halt_code": "CAP_EXCEEDED | PRICE_MISMATCH | CATEGORY_VIOLATION | TRACEABILITY_BROKEN | USER_REJECTED | DECISION_INVALID | TRANSACTION_FAILED",
                "retry_class": "no-retry | re-quote | user-approval",
                "audit_seal": "sha256 over the whole decision bundle (tamper evidence)", "...": "..." },
  "payment_url": "https://sandbox.collect.prava.space?session=...",
  "error": null,
  "activity": [
    "13:41:02  analyzer started on demo-repo/",
    "13:41:05  list_files, search_code(/socket.io/), search_code(/multer/)",
    "13:41:08  read_file(package.json), read_file(server.js)",
    "13:41:12  load interview: 5 questions for the founder"
  ]
}
```
Fields are `null` until their stage has happened. `activity` is the live agent
feed ("the code rail") — append-only, capped at 300 lines; render it as a
terminal during `cloning`/`exploring`/`analyzing`/`proposing`/`executing`.

### `POST /api/runs/:id/answers`
Body: `{ "answers": { "Q_USERS": "100-1K", "Q_ACTIVITY": "All day", "...": "..." } }`
Every question in `run.questions` must be answered with one of its **exact** `options` strings.
`400` on a missing/invalid answer, `409` if the run isn't in `awaiting_answers`.

### `POST /api/runs/:id/decision`
Body: `{ "decision": "approved" | "rejected", "note": "optional" }`
`409` if the run isn't in `awaiting_decision`. (Autonomy-mode runs never enter that state.)

### `GET /api/runs` — list all runs (newest first): `{ "runs": [...] }`

### Static helpers
- `GET /api/catalog` — the plan catalog (for a "plans we compare" section)
- `GET /api/fixtures/report`, `GET /api/fixtures/proposal` — the example objects, so screens can be built with zero backend state

## Notes for the UI

- **Poll, don't push** — no websockets on this API; 1-2s polling is fine for the demo.
- The four rules in `rules.checks` are always in order: spend-ceiling, price-match, category-lock, traceability. Render each `detail` string — they're written to be shown to humans.
- Every reasoning entry in `proposal.reasoning` has `finding_ids` — link them to the matching findings in `report` (that's the paper-trail moment of the demo).
- `payment_url` opens Prava's hosted page (sandbox). The user finishes card + passkey there; the run flips to `completed` on its own — keep polling.
- Finding `confidence` values: `derived-from-code` | `inferred` | `user-provided` | `assumption` — give each a distinct badge.
