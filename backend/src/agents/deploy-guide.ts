/**
 * Deploy-Guide Agent — the after-sales engineer.
 *
 * Runs AFTER a successful purchase. Input: the requirements report (what the
 * code needs, with evidence) + the purchase proposal (what was bought).
 * Output: a step-by-step markdown guide for deploying THIS repo on THAT plan.
 *
 * One plain completion, no tools, no retry loop — the guide is a deliverable,
 * not a decision. Money-adjacent logic never lives here.
 */
import type { PurchaseProposal, RequirementsReport } from "../core/contract.js";
import { agentLog, baseParams, makeClient } from "./llm.js";

const SYSTEM_PROMPT = `You are the Deploy-Guide Agent of Pay Right, writing for a founder who
just bought a hosting plan chosen by an analysis of their actual codebase.

Write a practical, step-by-step DEPLOYMENT GUIDE in markdown for deploying THIS repository
on THE EXACT plan that was purchased. Ground every step in the report's findings — runtime,
database, websockets, file uploads, load class. Never invent facts about the code; where
something is unknown, say "check <file>" instead of guessing.

Structure (use these exact headings):
## What you bought and why it fits
2-3 sentences tying the plan to the findings (cite finding ids like F1, F2 inline).
## Before you deploy
Checklist: env vars to set (infer names from the findings/evidence), database provisioning
on this provider, anything the code needs (persistent disk, node version...).
## Deploy — step by step
Numbered, provider-specific steps for THIS provider (dashboard clicks + CLI where it exists):
connect the GitHub repo, build/start commands, attach the database, set env vars, deploy.
## Verify it works
How to smoke-test: health endpoint, websocket connection if the app uses one, a database
read/write, logs to watch during the first hour.
## Watch your spend
2-3 bullets: what is included in this plan's price, what usage could exceed it, and the
one metric to check weekly.

Rules: plain language, no filler, no marketing tone. Keep it under ~500 words.
The reader should be able to deploy by following it top to bottom.`;

export async function writeDeployGuide(
  report: RequirementsReport,
  proposal: PurchaseProposal,
  repoName: string
): Promise<string> {
  const client = makeClient();
  agentLog("deploy-guide", "start", `writing guide for ${repoName} on ${proposal.recommended.provider} ${proposal.recommended.plan}`);

  const completion = await client.chat.completions.create({
    ...baseParams(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Repository: ${repoName}\n\n` +
          `REQUIREMENTS REPORT (from the code analysis):\n${JSON.stringify(report, null, 2)}\n\n` +
          `PURCHASED PLAN:\n${JSON.stringify(proposal.recommended, null, 2)}\n\n` +
          `Write the deployment guide now.`,
      },
    ],
  });

  const guide = completion.choices[0]?.message?.content?.trim();
  if (!guide) throw new Error("deploy-guide agent returned an empty response");
  agentLog("deploy-guide", "done", `${guide.length} chars`);
  return guide;
}
