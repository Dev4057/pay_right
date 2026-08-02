/**
 * Deploy executor — the receipt gate and the dry-run path are pure (no
 * network), so they are unit-testable offline. Also covers the deterministic
 * DeploySpec sanity checks that back the deployer agent's retry loop.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateProposal,
  validateReport,
  type DeploySpec,
  type TransactionReceipt,
} from "../core/contract.js";
import { checkDeploySpec } from "../agents/deployer.js";
import { executeDeploy } from "./executor.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "core", "fixtures");
const report = validateReport(
  JSON.parse(readFileSync(join(fixtures, "report.example.json"), "utf-8"))
);
const proposal = validateProposal(
  JSON.parse(readFileSync(join(fixtures, "proposal.example.json"), "utf-8"))
);

const dbIsPostgres = report.database.value.type === "postgres";

const spec: DeploySpec = {
  service_name: "demo-repo",
  runtime: "node",
  branch: "main",
  build_command: "npm install",
  start_command: "npm start",
  needs_postgres: dbIsPostgres,
  env_vars: [
    { key: "NODE_ENV", value: "production", source: "literal" },
    ...(dbIsPostgres
      ? [{ key: "DATABASE_URL", value: "", source: "postgres-connection" as const }]
      : []),
  ],
  health_path: "/",
  reasoning: [{ reason: "runtime from the report", finding_ids: [report.runtime.id] }],
};

const approvedReceipt: TransactionReceipt = {
  proposal_id: proposal.meta.proposal_id,
  method: "session",
  merchant: proposal.recommended.provider,
  plan: proposal.recommended.plan,
  amount: proposal.recommended.price,
  currency: "USD",
  status: "APPROVED",
  timestamp: new Date().toISOString(),
};

const repoUrl = "https://github.com/example/demo-repo";

test("dry-run with an approved receipt narrates the plan and makes no calls", async () => {
  const outcome = await executeDeploy({
    spec,
    proposal,
    receipt: approvedReceipt,
    repoUrl,
    mode: "dry-run",
  });
  assert.equal(outcome.status, "dry-run-complete");
  assert.equal(outcome.service_url, null);
  assert.equal(outcome.error, null);
  assert.ok(outcome.steps.some((s) => s.includes("DRY-RUN")));
  assert.ok(outcome.steps.some((s) => s.includes(repoUrl)), "plan must name the repo it would deploy");
});

test("a HALTED receipt is refused — no deploy without a successful purchase", async () => {
  const halted: TransactionReceipt = { ...approvedReceipt, status: "HALTED" };
  const outcome = await executeDeploy({ spec, proposal, receipt: halted, repoUrl, mode: "dry-run" });
  assert.equal(outcome.status, "refused");
  assert.match(outcome.error ?? "", /APPROVED/);
});

test("a receipt for a different proposal is refused", async () => {
  const foreign: TransactionReceipt = { ...approvedReceipt, proposal_id: "prop_other" };
  const outcome = await executeDeploy({ spec, proposal, receipt: foreign, repoUrl, mode: "dry-run" });
  assert.equal(outcome.status, "refused");
});

test("checkDeploySpec rejects invented secrets and phantom findings", () => {
  const bad: DeploySpec = {
    ...spec,
    env_vars: [{ key: "API_KEY", value: "sk-invented-secret", source: "user-must-set" }],
    reasoning: [{ reason: "made up", finding_ids: ["F99"] }],
  };
  const violations = checkDeploySpec(bad, report);
  assert.ok(violations.some((v) => v.includes("F99")), "phantom finding id must be caught");
  assert.ok(
    violations.some((v) => v.includes("API_KEY")),
    "a non-empty value on user-must-set must be caught"
  );
});

test("checkDeploySpec rejects a start_command whose npm script does not exist", () => {
  // The exact failure the HandShake rehearsal exposed: "npm start" against a
  // package.json with no "start" script.
  const pkg = JSON.stringify({ scripts: { server: "tsx src/server.ts", web: "vite" } });
  const violations = checkDeploySpec({ ...spec, start_command: "npm start" }, report, pkg);
  assert.ok(
    violations.some((v) => v.includes('"start"') && v.includes("server")),
    "missing start script must be caught and the available scripts listed"
  );
  // The correct command passes.
  const ok = checkDeploySpec({ ...spec, start_command: "npm run server" }, report, pkg);
  assert.ok(!ok.some((v) => v.includes("start_command")), "existing script must be accepted");
});

test("checkDeploySpec requires running the build script when one exists (Next.js apps)", () => {
  const pkg = JSON.stringify({ scripts: { build: "next build", start: "next start" } });
  const missing = checkDeploySpec(
    { ...spec, build_command: "npm install", start_command: "npm start" },
    report,
    pkg
  );
  assert.ok(missing.some((v) => v.includes('"build"')), "unbuilt Next.js app must be caught");
  const ok = checkDeploySpec(
    { ...spec, build_command: "npm install --include=dev && npm run build", start_command: "npm start" },
    report,
    pkg
  );
  assert.equal(ok.filter((v) => v.includes("build")).length, 0, "install+build must pass");
});

test("checkDeploySpec ties needs_postgres to the report's database finding", () => {
  const flipped: DeploySpec = { ...spec, needs_postgres: !spec.needs_postgres, env_vars: [] };
  const violations = checkDeploySpec(flipped, report);
  assert.ok(violations.length > 0, "postgres mismatch with the report must be caught");
});
