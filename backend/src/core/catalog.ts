/**
 * Curated hosting-plan catalog — the Infra Agent's ONLY source of plans.
 *
 * The agent cannot recommend a plan or price that isn't in this file
 * (enforced by proposal-checks). Deliberately hand-curated, not scraped:
 * a reliable comparison across 6 real plans beats a flaky one across 600.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const CatalogPlan = z.object({
  provider: z.string(),
  plan: z.string(),
  price: z.string().regex(/^\d+\.\d{2}$/),
  billing_cycle: z.enum(["monthly", "yearly", "usage-based"]),
  checkout_url: z.string().url(),
  specs: z.object({
    ram_gb: z.number().positive(),
    vcpu: z.number().positive(),
    always_on: z.boolean(),
    websockets: z.boolean(),
    managed_postgres: z.boolean(),
    autoscaling: z.enum(["none", "vertical-within-limits", "horizontal-paid"]),
    persistent_disk: z.boolean(),
  }),
  notes: z.string(),
});
export type CatalogPlan = z.infer<typeof CatalogPlan>;

export const Catalog = z.object({
  meta: z.object({
    category: z.literal("hosting"),
    currency: z.literal("USD"),
    verified_at: z.string(),
    note: z.string(),
  }),
  plans: z.array(CatalogPlan).min(2),
});
export type Catalog = z.infer<typeof Catalog>;

let cached: Catalog | null = null;

export function loadCatalog(): Catalog {
  if (!cached) {
    const path = join(dirname(fileURLToPath(import.meta.url)), "catalog.json");
    cached = Catalog.parse(JSON.parse(readFileSync(path, "utf-8")));
  }
  return cached;
}

export function findPlan(
  catalog: Catalog,
  provider: string,
  plan: string
): CatalogPlan | undefined {
  return catalog.plans.find(
    (p) =>
      p.provider.toLowerCase() === provider.toLowerCase() &&
      p.plan.toLowerCase() === plan.toLowerCase()
  );
}
