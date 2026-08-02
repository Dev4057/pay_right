/**
 * Purchase executor — the ONLY code path to Prava.
 *
 * Order of operations (fixed, no LLM anywhere):
 *   1. decisionAuthorizes()  — an approved decision for THIS proposal exists
 *   2. runRulesCheck()       — all four rules pass
 *   3. createSession()       — Prava mints the merchant+amount-locked session
 *   4. pollPaymentResult()   — user completes card/passkey; credential returned
 *   5. reportStatus()        — outcome reported (REQUIRED by Prava)
 *
 * Any failure at any step => HALT: produce a HALTED receipt with the reason
 * and stop. No autonomous retry, ever (WORKING.md §8).
 */
import type {
  ApprovalDecision,
  HaltCode,
  PurchaseProposal,
  RequirementsReport,
  RetryClass,
  RulesCheckResult,
  TransactionReceipt,
} from "../core/contract.js";
import { decisionAuthorizes, runRulesCheck } from "../core/rules.js";
import { computeAuditSeal } from "../core/audit.js";
import { createSession, pollPaymentResult, reportStatus } from "./prava.js";
import { z } from "zod";
import { RuleName as RuleNameSchema } from "../core/contract.js";

/** Failing rule -> typed halt code + what a legitimate next move is. */
const RULE_TO_HALT: Record<
  z.infer<typeof RuleNameSchema>,
  { code: HaltCode; retry: RetryClass }
> = {
  "spend-ceiling": { code: "CAP_EXCEEDED", retry: "user-approval" }, // only a human can raise the cap
  "price-match": { code: "PRICE_MISMATCH", retry: "re-quote" }, // proposal is stale — regenerate
  "category-lock": { code: "CATEGORY_VIOLATION", retry: "no-retry" }, // scope breach, never valid
  traceability: { code: "TRACEABILITY_BROKEN", retry: "re-quote" }, // defective proposal — regenerate
};

export interface ExecuteInput {
  report: RequirementsReport;
  proposal: PurchaseProposal;
  decision: ApprovalDecision;
  user: { id: string; email: string };
  /** Per-run spend ceiling ("50.00"). Omitted = env WALLET_LIMIT_USD. */
  wallet_limit_usd?: string;
  /** Called with the Prava payment URL so the runner/UI can show it to the user. */
  onPaymentUrl?: (url: string, sessionId: string) => void;
}

export interface ExecuteOutcome {
  rules: RulesCheckResult;
  receipt: TransactionReceipt;
}

function haltReceipt(
  proposal: PurchaseProposal,
  reason: string,
  code: HaltCode,
  retry: RetryClass,
  sessionId?: string
): TransactionReceipt {
  return {
    proposal_id: proposal.meta.proposal_id,
    method: "session",
    ...(sessionId ? { session_id: sessionId } : {}),
    merchant: proposal.recommended.provider,
    plan: proposal.recommended.plan,
    amount: proposal.recommended.price,
    currency: "USD",
    status: "HALTED",
    halt_reason: reason,
    halt_code: code,
    retry_class: retry,
    timestamp: new Date().toISOString(),
  };
}

export async function executePurchase(input: ExecuteInput): Promise<ExecuteOutcome> {
  const { report, proposal, decision } = input;
  const chargeAmount = proposal.recommended.price;

  // Gate 0: the decision must authorize this exact proposal.
  const auth = decisionAuthorizes(decision, proposal);
  const rules = runRulesCheck({
    report,
    proposal,
    decision,
    charge_amount: chargeAmount,
    wallet_limit_usd: input.wallet_limit_usd,
  });

  // Every outcome leaves with a tamper-evident seal over the whole bundle.
  const sealed = (receipt: TransactionReceipt): ExecuteOutcome => {
    const { audit_seal: _drop, ...unsealed } = receipt;
    receipt.audit_seal = computeAuditSeal({ report, proposal, decision, rules, receipt: unsealed });
    return { rules, receipt };
  };

  if (!auth.ok) {
    const isRejection = decision.decision === "rejected";
    return sealed(
      haltReceipt(
        proposal,
        `authorization failed: ${auth.reason}`,
        isRejection ? "USER_REJECTED" : "DECISION_INVALID",
        isRejection ? "user-approval" : "no-retry"
      )
    );
  }
  // Gate 1-4: the rules layer. The FIRST failing rule names the typed code.
  if (!rules.passed) {
    const failedChecks = rules.checks.filter((c) => !c.passed);
    const first = RULE_TO_HALT[failedChecks[0]!.rule];
    const detail = failedChecks.map((c) => `${c.rule}: ${c.detail}`).join("; ");
    return sealed(
      haltReceipt(proposal, `rules layer blocked: ${detail}`, first.code, first.retry)
    );
  }

  // Only now may Prava be touched.
  let sessionId: string | undefined;
  try {
    const cat = proposal.recommended;
    const session = await createSession({
      user_id: input.user.id,
      user_email: input.user.email,
      total_amount: chargeAmount,
      currency: "USD",
      description: `Pre-deployment infra purchase for ${proposal.meta.repo_name}`,
      merchant: {
        name: cat.provider,
        url: cat.checkout_url,
        country_code_iso2: "US",
        category: "Cloud Hosting",
      },
      products: [
        {
          description: `${cat.provider} ${cat.plan} plan (${cat.billing_cycle})`,
          unit_price: chargeAmount,
          quantity: 1,
        },
      ],
    });
    sessionId = session.session_id;
    input.onPaymentUrl?.(session.iframe_url, session.session_id);

    const credential = await pollPaymentResult(session.session_id);

    // Checkout happens here with credential.token / credential.dynamic_cvv at the
    // provider's checkout (browser automation / manual in the demo). The
    // credential is intentionally NOT logged or persisted.
    await reportStatus(session.session_id, credential.txn_ref_id, "APPROVED");

    return sealed({
      proposal_id: proposal.meta.proposal_id,
      method: "session",
      session_id: session.session_id,
      txn_ref_id: credential.txn_ref_id,
      merchant: cat.provider,
      plan: cat.plan,
      amount: chargeAmount,
      currency: "USD",
      status: "APPROVED",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    // HALT: surface, never retry. A fresh session needs a fresh human
    // passkey, so the legitimate next move is user-approval.
    return sealed(
      haltReceipt(
        proposal,
        `transaction failed: ${(e as Error).message}`,
        "TRANSACTION_FAILED",
        "user-approval",
        sessionId
      )
    );
  }
}
