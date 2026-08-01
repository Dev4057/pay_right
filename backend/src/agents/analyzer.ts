/**
 * Worker / Analyzer Agent.
 *
 * Reads a Node.js codebase with read-only tools, runs the Load Interview,
 * and emits a RequirementsReport that satisfies the contract.
 *
 * Design rules:
 *  - The LLM reasons; deterministic code enforces. The report is validated
 *    with zod and re-prompted on any violation (validation-retry loop).
 *  - load_class is computed by load-math from interview answers — the agent
 *    must copy it verbatim; we verify it did.
 *  - The agent has no network, no write access, no money. Five tools only.
 */
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { zodToJsonSchema } from "zod-to-json-schema";
import { agentLog, baseParams, makeClient } from "./llm.js";
import { RepoTools } from "./repo-tools.js";
import {
  RequirementsReport,
  validateReport,
} from "../core/contract.js";
import {
  QUESTION_BANK,
  REQUIRED_IDS,
  isCanonicalId,
  type QuestionDef,
} from "../core/interview.js";
import { computeLoadClass, mismatchFlags, type LoadEstimate } from "../core/load-math.js";

/** How the runner (CLI now, HTTP later) collects answers from the human. */
export type AskUser = (questions: QuestionDef[]) => Promise<Record<string, string>>;

export interface AnalyzerResult {
  report: RequirementsReport;
  iterations: number;
}

const MAX_ITERATIONS = 30;

