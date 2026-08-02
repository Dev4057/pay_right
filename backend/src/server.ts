/**
 * HTTP API for the frontend dashboard.
 *
 *   GET  /health                 backend + config + Prava reachability
 *   GET  /api/catalog            the curated plan catalog
 *   GET  /api/fixtures/report    example report (frontend dev aid)
 *   GET  /api/fixtures/proposal  example proposal (frontend dev aid)
 *   GET  /api/runs               all runs (newest first)
 *   POST /api/runs               start a run { repo_path?, mode? }
 *   GET  /api/runs/:id           poll run state (the frontend's main loop)
 *   POST /api/runs/:id/answers   submit Load Interview answers
 *   POST /api/runs/:id/decision  approve / reject the proposal
 *
 * Frontend polls GET /api/runs/:id and renders by `state`:
 *   awaiting_answers -> show run.questions
 *   awaiting_decision -> show run.proposal
 *   executing + payment_url -> show the Prava payment link
 *   completed/halted/rejected -> show run.rules + run.receipt
 */
import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { env } from "./config.js";
import { loadCatalog } from "./core/catalog.js";
import { health as pravaHealth } from "./payments/prava.js";
import {
  getRun,
  listRuns,
  startRun,
  submitAnswers,
  submitDecision,
  toView,
} from "./api/run-manager.js";

const app = express();
app.use(cors()); // hackathon scope: allow the Next.js dev origin
app.use(express.json());

const DEFAULT_REPO = join(process.cwd(), "..", "demo-repo");
const fixturesDir = join(process.cwd(), "src", "core", "fixtures");

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    openai_key_present: Boolean(env.OPENAI_API_KEY),
    prava_reachable: await pravaHealth(),
    wallet_limit_usd: env.WALLET_LIMIT_USD,
    assigned_category: env.ASSIGNED_CATEGORY,
    model: env.OPENAI_MODEL,
  });
});

app.get("/api/catalog", (_req, res) => {
  res.json(loadCatalog());
});

app.get("/api/fixtures/report", (_req, res) => {
  res.json(JSON.parse(readFileSync(join(fixturesDir, "report.example.json"), "utf-8")));
});
app.get("/api/fixtures/proposal", (_req, res) => {
  res.json(JSON.parse(readFileSync(join(fixturesDir, "proposal.example.json"), "utf-8")));
});

app.get("/api/runs", (_req, res) => {
  res.json({ runs: listRuns() });
});

const StartRunBody = z.object({
  repo_path: z.string().optional(),
  mode: z.enum(["approval", "autonomy"]).default("approval"),
  // Per-run spend ceiling set from the dashboard slider. Falls back to the
  // WALLET_LIMIT_USD env value when omitted.
  wallet_limit_usd: z.number().min(1).max(1000).optional(),
});

app.post("/api/runs", (req, res) => {
  const parsed = StartRunBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join("; ") });
    return;
  }
  if (!env.OPENAI_API_KEY) {
    res.status(503).json({ error: "OPENAI_API_KEY is not configured on the backend" });
    return;
  }
  try {
    const run = startRun(
      parsed.data.repo_path ?? DEFAULT_REPO,
      parsed.data.mode,
      parsed.data.wallet_limit_usd
    );
    res.status(201).json(run);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get("/api/runs/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  res.json(toView(run));
});

const AnswersBody = z.object({ answers: z.record(z.string(), z.string()) });

app.post("/api/runs/:id/answers", (req, res) => {
  const parsed = AnswersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'body must be { answers: { "Q_ID": "chosen option", ... } }' });
    return;
  }
  const result = submitAnswers(req.params.id, parsed.data.answers);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

const DecisionBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().optional(),
});

app.post("/api/runs/:id/decision", (req, res) => {
  const parsed = DecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'body must be { decision: "approved" | "rejected", note? }' });
    return;
  }
  const result = submitDecision(req.params.id, parsed.data.decision, parsed.data.note);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`pay_right backend listening on http://localhost:${PORT}`);
  console.log(`  default repo for analysis: ${DEFAULT_REPO}`);
});
