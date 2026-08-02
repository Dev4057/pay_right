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
import { basename, join, resolve } from "node:path";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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
import { RepoTools } from "../agents/repo-tools.js";

export type RunState =
  | "cloning"
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
  /** Live agent activity feed ("the code rail") — newest last, capped. */
  activity: string[];
  /** Repo file paths (repo-relative) — lets the UI render a real file tree. */
  files: string[] | null;
  /** Spend ceiling for THIS run (dashboard slider). null = env default. */
  wallet_limit_usd: string | null;
  /** Internal deferred resolvers — never serialized to clients. */
  _resolveAnswers: ((answers: Record<string, string>) => void) | null;
  _resolveDecision: ((decision: ApprovalDecision) => void) | null;
}

/** Client-safe view of a run (no internal resolvers). */
export type RunView = Omit<Run, "_resolveAnswers" | "_resolveDecision">;

const runs = new Map<string, Run>();

const USER = { id: "pay_right_dev_001", email: "sn@blokcapital.io" };

const execFileAsync = promisify(execFile);

/** Relative repo paths resolve against the PROJECT root (pay_right/), not backend/. */
const PROJECT_ROOT = resolve(process.cwd(), "..");

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/i;

export function isGithubUrl(input: string): boolean {
  return GITHUB_URL_RE.test(input.trim());
}

function touch(run: Run, state?: RunState): void {
  if (state) run.state = state;
  run.updated_at = new Date().toISOString();
}

const MAX_ACTIVITY_LINES = 300;

/** Append a line to the run's live activity feed (UTC HH:MM:SS prefix). */
function act(run: Run, line: string): void {
  run.activity.push(`${new Date().toISOString().slice(11, 19)}  ${line}`);
  if (run.activity.length > MAX_ACTIVITY_LINES) run.activity.shift();
  touch(run);
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

export function startRun(repoPathRaw: string, mode: RunMode, walletLimitUsd?: number): RunView {
  const input = repoPathRaw.trim();
  let repo_path: string;
  let repo_name: string;
  let initialState: RunState;

  if (isGithubUrl(input)) {
    // Public GitHub repo — cloned by drive() before analysis.
    repo_path = input.replace(/\/+$/, "");
    repo_name = repo_path.split("/").pop()!.replace(/\.git$/, "");
    initialState = "cloning";
  } else {
    // Local folder — relative paths resolve against the project root,
    // so "demo-repo" works no matter where the server was started from.
    repo_path = resolve(PROJECT_ROOT, input);
    const st = statSync(repo_path, { throwIfNoEntry: false });
    if (!st?.isDirectory()) {
      throw new Error(
        `Repository path is not a directory: ${repo_path}. ` +
          `Use an absolute path, a path relative to the project root (e.g. "demo-repo"), ` +
          `or a public GitHub URL (https://github.com/owner/repo).`
      );
    }
    repo_name = basename(repo_path);
    initialState = "exploring";
  }

  const now = new Date().toISOString();
  const run: Run = {
    id: `run_${randomUUID().slice(0, 8)}`,
    state: initialState,
    mode,
    repo_path,
    repo_name,
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
    activity: [],
    files: null,
    wallet_limit_usd: walletLimitUsd != null ? walletLimitUsd.toFixed(2) : null,
    _resolveAnswers: null,
    _resolveDecision: null,
  };
  runs.set(run.id, run);
  act(run, initialState === "cloning" ? `cloning ${repo_path} ...` : `analyzer started on ${repo_name}/`);
  if (run.wallet_limit_usd) {
    act(run, `spend ceiling for this run: $${run.wallet_limit_usd} (set from dashboard)`);
  }

  void drive(run).catch((e) => {
    run.error = (e as Error).message;
    touch(run, "error");
  });

  return toView(run);
}

/** The whole pipeline for one run, suspending where humans are needed. */
async function drive(run: Run): Promise<void> {
  // 0. GitHub URL? Shallow-clone it first (public repos only).
  let localPath = run.repo_path;
  if (isGithubUrl(run.repo_path)) {
    const dest = join(tmpdir(), "pay_right_clones", `${run.repo_name}-${run.id}`);
    try {
      await execFileAsync("git", ["clone", "--depth", "1", run.repo_path, dest], {
        timeout: 90_000,
      });
    } catch (e) {
      throw new Error(
        `Could not clone ${run.repo_path} — is it a public repository? (${(e as Error).message})`
      );
    }
    localPath = dest;
    act(run, `clone complete -> analyzing ${run.repo_name}/`);
    touch(run, "exploring");
  }

  // Index the repo's files so the UI can render a real file tree.
  try {
    const listing = new RepoTools(localPath).listFiles();
    run.files = listing.files;
    act(run, `indexed ${listing.files.length} files${listing.truncated ? " (capped at 500)" : ""}`);
  } catch {
    run.files = null; // non-fatal — the tree just won't render
  }

  // 1. Analyzer. The trick that makes the interview work over HTTP: when the
  //    agent calls ask_user, we park the run in "awaiting_answers" and return
  //    a promise that stays unresolved. The whole pipeline simply waits here
  //    — until the POST /answers endpoint calls the stored resolver, which
  //    wakes this exact spot up with the user's answers.
  const { report } = await runAnalyzer(
    localPath,
    run.repo_name,
    async (questions) => {
      run.questions = questions;
      act(run, `load interview: ${questions.length} questions for the founder`);
      touch(run, "awaiting_answers");
      return new Promise<Record<string, string>>((res) => {
        run._resolveAnswers = (answers) => {
          run._resolveAnswers = null;
          act(run, "answers received -> computing load class (deterministic)");
          touch(run, "analyzing");
          res(answers);
        };
      });
    },
    (line) => act(run, line)
  );
  run.report = report;
  act(
    run,
    `report ready: ${report.special_needs.length + 4} findings, load class ${report.load_class.value}, ${report.flags.length} flag(s)`
  );

  // 2. Infra Agent
  touch(run, "proposing");
  const proposalId = `prop_${randomUUID().slice(0, 8)}`;
  const { proposal } = await runInfraAgent(report, run.mode, proposalId, (line) => act(run, line));
  run.proposal = proposal;
  act(
    run,
    `proposal: ${proposal.recommended.provider} ${proposal.recommended.plan} $${proposal.recommended.price}/${proposal.recommended.billing_cycle}`
  );

  // 3. Decision — same suspend-and-wait trick as the interview: in approval
  //    mode the run parks in "awaiting_decision" until POST /decision fires.
  //    In autonomy mode no human is asked — but a decision object is still
  //    minted, because the executor refuses to run without one.
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
      wallet_limit_usd: run.wallet_limit_usd ?? undefined,
    });
    run.rules = outcome.rules;
    run.receipt = outcome.receipt;
    touch(run, "rejected");
    return;
  }

  // 4. Rules layer + Prava
  touch(run, "executing");
  act(run, "running rules layer: spend-ceiling, price-match, category-lock, traceability");
  const outcome = await executePurchase({
    report,
    proposal,
    decision,
    user: USER,
    wallet_limit_usd: run.wallet_limit_usd ?? undefined,
    onPaymentUrl: (url) => {
      run.payment_url = url;
      act(run, "Prava session created — waiting for card + passkey approval");
      touch(run);
    },
  });
  run.rules = outcome.rules;
  run.receipt = outcome.receipt;
  const failed = outcome.rules.checks.filter((c) => !c.passed);
  act(
    run,
    failed.length === 0
      ? `rules: 4/4 passed -> ${outcome.receipt.status}`
      : `rules: BLOCKED at ${failed[0]!.rule} -> HALTED`
  );
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
