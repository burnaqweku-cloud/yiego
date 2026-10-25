# Refund choices and processing-fee policy

## What will change

When an administrator searches an order ID and opens its details, show a clear refund note based on the order’s payment method and verified situation.

### 1. Supplier-rejected orders: full refund
- Keep full refunds for supplier failures, including the checkout fee for Paystack payments.
- Require you to confirm that the supplier credited the cost back, with a short reference or note, when a supplier purchase occurred.
- A failed / needs-review label alone is not proof that the supplier returned the money.
- Wallet-paid orders return their order amount to the wallet, without a processing-fee deduction.

### 2. MTN verification holds: wait or refund
- Show the alternative: wait for number verification, then have the order sent for delivery. Do not promise a delivery date or automatically send it.
- For a Paystack-paid order that has not been purchased from the supplier, show:
  - Total originally paid, including the 4% checkout fee.
  - Paystack’s actual processing fee for that transaction.
  - Exact amount the customer would receive.
- Refund amount = original payment minus its actual Paystack processing fee. Do not deduct our 4% checkout fee again.
- Example: GH₵104 paid − GH₵2.08 Paystack fee = **GH₵101.92 refunded**.
- Wallet-paid verification holds receive the full order amount back into the wallet, without a new fee deduction.
- If the supplier already accepted/purchased the order, do not offer this fee-excluding verification refund; resolve the supplier position first.

## Customer disclosure and confirmation
- Explain the MTN verification refund deduction alongside the existing number-check warning before Paystack payment, and in the applicable refund terms.
- Keep supplier-failure refunds explicitly exempt from that deduction.
- Before issuing a reduced refund, show a confirmation with the paid amount, fee retained and refund amount; record the customer’s request and acceptance of the quoted amount.
- Do not automatically apply the new deduction to earlier purchases based only on the old number-check warning. Earlier orders retain the existing full-refund path unless an informed agreement is permitted and recorded.
- Confirm the policy is consistent with applicable consumer requirements before activation; a warning does not establish who is legally responsible for a failure.

## How Finance stays correct
- Keep the main Finance formula, Paystack API readings and the small pending-fee estimate unchanged.
- On a successfully initiated refund, resolve the full cancelled-order obligation, including its pending checkout fee, through the existing accounting lifecycle. Any refund still owed remains tracked until the refund succeeds.
- Send only the agreed reduced amount to Paystack. The retained amount covers the original transaction fee; it is not additional order-sales profit.
- Continue subtracting the actual Paystack refund amount only while the API reports it not fully deducted. Once deducted inside a payout, the separate minus disappears as it does today.
- Wallet refunds never change the bank balance.
- Do not manually add a fee recovery to the Finance profit card or deduct the transaction fee twice.
- This avoids bearing the original processing fee only when the deduction matches that fee, no supplier cost remains lost, and no additional refund charge applies.

## Safeguards
- Admin-only refunds with existing two-factor protection; staff remain read-only.
- Recheck payment, verification hold, supplier purchase history and refund status immediately before refunding.
- Verify payment amount, currency and actual fee directly with Paystack. If that reading is missing or inconsistent, block the reduced refund rather than guessing 2%.
- Prevent concurrent refund and supplier-send actions, duplicate refunds and accidental retries after an uncertain Paystack response.
- Preserve existing full-refund and automatic supplier-failure paths; do not enable fee retention globally.
- Save the refund reason, calculation, administrator, confirmation and provider reference for later review.

## Technical implementation
- Reuse Admin → Orders search/details and the relevant MTN verification refund entry point; share one refund preview and confirmation flow so entry points cannot apply different rules.
- First inspect the authoritative deployed `refund-order` engine and the active external `phase1` refund/accounting functions. The local refund engine currently has only a README, so do not replace it with an incomplete reconstruction.
- Add a protected server-calculated refund quote and a validated refund policy/reason to the existing engine. Client inputs must never decide the fee, amount or eligibility.
- Treat a reduced payment refund as full resolution of the cancelled order, not an outstanding partial-order obligation. Adapt existing postings and completion handling accordingly after inspecting them.
- Apply any required SQL and function deployments only to the active external service, never the unused managed backend.

## Verification before activation
- Add concrete tests for GH₵104 − GH₵2.08 = GH₵101.92; full supplier-rejection refund GH₵104; and full wallet refund GH₵100.
- Test missing actual fee, already-sent verification orders, customer acceptance, staff restriction, duplicate requests and refund/send races.
- Test full obligation release, refund failure/pending handling and the API’s transition from not deducted to fully deducted without a second subtraction.
- Verify order search → refund quote → confirmation → returned status and Finance readback in an authenticated administrator session, using a safe test transaction. Do not issue a real customer refund merely to test.
- Activate only after the authoritative engine, accounting and test flow are verified. External deployment access or authenticated test access may need to be supplied before activation.

## Scope
No app code or financial records have changed. Approval authorizes implementation of this plan, not an immediate refund of any existing order.