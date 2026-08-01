/**
 * THE RULES LAYER — the non-negotiable gate between decision and money.
 *
 * Plain deterministic code. No LLM involvement, no code path around it:
 * the purchase executor refuses to touch Prava unless this gate passes.
 *
 * Four rules (see WORKING.md §8):
 *   1. spend-ceiling  — price <= the user's wallet limit
 *   2. price-match    — the amount about to be charged == the approved proposal's price
 *   3. category-lock  — the purchase is inside the agent's assigned category
 *   4. traceability   — every reasoning entry cites findings that exist in the report
 *
 * Defense in depth: Prava additionally locks the virtual card to the exact
 * merchant + amount at the network level. These checks run BEFORE any
 * session is even created, and produce the auditable RulesCheckResult.
 */
import type {
  ApprovalDecision,
  PurchaseProposal,
  RequirementsReport,
  RulesCheckResult,
} from "./contract.js";
import { citedFindingsExist } from "./contract.js";
import { env } from "../config.js";

/** Parse "12.34" into integer cents; throws on malformed money strings. */
export function toCents(amount: string): number {
  const m = /^(\d+)\.(\d{2})$/.exec(amount.trim());
  if (!m) throw new Error(`Malformed amount: "${amount}" (expected e.g. "5.00")`);
  return Number(m[1]) * 100 + Number(m[2]);
}

export interface PurchaseContext {
  report: RequirementsReport;
  proposal: PurchaseProposal;
  decision: ApprovalDecision;
  /** The exact amount the executor is about to charge. */
  charge_amount: string;
  wallet_limit_usd?: string; // defaults to env WALLET_LIMIT_USD
  assigned_category?: string; // defaults to env ASSIGNED_CATEGORY
}

export function runRulesCheck(ctx: PurchaseContext): RulesCheckResult {
  const walletLimit = ctx.wallet_limit_usd ?? env.WALLET_LIMIT_USD;
  const assignedCategory = ctx.assigned_category ?? env.ASSIGNED_CATEGORY;
  const checks: RulesCheckResult["checks"] = [];

  // 1. spend-ceiling
  const priceCents = toCents(ctx.proposal.recommended.price);
  const limitCents = toCents(walletLimit);
  checks.push({
    rule: "spend-ceiling",
    passed: priceCents <= limitCents,
    detail:
      priceCents <= limitCents
        ? `$${ctx.proposal.recommended.price} is within the $${walletLimit} wallet limit`
        : `$${ctx.proposal.recommended.price} EXCEEDS the $${walletLimit} wallet limit`,
  });

  // 2. price-match
  const chargeCents = toCents(ctx.charge_amount);
  checks.push({
    rule: "price-match",
    passed: chargeCents === priceCents,
    detail:
      chargeCents === priceCents
        ? `charge $${ctx.charge_amount} matches the approved proposal price`
        : `charge $${ctx.charge_amount} DOES NOT MATCH approved price $${ctx.proposal.recommended.price}`,
  });

  // 3. category-lock
  const categoryOk = ctx.proposal.meta.category === assignedCategory;
  checks.push({
    rule: "category-lock",
    passed: categoryOk,
    detail: categoryOk
      ? `category "${ctx.proposal.meta.category}" is the assigned category`
      : `category "${ctx.proposal.meta.category}" is OUTSIDE the assigned category "${assignedCategory}"`,
  });

  // 4. traceability
  const trace = citedFindingsExist(ctx.proposal, ctx.report);
  checks.push({
    rule: "traceability",
    passed: trace.ok,
    detail: trace.ok
      ? `all ${ctx.proposal.reasoning.length} reasons cite findings present in the report`
      : `reasoning cites finding ids missing from the report: ${trace.missing.join(", ")}`,
  });

  return {
    proposal_id: ctx.proposal.meta.proposal_id,
    passed: checks.every((c) => c.passed),
    checks,
  };
}

/**
 * Approval gate: the decision must approve THIS proposal. In autonomy mode
 * the decision is minted by the system itself, but it still must exist —
 * there is no path to the executor without a decision object.
 */
export function decisionAuthorizes(
  decision: ApprovalDecision,
  proposal: PurchaseProposal
): { ok: boolean; reason: string } {
  if (decision.proposal_id !== proposal.meta.proposal_id) {
    return {
      ok: false,
      reason: `decision is for proposal "${decision.proposal_id}", not "${proposal.meta.proposal_id}"`,
    };
  }
  if (decision.decision !== "approved") {
    return { ok: false, reason: "proposal was rejected by the user" };
  }
  if (proposal.meta.mode === "approval" && decision.decided_by !== "user") {
    return { ok: false, reason: "approval mode requires a user decision, not an autonomy decision" };
  }
  return { ok: true, reason: "decision authorizes this proposal" };
}
