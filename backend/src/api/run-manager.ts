/**
 * Run manager — orchestrates one full pipeline run as an async state machine.
 *
 *   exploring -> awaiting_answers -> analyzing -> proposing
 *     -> awaiting_decision (approval mode only)
 *     -> executing -> completed | halted
 *   (any stage may end in: error)
 *
 * The analyzer's ask_user callback suspends the run mid-flight: the run
 * parks in "awaiting_answers" holding a deferred promise that
 * submitAnswers() resolves. Same pattern for the approval decision.
 *
 * In-memory store — deliberate hackathon scope (single process, demo runs).
 */
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { statSync } from "node:fs";
import type {
  ApprovalDecision,
  PurchaseProposal,
  RequirementsReport,
  RulesCheckResult,
  TransactionReceipt,
} from "../core/contract.js";
import type { QuestionDef } from "../core/interview.js";
import { runAnalyzer } from "../agents/analyzer.js";
import { runInfraAgent } from "../agents/infra.js";
import { executePurchase } from "../payments/executor.js";

export type RunState =
  | "exploring"
  | "awaiting_answers"
  | "analyzing"
  | "proposing"
  | "awaiting_decision"
  | "executing"
  | "completed"
  | "halted"
  | "rejected"
  | "error";

export type RunMode = "approval" | "autonomy";

interface Run {
  id: string;
  state: RunState;
  mode: RunMode;
  repo_path: string;
  repo_name: string;
  created_at: string;
  updated_at: string;
  questions: QuestionDef[] | null;
  report: RequirementsReport | null;
  proposal: PurchaseProposal | null;
  decision: ApprovalDecision | null;
  rules: RulesCheckResult | null;
  receipt: TransactionReceipt | null;
  payment_url: string | null;
  error: string | null;
  /** Internal deferred resolvers — never serialized to clients. */
  _resolveAnswers: ((answers: Record<string, string>) => void) | null;
  _resolveDecision: ((decision: ApprovalDecision) => void) | null;
}

/** Client-safe view of a run (no internal resolvers). */
export type RunView = Omit<Run, "_resolveAnswers" | "_resolveDecision">;

const runs = new Map<string, Run>();

const USER = { id: "pay_right_dev_001", email: "sn@blokcapital.io" };

function touch(run: Run, state?: RunState): void {
  if (state) run.state = state;
  run.updated_at = new Date().toISOString();
}

export function toView(run: Run): RunView {
  const { _resolveAnswers, _resolveDecision, ...view } = run;
  return view;
}

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export function listRuns(): RunView[] {
  return [...runs.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(toView);
}

export function startRun(repoPathRaw: string, mode: RunMode): RunView {
  const repo_path = resolve(repoPathRaw);
  const st = statSync(repo_path, { throwIfNoEntry: false });
  if (!st?.isDirectory()) throw new Error(`Repository path is not a directory: ${repo_path}`);

  const now = new Date().toISOString();
  const run: Run = {
    id: `run_${randomUUID().slice(0, 8)}`,
    state: "exploring",
    mode,
    repo_path,
    repo_name: basename(repo_path),
    created_at: now,
    updated_at: now,
    questions: null,
    report: null,
    proposal: null,
    decision: null,
    rules: null,
    receipt: null,
    payment_url: null,
    error: null,
    _resolveAnswers: null,
    _resolveDecision: null,
  };
  runs.set(run.id, run);

  void drive(run).catch((e) => {
    run.error = (e as Error).message;
    touch(run, "error");
  });

  return toView(run);
}

/** The whole pipeline for one run, suspending where humans are needed. */
async function drive(run: Run): Promise<void> {
  // 1. Analyzer (suspends in ask_user until answers arrive)
  const { report } = await runAnalyzer(run.repo_path, run.repo_name, async (questions) => {
    run.questions = questions;
    touch(run, "awaiting_answers");
    return new Promise<Record<string, string>>((res) => {
      run._resolveAnswers = (answers) => {
        run._resolveAnswers = null;
        touch(run, "analyzing");
        res(answers);
      };
    });
  });
  run.report = report;

  // 2. Infra Agent
  touch(run, "proposing");
  const proposalId = `prop_${randomUUID().slice(0, 8)}`;
  const { proposal } = await runInfraAgent(report, run.mode, proposalId);
  run.proposal = proposal;

  // 3. Decision — human in approval mode, system-minted in autonomy mode.
  let decision: ApprovalDecision;
  if (run.mode === "approval") {
    touch(run, "awaiting_decision");
    decision = await new Promise<ApprovalDecision>((res) => {
      run._resolveDecision = (d) => {
        run._resolveDecision = null;
        res(d);
      };
    });
  } else {
    decision = {
      proposal_id: proposal.meta.proposal_id,
      decision: "approved",
      decided_by: "autonomy-mode",
      note: "Full Autonomy Mode: pre-authorized within wallet limits",
    };
  }
  run.decision = decision;

  if (decision.decision === "rejected") {
    // Still run the executor: it produces the auditable HALTED receipt
    // without ever touching Prava (authorization gate).
    const outcome = await executePurchase({
      report,
      proposal,
      decision,
      user: USER,
    });
    run.rules = outcome.rules;
    run.receipt = outcome.receipt;
    touch(run, "rejected");
    return;
  }

  // 4. Rules layer + Prava
  touch(run, "executing");
  const outcome = await executePurchase({
    report,
    proposal,
    decision,
    user: USER,
    onPaymentUrl: (url) => {
      run.payment_url = url;
      touch(run);
    },
  });
  run.rules = outcome.rules;
  run.receipt = outcome.receipt;
  touch(run, outcome.receipt.status === "APPROVED" ? "completed" : "halted");
}

export function submitAnswers(
  id: string,
  answers: Record<string, string>
): { ok: true } | { ok: false; error: string; status: number } {
  const run = runs.get(id);
  if (!run) return { ok: false, error: "run not found", status: 404 };
  if (run.state !== "awaiting_answers" || !run._resolveAnswers || !run.questions) {
    return { ok: false, error: `run is in state "${run.state}", not awaiting answers`, status: 409 };
  }
  // Every asked question must be answered with one of its exact options.
  for (const q of run.questions) {
    const a = answers[q.q_id];
    if (a === undefined) {
      return { ok: false, error: `missing answer for ${q.q_id} ("${q.question}")`, status: 400 };
    }
    if (!q.options.includes(a)) {
      return {
        ok: false,
        error: `answer for ${q.q_id} must be one of: ${q.options.join(" | ")}`,
        status: 400,
      };
    }
  }
  run._resolveAnswers(answers);
  return { ok: true };
}

export function submitDecision(
  id: string,
  decision: "approved" | "rejected",
  note?: string
): { ok: true } | { ok: false; error: string; status: number } {
  const run = runs.get(id);
  if (!run) return { ok: false, error: "run not found", status: 404 };
  if (run.state !== "awaiting_decision" || !run._resolveDecision || !run.proposal) {
    return { ok: false, error: `run is in state "${run.state}", not awaiting a decision`, status: 409 };
  }
  run._resolveDecision({
    proposal_id: run.proposal.meta.proposal_id,
    decision,
    decided_by: "user",
    ...(note ? { note } : {}),
  });
  return { ok: true };
}