const SYSTEM_PROMPT = `You are the Worker/Analyzer Agent of a pre-deployment infrastructure system.
Your job: read a Node.js codebase with the provided read-only tools and produce a structured
requirements report — evidence, not assumptions.

PROCEDURE (in order):
1. EXPLORE: list_files, then read package.json and entry points; use search_code for signals
   (socket.io/ws, bull/bullmq, node-cron, multer, pg/mysql2/mongoose/sqlite3, cluster, sharp/ffmpeg).
   BATCH your exploration: request MULTIPLE tool calls in a single response (e.g. read 4 files
   at once) — never one file per turn.
2. INTERVIEW: call ask_user EXACTLY ONCE. Include the required question ids (${REQUIRED_IDS.join(", ")})
   plus any other canonical ids that matter, plus custom questions ONLY about things you actually
   found in the code (e.g. upload sizes if you found multer). Never ask technical questions.
3. EMIT: call emit_report with the final report.

HARD RULES for the report:
- Finding ids are F1, F2, F3... sequential and unique.
- Every code finding's evidence cites file:line (e.g. "server.js:12"). Interview-based evidence cites question ids.
- confidence: "derived-from-code" only for things literally visible in files you read;
  "inferred" for reasonable conclusions; "assumption" only when unavoidable — never guess silently.
- load_class: the ask_user result includes computed_load_class and computed_evidence from
  deterministic capacity math. Copy BOTH verbatim into the load_class finding
  (confidence "user-provided"). Do NOT invent your own load estimate.
- interview_answers: include every question asked with the user's exact answer.
- special_needs: include ONLY needs that are actually PRESENT in the code. If something is
  absent (no cron, no queue), OMIT it entirely — never add a finding to record an absence,
  and never infer a need from code that doesn't clearly use it.
- flags: add warnings where the user's expectations conflict with what the code supports,
  and infra-relevant caveats (e.g. local-disk uploads on ephemeral hosting).
- Code reveals architecture class, NOT traffic. Never claim traffic knowledge from code.

If emit_report returns validation errors, fix them and call it again.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List all file paths in the repository (node_modules etc. excluded).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file's content with line numbers. Path is repo-relative.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description:
        "Search all text files with a case-insensitive regex (falls back to literal). Returns file:line: text matches.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ask_user",
      description:
        "Run the Load Interview. Call exactly once, after exploring the code. Returns the user's answers plus the deterministically computed load class.",
      parameters: {
        type: "object",
        properties: {
          question_ids: {
            type: "array",
            items: { type: "string", enum: Object.keys(QUESTION_BANK) },
            description: "Canonical question ids to ask (must include the required ones).",
          },
          custom_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                q_id: { type: "string", description: "e.g. QC_UPLOAD_SIZE" },
                question: { type: "string" },
                options: { type: "array", items: { type: "string" }, minItems: 2 },
              },
              required: ["q_id", "question", "options"],
              additionalProperties: false,
            },
            description: "Code-specific questions grounded in actual findings. May be empty.",
          },
        },
        required: ["question_ids", "custom_questions"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "emit_report",
      description:
        "Submit the final RequirementsReport JSON. Validated against the contract; returns errors to fix if invalid.",
      parameters: {
        type: "object",
        properties: {
          // Full schema generated from the zod contract so the model sees the
          // exact required shape upfront instead of discovering it via rejections.
          report: zodToJsonSchema(RequirementsReport, { target: "openAi" }),
        },
        required: ["report"],
        additionalProperties: false,
      },
    },
  },
];

interface AskUserArgs {
  question_ids: string[];
  custom_questions: { q_id: string; question: string; options: string[] }[];
}

export async function runAnalyzer(
  repoPath: string,
  repoName: string,
  askUser: AskUser
): Promise<AnalyzerResult> {
  const openai = makeClient();
  const tools = new RepoTools(repoPath);
  const log = (msg: string) => agentLog("analyzer", repoName, msg);

  let interviewDone = false;
  let loadEstimate: LoadEstimate | null = null;
  let collectedAnswers: Record<string, string> = {};

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Analyze the repository "${repoName}". Explore it, interview me, then emit the report. meta.target is "nodejs", meta.analyzer_version is "0.1.0".`,
    },
  ];

  const handleAskUser = async (args: AskUserArgs): Promise<string> => {
    if (interviewDone) return "ERROR: ask_user may only be called once. Proceed to emit_report.";

    const ids = [...new Set([...REQUIRED_IDS, ...args.question_ids.filter(isCanonicalId)])];
    const canonical = ids.map((id) => QUESTION_BANK[id]);
    const custom: QuestionDef[] = args.custom_questions.map((q) => ({
      q_id: q.q_id,
      question: q.question,
      options: q.options,
    }));

    const answers = await askUser([...canonical, ...custom]);
    collectedAnswers = answers;

    loadEstimate = computeLoadClass({
      Q_USERS: answers["Q_USERS"] ?? "",
      Q_ACTIVITY: answers["Q_ACTIVITY"] ?? "",
      Q_LAUNCH: answers["Q_LAUNCH"] ?? "",
    });
    interviewDone = true;

    return JSON.stringify({
      answers,
      computed_load_class: loadEstimate.load_class,
      computed_evidence: loadEstimate.evidence,
      instruction:
        "Use computed_load_class and computed_evidence VERBATIM for the load_class finding (confidence user-provided).",
    });
  };

  const handleEmitReport = (reportRaw: unknown): { done: boolean; reply: string } => {
    if (!interviewDone || !loadEstimate) {
      return { done: false, reply: "ERROR: run ask_user before emitting the report." };
    }
    let report: RequirementsReport;
    try {
      report = validateReport(reportRaw);
    } catch (e) {
      return { done: false, reply: `VALIDATION FAILED — fix and re-emit:\n${(e as Error).message}` };
    }
    // Deterministic enforcement: load class must be the computed one.
    if (report.load_class.value !== loadEstimate.load_class) {
      return {
        done: false,
        reply: `VALIDATION FAILED: load_class.value must be "${loadEstimate.load_class}" (computed deterministically), got "${report.load_class.value}". Re-emit.`,
      };
    }
    if (report.load_class.confidence !== "user-provided") {
      return {
        done: false,
        reply: 'VALIDATION FAILED: load_class.confidence must be "user-provided". Re-emit.',
      };
    }
    // Every asked question must appear in interview_answers.
    const answered = new Set(report.interview_answers.map((a) => a.q_id));
    const missing = Object.keys(collectedAnswers).filter((q) => !answered.has(q));
    if (missing.length > 0) {
      return {
        done: false,
        reply: `VALIDATION FAILED: interview_answers is missing ${missing.join(", ")}. Re-emit.`,
      };
    }
    return { done: true, reply: JSON.stringify(report) };
  };

  let consecutiveNoTool = 0;
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const started = Date.now();
    const completion = await openai.chat.completions.create({
      ...baseParams(),
      messages,
      tools: TOOLS,
    });
    const elapsed = Date.now() - started;

    const msg = completion.choices[0]?.message;
    if (!msg) throw new Error("OpenAI returned no message");
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      consecutiveNoTool++;
      log(`iter ${iteration} (${elapsed}ms): no tool call (${consecutiveNoTool} in a row)`);
      if (consecutiveNoTool >= 3) {
        throw new Error("Analyzer stopped calling tools — aborting instead of spinning");
      }
      messages.push({
        role: "user",
        content: "Continue using tools. When finished, call emit_report.",
      });
      continue;
    }
    consecutiveNoTool = 0;
    log(
      `iter ${iteration} (${elapsed}ms): ${msg.tool_calls
        .map((c) => {
          if (c.type !== "function") return c.type;
          try {
            const a = JSON.parse(c.function.arguments || "{}") as Record<string, unknown>;
            if (c.function.name === "read_file") return `read_file(${a.path})`;
            if (c.function.name === "search_code") return `search_code(/${a.pattern}/)`;
            if (c.function.name === "ask_user") {
              const ids = (a.question_ids as string[] | undefined)?.join(",") ?? "";
              const n = (a.custom_questions as unknown[] | undefined)?.length ?? 0;
              return `ask_user(${ids}${n ? ` +${n} custom` : ""})`;
            }
          } catch {
            /* fall through to bare name */
          }
          return c.function.name;
        })
        .join(", ")}`
    );

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: "ERROR: invalid JSON arguments" });
        continue;
      }

      let content: string;
      switch (name) {
        case "list_files": {
          const r = tools.listFiles();
          content = JSON.stringify(r);
          break;
        }
        case "read_file": {
          const { path } = args as { path: string };
          try {
            content = tools.readFile(path);
          } catch (e) {
            content = `ERROR: ${(e as Error).message}`;
          }
          break;
        }
        case "search_code": {
          const { pattern } = args as { pattern: string };
          content = JSON.stringify(tools.searchCode(pattern));
          break;
        }
        case "ask_user": {
          content = await handleAskUser(args as AskUserArgs);
          break;
        }
        case "emit_report": {
          const { report } = args as { report: unknown };
          const result = handleEmitReport(report);
          if (!result.done) log(`emit_report rejected: ${result.reply.slice(0, 200)}`);
          if (result.done) {
            // Post-process: append guaranteed deterministic mismatch flags.
            const final = validateReport(JSON.parse(result.reply));
            const extra = mismatchFlags(
              final.load_class.value,
              final.database.value.type,
              final.database.id,
              final.load_class.id
            ).filter((f) => !final.flags.some((existing) => existing.message === f.message));
            final.flags.push(...extra);
            return { report: final, iterations: iteration };
          }
          content = result.reply;
          break;
        }
        default:
          content = `ERROR: unknown tool ${name}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  throw new Error(`Analyzer did not produce a valid report within ${MAX_ITERATIONS} iterations`);
}
