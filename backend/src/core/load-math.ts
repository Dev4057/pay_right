/**
 * Deterministic load math — interview answers -> load class.
 *
 * Pure functions, zero LLM. Standard capacity-planning heuristics:
 *   daily requests = DAU x requests/user/day   (web app ~30/user midpoint)
 *   average RPS    = daily requests / 86,400
 *   peak RPS       = average x peak factor
 *
 * Output is a CLASS (a range), never a fake-precise number.
 */
import type { LoadClass } from "./contract.js";
import { z } from "zod";
import { LoadClass as LoadClassSchema } from "./contract.js";

const ORDER = LoadClassSchema.options; // ["XS", "S", "M", "L"]

/** DAU midpoint per Q_USERS bucket — used only for the evidence estimate. */
const DAU_MIDPOINT: Record<string, number> = {
  "<100 (pilot)": 50,
  "100-1K": 500,
  "1K-10K": 5000,
  "10K+": 20000,
};

const BASE_CLASS: Record<string, LoadClass> = {
  "<100 (pilot)": "XS",
  "100-1K": "S",
  "1K-10K": "M",
  "10K+": "L",
};

const PEAK_FACTOR: Record<string, number> = {
  "Business hours": 3,
  "All day": 2,
  "Spiky events": 10,
};

const REQUESTS_PER_USER_PER_DAY = 30;

export interface LoadEstimate {
  load_class: LoadClass;
  /** Human-readable evidence string for the report finding. */
  evidence: string;
  avg_rps: number;
  peak_rps: number;
}

export interface LoadAnswers {
  Q_USERS: string;
  Q_ACTIVITY: string;
  Q_LAUNCH: string;
}

const LoadAnswersSchema = z.object({
  Q_USERS: z.enum(Object.keys(BASE_CLASS) as [string, ...string[]]),
  Q_ACTIVITY: z.enum(Object.keys(PEAK_FACTOR) as [string, ...string[]]),
  Q_LAUNCH: z.enum(["Quiet rollout", "Launch-day spike", "Marketing push"]),
});

/** One step up the ladder (XS->S->M->L), never past L. */
function bump(cls: LoadClass): LoadClass {
  const i = ORDER.indexOf(cls);
  return ORDER[Math.min(i + 1, ORDER.length - 1)] as LoadClass;
}

/**
 * Compute the load class. Throws on unknown answer values — answers must be
 * exact options from the question bank (the CLI/UI enforces this; so does
 * this guard, in case an LLM ever relays them).
 */
export function computeLoadClass(raw: LoadAnswers): LoadEstimate {
  const answers = LoadAnswersSchema.parse(raw);

  const dau = DAU_MIDPOINT[answers.Q_USERS]!;
  const avgRps = (dau * REQUESTS_PER_USER_PER_DAY) / 86_400;
  const peakFactor =
    answers.Q_LAUNCH === "Launch-day spike" ? 10 : PEAK_FACTOR[answers.Q_ACTIVITY]!;
  const peakRps = avgRps * peakFactor;

  let cls = BASE_CLASS[answers.Q_USERS]!;
  // Spikes demand elastic headroom one class up — a launch day or event
  // traffic behaves like the next audience size for its peak minutes.
  if (answers.Q_LAUNCH === "Launch-day spike" || answers.Q_ACTIVITY === "Spiky events") {
    cls = bump(cls);
  }

  const evidence =
    `interview: ${answers.Q_USERS} users, activity "${answers.Q_ACTIVITY}", ` +
    `launch "${answers.Q_LAUNCH}" -> ~${avgRps.toFixed(2)} avg RPS, ` +
    `~${peakRps.toFixed(1)} peak RPS -> class ${cls}`;

  return { load_class: cls, evidence, avg_rps: avgRps, peak_rps: peakRps };
}

/**
 * Deterministic expectation-vs-code mismatch checks. The agent may add more
 * nuanced flags; these are the guaranteed ones.
 */
export function mismatchFlags(
  loadClass: LoadClass,
  dbType: string,
  dbFindingId: string,
  loadFindingId: string
): { severity: "warning"; message: string; related_finding_ids: string[] }[] {
  const flags: { severity: "warning"; message: string; related_finding_ids: string[] }[] = [];
  if ((loadClass === "M" || loadClass === "L") && dbType === "sqlite") {
    flags.push({
      severity: "warning",
      message:
        "You expect a growing/large audience but the code uses SQLite (single-file, single-writer database). This expectation exceeds what the current database choice supports.",
      related_finding_ids: [dbFindingId, loadFindingId],
    });
  }
  return flags;
}
