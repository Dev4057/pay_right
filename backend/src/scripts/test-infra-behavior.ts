/**
 * Behavioral test: does the Infra Agent make DIFFERENT decisions for
 * DIFFERENT requirements? Three contrasting reports, three live runs.
 *
 *   npx tsx src/scripts/test-infra-behavior.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateReport, type RequirementsReport } from "../core/contract.js";
import { runInfraAgent } from "../agents/infra.js";

const base = validateReport(
  JSON.parse(
    readFileSync(join(process.cwd(), "src", "core", "fixtures", "report.example.json"), "utf-8")
  )
);

// Scenario A — the fixture: S-class realtime chat app (websockets + postgres + uploads)
const scenarioA = base;

// Scenario B — same app, but expecting SCALE: 10K+ users, launch-day spike -> L
const scenarioB: RequirementsReport = structuredClone(base);
scenarioB.meta.repo_name = "demo-chat-app-scale";
scenarioB.load_class = {
  id: "F6",
  value: "L",
  confidence: "user-provided",
  evidence: "interview: 10K+ users, launch-day spike -> ~7 avg RPS, ~70 peak RPS -> class L",
};

// Scenario C — tiny stateless REST API: no websockets, no DB, no uploads, XS pilot
const scenarioC: RequirementsReport = {
  meta: { repo_name: "tiny-webhook-api", target: "nodejs", analyzer_version: "0.1.0" },
  runtime: { id: "F1", value: "node-20", confidence: "derived-from-code", evidence: "package.json:5" },
  database: {
    id: "F2",
    value: { type: "none", shape: "none", workload: "unknown" },
    confidence: "derived-from-code",
    evidence: "no database driver in package.json; no queries found",
  },
  concurrency: {
    id: "F3",
    value: "io-bound-stateless",
    confidence: "derived-from-code",
    evidence: "3 Express routes forwarding webhooks; no session state",
  },
  special_needs: [],
  load_class: {
    id: "F4",
    value: "XS",
    confidence: "user-provided",
    evidence: "interview: <100 users, business hours, quiet rollout -> ~0.02 avg RPS -> XS",
  },
  interview_answers: [
    { q_id: "Q_USERS", question: "How many users do you expect in the first 3 months?", answer: "<100 (pilot)" },
    { q_id: "Q_ACTIVITY", question: "When are your users active?", answer: "Business hours" },
    { q_id: "Q_LAUNCH", question: "Any launch moment planned?", answer: "Quiet rollout" },
  ],
  flags: [],
};

const only = process.argv[2]; // optionally run one scenario: A | B | C
const scenarios = [
  { name: "A: S-class chat app (websockets+pg+uploads)", report: scenarioA, expect: "smallest always-on plan with managed PG + disk" },
  { name: "B: SAME app at L-class (10K+, launch spike)", report: scenarioB, expect: "a bigger/elastic tier — NOT the $5 plan" },
  { name: "C: XS stateless API, no DB, no websockets", report: scenarioC, expect: "cheapest plan; PG/disk should NOT matter" },
];

for (const s of scenarios.filter((s) => !only || s.name.startsWith(only))) {
  console.log(`\n=== ${s.name} ===`);
  console.log(`    (expectation: ${s.expect})`);
  const { proposal, iterations } = await runInfraAgent(s.report, "approval", `prop_test_${s.report.meta.repo_name}`);
  console.log(`    -> ${proposal.recommended.provider} ${proposal.recommended.plan} $${proposal.recommended.price}/${proposal.recommended.billing_cycle} (${iterations} iteration${iterations > 1 ? "s" : ""})`);
  for (const r of proposal.reasoning) {
    console.log(`       • ${r.reason.slice(0, 110)}${r.reason.length > 110 ? "..." : ""} [${r.finding_ids.join(",")}]`);
  }
  console.log(`       rejected: ${proposal.alternatives.map((a) => `${a.provider} ${a.plan} ($${a.price})`).join(" | ")}`);
}
