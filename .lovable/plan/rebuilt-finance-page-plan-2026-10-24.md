# Rebuilt Finance Page — plan

## Agreed rules

1. **Paystack refunds.** Paystack's own refund list tells us which refunds it hasn't taken back yet, and we subtract those from the Paystack figure. We keep no record of our own for this.
2. **Wallet refunds.** A wallet refund puts the money back in the customer's wallet, so what we owe goes up. The bank doesn't move.
   - The bank only drops when we actually send wallet money out, for example to MoMo. What we owe drops by the same amount.
   - If the supplier never charged us for the failed bundle, the supplier balance goes back up as well.
3. **Agent payouts.** On a 21 withdrawal, what we owe drops by 21 and the bank drops by 20. The 1 cedi fee stays in the bank.
4. **Scheduled payouts.** Example: 1,500 scheduled, 50 in charges, 1,450 to receive. The details page shows all three, and profit counts the 1,450.
5. **Money not yet scheduled.** Taken exactly as Paystack reports it.

## The page

```text
[ Record top-up ]  [ Take money out v ]  [ Partner put in ]

Money at bank | Money at Paystack (tap for details) | At suppliers | Money we owe | Profit
```

- **Money at bank**: starts from today's real bank figure.
  - Plus: Paystack payouts that arrive (the after-charges amount, read from Paystack).
  - Plus: money partners put in.
  - Minus: top-ups, amount plus charges (1,000 + 10 = 1,010).
  - Minus: agent payouts, what we actually sent.
  - Minus: money taken out.
- **Money at Paystack** (from Paystack only): scheduled payouts after charges, plus money not yet scheduled, minus Paystack refunds not yet taken back.
- **Paystack details page**:
  - Each scheduled payout: before charges, charges, after charges, date.
  - Money not yet scheduled.
  - Paystack refunds, with each one's status and whether it has been taken back yet (wallet refunds are not listed here).
  - When Paystack was last read.
- **At suppliers**: each supplier's reported balance, plus a total.
- **Money we owe**: customer and agent wallets, paid but not delivered, refunds due, and agent earnings.
- **Profit** = bank + scheduled payouts (after charges) + money not yet scheduled − Paystack refunds not yet taken back + suppliers − money we owe − capital (2,400).

## Buttons
- **Record top-up**: the bank drops by the amount plus charges, and the supplier goes up by the amount.
- **Take money out**, with two kinds:
  - **Business cost**: the bank drops and profit drops.
  - **Return capital**: the bank drops and capital drops, so profit stays the same.
- **Partner put in**: the bank goes up and capital goes up.

## Safety
- If Paystack can't be reached, the page shows no totals rather than a guess.
- Before building, I'll re-read Paystack's docs on Settlements, Transaction Totals and Refunds, and check each figure against a live reading.
- Old finance pages stay untouched for comparison. Past history is kept but not counted again; the page starts from today's figures.

## Technical details
- Paystack figure = pending_transfers (GHS) + net of pending/processing settlements − Σ(amount − deducted_amount) for refunds where fully_deducted is false.
- Wallet refunds stay as wallet liabilities, with no bank movement.
- These reuse the existing top-up, partner capital, master spend, agent payout and liability records, with a dated starting snapshot. The function must be deployed to the live backend on your side.
- Tests: a top-up of 1,000 + 10 lowers profit by 10; a business cost of 100 lowers profit by 100; returning capital and putting capital in leave profit unchanged; a 21 agent payout gives owed −21 and bank −20; a Paystack refund not yet taken back leaves profit unchanged.
