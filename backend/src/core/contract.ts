/**
 * THE CONTRACT — the fixed JSON handoff between every part of the system.
 *
 *   Analyzer Agent  --RequirementsReport-->  Infra Agent
 *   Infra Agent     --PurchaseProposal--->   Human gate / Rules layer
 *   Rules layer     --RulesCheckResult-->    Dashboard
 *   Prava executor  --TransactionReceipt->   Dashboard
 *
 * Everything downstream (agents, rules, dashboard) builds against these
 * schemas, never against free-form LLM text.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export const Confidence = z.enum([
  "derived-from-code", // directly visible in the code (strongest)
  "inferred", // reasonable conclusion from evidence
  "user-provided", // founder's answer from the Load Interview
  "assumption", // a guess, clearly marked
]);
export type Confidence = z.infer<typeof Confidence>;

/**
 * Every finding shares one envelope. `id` (F1, F2, ...) is what proposal
 * reasoning and the traceability rule point at — the paper trail.
 */
const finding = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    id: z.string().regex(/^F\d+$/, "finding ids look like F1, F2, ..."),
    value,
    confidence: Confidence,
    evidence: z
      .string()
      .min(1)
      .describe('Where this came from: "package.json:12", "server.js:8", "interview Q3"'),
  });

/* ------------------------------------------------------------------ */
/* Requirements Report (Analyzer Agent output)                         */
/* ------------------------------------------------------------------ */

export const DatabaseInfo = z.object({
  type: z.enum(["postgres", "mysql", "mongodb", "sqlite", "redis", "none", "other"]),
  shape: z.enum(["relational", "document", "key-value", "none"]),
  workload: z.enum(["read-heavy", "write-heavy", "balanced", "unknown"]),
});

export const SpecialNeed = z.object({
  need: z.enum(["websockets", "queue", "cron", "file-uploads", "file-storage", "email", "gpu", "other"]),
  detail: z.string().describe('Short human note, e.g. "socket.io realtime chat"'),
});

export const ConcurrencyClass = z.enum([
  "io-bound-stateless",
  "io-bound-stateful",
  "cpu-bound",
  "mixed",
]);

/** XS/S/M/L — computed by deterministic load math from interview answers. */
export const LoadClass = z.enum(["XS", "S", "M", "L"]);
export type LoadClass = z.infer<typeof LoadClass>;

export const InterviewAnswer = z.object({
  q_id: z.string().describe("Q1, Q2, ..."),
  question: z.string(),
  answer: z.string(),
});

export const ReportFlag = z.object({
  severity: z.enum(["info", "warning"]),
  message: z.string().describe('e.g. "You expect 10K+ users but the code uses SQLite"'),
  related_finding_ids: z.array(z.string()),
});

