/**
 * Infra Agent.
 *
 * Input: a validated RequirementsReport + the curated plan catalog.
 * Output: a PurchaseProposal where every reason cites report findings and
 * every plan/price is real (catalog-verified).
 *
 * Same architecture as the analyzer: the LLM reasons and writes the
 * comparison; deterministic checks (contract + proposal-checks) gate the
 * output with a validation-retry loop. No tools other than emit_proposal —
 * the report and catalog are its full world, injected directly.
 */
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { zodToJsonSchema } from "zod-to-json-schema";
import { agentLog, baseParams, makeClient } from "./llm.js";
import {
  PurchaseProposal,
  validateProposal,
  type RequirementsReport,
} from "../core/contract.js";
import { loadCatalog } from "../core/catalog.js";
import { checkProposal, type ProposalExpectations } from "../core/proposal-checks.js";

export interface InfraResult {
  proposal: PurchaseProposal;
  iterations: number;
}

const MAX_ITERATIONS = 8;

const SYSTEM_PROMPT = `You are the Infra Agent of a pre-deployment infrastructure system.
You receive (1) a requirements report produced by a code analyzer — every finding has an id
(F1, F2, ...), a confidence tag, and evidence — and (2) a curated catalog of real hosting plans.

Your job: pick the best-fit plan and produce a purchase proposal.

DECISION PRINCIPLES:
- Code findings decide the plan's SHAPE (websockets need an always-on process; Postgres in code
  strongly favors a platform with managed Postgres; local-disk uploads care about persistent disks).
- The load_class decides the SIZE: buy for the expected case, not the dream case.
  XS/S -> smallest tier that satisfies the shape. M -> mid tier or autoscaling-ready. L -> elasticity mandatory.
- Where load is uncertain, prefer elastic/scalable plans over fixed-capacity ones.
- Cheaper wins when two plans satisfy the same requirements — overpaying is a failure mode
  this product exists to prevent.

HARD RULES:
- Recommend ONLY plans from the catalog, with their EXACT price, billing_cycle and checkout_url.
- Every reasoning entry MUST cite the finding ids it rests on (the findings are the paper trail).
- Include at least 2 alternatives (real catalog plans), each with an honest why_rejected tied to
  the requirements — never invent weaknesses.
- Write reasoning in plain language a founder understands; name the findings' facts, not jargon.

Call emit_proposal with the finished proposal. If it returns validation errors, fix them and re-emit.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "emit_proposal",
      description: "Submit the final PurchaseProposal JSON. Returns validation errors to fix if invalid.",
      parameters: {
        type: "object",
        properties: {
          proposal: zodToJsonSchema(PurchaseProposal, { target: "openAi" }),
        },
        required: ["proposal"],
        additionalProperties: false,
      },
    },
  },
];

export async function runInfraAgent(
  report: RequirementsReport,
  mode: "approval" | "autonomy",
  proposalId: string
): Promise<InfraResult> {
  const openai = makeClient();
  const catalog = loadCatalog();
  const log = (msg: string) => agentLog("infra", report.meta.repo_name, msg);

  const expected: ProposalExpectations = {
    proposal_id: proposalId,
    repo_name: report.meta.repo_name,
    mode,
  };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `REQUIREMENTS REPORT:\n${JSON.stringify(report, null, 2)}\n\n` +
        `PLAN CATALOG (your only allowed plans; prices verified ${catalog.meta.verified_at}):\n` +
        `${JSON.stringify(catalog.plans, null, 2)}\n\n` +
        `Produce the proposal. meta.proposal_id="${proposalId}", meta.repo_name="${report.meta.repo_name}", ` +
        `meta.category="hosting", meta.mode="${mode}".`,
    },
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const started = Date.now();
    const completion = await openai.chat.completions.create({
      ...baseParams(),
      messages,
      tools: TOOLS,
      tool_choice: { type: "function", function: { name: "emit_proposal" } },
    });
    log(`iter ${iteration}: completion in ${Date.now() - started}ms`);

    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    messages.push(msg);

    const call = msg.tool_calls?.find((c) => c.type === "function");
    if (!call || call.type !== "function") {
      messages.push({ role: "user", content: "Call emit_proposal with the proposal." });
      continue;
    }

    let reply: string;
    try {
      const { proposal: raw } = JSON.parse(call.function.arguments || "{}") as { proposal: unknown };
      const proposal = validateProposal(raw);
      const violations = checkProposal(proposal, report, catalog, expected);
      if (violations.length === 0) {
        return { proposal, iterations: iteration };
      }
      reply = `VALIDATION FAILED — fix and re-emit:\n${violations.map((v) => `  - ${v}`).join("\n")}`;
    } catch (e) {
      reply = `VALIDATION FAILED — fix and re-emit:\n${(e as Error).message}`;
    }
    log(`emit_proposal rejected: ${reply.slice(0, 200)}`);
    messages.push({ role: "tool", tool_call_id: call.id, content: reply });
  }

  throw new Error(`Infra Agent did not produce a valid proposal within ${MAX_ITERATIONS} iterations`);
}
