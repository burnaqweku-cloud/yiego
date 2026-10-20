# Order SMS operation

The active external database has a private `phase1.order_sms_outbox`. An order trigger queues purchase SMS only after successful payment, and delivery SMS only on a delivered transition. All payment providers, wallet purchases, supplier polling, webhooks and manual delivered updates are covered. Existing purchases are not backfilled. The scheduled worker `notify-mtn-verified-sms` runs each minute and takes up to 20 atomically claimed jobs.

Verification candidates require MTN, successful payment, approval/cleared/email evidence and either actual delivery or supplier handover after clearance. One verification SMS per order chooses the current status at send time. Failed/review/unpaid/unhanded-over orders are excluded. When the verification message already confirms delivery, a queued duplicate routine delivery message is suppressed.

All dates/times come from the order's `created_at` in Africa/Accra. Recipients come from the order's recipient phone, normalized by the Ghana sender helper. Purchase and delivered texts include the actual order reference as Order ID. All four variants link to `https://datayego.com/s/{slug}` for agent store orders, using the agent attached to the order; otherwise they link to the main site. Missing agent details fail closed instead of substituting an unrelated store. Wording approved 20 Oct 2026 after delivery tests on MTN (sender `DTYEGO`; texts that named the network, said GB/bundles or carried an https link were dropped by the network): sizes read `2G`, main-site texts say `on DTYEGO` and end with `datayego.com`; store orders say `on <store name>` and end with the store's own address (custom domain if active, else `<slug>.datayego.com`). Routine messages stay within one segment for normal store names, two at most. Verification is two segments. "On its way" is only sent for orders under 48 hours old.

## Activation gate

Sending is disabled. The internal-only POST endpoint accepts strict request bodies:
- `{ "dryRun": true }`: four sample previews, never sends or activates.
- `{ "test": "+233557375894", "dryRun": true }`: sample verification preview.
- `{ "test": "+233557375894" }`: sends one explicit sample using the approved sender `DTYEGO`; records provider acceptance but does not activate customers.
- After the owner confirms the test arrived, `{ "activate": true }` enables customer dispatch; a successful test is required.
- `{}`: processes queued messages, or returns zero sends while disabled.

The endpoint requires the existing internal cron secret; do not expose it to client code. The only test destination allowed is the owner-approved number. Test details are explicitly sample details and do not create or change an order.

Provider acceptance is not proof of handset delivery. Unique order/kind keys plus atomic claims prevent ordinary repeat sends. Unknown provider/network outcomes and interrupted workers are quarantined, not automatically retried; rejected messages remain failed for review. Notifications never run in the order/payment transaction. No customer sending occurred during setup.

SQL source: `docs/sql/order-sms-outbox.sql` (already applied to the external phase1 database). Do not apply this source to the unused managed database.

Validation: `bunx vitest run src/lib/orderSms.test.ts`; `node scripts/test-order-sms-db.cjs` uses the external secure DB environment and rolls back every test change. The DB test is a pre-activation check.
## Delivery reports (added 20 Oct 2026)

Vynfy's send reply carries `data.task_id` (their docs say `job_id`; `sendSms` accepts either) and it is stored as `provider_job_id`. The scheduled job `sync-order-sms-delivery` (every 5 minutes) calls `sms-status-sync`, which asks `GET /api/v1/status/<task_id>` for accepted texts from the last 3 days that have no final report (at most 12 checks each) and records `delivery_status` (`delivered` / `not_delivered` / `failed` / `sent` / `pending` / `unknown`), `delivery_checked_at`, `delivery_checks` and the raw reply on the outbox row. It is read-only: nothing is re-queued or re-sent from a report. Texts sent before this change (the 20 Oct verification batch) have no task id and can only be checked in the Vynfy dashboard. `{ "probe": "<task_id>" }` returns one raw report.
