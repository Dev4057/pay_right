/**
 * Environment configuration — validated once at startup, never read
 * directly from process.env anywhere else.
 */
import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  /** Per-request timeout — a hung call must fail loudly, not hang a run. */
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  /** gpt-5 family reasoning effort: tool loops need speed, not deep thought. */
  OPENAI_REASONING_EFFORT: z.enum(["minimal", "low", "medium", "high"]).default("low"),
  PRAVA_BACKEND_URL: z.string().url().default("https://sandbox.api.prava.space"),
  PRAVA_SECRET_KEY: z.string().optional(),
  PRAVA_PUBLISHABLE_KEY: z.string().optional(),
  WALLET_LIMIT_USD: z
    .string()
    .regex(/^\d+(\.\d{2})?$/, "amount like 30.00")
    .default("30.00"),
  ASSIGNED_CATEGORY: z.literal("hosting").default("hosting"),
  /** SMTP for the receipt email — all optional; unset = email step is skipped.
   *  Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com
   *  SMTP_PASS=<app password, NOT your real password>. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** From header; defaults to SMTP_USER. */
  SMTP_FROM: z.string().optional(),
  /** Render deploy rail. Modes:
   *  off     — deploy feature hidden entirely
   *  dry-run — plan the deploy + show the exact API calls, execute NOTHING (default)
   *  live    — really provision on Render's free tier (demo day only) */
  DEPLOY_MODE: z.enum(["off", "dry-run", "live"]).default("dry-run"),
  RENDER_API_KEY: z.string().optional(),
});

export const env = Env.parse(process.env);

export function requireOpenAIKey(): string {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to backend/.env (hackathon credits key)."
    );
  }
  return env.OPENAI_API_KEY;
}
