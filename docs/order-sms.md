# Order SMS operation

The active external database has a private `phase1.order_sms_outbox`. An order trigger queues purchase SMS only after successful payment, and delivery SMS only on a delivered transition. All payment providers, wallet purchases, supplier polling, webhooks and manual delivered updates are covered. Existing purchases are not backfilled. The scheduled worker `notify-mtn-verified-sms` runs each minute and takes up to 20 atomically claimed jobs.

Verification candidates require MTN, successful payment, approval/cleared/email evidence and either actual delivery or supplier handover after clearance. One verification SMS per order chooses the current status at send time. Failed/review/unpaid/unhanded-over orders are excluded. When the verification message already confirms delivery, a queued duplicate routine delivery message is suppressed.

All dates/times come from the order's `created_at` in Africa/Accra. Recipients come from the order's recipient phone, normalized by the Ghana sender helper. Purchase and delivered texts include the actual order reference as Order ID. All four variants link to `https://datayego.com/s/{slug}` for agent store orders, using the agent attached to the order; otherwise they link to the main site. Missing agent details fail closed instead of substituting an unrelated store. Routine messages stay within one ASCII/GSM segment. Verification uses the approved fuller wording and two segments for typical orders.

## Activation gate

Sending is disabled. The internal-only POST endpoint accepts strict request bodies:
- `{ "dryRun": true }`: four sample previews, never sends or activates.
- `{ "test": "0536529090", "dryRun": true }`: sample verification preview.
- `{ "test": "0536529090" }`: sends one explicit sample after sender approval; records provider acceptance but does not activate customers.
- After the owner confirms the test arrived, `{ "activate": true }` enables customer dispatch; a successful test is required.
- `{}`: processes queued messages, or returns zero sends while disabled.

The endpoint requires the existing internal cron secret; do not expose it to client code. The only test destination allowed is the owner-approved number. Test details are explicitly sample details and do not create or change an order.

Provider acceptance is not proof of handset delivery. Unique order/kind keys plus atomic claims prevent ordinary repeat sends. Unknown provider/network outcomes and interrupted workers are quarantined, not automatically retried; rejected messages remain failed for review. Notifications never run in the order/payment transaction. No customer sending occurred during setup.

SQL source: `docs/sql/order-sms-outbox.sql` (already applied to the external phase1 database). Do not apply this source to the unused managed database.

Validation: `bunx vitest run src/lib/orderSms.test.ts`; `node scripts/test-order-sms-db.cjs` uses the external secure DB environment and rolls back every test change. The DB test is a pre-activation check.