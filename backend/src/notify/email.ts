/**
 * Receipt email — the "here is everything you just bought" message, sent to
 * the address the user signed in with.
 *
 * Contents: the receipt, what the code analysis found, the savings math, and
 * the agent-written deployment guide. Pure presentation — all numbers and
 * facts arrive already computed/validated; nothing is decided here.
 *
 * SMTP is optional: with no SMTP_* env vars the send is skipped gracefully
 * (the same content still shows on the dashboard receipt screen).
 */
import nodemailer from "nodemailer";
import { env } from "../config.js";
import type {
  PurchaseProposal,
  RequirementsReport,
  TransactionReceipt,
} from "../core/contract.js";
import type { SavingsSummary } from "../core/savings.js";

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

export interface ReceiptEmailInput {
  to: string;
  userName: string;
  repoName: string;
  report: RequirementsReport;
  proposal: PurchaseProposal;
  receipt: TransactionReceipt;
  savings: SavingsSummary;
  deployGuide: string | null;
}

/* ---------- tiny presentation helpers (dark, brand-matched HTML) ---------- */

const YELLOW = "#FFD600";
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function row(label: string, value: string, highlight = false): string {
  return `<tr>
    <td style="padding:6px 14px 6px 0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;">${esc(label)}</td>
    <td style="padding:6px 0;color:${highlight ? YELLOW : "#f5f5f0"};font-size:13px;font-weight:${highlight ? "bold" : "normal"};">${esc(value)}</td>
  </tr>`;
}

function section(title: string, bodyHtml: string): string {
  return `<div style="margin-top:28px;">
    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:2px;border-bottom:1px solid #2d2d2d;padding-bottom:6px;margin-bottom:12px;">${esc(title)}</div>
    ${bodyHtml}
  </div>`;
}

/** The report's core findings as label/value lines (id + confidence shown). */
function findingLines(report: RequirementsReport): string {
  const asText = (v: unknown): string =>
    typeof v === "string"
      ? v
      : Object.entries(v as Record<string, unknown>)
          .map(([k, val]) => `${k}: ${String(val)}`)
          .join(", ");
  const core = [report.runtime, report.database, report.concurrency, report.load_class];
  const items = [
    ...core.map((f) => ({
      id: f.id,
      text: asText(f.value),
      confidence: f.confidence,
    })),
    ...report.special_needs.map((f) => ({
      id: f.id,
      text: f.value.need,
      confidence: f.confidence,
    })),
  ];
  return items
    .map(
      (i) =>
        `<div style="padding:7px 10px;border:1px solid #1d1d1d;border-radius:4px;margin-bottom:6px;color:#f5f5f0;font-size:13px;">
          <span style="color:${YELLOW};font-weight:bold;">${esc(i.id)}</span>
          &nbsp;${esc(i.text)}
          <span style="float:right;color:#888;font-size:11px;">${esc(i.confidence)}</span>
        </div>`
    )
    .join("");
}

export function buildReceiptEmail(input: ReceiptEmailInput): { subject: string; html: string } {
  const { proposal, receipt, savings, report } = input;
  const p = proposal.recommended;
  const subject = `Your Pay Right receipt — ${p.provider} ${p.plan} for ${input.repoName}`;

  const savingsHtml = `
    <p style="color:#f5f5f0;font-size:13px;line-height:1.6;margin:0 0 10px;">${esc(savings.headline)}</p>
    ${savings.avoided_traps
      .map(
        (t) =>
          `<div style="color:#888;font-size:12px;margin:3px 0;">✗ ${esc(t.provider)} ${esc(t.plan)} ($${esc(t.price)}/mo) — ${esc(t.fails)}</div>`
      )
      .join("")}`;

  const guideHtml = input.deployGuide
    ? `<pre style="white-space:pre-wrap;word-wrap:break-word;background:#0a0a0a;border:1px solid #2d2d2d;border-radius:6px;padding:16px;color:#d5d5d0;font-size:12.5px;line-height:1.65;font-family:Consolas,Menlo,monospace;margin:0;">${esc(input.deployGuide)}</pre>`
    : `<p style="color:#888;font-size:12px;">The deployment guide could not be generated for this run — it is available on your dashboard.</p>`;

  const html = `
  <div style="background:#0a0a0a;padding:32px 16px;font-family:Consolas,Menlo,'Segoe UI',monospace;">
    <div style="max-width:640px;margin:0 auto;background:#0f0f0f;border:1px solid #2d2d2d;border-radius:8px;padding:32px;">

      <div style="display:flex;align-items:center;">
        <span style="display:inline-block;width:10px;height:10px;background:${YELLOW};border-radius:2px;margin-right:10px;"></span>
        <span style="color:#f5f5f0;font-size:15px;font-weight:bold;letter-spacing:3px;">PAY RIGHT</span>
        <span style="color:#555;font-size:10px;letter-spacing:1px;margin-left:10px;">POWERED BY PRAVA</span>
      </div>

      <h1 style="color:#f5f5f0;font-size:20px;margin:26px 0 4px;">Purchase complete ✓</h1>
      <p style="color:#888;font-size:13px;margin:0;">
        Hi ${esc(input.userName)} — your agent analyzed <b style="color:#f5f5f0;">${esc(input.repoName)}</b>,
        picked the best-fit plan, passed all four compliance rules, and completed the purchase through Prava.
      </p>

      ${section(
        "Receipt",
        `<table style="border-collapse:collapse;">${[
          row("Plan", `${p.provider} ${p.plan}`),
          row("Amount", `$${p.price} / ${p.billing_cycle}`, true),
          row("Status", receipt.status),
          row("Proposal ID", receipt.proposal_id),
          row("Session", receipt.session_id ?? "—"),
          row("Timestamp", receipt.timestamp),
        ].join("")}</table>
        <p style="color:#555;font-size:11px;margin:12px 0 0;">
          Audit seal (sha-256 over the full decision bundle — tamper evidence):<br/>
          <span style="word-break:break-all;color:#888;">${esc(receipt.audit_seal ?? "—")}</span>
        </p>`
      )}

      ${section("What your money bought — and what it saved", savingsHtml)}

      ${section(`What the analysis found in ${input.repoName}`, findingLines(report))}

      ${section("Your deployment guide", guideHtml)}

      <p style="color:#555;font-size:11px;margin-top:28px;border-top:1px solid #1d1d1d;padding-top:14px;line-height:1.6;">
        Payment executed via Prava's tokenized rails: passkey approval, one-time Visa network token,
        amount locked to the approved proposal. This purchase was gated by four deterministic rules
        (spend-ceiling, price-match, category-lock, traceability) that no AI can override.<br/>
        Pay Right — pre-deployment infrastructure, purchased responsibly.
      </p>
    </div>
  </div>`;

  return { subject, html };
}

export async function sendReceiptEmail(input: ReceiptEmailInput): Promise<void> {
  if (!isEmailConfigured()) throw new Error("SMTP is not configured (backend/.env)");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER!, pass: env.SMTP_PASS! },
  });
  const { subject, html } = buildReceiptEmail(input);
  await transport.sendMail({
    from: env.SMTP_FROM ?? `Pay Right <${env.SMTP_USER}>`,
    to: input.to,
    subject,
    html,
  });
}
