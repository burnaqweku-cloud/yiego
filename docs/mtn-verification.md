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
