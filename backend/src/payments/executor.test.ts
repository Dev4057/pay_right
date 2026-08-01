/**
 * Executor halt paths — these never touch Prava (they exit before any
 * network call), so they are unit-testable offline. Verifies the typed
 * halt codes, retry classes, and the audit seal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProposal, validateReport, type ApprovalDecision } from "../core/contract.js";
import { verifyAuditSeal } from "../core/audit.js";
import { executePurchase } from "./executor.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "core", "fixtures");
const report = validateReport(
  JSON.parse(readFileSync(join(fixtures, "report.example.json"), "utf-8"))
);
const proposal = validateProposal(
  JSON.parse(readFileSync(join(fixtures, "proposal.example.json"), "utf-8"))
);
const user = { id: "test", email: "test@example.com" };

const approved: ApprovalDecision = {
  proposal_id: proposal.meta.proposal_id,
  decision: "approved",
  decided_by: "user",
};

test("user rejection -> HALTED with USER_REJECTED / user-approval + valid seal", async () => {
  const decision: ApprovalDecision = { ...approved, decision: "rejected" };
  const { rules, receipt } = await executePurchase({ report, proposal, decision, user });

  assert.equal(receipt.status, "HALTED");
  assert.equal(receipt.halt_code, "USER_REJECTED");
  assert.equal(receipt.retry_class, "user-approval");
  assert.equal(receipt.plan, proposal.recommended.plan);

  const { audit_seal, ...unsealed } = receipt;
  assert.ok(audit_seal, "receipt must carry an audit seal");
  assert.equal(
    verifyAuditSeal({ report, proposal, decision, rules, receipt: unsealed }, audit_seal).valid,
    true
  );
});

test("tampering after the fact breaks the seal", async () => {
  const decision: ApprovalDecision = { ...approved, decision: "rejected" };
  const { rules, receipt } = await executePurchase({ report, proposal, decision, user });
  const { audit_seal, ...unsealed } = receipt;

  const tampered = { ...unsealed, amount: "0.01" }; // rewrite history
  assert.equal(
    verifyAuditSeal({ report, proposal, decision, rules, receipt: tampered }, audit_seal!).valid,
    false
  );
});

test("decision for a different proposal -> DECISION_INVALID / no-retry", async () => {
  const decision: ApprovalDecision = { ...approved, proposal_id: "prop_other" };
  const { receipt } = await executePurchase({ report, proposal, decision, user });
  assert.equal(receipt.halt_code, "DECISION_INVALID");
  assert.equal(receipt.retry_class, "no-retry");
});

test("broken traceability -> TRACEABILITY_BROKEN / re-quote", async () => {
  const bad = structuredClone(proposal);
  bad.reasoning[0]!.finding_ids = ["F99"];
  const { receipt } = await executePurchase({ report, proposal: bad, decision: approved, user });
  assert.equal(receipt.status, "HALTED");
  assert.equal(receipt.halt_code, "TRACEABILITY_BROKEN");
  assert.equal(receipt.retry_class, "re-quote");
});
