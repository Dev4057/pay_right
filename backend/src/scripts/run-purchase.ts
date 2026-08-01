/**
 * End-to-end purchase: report + proposal -> approval -> rules -> Prava.
 *
 *   npx tsx src/scripts/run-purchase.ts [--yes]
 *
 * Loads out/report.json + out/proposal.json (falls back to fixtures).
 * Shows the proposal, asks for approval in the terminal (or --yes),
 * then executes through the rules layer and Prava sandbox.
 * Saves out/receipt.json + out/rules-check.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { validateProposal, validateReport, type ApprovalDecision } from "../core/contract.js";
import { executePurchase } from "../payments/executor.js";

const outDir = join(process.cwd(), "out");
const fixturesDir = join(process.cwd(), "src", "core", "fixtures");
const pick = (name: string, fixture: string) =>
  existsSync(join(outDir, name)) ? join(outDir, name) : join(fixturesDir, fixture);

const report = validateReport(
  JSON.parse(readFileSync(pick("report.json", "report.example.json"), "utf-8"))
);
const proposal = validateProposal(
  JSON.parse(readFileSync(pick("proposal.json", "proposal.example.json"), "utf-8"))
);

console.log(`\n=== PURCHASE PROPOSAL (${proposal.meta.proposal_id}) ===`);
console.log(
  `Recommended: ${proposal.recommended.provider} ${proposal.recommended.plan} — $${proposal.recommended.price}/${proposal.recommended.billing_cycle}`
);
for (const r of proposal.reasoning) console.log(`  • ${r.reason} [${r.finding_ids.join(", ")}]`);
console.log(`Alternatives rejected: ${proposal.alternatives.map((a) => `${a.provider} ${a.plan}`).join(", ")}`);

let approved = process.argv.includes("--yes");
if (!approved) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("\nApprove this purchase? (yes/no) > ")).trim().toLowerCase();
  rl.close();
  approved = answer === "yes" || answer === "y";
}

const decision: ApprovalDecision = {
  proposal_id: proposal.meta.proposal_id,
  decision: approved ? "approved" : "rejected",
  decided_by: "user",
};

const outcome = await executePurchase({
  report,
  proposal,
  decision,
  user: { id: "pay_right_dev_001", email: "sn@blokcapital.io" },
  onPaymentUrl: (url) => {
    console.log("\n👉 OPEN THIS URL AND COMPLETE CARD + PASSKEY (sandbox OTP 456789):");
    console.log(url + "\n");
  },
});

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "rules-check.json"), JSON.stringify(outcome.rules, null, 2), "utf-8");
writeFileSync(join(outDir, "receipt.json"), JSON.stringify(outcome.receipt, null, 2), "utf-8");

console.log("=== RULES CHECK ===");
for (const c of outcome.rules.checks) {
  console.log(`  ${c.passed ? "✅" : "🛑"} ${c.rule}: ${c.detail}`);
}
console.log(`\n=== RECEIPT: ${outcome.receipt.status} ===`);
console.log(JSON.stringify(outcome.receipt, null, 2));
