# Build Spec — Wire Real Dashboard to pay_right Backend (Reuse Demo UX Only)

> **To the coding agent: do not redesign anything. Do not invent new components, colors, layouts, or copy. Your only job is to take the existing demo UX (built at [demo project path]) and connect it to the real backend API. If a screen has no demo equivalent (see Section 3), match its existing visual language exactly — same fonts, same badge system, same spacing, same animation style. Treat the demo as the design system, not a reference.**

---

## 1. Non-Negotiable Rule

**Reuse these exact components from the demo UX as-is:**
- `ConfidenceBadge.tsx`
- `CodeViewerModal.tsx`
- The Rules Layer sequential-check animation
- The findings list / accordion pattern
- The proposal chosen-vs-rejected card layout
- The final receipt layout
- Global styles, fonts (Space Grotesk / IBM Plex Mono), color tokens, dark theme

**Do not:**
- Regenerate these components from scratch
- Change color palette, spacing, or typography
- Add new UI patterns not already established in the demo
- Simplify or "improve" the design — if something looks wrong, flag it, don't silently redesign it

If the agent is unsure whether something counts as "reuse" vs "redesign," it should ask rather than guess.

---

## 2. What Changes: Data Layer Only

The demo currently uses `mockData.ts` and `setTimeout` delays. Replace these with real calls to the backend running on `http://localhost:4000`. Everything else — component structure, styling, animation timing where possible — stays the same.

### Real Backend Endpoints to Wire In
(confirm exact paths/payloads against `backend/API.md` and `backend/src/server.ts` before implementing — do not guess field names)

| Action | Endpoint (confirm exact in API.md) | Triggers |
|---|---|---|
| Start a run | `POST /api/runs` (repo info) | Landing screen "Connect Repository" |
| Poll run status | `GET /api/runs/:id` | Drives all state transitions below |
| Submit load-interview answers | likely `POST /api/runs/:id/answers` | Awaiting-Answers screen |
| Approve proposal | likely `POST /api/runs/:id/approve` | Proposal screen "Approve" button |
| Reject proposal | likely `POST /api/runs/:id/reject` | Proposal screen "Reject" button |
| Fetch mock report (for design/testing only) | `GET /api/fixtures/report` | Use only for local dev testing, not real flow |
| Fetch mock proposal (for design/testing only) | `GET /api/fixtures/proposal` | Use only for local dev testing, not real flow |

**Important:** the fixture endpoints (`/api/fixtures/report`, `/api/fixtures/proposal`) are dev/testing conveniences from the backend team, not part of the real user flow. Do not wire the production dashboard to these — use them only to sanity-check that your screens render correctly against real backend JSON shapes before the LLM agents are actually invoked live.

---

## 3. State-to-Screen Mapping

The backend drives a **state machine**, not a fixed linear click-through like the demo was. The dashboard must poll `GET /api/runs/:id` and render the correct screen based on the returned `state` field. Map states to existing demo screens as follows:

| Backend State | Demo Screen to Reuse | Notes |
|---|---|---|
| `exploring` | Screen 2 (Live Repo Scan) | If backend can stream findings incrementally, keep the file-by-file animation. **If backend only returns a single blocking response, do NOT fake per-file streaming** — collapse to a single honest "Analyzing repository..." progress state instead. Confirm which is actually possible before deciding. |
| `awaiting_answers` | **New screen — no demo equivalent** | Build a "Load Interview" screen matching the exact visual style of the demo (same card style, spacing, fonts, dark theme). Likely a short form of multiple-choice business questions (e.g. expected users, growth stage). Confirm exact question shape from backend payload before building — do not invent placeholder questions that don't match real data. |
| `proposing` / `analyzing` | Screen 2/3 transition state | Simple loading/progress state consistent with existing style — reuse Screen 2's progress bar pattern rather than inventing a new spinner. |
| `awaiting_decision` | Screen 3 (Findings) + Screen 4 (Proposal) | Findings come from the real analyzer report shape (`report.example.json` fixture defines the contract — confirm live output matches). Proposal comes from real infra agent output (`proposal.example.json` defines the contract). |
| `executing` | Screen 5 (Rules Layer Check) | Wire real check results (pass/fail per check) instead of the demo's toggle-based fake halt-state. If a check fails, use the existing halt-state UI exactly as designed — don't build a new error screen. |
| `completed` | Screen 6 (Final Report / Receipt) | Use real receipt data from Prava, mapped into the existing receipt layout. |
| `halted` | Screen 5 halt-state variant | Reuse demo's existing halt UI, populated with the real failed check + reason from the backend. |
| `rejected` | Reuse Screen 4's reject flow | If backend supports re-selecting a rejected alternative, wire that; if not, at minimum support "session ended, no purchase made" using the existing end-state pattern from the demo spec. |

---

## 4. Contract Verification Step (do this before writing UI code)

Before wiring any screen, the agent must:
1. Read `backend/src/core/fixtures/report.example.json` and confirm the findings shape matches what Screen 3's `ConfidenceBadge` / evidence display expects (`value`, `confidence`, `evidence` fields per the original design doc).
2. Read `backend/src/core/fixtures/proposal.example.json` and confirm it matches what Screen 4's chosen-vs-rejected card expects (plan name, price, reasoning citing finding IDs, rejected alternatives with reasons).
3. Read `backend/API.md` and `backend/src/server.ts` directly for exact endpoint paths, request/response shapes, and the full list of possible `state` values — do not assume the state names above are complete or exactly correct; verify against source.
4. Flag any mismatch between what the demo UI expects and what real backend data actually provides — do not silently patch over mismatches by inventing fallback data or changing the UI to hide missing fields.

---

## 5. Verification Plan

### Automated
- `npm run build` in frontend — confirm no TypeScript errors after wiring
- `cd backend && npm test` — confirm all 23 existing backend tests still pass (should be untouched by frontend work)

### Manual
- Run backend (`npm run dev`, port 4000) and frontend (`npm run dev`, port 3000) together
- Walk through one full real run end-to-end: connect the `quicktalk` demo-repo → confirm real analyzer findings render correctly with correct confidence tags and evidence → confirm real proposal renders with real chosen/rejected plans → approve → confirm real Rules Layer checks run against real data → confirm real Prava sandbox receipt renders on the final screen
- Specifically verify: does the visual output at each state look **identical in style** to the original demo recording, just with real data instead of mock data? If any screen looks different in font, color, spacing, or component structure from the demo, that's a regression — fix it to match, don't treat it as an acceptable variant.

---

## 6. Explicit Warning About Scope Creep

Do not use this task as an opportunity to "improve" the UX, adjust the flow, add new states, or restyle anything — even if it seems like a good idea. The UX has already been through multiple design review passes and is considered final. This task is **integration only**. Any UX-level suggestions should be raised as a question to the user, not implemented unilaterally.
