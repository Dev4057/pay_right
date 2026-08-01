/**
 * Audit seal — tamper evidence for the decision record.
 *
 * One sha256 fingerprint over the WHOLE bundle (report + proposal +
 * decision + rules + receipt-without-the-seal). Change one character in
 * any artifact afterwards and the seal no longer matches: the records go
 * from "trust our files" to "verify it yourself".
 *
 * Note: this proves records were not altered AFTER the purchase. It does
 * not prove they were correct — correctness is the job of the validators,
 * checks, and tests that run BEFORE anything is sealed.
 */
import { createHash } from "node:crypto";
import type {
  ApprovalDecision,
  PurchaseProposal,
  RequirementsReport,
  RulesCheckResult,
  TransactionReceipt,
} from "./contract.js";

export interface AuditBundle {
  report: RequirementsReport;
  proposal: PurchaseProposal;
  decision: ApprovalDecision;
  rules: RulesCheckResult;
  receipt: Omit<TransactionReceipt, "audit_seal">;
}

export function computeAuditSeal(bundle: AuditBundle): string {
  // Same-process construction gives stable key order; good enough for
  // tamper evidence at this scope (canonical JSON would be the v2 step).
  return createHash("sha256").update(JSON.stringify(bundle)).digest("hex");
}

/** Re-computes the seal from the artifacts and compares. */
export function verifyAuditSeal(
  bundle: AuditBundle,
  seal: string
): { valid: boolean; expected: string } {
  const expected = computeAuditSeal(bundle);
  return { valid: expected === seal, expected };
}
