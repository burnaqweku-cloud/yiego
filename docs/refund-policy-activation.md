# Refund policy activation checklist

The refund-policy endpoint is a protected quote/full-refund wrapper. Fee retention is deliberately disabled; it must not be enabled merely by changing the flag.

## Preserved behavior
- Full supplier-rejection refunds after administrator records recovered supplier funds.
- Wallet order amounts returned without payment-fee deduction.
- Existing refund-order remains the authoritative full-refund engine and automatic out-of-stock path.
- Main Finance formula and pending-fee estimate remain untouched.

## Required before fee-retention activation
- Obtain applicable policy clearance and publish the approved terms/disclosure, including prepayment acknowledgement; older orders need informed customer agreement, not the old number warning alone.
- Integrate an atomic external phase1 refund-operation claim with the existing supplier-send row lock; pending/uncertain operations must block sends and repeat refunds without expiring automatically.
- Read payment amount and actual fee from Paystack, currency GHS, matched to the successful payment intent within GHS 0.02.
- Submit the quoted reduced amount in integer pesewas, not a default full refund.
- Treat creation/queued as pending; finalize only on independently verified processed refund with matching amount, currency and transaction.
- Resolve the complete cancelled-order obligation and its fees_pending only on confirmation, while posting actual cash out rather than the legacy full-charge amount. Retained fees are recovery, not delivered order-sales income.
- Reconcile pending provider refunds with Finance's API reserve: do not simultaneously retain the full customer liability and separately reserve the same refund without an offset. Verify before activating; existing formula must not change silently.
- Preserve fully_deducted refund handling; do not deduct the same refund again from scheduled payouts.
- Test failed/ambiguous outcomes, concurrent sends/refunds, duplicate submissions, provider completion and full liability release with rolled-back external fixtures.
- Verify admin order search → quote → confirmation → refund status → Finance readback using a safe test transaction and an authenticated external AAL2 admin session. Do not refund a real customer to test.

## Current blockers
No authenticated external AAL2 administrator test session is available in the sandbox. Fee-retaining money movement and revised completion/accounting are not activated or deployed. Customer notices describe the proposed exception as subject to explicit agreement; full refunds remain available.