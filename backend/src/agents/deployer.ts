/**
 * Deployer Agent — turns the requirements report into a deploy plan.
 *
 * Same architecture as the Infra Agent: the LLM reasons and writes the
 * DeploySpec; deterministic validation (contract schema + finding-citation
 * check + hard sanity rules) gates the output with a validation-retry loop.
 *
 * The agent PLANS the deployment. It never calls Render — only the
 * deterministic executor (src/deploy/executor.ts) touches the provider,
 * and only after checking the purchase receipt.
 */
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { zodToJsonSchema } from "zod-to-json-schema";
import { agentLog, baseParams, makeClient } from "./llm.js";
import {
  DeploySpec,
  deployCitationsExist,
  validateDeploySpec,
  type RequirementsReport,
} from "../core/contract.js";

export interface DeployPlanResult {
  spec: DeploySpec;
  iterations: number;
}

const MAX_ITERATIONS = 6;

const SYSTEM_PROMPT = `You are the Deployer Agent of Pay Right. A hosting plan was just purchased
for this repository, based on a requirements report produced by a code analyzer. Your job: plan
how to deploy THIS repository on Render (the deploy rail), as a DeploySpec.

GROUND EVERY FIELD IN THE REPORT — never invent facts about the code:
- runtime: from the report's runtime finding (e.g. "node-20" -> "node").
- build_command / start_command: when the repository's ACTUAL package.json is provided below,
  it is ground truth — pick the script that starts the SERVER (e.g. "npm run server", "npm start").
  NEVER use "npm start" unless a "start" script actually exists.
  If package.json has a "build" script (next build, vite build, tsc...), build_command MUST
  install AND build: "npm install --include=dev && npm run build".
  If the start script runs a devDependency tool (tsx, ts-node...), install with --include=dev.
  Without a package.json, infer from the findings' evidence.
- needs_postgres: true ONLY if the report's database finding says postgres.
- env_vars:
  * If needs_postgres: include DATABASE_URL with source "postgres-connection" and value "".
  * NODE_ENV=production (or equivalent) as source "literal".
  * Any secret the code clearly requires (API keys seen in evidence): source "user-must-set",
    value "" — NEVER invent secret values.
  * Render injects PORT automatically; do not set it. If evidence shows a hardcoded port with no
    process.env.PORT fallback, note that in reasoning.
- health_path: a route the evidence shows exists ("/health", "/api/health"); otherwise "/".
- service_name: the repo name as a lowercase slug (letters, digits, hyphens).
- branch: "main" unless the evidence indicates otherwise.
- reasoning: 2-4 short entries, each citing the finding ids (F1, F2, ...) it rests on.

Call emit_deploy_spec with the finished spec. If it returns validation errors, fix them and re-emit.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "emit_deploy_spec",
      description: "Submit the final DeploySpec JSON. Returns validation errors to fix if invalid.",
      parameters: {
        type: "object",
        properties: {
          spec: zodToJsonSchema(DeploySpec, { target: "openAi" }),
        },
        required: ["spec"],
        additionalProperties: false,
      },
    },
  },
];

/** Deterministic sanity rules on top of the schema — violations, or []. */
export function checkDeploySpec(
  spec: DeploySpec,
  report: RequirementsReport,
  packageJsonRaw?: string
): string[] {
  const violations: string[] = [];

  // With the real package.json in hand, an npm start_command MUST reference a
  // script that actually exists — "npm start" against a repo with no start
  // script is exactly the failure this check exists to prevent.
  if (packageJsonRaw) {
    try {
      const scripts = (JSON.parse(packageJsonRaw).scripts ?? {}) as Record<string, string>;
      const m = /^npm\s+(?:run\s+)?([\w:-]+)/.exec(spec.start_command.trim());
      if (m && !scripts[m[1]!]) {
        violations.push(
          `start_command "${spec.start_command}" references npm script "${m[1]}" which does not exist ` +
            `in package.json (available scripts: ${Object.keys(scripts).join(", ") || "none"})`
        );
      }
      // A repo WITH a build script (Next.js, Vite, tsc...) cannot start unbuilt.
      if (scripts["build"] && !/\bbuild\b/.test(spec.build_command)) {
        violations.push(
          `package.json has a "build" script but build_command "${spec.build_command}" never runs it — ` +
            `use "npm install --include=dev && npm run build"`
        );
      }
    } catch {
      /* unparseable package.json — skip script validation */
    }
  }

  const citations = deployCitationsExist(spec, report);
  if (!citations.ok) {
    violations.push(`reasoning cites finding ids not present in the report: ${citations.missing.join(", ")}`);
  }

  const dbIsPostgres = report.database.value.type === "postgres";
  if (spec.needs_postgres && !dbIsPostgres) {
    violations.push(`needs_postgres=true but the report's database finding is "${report.database.value.type}"`);
  }
  if (!spec.needs_postgres && dbIsPostgres) {
    violations.push(`the report shows postgres but needs_postgres=false`);
  }

  const hasDbUrl = spec.env_vars.some((v) => v.source === "postgres-connection");
  if (spec.needs_postgres && !hasDbUrl) {
    violations.push(`needs_postgres=true requires an env var with source "postgres-connection" (DATABASE_URL)`);
  }

  for (const v of spec.env_vars) {
    if (v.source !== "literal" && v.value !== "") {
      violations.push(`env var ${v.key}: value must be "" when source is "${v.source}" — values for it are filled later, never invented`);
    }
  }

  return violations;
}

