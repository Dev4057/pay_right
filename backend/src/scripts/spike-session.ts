/**
 * Phase 2 spike — end-to-end sandbox payment.
 *
 * Creates a $5 session, prints the payment URL for you to open in a browser
 * (card entry -> sandbox OTP 456789 -> passkey), then polls until the
 * one-time credential arrives and reports APPROVED.
 *
 * Run: npx tsx src/scripts/spike-session.ts
 */
import { createSession, pollPaymentResult, reportStatus } from "../payments/prava.js";

const session = await createSession({
  user_id: "pay_right_dev_001",
  user_email: "sn@blokcapital.io",
  total_amount: "5.00",
  currency: "USD",
  description: "Spike test: hosting plan purchase",
  merchant: {
    name: "Railway",
    url: "https://railway.app",
    country_code_iso2: "US",
    category: "Cloud Hosting",
  },
  products: [{ description: "Railway Hobby plan - 1 month", unit_price: "5.00", quantity: 1 }],
});

console.log("Session created:", session.session_id);
console.log("\n👉 OPEN THIS URL IN YOUR BROWSER AND COMPLETE CARD ENTRY:");
console.log(session.iframe_url);
console.log("\n(sandbox OTP for device binding: 456789)");
console.log("\nPolling for credential — finish the flow in the browser...");

const cred = await pollPaymentResult(session.session_id);
console.log("\n✅ ONE-TIME CREDENTIAL RECEIVED:");
console.log(`   Token (card number): ${cred.token}`);
console.log(`   Dynamic CVV:         ${cred.dynamic_cvv}`);
console.log(`   Expiry:              ${cred.expiry_month}/${cred.expiry_year}`);
console.log(`   txn_ref_id:          ${cred.txn_ref_id}`);

await reportStatus(session.session_id, cred.txn_ref_id, "APPROVED");
console.log("\n✅ Outcome reported: APPROVED. Full sandbox loop works end-to-end.");
