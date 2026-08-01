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
  PurchaseProposal,
  RequirementsReport,
  RulesCheckResult,
  TransactionReceipt,
} from "../core/contract.js";
import { decisionAuthorizes, runRulesCheck } from "../core/rules.js";
import { createSession, pollPaymentResult, reportStatus } from "./prava.js";

export interface ExecuteInput {
  report: RequirementsReport;
  proposal: PurchaseProposal;
  decision: ApprovalDecision;
  user: { id: string; email: string };
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
  sessionId?: string
): TransactionReceipt {
  return {
    proposal_id: proposal.meta.proposal_id,
    method: "session",
    ...(sessionId ? { session_id: sessionId } : {}),
    merchant: proposal.recommended.provider,
    amount: proposal.recommended.price,
    currency: "USD",
    status: "HALTED",
    halt_reason: reason,
    timestamp: new Date().toISOString(),
  };
}

export async function executePurchase(input: ExecuteInput): Promise<ExecuteOutcome> {
  const { report, proposal, decision } = input;
  const chargeAmount = proposal.recommended.price;

  // Gate 0: the decision must authorize this exact proposal.
  const auth = decisionAuthorizes(decision, proposal);
  const rules = runRulesCheck({ report, proposal, decision, charge_amount: chargeAmount });

  if (!auth.ok) {
    return { rules, receipt: haltReceipt(proposal, `authorization failed: ${auth.reason}`) };
  }
  // Gate 1-4: the rules layer.
  if (!rules.passed) {
    const failed = rules.checks.filter((c) => !c.passed).map((c) => `${c.rule}: ${c.detail}`);
    return { rules, receipt: haltReceipt(proposal, `rules layer blocked: ${failed.join("; ")}`) };
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

    return {
      rules,
      receipt: {
        proposal_id: proposal.meta.proposal_id,
        method: "session",
        session_id: session.session_id,
        txn_ref_id: credential.txn_ref_id,
        merchant: cat.provider,
        amount: chargeAmount,
        currency: "USD",
        status: "APPROVED",
        timestamp: new Date().toISOString(),
      },
    };
  } catch (e) {
    // HALT: surface, never retry.
    return {
      rules,
      receipt: haltReceipt(proposal, `transaction failed: ${(e as Error).message}`, sessionId),
    };
  }
}