export async function planDeploy(
  report: RequirementsReport,
  repoName: string,
  opts: { packageJson?: string; onProgress?: (line: string) => void } = {}
): Promise<DeployPlanResult> {
  const openai = makeClient();
  const log = (msg: string) => {
    agentLog("deployer", repoName, msg);
    opts.onProgress?.(msg);
  };
  log(`planning deployment of ${repoName} from the requirements report`);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Repository: ${repoName}\n\n` +
        `REQUIREMENTS REPORT:\n${JSON.stringify(report, null, 2)}\n\n` +
        (opts.packageJson
          ? `THE REPOSITORY'S ACTUAL package.json (ground truth for scripts):\n${opts.packageJson}\n\n`
          : `(package.json was not available — infer commands from the findings' evidence)\n\n`) +
        `Produce the DeploySpec.`,
    },
  ];

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const started = Date.now();
    const completion = await openai.chat.completions.create({
      ...baseParams(),
      messages,
      tools: TOOLS,
      tool_choice: { type: "function", function: { name: "emit_deploy_spec" } },
    });
    log(`iter ${iteration}: completion in ${Date.now() - started}ms`);

    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    messages.push(msg);

    const call = msg.tool_calls?.find((c) => c.type === "function");
    if (!call || call.type !== "function") {
      messages.push({ role: "user", content: "Call emit_deploy_spec with the spec." });
      continue;
    }

    let reply: string;
    try {
      const { spec: raw } = JSON.parse(call.function.arguments || "{}") as { spec: unknown };
      const spec = validateDeploySpec(raw);
      const violations = checkDeploySpec(spec, report, opts.packageJson);
      if (violations.length === 0) {
        log(`deploy spec ready: ${spec.runtime}, build "${spec.build_command}", start "${spec.start_command}"${spec.needs_postgres ? ", + postgres" : ""}`);
        return { spec, iterations: iteration };
      }
      reply = `VALIDATION FAILED — fix and re-emit:\n${violations.map((v) => `  - ${v}`).join("\n")}`;
    } catch (e) {
      reply = `VALIDATION FAILED — fix and re-emit:\n${(e as Error).message}`;
    }
    log(`emit_deploy_spec rejected: ${reply.slice(0, 200)}`);
    messages.push({ role: "tool", tool_call_id: call.id, content: reply });
  }

  throw new Error(`Deployer Agent did not produce a valid DeploySpec within ${MAX_ITERATIONS} iterations`);
}
