/**
 * Savings summary — deterministic money math for the receipt.
 *
 * Answers two questions a founder actually cares about, using ONLY the
 * catalog and the eligibility rules (no LLM, no invented numbers):
 *
 *   1. "How much did picking the cheapest plan that FITS save me?"
 *      -> chosen price vs the priciest plan that also satisfies every
 *         requirement (the plan you might have bought by picking blind).
 *
 *   2. "What trap did the agent keep me out of?"
 *      -> plans that LOOK cheaper than the chosen one but fail a real
 *         requirement (e.g. a $5 entry plan under L-class launch traffic).
 */
import type { RequirementsReport, PurchaseProposal } from "./contract.js";
import { loadCatalog, type CatalogPlan } from "./catalog.js";
import { eligiblePlans } from "./proposal-checks.js";

export interface SavingsAlternative {
  provider: string;
  plan: string;
  price: string; // "25.00"
  /** How much MORE per month this plan costs vs the chosen one. */
  extra_per_month: string;
}

export interface AvoidedTrap {
  provider: string;
  plan: string;
  price: string;
  /** Which requirement the cheap plan fails. */
  fails: string;
}

export interface SavingsSummary {
  chosen: { provider: string; plan: string; price: string };
  /** Other plans that also fit, priced above the chosen one. */
  pricier_fits: SavingsAlternative[];
  /** Cheaper-looking plans that fail a requirement — the underprovision trap. */
  avoided_traps: AvoidedTrap[];
  /** vs the priciest plan that also fits ("0.00" when nothing pricier fits). */
  monthly_savings: string;
  yearly_savings: string;
  /** One plain-language sentence for the receipt / email. */
  headline: string;
}

/** Why a given cheaper plan is NOT eligible, in plain words. */
function whyIneligible(plan: CatalogPlan, report: RequirementsReport): string {
  const needs = new Set(report.special_needs.map((f) => f.value.need));
  if (needs.has("websockets") && !plan.specs.websockets) return "no websocket support";
  if ((needs.has("file-uploads") || needs.has("file-storage")) && !plan.specs.persistent_disk)
    return "no persistent disk for uploads";
  if (report.database.value.type === "postgres" && !plan.specs.managed_postgres)
    return "no managed Postgres";
  if (report.load_class.value === "L" && plan.tier === "entry")
    return `entry tier can't hold ${report.load_class.value}-class traffic`;
  if (report.load_class.value === "M" && plan.tier === "entry" && plan.specs.autoscaling === "none")
    return "no autoscaling headroom for M-class traffic";
  return "fails a sizing requirement";
}

export function computeSavings(
  report: RequirementsReport,
  proposal: PurchaseProposal
): SavingsSummary {
  const catalog = loadCatalog();
  const chosen = proposal.recommended;
  const chosenPrice = Number(chosen.price);
  const eligible = eligiblePlans(report, catalog);
  const eligibleKey = new Set(eligible.map((p) => `${p.provider}|${p.plan}`));

  const pricier_fits = eligible
    .filter((p) => Number(p.price) > chosenPrice)
    .sort((a, b) => Number(a.price) - Number(b.price))
    .map((p) => ({
      provider: p.provider,
      plan: p.plan,
      price: p.price,
      extra_per_month: (Number(p.price) - chosenPrice).toFixed(2),
    }));

  const avoided_traps = catalog.plans
    .filter((p) => Number(p.price) < chosenPrice && !eligibleKey.has(`${p.provider}|${p.plan}`))
    .sort((a, b) => Number(a.price) - Number(b.price))
    .map((p) => ({
      provider: p.provider,
      plan: p.plan,
      price: p.price,
      fails: whyIneligible(p, report),
    }));

  const priciest = pricier_fits[pricier_fits.length - 1];
  const monthly = priciest ? Number(priciest.extra_per_month) : 0;
  const monthly_savings = monthly.toFixed(2);
  const yearly_savings = (monthly * 12).toFixed(2);

  let headline: string;
  if (priciest) {
    headline =
      `${chosen.provider} ${chosen.plan} at $${chosen.price}/mo is the cheapest plan that fits — ` +
      `$${monthly_savings}/mo ($${yearly_savings}/yr) less than ${priciest.provider} ${priciest.plan}, ` +
      `the priciest plan that also fits.`;
  } else {
    headline = `${chosen.provider} ${chosen.plan} at $${chosen.price}/mo — the only plan that fits, at the lowest possible price.`;
  }
  if (avoided_traps.length > 0) {
    const t = avoided_traps[0]!;
    headline += ` Also skipped ${avoided_traps.length} cheaper-looking plan(s) that would fail in production (e.g. ${t.provider} ${t.plan} at $${t.price}/mo: ${t.fails}).`;
  }

  return {
    chosen: { provider: chosen.provider, plan: chosen.plan, price: chosen.price },
    pricier_fits,
    avoided_traps,
    monthly_savings,
    yearly_savings,
    headline,
  };
}
