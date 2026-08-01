import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProposal, validateReport } from "./contract.js";
import { loadCatalog } from "./catalog.js";
import { checkProposal } from "./proposal-checks.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const report = validateReport(
  JSON.parse(readFileSync(join(fixtures, "report.example.json"), "utf-8"))
);
const proposal = validateProposal(
  JSON.parse(readFileSync(join(fixtures, "proposal.example.json"), "utf-8"))
);
const catalog = loadCatalog();

const expected = {
  proposal_id: "prop_demo_001",
  repo_name: "demo-chat-app",
  mode: "approval" as const,
};

test("fixture proposal passes all checks", () => {
  const errors = checkProposal(proposal, report, catalog, expected);
  assert.deepEqual(errors, []);
});

test("hallucinated plan is rejected", () => {
  const bad = structuredClone(proposal);
  bad.recommended.provider = "MegaCloud";
  bad.recommended.plan = "Ultra";
  const errors = checkProposal(bad, report, catalog, expected);
  assert.ok(errors.some((e) => e.includes("not in the catalog")));
});

test("price drift is rejected", () => {
  const bad = structuredClone(proposal);
  bad.recommended.price = "4.00";
  const errors = checkProposal(bad, report, catalog, expected);
  assert.ok(errors.some((e) => e.includes("does not match catalog price")));
});

test("citing a nonexistent finding id is rejected", () => {
  const bad = structuredClone(proposal);
  bad.reasoning[0]!.finding_ids = ["F99"];
  const errors = checkProposal(bad, report, catalog, expected);
  assert.ok(errors.some((e) => e.includes("unknown finding ids: F99")));
});

test("alternative duplicating the recommendation is rejected", () => {
  const bad = structuredClone(proposal);
  bad.alternatives[0] = {
    provider: bad.recommended.provider,
    plan: bad.recommended.plan,
    price: bad.recommended.price,
    why_rejected: "n/a",
  };
  const errors = checkProposal(bad, report, catalog, expected);
  assert.ok(errors.some((e) => e.includes("duplicates the recommendation")));
});

test("wrong mode is rejected", () => {
  const errors = checkProposal(proposal, report, catalog, { ...expected, mode: "autonomy" });
  assert.ok(errors.some((e) => e.includes('meta.mode must be "autonomy"')));
});

test("entry tier is rejected for an L-class load", () => {
  const bigReport = structuredClone(report);
  bigReport.load_class.value = "L";
  const errors = checkProposal(proposal, bigReport, catalog, expected); // proposal = Railway Hobby (entry)
  assert.ok(errors.some((e) => e.includes("does not satisfy the report's requirements")));
});

test("non-cheapest eligible plan is rejected", () => {
  // Report with no special needs and no DB: every plan is eligible, cheapest = $5.
  const simpleReport = structuredClone(report);
  simpleReport.special_needs = [];
  simpleReport.database.value = { type: "none", shape: "none", workload: "unknown" };
  const pricey = structuredClone(proposal);
  pricey.recommended = {
    provider: "Render",
    plan: "Starter",
    price: "7.00",
    currency: "USD",
    billing_cycle: "monthly",
    checkout_url: "https://render.com/pricing",
  };
  pricey.alternatives = [
    { provider: "Railway", plan: "Hobby", price: "5.00", why_rejected: "n/a" },
  ];
  const errors = checkProposal(pricey, simpleReport, catalog, expected);
  assert.ok(errors.some((e) => e.includes("not the cheapest plan")));
});