export const RequirementsReport = z
  .object({
    meta: z.object({
      repo_name: z.string(),
      target: z.literal("nodejs"),
      analyzer_version: z.string(),
    }),
    runtime: finding(z.string().describe('e.g. "node-20"')),
    database: finding(DatabaseInfo),
    concurrency: finding(ConcurrencyClass),
    special_needs: z.array(finding(SpecialNeed)),
    load_class: finding(LoadClass),
    interview_answers: z.array(InterviewAnswer),
    flags: z.array(ReportFlag),
  })
  .superRefine((r, ctx) => {
    // Finding ids must be unique across the WHOLE report — they are the
    // paper-trail anchors cited by proposals, rules, and the UI.
    const ids = [
      r.runtime.id,
      r.database.id,
      r.concurrency.id,
      r.load_class.id,
      ...r.special_needs.map((f) => f.id),
    ];
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
    if (dupes.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate finding ids: ${[...dupes].join(", ")} — every finding needs a unique id (F1, F2, ...)`,
      });
    }
  });
export type RequirementsReport = z.infer<typeof RequirementsReport>;

/* ------------------------------------------------------------------ */
/* Purchase Proposal (Infra Agent output)                              */
/* ------------------------------------------------------------------ */

export const ServiceCategory = z.enum(["hosting"]); // one category, wired for real
export type ServiceCategory = z.infer<typeof ServiceCategory>;

export const PlanRef = z.object({
  provider: z.string(),
  plan: z.string(),
  price: z.string().describe('Amount as string, e.g. "5.00"'),
  currency: z.literal("USD"),
  billing_cycle: z.enum(["monthly", "yearly", "usage-based"]),
  checkout_url: z.string().url(),
});

/** Every reason MUST cite at least one finding id — enforced here, not hoped for in a prompt. */
export const Reason = z.object({
  reason: z.string(),
  finding_ids: z.array(z.string().regex(/^F\d+$/)).min(1),
});

export const RejectedAlternative = z.object({
  provider: z.string(),
  plan: z.string(),
  price: z.string(),
  why_rejected: z.string(),
});

export const PurchaseProposal = z.object({
  meta: z.object({
    proposal_id: z.string(),
    repo_name: z.string(),
    category: ServiceCategory,
    mode: z.enum(["approval", "autonomy"]),
  }),
  recommended: PlanRef,
  reasoning: z.array(Reason).min(1),
  alternatives: z.array(RejectedAlternative).min(1),
});
export type PurchaseProposal = z.infer<typeof PurchaseProposal>;

/* ------------------------------------------------------------------ */
/* Human gate                                                          */
/* ------------------------------------------------------------------ */

export const ApprovalDecision = z.object({
  proposal_id: z.string(),
  decision: z.enum(["approved", "rejected"]),
  decided_by: z.enum(["user", "autonomy-mode"]),
  note: z.string().optional(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

/* ------------------------------------------------------------------ */
/* Rules layer output (deterministic — never produced by an LLM)       */
/* ------------------------------------------------------------------ */

export const RuleName = z.enum([
  "spend-ceiling", // price <= wallet/mandate limit
  "price-match", // charge == approved proposal price
  "category-lock", // purchase is inside the assigned category
  "traceability", // every reasoning entry cites a real finding id
]);

export const RulesCheckResult = z.object({
  proposal_id: z.string(),
  passed: z.boolean(),
  checks: z.array(
    z.object({
      rule: RuleName,
      passed: z.boolean(),
      detail: z.string(),
    })
  ),
});
export type RulesCheckResult = z.infer<typeof RulesCheckResult>;

/* ------------------------------------------------------------------ */
/* Transaction receipt (Prava execution outcome)                       */
/* ------------------------------------------------------------------ */

/** Typed halt code — machine-readable cause, never inferred from prose. */
export const HaltCode = z.enum([
  "USER_REJECTED", // the human said no
  "DECISION_INVALID", // decision doesn't authorize this proposal (wrong id / self-approval)
  "CAP_EXCEEDED", // spend-ceiling rule failed
  "PRICE_MISMATCH", // price-match rule failed (proposal stale vs charge)
  "CATEGORY_VIOLATION", // category-lock rule failed
  "TRACEABILITY_BROKEN", // reasoning cites findings that don't exist
  "TRANSACTION_FAILED", // Prava/network failure during execution
]);
export type HaltCode = z.infer<typeof HaltCode>;

/**
 * What a LEGITIMATE next move is for the caller. We never auto-retry
 * ourselves — this tells a buyer runtime how to react without parsing text:
 *   no-retry      permanent; retrying is never valid
 *   re-quote      the proposal is defective/stale; regenerate it
 *   user-approval only a human action (raise cap, re-approve) unblocks this
 */
export const RetryClass = z.enum(["no-retry", "re-quote", "user-approval"]);
export type RetryClass = z.infer<typeof RetryClass>;

export const TransactionReceipt = z.object({
  proposal_id: z.string(),
  method: z.enum(["session", "mandate"]), // session = Approval Mode, mandate = Full Autonomy
  session_id: z.string().optional(),
  mandate_id: z.string().optional(),
  txn_ref_id: z.string().optional(),
  merchant: z.string(),
  /** The exact plan bought/attempted — bound directly, not via lookup. */
  plan: z.string(),
  amount: z.string(),
  currency: z.literal("USD"),
  status: z.enum([
    "APPROVED", // checkout completed, reported to Prava
    "DECLINED", // charge declined (e.g. THRESHOLD_EXCEEDED) — reported to Prava
    "HALTED", // rules layer or failure stopped it BEFORE/DURING checkout
  ]),
  halt_reason: z.string().optional(), // human-readable; halt_code is the typed truth
  halt_code: HaltCode.optional(),
  retry_class: RetryClass.optional(),
  timestamp: z.string().describe("ISO 8601"),
  /** sha256 over {report, proposal, decision, rules, receipt-sans-seal} — tamper evidence. */
  audit_seal: z.string().optional(),
});
export type TransactionReceipt = z.infer<typeof TransactionReceipt>;

/* ------------------------------------------------------------------ */
/* Validators                                                          */
/* ------------------------------------------------------------------ */

function validate<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${label}:\n${issues}`);
  }
  return result.data;
}

export const validateReport = (data: unknown) =>
  validate(RequirementsReport, data, "RequirementsReport");
export const validateProposal = (data: unknown) =>
  validate(PurchaseProposal, data, "PurchaseProposal");
export const validateReceipt = (data: unknown) =>
  validate(TransactionReceipt, data, "TransactionReceipt");

/**
 * Cross-schema check backing the traceability rule: every finding id cited in
 * the proposal's reasoning must exist in the report.
 */
export function citedFindingsExist(
  proposal: PurchaseProposal,
  report: RequirementsReport
): { ok: boolean; missing: string[] } {
  const known = new Set<string>([
    report.runtime.id,
    report.database.id,
    report.concurrency.id,
    report.load_class.id,
    ...report.special_needs.map((f) => f.id),
  ]);
  const cited = proposal.reasoning.flatMap((r) => r.finding_ids);
  const missing = [...new Set(cited.filter((id) => !known.has(id)))];
  return { ok: missing.length === 0, missing };
}
