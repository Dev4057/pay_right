/**
 * Shared LLM plumbing for both agents: a client with hard timeouts,
 * model-aware request params, and progress logging — a hung or silently
 * spinning agent run must be visible and must fail loudly.
 */
import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { env, requireOpenAIKey } from "../config.js";

export function makeClient(): OpenAI {
  return new OpenAI({
    apiKey: requireOpenAIKey(),
    timeout: env.OPENAI_TIMEOUT_MS,
    maxRetries: 2,
  });
}

/** Base params incl. reasoning effort where the model family supports it. */
export function baseParams(): Pick<ChatCompletionCreateParamsNonStreaming, "model" | "reasoning_effort"> {
  const supportsReasoningEffort = /^(gpt-5|o[0-9])/.test(env.OPENAI_MODEL);
  return {
    model: env.OPENAI_MODEL,
    ...(supportsReasoningEffort ? { reasoning_effort: env.OPENAI_REASONING_EFFORT } : {}),
  };
}

export function agentLog(agent: string, tag: string, message: string): void {
  console.log(`[${new Date().toISOString()}] [${agent}:${tag}] ${message}`);
}
