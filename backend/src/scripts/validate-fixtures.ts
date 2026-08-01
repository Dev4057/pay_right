/**
 * Sanity check: the example fixtures must satisfy the contract, and the
 * proposal's cited finding ids must exist in the report (traceability).
 * Run: npm run validate:fixtures
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReport, validateProposal, citedFindingsExist } from "../core/contract.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "core", "fixtures");
const load = (name: string) => JSON.parse(readFileSync(join(fixtures, name), "utf-8"));

const report = validateReport(load("report.example.json"));
console.log(`✅ report.example.json is a valid RequirementsReport (${report.special_needs.length + 4} findings)`);

const proposal = validateProposal(load("proposal.example.json"));
console.log(`✅ proposal.example.json is a valid PurchaseProposal (${proposal.reasoning.length} reasons, ${proposal.alternatives.length} alternatives)`);

const trace = citedFindingsExist(proposal, report);
if (!trace.ok) {
  throw new Error(`❌ traceability broken — cited finding ids missing from report: ${trace.missing.join(", ")}`);
}
console.log("✅ traceability: every cited finding id exists in the report");
console.log("\nContract is solid. Fixtures ready for frontend + rules-layer development.");
