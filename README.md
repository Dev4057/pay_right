<div align="center">

<img src="frontend/public/logo.png" alt="Pay Right" width="90" />

# Pay Right

**An AI agent that reads your codebase, proves what infrastructure it needs, buys it — and deploys your app on it. Money moves are guarded by deterministic rules, not vibes.**

Built for the **Agentic Commerce Hackathon** · payments by [Prava](https://prava.space) · agents by OpenAI

</div>

---

## The problem, in plain words

Before launch, every team buys hosting. But there's **no traffic yet** — so the purchase is a guess.

- **Guess too small** → database fills, server maxes out, app breaks on launch day.
- **Guess too big** → you pay every month for capacity you never use.

The root cause: **nobody turns the actual code into a purchasing decision.** A human skims a pricing page and picks a plan on gut feeling.

And the moment you let an *AI agent* make that purchase instead, a scarier problem appears: **what stops it from hallucinating a plan, overpaying, or buying the wrong thing entirely?**

## Our answer

> **AI reasons. Deterministic code decides. Prava moves the money.**

Pay Right replaces the guess with **evidence**, and replaces trust-in-the-model with **rules the model cannot override**. Four agents, one non-negotiable gate:

1. **Analyzer Agent** reads the repo file-by-file and produces a requirements report — every finding carries `file:line` evidence and a confidence tag (`derived-from-code` / `inferred` / `user-provided` / `assumption`).
2. Code can't know your traffic — so the agent runs a **Load Interview**: 5–7 business questions a founder can actually answer ("Who is this for?", "Launch-day spike?"). Plain math — not the LLM — converts answers into a load class (XS/S/M/L).
3. **Infra Agent** compares real plans (Railway, Render, DigitalOcean) and proposes the best fit — every reason must cite finding IDs. A full paper trail from code to purchase.
4. **Four deterministic rules** gate the money. Pure TypeScript, zero AI:

   | Rule | Blocks |
   |---|---|
   | 💰 Spend ceiling | any price above your cap (set live from the dashboard slider) |
   | 🎯 Price match | any drift from the approved amount — compared in integer cents |
   | 🔒 Category lock | anything that isn't hosting |
   | 🧾 Traceability | reasoning that cites findings which don't exist |

5. **Prava executes** — passkey approval, a one-time Visa network token locked to the exact merchant and amount. The agent physically cannot exceed your limit or skip your key.
6. After the purchase, the loop **closes**: a **Deploy-Guide Agent** writes a step-by-step deployment guide for your exact repo on the exact plan bought, a deterministic **savings summary** shows what picking the cheapest *fitting* plan saved you (and which cheaper-looking plans would have failed in production), and the full receipt — sealed with a **SHA-256 audit hash** — is **emailed** to the signed-in user.
7. Then the **Deployer Agent** plans the deployment from the same evidence, and a receipt-gated executor puts the app **live on real infrastructure** — ending with a URL you can open.

## Architecture

```mermaid
flowchart LR
    A[📁 Your repo<br/>GitHub URL or local] --> B[🔍 Analyzer Agent]
    B --> Q[❓ Load Interview<br/>business questions only]
    Q --> C[📋 Requirements Report<br/>findings + evidence + load class]
    C --> D[🧠 Infra Agent<br/>compares real plans]
    D --> E[📊 Proposal<br/>every reason cites findings]
    E --> F{Who approves?}
    F -->|Approval Mode| G[👤 You review & approve]
    F -->|Full Autonomy| H[🛡️ Rules Layer<br/>4 deterministic checks]
    G --> H
    H -->|all pass| I[💳 Prava<br/>passkey + one-time Visa token]
    H -->|any fail| K[🛑 HALT<br/>typed code + retry class]
    I -->|payment fails| K
    I --> J[✅ Receipt + audit seal<br/>savings math + email]
    J --> L[🚀 Deployer Agent<br/>plans from the same report]
    L --> M[🌐 App LIVE<br/>real URL + health check]
```

### The trust boundary — where AI ends and code begins

```mermaid
flowchart TB
    subgraph AI["🧠 AI may reason here"]
        R1[Read code & find evidence]
        R2[Compare plans & write proposals]
        R3[Plan the deployment]
        R4[Write the deployment guide]
    end
    subgraph CODE["🛡️ Only deterministic code here — no LLM"]
        C1[Load math → XS / S / M / L]
        C2[Plan eligibility + cheapest-fit check]
        C3[The 4 purchase rules]
        C4[Prava session · amount-locked]
        C5[Receipt-gated deploy executor]
        C6[Audit seal · sha-256 over the whole bundle]
    end
    AI -->|"validated JSON (zod), retried until correct"| CODE
```

Every AI output passes through a **zod contract with a validation-retry loop** — the agent's JSON is rejected and re-prompted until it's structurally perfect. Hallucinated plans, made-up prices, phantom findings, and invented secrets die at this boundary, before any rule even runs.

**And you don't have to take our word for it:** the dashboard has a *"These rules are code, not AI — read them"* button that displays the literal `rules.ts` source, **served live from the running backend**. Radical transparency as a feature.

## When it says no — halts are typed, not vibes

A blocked purchase doesn't throw an error string. It produces an auditable receipt with a **typed halt code** and a **retry class** telling an orchestrator what's legitimate next:

```
CAP_EXCEEDED        → user-approval   (only a human may raise the cap)
PRICE_MISMATCH      → re-quote        (proposal is stale, regenerate)
CATEGORY_VIOLATION  → no-retry        (scope breach is never valid)
TRACEABILITY_BROKEN → re-quote        (defective paper trail)
```

No autonomous retry, ever — only transient network glitches are transparently smoothed over; a real decline stops dead. And every receipt — approved or halted — is sealed with a **sha-256 hash over the full decision bundle** (report + proposal + decision + rules + receipt), so anyone can prove nothing was edited after the fact.

**Try it live:** drag the spend-cap slider below the plan price and watch the run halt with `CAP_EXCEEDED` — before Prava is ever contacted.

## What a run looks like

Sign in → paste a GitHub URL → watch the agent read the repo live (real file tree with the current file glowing, streaming findings) → answer 5 founder questions → review findings with evidence → see the proposal with reasons linked to findings → live rules check → passkey → green receipt with savings math and an agent-written deployment guide → the same receipt lands in your inbox → press **Deploy** and watch the app go live at a real URL.

The deployer also has a **dry-run mode** that narrates every provider API call it *would* make without executing any — how we rehearse safely, and itself a transparency feature.

## Run it yourself

```bash
# backend
cd backend
cp .env.example .env                         # then fill in your keys
npm install && npm run dev                   # http://localhost:4000

# frontend
cd frontend && npm install && npm run dev    # http://localhost:3000
```

Minimum to run: an OpenAI key and Prava sandbox keys ([.env.example](backend/.env.example)
documents every variable). SMTP and the Render deploy key are optional extras.

Works with any public GitHub repo, a local path, or the bundled `demo-repo`. No SMTP or deploy key? Those steps skip gracefully — everything still shows on the dashboard.

## Dig deeper

| Doc | What's inside |
|---|---|
| [WORKING.md](WORKING.md) | The full design: load math, interview rules, agent tools |
| [backend/API.md](backend/API.md) | The HTTP API the dashboard runs on |
| [backend/README.md](backend/README.md) | Code map — where everything lives |

**Stack:** TypeScript everywhere · 4 OpenAI tool-calling agents · zod contracts · Express · Next.js · Prava sandbox · Render deploy rail · **35 deterministic tests on the money and deploy paths**.

---

<div align="center">

*Pay Right — pre-deployment infrastructure, purchased responsibly.*

</div>
