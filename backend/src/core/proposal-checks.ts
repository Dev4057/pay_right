/**
 * Deterministic proposal checks — pure functions, zero LLM.
 *
 * The Infra Agent's LLM can reason freely, but its proposal is rejected
 * (and re-prompted) unless it survives every check here. This makes
 * hallucinated plans, prices, or citations mechanically impossible.
 */
import type { PurchaseProposal, RequirementsReport } from "./contract.js";
import { citedFindingsExist } from "./contract.js";
import { findPlan, type Catalog, type CatalogPlan } from "./catalog.js";

/**
 * Deterministic plan eligibility — the requirements a plan must satisfy are
 * computed from the report's structured findings, not from LLM judgment:
 *   shape: websockets/file storage/postgres needs map to catalog spec flags
 *   size:  load class L may never land on an entry tier
 */
export function eligiblePlans(report: RequirementsReport, catalog: Catalog): CatalogPlan[] {
  const needs = new Set(report.special_needs.map((f) => f.value.need));
  const requiresWebsockets = needs.has("websockets");
  const requiresDisk = needs.has("file-uploads") || needs.has("file-storage");
  const requiresPostgres = report.database.value.type === "postgres";
  const loadClass = report.load_class.value;

  return catalog.plans.filter((p) => {
    if (requiresWebsockets && !p.specs.websockets) return false;
    if (requiresDisk && !p.specs.persistent_disk) return false;
    if (requiresPostgres && !p.specs.managed_postgres) return false;
    if (loadClass === "L" && p.tier === "entry") return false;
    if (loadClass === "M" && p.tier === "entry" && p.specs.autoscaling === "none") return false;
    return true;
  });
}

export function cheapestEligible(report: RequirementsReport, catalog: Catalog): CatalogPlan[] {
  const eligible = eligiblePlans(report, catalog);
  if (eligible.length === 0) return [];
  const min = Math.min(...eligible.map((p) => Number(p.price)));
  return eligible.filter((p) => Number(p.price) === min);
}

export interface ProposalExpectations {
  proposal_id: string;
  repo_name: string;
  mode: "approval" | "autonomy";
}

/** Returns a list of violations; empty array = proposal is sound. */
export function checkProposal(
  proposal: PurchaseProposal,
  report: RequirementsReport,
  catalog: Catalog,
  expected: ProposalExpectations
): string[] {
  const errors: string[] = [];

  if (proposal.meta.proposal_id !== expected.proposal_id) {
    errors.push(`meta.proposal_id must be "${expected.proposal_id}"`);
  }
  if (proposal.meta.repo_name !== expected.repo_name) {
    errors.push(`meta.repo_name must be "${expected.repo_name}"`);
  }
  if (proposal.meta.mode !== expected.mode) {
    errors.push(`meta.mode must be "${expected.mode}"`);
  }

  // Recommended plan must exist in the catalog with the exact price/cycle/url.
  const rec = findPlan(catalog, proposal.recommended.provider, proposal.recommended.plan);
  if (!rec) {
    errors.push(
      `recommended plan "${proposal.recommended.provider} ${proposal.recommended.plan}" is not in the catalog — only catalog plans may be recommended`
    );
  } else {
    if (proposal.recommended.price !== rec.price) {
      errors.push(
        `recommended.price "${proposal.recommended.price}" does not match catalog price "${rec.price}"`
      );
    }
    if (proposal.recommended.billing_cycle !== rec.billing_cycle) {
      errors.push(`recommended.billing_cycle must be "${rec.billing_cycle}"`);
    }
    if (proposal.recommended.checkout_url !== rec.checkout_url) {
      errors.push(`recommended.checkout_url must be "${rec.checkout_url}"`);
    }
  }

  // Alternatives must also be real catalog plans, and not the recommended one.
  for (const alt of proposal.alternatives) {
    const found = findPlan(catalog, alt.provider, alt.plan);
    if (!found) {
      errors.push(`alternative "${alt.provider} ${alt.plan}" is not in the catalog`);
    } else if (alt.price !== found.price) {
      errors.push(`alternative "${alt.provider} ${alt.plan}" price must be "${found.price}"`);
    }
    if (
      alt.provider.toLowerCase() === proposal.recommended.provider.toLowerCase() &&
      alt.plan.toLowerCase() === proposal.recommended.plan.toLowerCase()
    ) {
      errors.push(`alternative "${alt.provider} ${alt.plan}" duplicates the recommendation`);
    }
  }

  // Traceability: every cited finding id must exist in the report.
  const trace = citedFindingsExist(proposal, report);
  if (!trace.ok) {
    errors.push(`reasoning cites unknown finding ids: ${trace.missing.join(", ")}`);
  }

  // Deterministic fit + price optimality: the recommendation must be an
  // eligible plan (shape + size) AND the cheapest among eligible plans.
  const eligible = eligiblePlans(report, catalog);
  if (eligible.length > 0 && rec) {
    const recEligible = eligible.some(
      (p) => p.provider === rec.provider && p.plan === rec.plan
    );
    if (!recEligible) {
      errors.push(
        `recommended "${rec.provider} ${rec.plan}" does not satisfy the report's requirements ` +
          `(shape/size). Eligible plans: ${eligible.map((p) => `${p.provider} ${p.plan}`).join(", ")}`
      );
    } else {
      const cheapest = cheapestEligible(report, catalog);
      const isCheapest = cheapest.some(
        (p) => p.provider === rec.provider && p.plan === rec.plan
      );
      if (!isCheapest) {
        errors.push(
          `recommended "${rec.provider} ${rec.plan}" ($${rec.price}) is not the cheapest plan ` +
            `satisfying all requirements — cheapest eligible: ${cheapest
              .map((p) => `${p.provider} ${p.plan} ($${p.price})`)
              .join(" or ")}. Recommend one of those instead.`
        );
      }
    }
  }

  return errors;
}
