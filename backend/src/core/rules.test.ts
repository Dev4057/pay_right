import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProposal, validateReport, type ApprovalDecision } from "./contract.js";
import { decisionAuthorizes, runRulesCheck, toCents } from "./rules.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const report = validateReport(
  JSON.parse(readFileSync(join(fixtures, "report.example.json"), "utf-8"))
);
const proposal = validateProposal(
  JSON.parse(readFileSync(join(fixtures, "proposal.example.json"), "utf-8"))
);

const approval: ApprovalDecision = {
  proposal_id: "prop_demo_001",
  decision: "approved",
  decided_by: "user",
};

const base = {
  report,
  proposal,
  decision: approval,
  charge_amount: "5.00",
  wallet_limit_usd: "30.00",
  assigned_category: "hosting",
};

test("toCents parses and rejects correctly", () => {
  assert.equal(toCents("5.00"), 500);
  assert.equal(toCents("30.00"), 3000);
  assert.throws(() => toCents("5"));
  assert.throws(() => toCents("5.0"));
  assert.throws(() => toCents("abc"));
});

test("clean purchase passes all four rules", () => {
  const r = runRulesCheck(base);
  assert.equal(r.passed, true);
  assert.equal(r.checks.length, 4);
  assert.ok(r.checks.every((c) => c.passed));
});

test("spend ceiling blocks a price above the wallet limit", () => {
  const r = runRulesCheck({ ...base, wallet_limit_usd: "4.00" });
  assert.equal(r.passed, false);
  assert.equal(r.checks.find((c) => c.rule === "spend-ceiling")!.passed, false);
});

test("price mismatch between charge and approved proposal is blocked", () => {
  const r = runRulesCheck({ ...base, charge_amount: "9.99" });
  assert.equal(r.passed, false);
  assert.equal(r.checks.find((c) => c.rule === "price-match")!.passed, false);
});

test("category outside the assigned lock is blocked", () => {
  const r = runRulesCheck({ ...base, assigned_category: "domains" });
  assert.equal(r.passed, false);
  assert.equal(r.checks.find((c) => c.rule === "category-lock")!.passed, false);
});

test("proposal citing findings not in the report is blocked", () => {
  const tampered = structuredClone(proposal);
  tampered.reasoning[0]!.finding_ids = ["F42"];
  const r = runRulesCheck({ ...base, proposal: tampered });
  assert.equal(r.passed, false);
  assert.equal(r.checks.find((c) => c.rule === "traceability")!.passed, false);
});

test("decision for a different proposal does not authorize", () => {
  const other: ApprovalDecision = { ...approval, proposal_id: "prop_other" };
  assert.equal(decisionAuthorizes(other, proposal).ok, false);
});

test("rejected decision does not authorize", () => {
  const rejected: ApprovalDecision = { ...approval, decision: "rejected" };
  assert.equal(decisionAuthorizes(rejected, proposal).ok, false);
});

test("approval-mode proposal cannot be self-approved by autonomy", () => {
  const auto: ApprovalDecision = { ...approval, decided_by: "autonomy-mode" };
  assert.equal(decisionAuthorizes(auto, proposal).ok, false);
});

test("user approval of the right proposal authorizes", () => {
  assert.equal(decisionAuthorizes(approval, proposal).ok, true);
});
