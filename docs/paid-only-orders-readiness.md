# Paid-only order creation

## Approved requirement
New orders must exist only after successful payment. Unpaid checkouts keep a private payment reference, never an order ID, and cannot prevent another purchase. Existing customer orders must remain intact.

## Current state
Not implemented or enabled. Read-only inspection confirmed the live `phase1` schema still creates unpaid orders through `prepare_data_order` and `promotion_prepare_order`. Guest/storefront creation also inserts an order before gateway initialization. Changing only the screen would not satisfy this requirement.

The active service is external. Database read access is available, but no external function deployment credential/connection is available. The managed deployment tool targets the unused backend and must not be used. Obtain supported deployment access and compare the deployed payment entrypoints before replacing them; local source may omit live-only changes.

## Implementation
1. Add a private, versioned checkout snapshot, linked to an orderless payment intent. Snapshot server-verified product, normalized recipient, price/fee, supplier, owner/payer, store/self/sub-agent margins, prefix confirmation, campaign reservation and partner attribution. Persist intent and selected provider before asking the gateway to initialize payment.
2. Replace signed-in preparation, guest/storefront initialization and promotion preparation with checkout quotes/reservations. Keep legacy unpaid-order recovery and shared requests operational for existing records. New payment-sharing requests must reference checkouts, not create unpaid orders. Wallet orders are created during successful atomic wallet debit, not before payment selection.
3. Add a service-only atomic settlement operation. Lock the checkout/payment intent, verify provider, reference, GHS and the expected amount within the existing GH₵0.02 tolerance; reject test charges from real order creation. Create/link exactly one order and attach all attribution in the same transaction. Payment and intent state must be visible before Finance's paid-order trigger runs, preventing Kora's wallet misclassification.
4. Preserve receipts for every verified payment. Concurrent successful checkouts for the same recipient need a durable paid review outcome, not a discarded charge or duplicate delivery. Late payment after abandonment/expiry must remain reconcilable. Product/network pauses after payment must not prevent recording received money; fulfillment can hold the paid order safely.
5. Use the common settlement operation from Paystack/Kora/Flutterwave webhooks and callback reconciliation. Purchase intents without an explicit new checkout version must not be reconstructed from missing/deleted legacy orders. Keep failed settlements retryable rather than marking them complete.
6. Audit insert-only versus update-only triggers for Finance, SMS, promotion/campaign settlement, referral and agent/parent earnings. Ensure each existing side effect runs exactly once. Attach partner attribution before delivery can occur.
7. Resolve callbacks by private checkout/payment reference; return a public order ID only after verified creation. Update main and storefront success screens accordingly. Pending screens must not invent an order ID or claim an order exists.
8. Enable all new guest/account/store/promotion paths only after their live settlement and callback support is deployed and validated together. Do not enable a partial rollout that could collect a payment without creating an order.

## Required verification
- Abandoned/failed initialization: no order and no recipient block.
- Successful GH₵4.26 MTN checkout: one GH₵4.10 order after verified payment.
- Wrong amount/currency and test charge: no real order or supplier purchase.
- Concurrent webhook/reconcile/retry: one order, one financial posting, one supplier dispatch.
- Two successful payments for a recipient: both funds accounted for, no silent loss or duplicate fulfillment.
- Callback after browser loss and webhook before initialization response: payment remains recoverable.
- Legacy unpaid order: existing continuation/cancellation still works.
- Store, agent self/sub-agent, promotions and permanent partner attribution: preserved prices, identities and commissions.
- New wallet checkout: successful debit creates one order; insufficient funds creates none.
- Real successful payment reads back through the customer screen and Finance; requires live service deployment and a real payment.

No customer order, payment, setting, supplier request or financial entry was changed during this investigation.