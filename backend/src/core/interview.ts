/**
 * Load Interview — canonical question bank.
 *
 * The Analyzer Agent SELECTS which of these to ask (based on what it found
 * in the code) and may add code-specific custom questions. Canonical ids are
 * what the deterministic load math keys on — the LLM never invents them.
 */

export interface QuestionDef {
  readonly q_id: string;
  readonly question: string;
  readonly options: readonly string[];
}

export const QUESTION_BANK = {
  Q_AUDIENCE: {
    q_id: "Q_AUDIENCE",
    question: "Who is this app for?",
    options: ["Internal team", "B2B customers", "B2C public"],
  },
  Q_USERS: {
    q_id: "Q_USERS",
    question: "How many users do you expect in the first 3 months?",
    options: ["<100 (pilot)", "100-1K", "1K-10K", "10K+"],
  },
  Q_ACTIVITY: {
    q_id: "Q_ACTIVITY",
    question: "When are your users active?",
    options: ["Business hours", "All day", "Spiky events"],
  },
  Q_SESSION: {
    q_id: "Q_SESSION",
    question: "How long is a typical session?",
    options: ["Quick check (1-2 min)", "Normal use (~10 min)", "Lives in it (hours)"],
  },
  Q_GEO: {
    q_id: "Q_GEO",
    question: "Where are your users located?",
    options: ["One country", "One region", "Global"],
  },
  Q_LAUNCH: {
    q_id: "Q_LAUNCH",
    question: "Any launch moment planned?",
    options: ["Quiet rollout", "Launch-day spike", "Marketing push"],
  },
} as const satisfies Record<string, QuestionDef>;

export type CanonicalQuestionId = keyof typeof QUESTION_BANK;

export const CANONICAL_IDS = Object.keys(QUESTION_BANK) as CanonicalQuestionId[];

/** Questions the load math requires — the agent must always ask these. */
export const REQUIRED_IDS: readonly CanonicalQuestionId[] = [
  "Q_USERS",
  "Q_ACTIVITY",
  "Q_LAUNCH",
];

export function isCanonicalId(id: string): id is CanonicalQuestionId {
  return id in QUESTION_BANK;
}
