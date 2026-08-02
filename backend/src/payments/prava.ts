/**
 * Prava sandbox client — the execution layer.
 *
 * Flow (SDK path, per PRAVA_INTEGRATION_GUIDE):
 *   createSession() -> user completes card entry + passkey at iframe_url
 *   pollPaymentResult() -> one-time credential (Visa network token + dynamic CVV)
 *   ...agent completes checkout at the merchant with the credential...
 *   reportStatus() -> APPROVED | DECLINED  (REQUIRED — else txn sticks in awaiting_result)
 *
 * No LLM touches this module. It is called only after the rules layer passes.
 */
import "dotenv/config";

const BASE = process.env.PRAVA_BACKEND_URL ?? "https://sandbox.api.prava.space";
const SECRET = process.env.PRAVA_SECRET_KEY;

function headers(): Record<string, string> {
  if (!SECRET) throw new Error("PRAVA_SECRET_KEY is not set (backend/.env)");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SECRET}`,
  };
}

/**
 * fetch with a safety net for TRANSIENT faults only: network drops and 5xx
 * responses (the sandbox occasionally returns a one-off 500 INTERNAL_ERROR).
 *
 * This does NOT violate the "no autonomous retry" rule — that rule forbids
 * re-attempting a PURCHASE after a halt or decline. These retries are
 * transport-level plumbing: a definitive answer from Prava (2xx/4xx) is
 * always returned immediately on the first attempt; only "the wire glitched"
 * is retried, and only a couple of times.
 */
async function fetchTransientSafe(
  label: string,
  url: string,
  init: RequestInit,
  { attempts = 3, backoffMs = 2000 }: { attempts?: number; backoffMs?: number } = {}
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500) return res; // success OR a definitive 4xx — a real answer
      lastError = new Error(`${label} failed (${res.status}): ${await res.text()}`);
    } catch (e) {
      lastError = new Error(`${label} network error: ${(e as Error).message}`);
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, backoffMs));
  }
  throw lastError ?? new Error(`${label} failed`);
}

export interface MerchantDetails {
  name: string;
  url: string;
  country_code_iso2: string;
  category?: string;
  category_code?: string;
}

export interface ProductDetails {
  description: string;
  unit_price: string;
  quantity: number;
}

export interface CreateSessionInput {
  user_id: string;
  user_email: string;
  total_amount: string;
  currency: "USD";
  description: string;
  merchant: MerchantDetails;
  products: ProductDetails[];
}

export interface PravaSession {
  session_id: string;
  session_token: string;
  iframe_url: string;
  order_id: string;
  expires_at: string;
}

export async function createSession(input: CreateSessionInput): Promise<PravaSession> {
  const res = await fetchTransientSafe("createSession", `${BASE}/v1/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      user_id: input.user_id,
      user_email: input.user_email,
      total_amount: input.total_amount,
      currency: input.currency,
      description: input.description,
      purchase_context: [
        {
          merchant_details: input.merchant,
          product_details: input.products,
          effective_until_minutes: 15,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`createSession failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as PravaSession;
}

export interface PaymentCredential {
  token: string; // 16-digit Visa network token -> card-number field
  dynamic_cvv: string; // one-time CVV -> CVV field
  expiry_month: string;
  expiry_year: string;
  txn_ref_id: string; // needed for reportStatus
  merchant_name: string;
  total_amount: string;
}

/**
 * Polls payment-result until the user finishes card entry + passkey.
 * Credentials live on transactions[].line_items[].
 */
export async function pollPaymentResult(
  sessionId: string,
  // 12 minutes: first-time card entry (OTP + passkey registration) can be slow.
  { maxAttempts = 240, intervalMs = 3000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<PaymentCredential> {
  for (let i = 0; i < maxAttempts; i++) {
    // Transient-safe: a single sandbox 500 mid-poll must not kill a payment
    // the user is actively completing at the passkey screen.
    const res = await fetchTransientSafe(
      "payment-result",
      `${BASE}/v1/sessions/${sessionId}/payment-result`,
      { headers: headers() }
    );
    if (!res.ok) throw new Error(`payment-result failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as {
      status: "pending" | "completed" | "awaiting_result" | "failed";
      transactions?: Array<{
        error?: { message?: string };
        line_items: Array<{
          txn_ref_id: string;
          merchant_name: string;
          total_amount: string;
          status?: string;
          token?: string;
          dynamic_cvv?: string;
          expiry_month?: string;
          expiry_year?: string;
        }>;
      }>;
    };

    // The credential is ready on "completed" — but the live sandbox reports
    // "awaiting_result" (credentials generated, outcome not yet reported)
    // with the token already present on the line item. Accept both.
    const li = data.transactions?.[0]?.line_items?.[0];
    const credentialReady =
      data.status === "completed" ||
      (data.status === "awaiting_result" && Boolean(li?.token) && Boolean(li?.dynamic_cvv));

    if (credentialReady) {
      if (!li?.token || !li.dynamic_cvv) {
        throw new Error(`payment-result ${data.status} but credential fields are missing`);
      }
      return {
        token: li.token,
        dynamic_cvv: li.dynamic_cvv,
        expiry_month: li.expiry_month ?? "",
        expiry_year: li.expiry_year ?? "",
        txn_ref_id: li.txn_ref_id,
        merchant_name: li.merchant_name,
        total_amount: li.total_amount,
      };
    }
    if (data.status === "failed") {
      throw new Error(data.transactions?.[0]?.error?.message ?? "Payment failed");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Polling timed out waiting for card entry/passkey");
}

/** REQUIRED after checkout — report every outcome, including DECLINED. */
export async function reportStatus(
  sessionId: string,
  txnRefId: string,
  status: "APPROVED" | "DECLINED",
  authorizationCode?: string
): Promise<void> {
  // Transient-safe: Prava REQUIRES this report — if it were dropped on a
  // network blip, a payment that actually succeeded would look failed.
  const res = await fetchTransientSafe("report-status", `${BASE}/v1/sessions/${sessionId}/report-status`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      txn_ref_id: txnRefId,
      txn_status: status,
      ...(authorizationCode ? { authorization_code: authorizationCode } : {}),
    }),
  });
  if (!res.ok) throw new Error(`report-status failed (${res.status}): ${await res.text()}`);
}

export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
