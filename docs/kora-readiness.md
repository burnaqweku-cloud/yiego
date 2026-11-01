# Kora payment readiness — Paystack stays active

## Prepared in source
- Existing guest/account checkout, wallet top-ups and agent subscriptions share gateway selection. Kora remains admin-only with test keys; live keys alone cannot switch customers.
- Server-side verification requires an exact matching reference, GHS currency, full charged amount (including wallet checkout fee) and the existing GHS 0.02 tolerance.
- Signed `charge.success` callbacks are verified with Kora before settling. Test intents issue no data, wallet credit or subscription. Persist failures return non-200 so Kora retries.
- Read-only `kora-holdings` endpoint and a separate Finance preparation section show available/pending provider balances. Neither modifies existing Paystack holdings or profit.
- Raw balance-history and refund query/initiation adapters exist; initiation is blocked until GHS refunds are confirmed. They are not connected to refund-order or the ledger.

## Still blocked; not ready to replace Paystack
1. Rotate the private credentials exposed in chat, then configure fresh test credentials securely on the **active external backend**. No pasted credential was used or stored by this task.
2. Deploy the changed functions to that external backend. The environment's managed deployment tool points to the unused backend; do not deploy there. Changes here are source only.
3. Test a real sandbox checkout end-to-end for guest/account data, deposit and subscription. Check duplicate callbacks, missing callbacks, wrong amounts/currency, cancelled orders and return-to-store redirects.
4. Confirm fractional GHS amounts (e.g. GH₵4.26) with Kora. The public guide says integer while the API reference says double. Source preserves decimal major units; no live use until a provider-backed sandbox check succeeds.
5. Confirm GHS refund support, fees, partial refunds and eligibility before wiring provider-aware refund quotes and completion events. Existing Paystack refund policy/authority is unchanged. Kora's public refund reference only states an NGN minimum.
6. Capture GHS collection → available/pending → settlement → bank samples. Confirm all money held, deductions and refunds without double counting. Provider wallet balances are not proven to include all unremitted collections. Finance must not switch to them as an assumed equivalent of Paystack pending transfers/scheduled payouts.
7. Update active ledger posting for every provider-specific collection, subscription, refund and payout. Current subscription activation defaults external providers to `paystack_transit`; do not accept live Kora until this is audited and corrected. Agent withdrawals and settlement/bank sync need a separate verified Kora payout path.
8. After KYC and tests, enable live readiness explicitly (`KORA_LIVE_ENABLED=true`) and separately choose Kora in gateway settings. Never activate it merely by replacing a key. Historical Paystack refunds and outstanding Paystack funds must continue reconciling.

## Deployment set
Deploy `payment-gateway`, `kora-webhook`, `kora-holdings`, `create-wallet-deposit`, `create-guest-data-payment`, `order-payment-action`, `agent-subscribe`, `verify-wallet-deposit`, `reconcile-guest-order` and `flutterwave-webhook` with their shared dependencies. Follow the existing external deployment checklist. Configure the Kora webhook only after deployment; its path is `/functions/v1/kora-webhook` on the active backend's public function host.

Kora refund/transfer callbacks are currently audited in payment_events but do not mutate refund, payout or bank records. No refund endpoint is exposed for Kora yet.

## Official references
- https://developers.korapay.com/docs/checkout-redirect
- https://developers.korapay.com/docs/webhooks
- https://developers.korapay.com/docs/refunds-api
- https://developers.korapay.com/docs/balance-api
- https://developers.korapay.com/docs/balance-history-api
- https://docs.korapay.com/korapay/charges/initialize
- https://docs.korapay.com/korapay/charges/:reference
- https://docs.korapay.com/korapay/refunds/initiate

Kora HMAC-SHA256 signs `JSON.stringify(data)` using the secret key. The encryption key is for direct card encryption, not hosted checkout or webhook signing; it is not needed for this preparation.