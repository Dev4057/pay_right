/**
 * Deploy executor — the ONLY code path to Render.
 *
 * Mirrors the purchase executor's philosophy exactly:
 *   - Gate first: no deploy without an APPROVED receipt for THIS proposal.
 *   - AI planned (DeploySpec), deterministic code executes.
 *   - dry-run mode narrates every API call it WOULD make and touches nothing —
 *     the default, so rehearsals are free and safe. live mode is demo-day only.
 *
 * Order of operations (live):
 *   1. receipt gate            2. resolve workspace (getOwnerId)
 *   3. free Postgres if needed 4. create free web service from the public repo
 *   5. poll until live         6. health-check the URL
 */
import type { DeploySpec, PurchaseProposal, TransactionReceipt } from "../core/contract.js";
import { env } from "../config.js";
import {
  createFreePostgres,
  createFreeWebService,
  getOwnerId,
  getServiceUrl,
  waitForDeploy,
  waitForPostgres,
} from "./render.js";

export type DeployMode = "dry-run" | "live";

export interface DeployInput {
  spec: DeploySpec;
  proposal: PurchaseProposal;
  receipt: TransactionReceipt;
  /** Public GitHub URL of the repo being deployed. */
  repoUrl: string;
  mode: DeployMode;
  onProgress?: (line: string) => void;
}

export interface DeployOutcome {
  status: "dry-run-complete" | "live" | "refused" | "failed";
  /** Human-readable log of every step taken (or planned, in dry-run). */
  steps: string[];
  service_url: string | null;
  error: string | null;
}

/** The deploy inherits the purchase's authorization chain — or doesn't run. */
export function deployAuthorized(
  receipt: TransactionReceipt,
  proposal: PurchaseProposal
): { ok: boolean; reason: string } {
  if (receipt.status !== "APPROVED") {
    return { ok: false, reason: `receipt status is ${receipt.status} — only an APPROVED purchase may be deployed` };
  }
  if (receipt.proposal_id !== proposal.meta.proposal_id) {
    return { ok: false, reason: "receipt does not belong to this proposal" };
  }
  return { ok: true, reason: "approved purchase receipt matches this proposal" };
}

export async function executeDeploy(input: DeployInput): Promise<DeployOutcome> {
  const { spec, proposal, receipt, repoUrl, mode } = input;
  const steps: string[] = [];
  const step = (line: string) => {
    steps.push(line);
    input.onProgress?.(line);
  };

  // Gate 0: same discipline as the purchase — authorization before action.
  const auth = deployAuthorized(receipt, proposal);
  if (!auth.ok) {
    step(`REFUSED: ${auth.reason}`);
    return { status: "refused", steps, service_url: null, error: auth.reason };
  }
  step(`receipt gate passed: ${auth.reason} (${receipt.merchant} ${receipt.plan}, $${receipt.amount})`);

  const envVarsForRender = spec.env_vars.map((v) => ({
    key: v.key,
    // Placeholders here; the live path substitutes the real connection string.
    value: v.source === "literal" ? v.value : `<${v.source}>`,
  }));

  if (mode === "dry-run") {
    // Narrate the exact calls the live path would make — and make none of them.
    step(`DRY-RUN — no Render API calls are being made. The live path would run:`);
    step(`1. GET /v1/owners — resolve the workspace that owns the deployment`);
    if (spec.needs_postgres) {
      step(`2. POST /v1/postgres { name: "${spec.service_name}-db", plan: "free", version: "16" } — provision the database the report requires`);
      step(`3. poll GET /v1/postgres/:id until available, read its connection string into ${spec.env_vars.find((v) => v.source === "postgres-connection")?.key ?? "DATABASE_URL"}`);
    }
    step(`${spec.needs_postgres ? "4" : "2"}. POST /v1/services { type: "web_service", repo: "${repoUrl}", branch: "${spec.branch}", runtime: "${spec.runtime}", plan: "free", buildCommand: "${spec.build_command}", startCommand: "${spec.start_command}", envVars: ${JSON.stringify(envVarsForRender)} }`);
    step(`${spec.needs_postgres ? "5" : "3"}. poll the deploy until status "live"`);
    step(`${spec.needs_postgres ? "6" : "4"}. GET https://${spec.service_name}.onrender.com${spec.health_path} — verify the service answers`);
    step(`DRY-RUN COMPLETE — flip DEPLOY_MODE=live in backend/.env to execute for real (demo day).`);
    return { status: "dry-run-complete", steps, service_url: null, error: null };
  }

  // ----- live -----
  try {
    step("resolving Render workspace...");
    const ownerId = await getOwnerId();

    const envVars = [...envVarsForRender];
    if (spec.needs_postgres) {
      step(`provisioning free Postgres "${spec.service_name}-db" (the report's database finding requires it)...`);
      const pg = await createFreePostgres(ownerId, `${spec.service_name}-db`);
      step(`postgres ${pg.id} creating — waiting until available (can take a couple of minutes)...`);
      const connectionString = await waitForPostgres(pg.id);
      for (const v of envVars) {
        if (v.value === "<postgres-connection>") v.value = connectionString;
      }
      step("postgres available — connection string wired into the service env");
    }

    step(`creating free web service "${spec.service_name}" from ${repoUrl} (${spec.branch})...`);
    const service = await createFreeWebService({
      ownerId,
      name: spec.service_name,
      repoUrl,
      branch: spec.branch,
      runtime: spec.runtime,
      buildCommand: spec.build_command,
      startCommand: spec.start_command,
      envVars: envVars.filter((v) => !v.value.startsWith("<")), // user-must-set stays unset, never invented
    });
    step(`service ${service.id} created — building & deploying (free-tier builds take a few minutes)...`);
    await waitForDeploy(service.id);

    const url = service.url ?? (await getServiceUrl(service.id));
    step(`deploy is LIVE${url ? ` at ${url}` : ""}`);

    if (url) {
      step(`health check: GET ${url}${spec.health_path} ...`);
      try {
        const res = await fetch(`${url}${spec.health_path}`, { signal: AbortSignal.timeout(60_000) });
        step(res.ok ? `health check passed (${res.status})` : `health check answered ${res.status} — service is up, route may differ`);
      } catch {
        step("health check did not answer yet (free tier cold start) — the URL is live, first request may take ~1 min");
      }
    }
    return { status: "live", steps, service_url: url, error: null };
  } catch (e) {
    const message = (e as Error).message;
    step(`DEPLOY FAILED: ${message}`);
    // Same no-silent-retry stance as payments: surface it, let a human decide.
    return { status: "failed", steps, service_url: null, error: message };
  }
}

export function deployModeFromEnv(): "off" | DeployMode {
  if (env.DEPLOY_MODE === "live" && !env.RENDER_API_KEY) return "dry-run"; // live without a key is impossible — degrade safely
  return env.DEPLOY_MODE;
}
