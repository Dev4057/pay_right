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
import { writeDeployGuide } from "../agents/deploy-guide.js";
import { planDeploy } from "../agents/deployer.js";
import { executePurchase } from "../payments/executor.js";
import { deployModeFromEnv, executeDeploy } from "../deploy/executor.js";
import { RepoTools } from "../agents/repo-tools.js";
import { computeSavings, type SavingsSummary } from "../core/savings.js";
import { isEmailConfigured, sendReceiptEmail } from "../notify/email.js";
import type { DeploySpec } from "../core/contract.js";

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

/** The deployment console's state, streamed to the UI while it runs. */
export interface DeployState {
  status: "planning" | "deploying" | "dry-run-complete" | "live" | "refused" | "failed";
  mode: "dry-run" | "live";
  steps: string[];
  service_url: string | null;
  error: string | null;
}

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
  /** Who signed in on the dashboard — the receipt email goes here. */
  user_email: string | null;
  user_name: string | null;
  /** Post-purchase deliverables (filled after a successful payment). */
  savings: SavingsSummary | null;
  deploy_guide: string | null;
  /** "sent to x" | "skipped (...)" | "failed: ..." — null until attempted. */
  email_status: string | null;
  /** The Deployer Agent's validated plan (cached across deploy attempts). */
  deploy_spec: DeploySpec | null;
  /** Live deploy console state — null until the user presses Deploy. */
  deploy: DeployState | null;
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

export function startRun(
  repoPathRaw: string,
  mode: RunMode,
  walletLimitUsd?: number,
  user?: { email?: string; name?: string }
): RunView {
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
    user_email: user?.email ?? null,
    user_name: user?.name ?? null,
    savings: null,
    deploy_guide: null,
    email_status: null,
    deploy_spec: null,
    deploy: null,
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
    run.email_status = "skipped (proposal rejected — nothing was purchased)";
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

  if (outcome.receipt.status !== "APPROVED") {
    run.email_status = "skipped (run halted — nothing was purchased)";
    touch(run, "halted");
    return;
  }

  // 5. Post-purchase deliverables. Savings math is deterministic and instant,
  //    so it is ready the moment the receipt appears; the deployment guide and
  //    the email land seconds later (the frontend keeps polling for them).
  //    Every step is non-fatal — the purchase already succeeded.
  run.savings = computeSavings(report, proposal);
  act(run, `savings: ${run.savings.headline}`);
  touch(run, "completed");

  try {
    act(run, "deploy-guide agent: writing the deployment guide for this repo + plan");
    run.deploy_guide = await writeDeployGuide(report, proposal, run.repo_name);
    act(run, "deployment guide ready");
  } catch (e) {
    act(run, `deployment guide failed (non-fatal): ${(e as Error).message}`);
  }

  if (!run.user_email) {
    run.email_status = "skipped (no signed-in email on this run)";
  } else if (!isEmailConfigured()) {
    run.email_status = "skipped (SMTP not configured on the backend)";
  } else {
    try {
      await sendReceiptEmail({
        to: run.user_email,
        userName: run.user_name ?? "there",
        repoName: run.repo_name,
        report,
        proposal,
        receipt: run.receipt!,
        savings: run.savings,
        deployGuide: run.deploy_guide,
      });
      run.email_status = `sent to ${run.user_email}`;
      act(run, `receipt email sent to ${run.user_email}`);
    } catch (e) {
      run.email_status = `failed: ${(e as Error).message}`;
      act(run, `receipt email failed (non-fatal): ${(e as Error).message}`);
    }
  }
  touch(run);
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

/**
 * Kick off the deploy rail for a completed run (user pressed "Deploy").
 * Async fire-and-forget like drive(); the UI polls run.deploy for progress.
 *
 * Guards: the run must be completed with an APPROVED receipt, the repo must
 * be a public GitHub URL (that's what Render builds from), DEPLOY_MODE must
 * not be off, and no deploy may already be in flight. Re-triggering after a
 * terminal outcome IS allowed — dry-run first, live on demo day.
 */
/** The repo's real package.json (raw GitHub) — ground truth for deploy commands. */
async function fetchRepoPackageJson(repoUrl: string): Promise<string | null> {
  const m = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(repoUrl.trim());
  if (!m) return null;
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/package.json`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export function startDeploy(id: string): { ok: true } | { ok: false; error: string; status: number } {
  const run = runs.get(id);
  if (!run) return { ok: false, error: "run not found", status: 404 };
  if (run.state !== "completed" || !run.receipt || !run.proposal || !run.report) {
    return { ok: false, error: `run is in state "${run.state}" — only a completed purchase can be deployed`, status: 409 };
  }
  const mode = deployModeFromEnv();
  if (mode === "off") {
    return { ok: false, error: "deployments are disabled on this backend (DEPLOY_MODE=off)", status: 409 };
  }
  if (!isGithubUrl(run.repo_path)) {
    return { ok: false, error: "only runs started from a public GitHub URL can be deployed (Render builds from the repo)", status: 409 };
  }
  if (run.deploy && (run.deploy.status === "planning" || run.deploy.status === "deploying")) {
    return { ok: false, error: "a deploy is already in progress for this run", status: 409 };
  }
  // A failed attempt invalidates the cached plan — re-plan from scratch so the
  // agent can correct whatever the failure exposed (wrong start script etc.).
  if (run.deploy?.status === "failed") {
    run.deploy_spec = null;
  }

  const deploy: DeployState = { status: "planning", mode, steps: [], service_url: null, error: null };
  run.deploy = deploy;
  const step = (line: string) => {
    deploy.steps.push(line);
    touch(run);
  };

  void (async () => {
    try {
      // 1. Plan (Deployer Agent) — reuse a cached spec so re-runs are instant.
      if (!run.deploy_spec) {
        act(run, "deployer agent: planning the deployment from the requirements report");
        step("deployer agent: reading the requirements report...");
        const packageJson = await fetchRepoPackageJson(run.repo_path);
        step(
          packageJson
            ? "fetched the repo's package.json — commands grounded in its real scripts"
            : "package.json not reachable — inferring commands from the findings"
        );
        const { spec } = await planDeploy(run.report!, run.repo_name, {
          ...(packageJson ? { packageJson } : {}),
          onProgress: (line) => step(line),
        });
        run.deploy_spec = spec;
      } else {
        step("using the previously validated deploy spec");
      }

      // 2. Execute (deterministic) — dry-run narrates, live provisions.
      deploy.status = "deploying";
      act(run, `deploy executor: ${mode} run for ${run.repo_name}`);
      const outcome = await executeDeploy({
        spec: run.deploy_spec,
        proposal: run.proposal!,
        receipt: run.receipt!,
        repoUrl: run.repo_path,
        mode,
        onProgress: (line) => step(line),
      });
      deploy.status = outcome.status;
      deploy.service_url = outcome.service_url;
      deploy.error = outcome.error;
      act(
        run,
        outcome.status === "live"
          ? `DEPLOYED — ${outcome.service_url}`
          : `deploy finished: ${outcome.status}`
      );
    } catch (e) {
      deploy.status = "failed";
      deploy.error = (e as Error).message;
      deploy.steps.push(`DEPLOY FAILED: ${deploy.error}`);
      act(run, `deploy failed: ${deploy.error}`);
    }
    touch(run);
  })();

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
