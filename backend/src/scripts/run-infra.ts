/**
 * Run the Infra Agent on an analyzer report.
 *
 *   npx tsx src/scripts/run-infra.ts [report-path] [approval|autonomy]
 *
 * Defaults: out/report.json (falls back to the fixture report), approval mode.
 * Saves the proposal to out/proposal.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateReport } from "../core/contract.js";
import { runInfraAgent } from "../agents/infra.js";

const fixture = join(process.cwd(), "src", "core", "fixtures", "report.example.json");
const defaultReport = join(process.cwd(), "out", "report.json");
const reportPath = process.argv[2] ?? (existsSync(defaultReport) ? defaultReport : fixture);
const mode = (process.argv[3] ?? "approval") as "approval" | "autonomy";

console.log(`Report: ${reportPath}\nMode:   ${mode}\n`);
const report = validateReport(JSON.parse(readFileSync(reportPath, "utf-8")));

const proposalId = `prop_${randomUUID().slice(0, 8)}`;
const { proposal, iterations } = await runInfraAgent(report, mode, proposalId);

const outDir = join(process.cwd(), "out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "proposal.json"), JSON.stringify(proposal, null, 2), "utf-8");

console.log(`✅ Proposal valid (${iterations} iterations). Saved to out/proposal.json\n`);
console.log(`Recommended: ${proposal.recommended.provider} ${proposal.recommended.plan} — $${proposal.recommended.price}/${proposal.recommended.billing_cycle}`);
console.log(`\nReasoning:`);
for (const r of proposal.reasoning) {
  console.log(`  • ${r.reason}  [${r.finding_ids.join(", ")}]`);
}
console.log(`\nRejected:`);
for (const a of proposal.alternatives) {
  console.log(`  • ${a.provider} ${a.plan} ($${a.price}) — ${a.why_rejected}`);
}
