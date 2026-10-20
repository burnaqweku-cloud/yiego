# MTN verification (admin-driven)

Since 20 Oct 2026 nothing about verification-held orders runs on a schedule. The hourly `verify-mtn-numbers` job was
unscheduled after automatic re-sends bought 123 orders twice from DataBundlesHub on 19 Oct (~GH₵1,050).

Admin → MTN verification:
- **Queue** – orders with `admin_resolution_status = awaiting_verification`. *Check all with DBH* calls
  `admin-mtn-verification {action:"check_all"}`: beneficiary check in batches of 100 (orders + submitted numbers), report
  stored in `phase1.mtn_verification_checks`, answers in `beneficiary_checks`, approved orders get one
  `supplier.number_approved` event. Nothing is sent. *Send selected* calls `{action:"send", orderIds}`.
- **Sent** – `phase1.mtn_verification_sends` joined to orders: outcome (sent / adopted / refused / failed), who, DBH status.
- **Submitted numbers** – numbers submitted without an order.
- **History** – check runs with full reports, and the order events.

Send guards, in order: a lock row per order in `mtn_verification_sends` (unique; refused/failed may be taken over, sent/adopted
never); the number must be approved on a check less than 24h old; an existing DBH attempt is looked up and adopted if alive;
no successful DBH purchase to that number in the last 10 minutes; then `fulfillOrder` (which also refuses when supplier ids
are set and asks DBH for an order held under our reference). Admin → Orders → Retry refuses verification-held orders.

## One payment, one bundle (all suppliers)

`_shared/sendGuard.ts`, called by `fulfillment.sendToSupplier` before any purchase: (1) an atomic per-order lock
(`orders.send_lock_until`, 3-minute expiry) so two callers cannot send at once; (2) if any supplier ever accepted a
purchase for the order, a new purchase is refused until that supplier is on record — in the timeline or a logged status
check — as having refunded / rejected / cancelled it. "failed" is not enough (Emma and DBH re-run failed orders).
Refusals are written as `supplier.fulfillment_blocked` with reason `earlier_attempt_open` or `send_in_progress`.
