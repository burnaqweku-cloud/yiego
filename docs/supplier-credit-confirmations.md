# Supplier credit confirmations

Private evidence is stored in existing admin-only audit logs, not customer-readable order events. A marker applies only to the exact supplier and attempt. It neither changes order/payment status nor issues a refund or touches finance. The existing refund workflow still performs its independent checks.

## Support screenshot comparison — 25 October 2026

| Number | Exact order | Result |
|---|---|---|
| 0542117427 | AG-9BE935AE0E, supplier ID 808195, cost GHS 3.95 | Still needs review. Support says “Refunding 3.95”, followed by “7.9 credited” covering this and 0248944951. Ready to mark once private service is activated. |
| 0248944951 | YG-A9ED2FAF60, supplier ID 796375 | Same GHS 7.90 confirmation, but already customer-refunded. Do not issue another refund. |
| 0248066542 | AG-B9979BD6E9, supplier ID 791776 | Support explicitly says “3.95 credited”; already customer-refunded. Older delivered order on same number must not be marked. |
| 0535819256 | YG-E8548A8EB0, supplier ID 783606 | Support says no deduction/payment not made, not a completed credit. Leave unmarked pending clarification. |
| 0559167397 | YG-302433AD1F, supplier ID 757183 | Pending; “check your portal well” is not credit confirmation. Leave unmarked. |
| 0559445149, 0592594476, 0204033601 | Multiple/current delivered matches | Listed for checking, but no explicit credit confirmation. Leave unmarked. |
| Unidentified | GHS 15.80 | Credited, but screenshots omit the associated numbers/order IDs. Do not assign to guessed orders. |

Other current needs-review orders 0596369550 and 0203342391 are not identified by these screenshots; three wrong-network holds also have no supplier credit evidence here.

## Activation blocker

The prepared SQL is `docs/sql/supplier-credit-confirmation.sql`. Available migration/data tools target an unused managed database, not the active external database; do not apply it there. No confirmation has been saved yet. Once applied to the correct database, record the GHS 7.90 support evidence against AG-9BE935AE0E using the admin control. Authenticated external browser testing remains unavailable.