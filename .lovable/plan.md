# Finance wording and pending-fee estimate

## 1. Correct the payout wording
On the **Money at Paystack** page:
- Change “charges” to **“deductions”** beneath “Scheduled to receive.”
- Change “charges” to **“deductions”** in each scheduled payout row.
- Keep every amount unchanged. The payout differences we reviewed were refunds, not additional payout fees.

## 2. Add the smaller profit estimate
Inside the existing **Profit** card, below its current amount and capital note, show:

**Estimated profit after pending fees: GH₵…**

With a small supporting line: **“2% of not-yet-scheduled money.”**

Calculation:
```text
Estimated pending fees = round(Paystack API unscheduled amount × 2%, 2 decimal places)
Estimated profit = round(current Finance profit − estimated pending fees, 2 decimal places)
```

Example: current profit GH₵350.00 and API unscheduled money GH₵65.00 → estimated fees GH₵1.30 → estimated profit **GH₵348.70**.

## What stays unchanged
- The main Finance profit, asset balances, liabilities and capital calculation.
- Existing refund handling: subtract only refunds not yet deducted by Paystack, stopping the separate subtraction once fully deducted.
- Scheduled payout amounts: no further fee deduction from them.
- No individual payment tracking, internal payment-record matching, or changes to financial records.

## Estimate limitation
The estimate assumes the API unscheduled amount includes fees and applies the observed 2% rate. It is not an exact transaction-fee total because per-payment rounding or other payment-method rates may differ. If nothing is unscheduled, the estimate equals the main profit.

## Technical details and checks
- Reuse the existing protected Paystack API reading; refresh the estimate whenever that reading and the main profit update.
- Keep the estimate separate from the main calculation and hide it whenever complete Finance totals cannot be shown.
- Test the 2% calculation, rounding, zero unscheduled balance, unchanged main profit, and no repeated refund deduction.
- Check the small text fits the existing card. Signed-in live verification requires access to the app’s external authenticated account; do not substitute a session from the unused managed backend.

## Current status
The wording and estimate were already added in the preceding step, and all 15 calculation tests passed. This plan confirms their exact scope; it does not add another profit calculation or change the main one. The signed-in live card has not yet been verified, and nothing has been published.