# Rebuilt Finance Page — plan

## Where we agree, and two points to confirm

1. **Paystack refunds.** Agreed. Paystack's own refund list tells us which refunds it hasn't taken back yet, and we subtract those from the Paystack figure. Once Paystack takes a refund out of a payout, it shows up in Paystack's numbers directly. We keep no record of our own for this.
2. **Wallet refunds.** I think this one needs correcting. A wallet refund doesn't send any money out of the bank. It puts credit in the customer's wallet on our app, so it adds to **Money we owe** instead.
   - The bank only drops later, when that credit is used. If they buy data with it, the supplier balance drops. If they withdraw it, the bank drops then.
   - Taking it from the bank now would count it twice: once from the bank, and again when the credit is used.
   - Please confirm.
3. **Agent payouts.** Agreed. On a 21 withdrawal, what we owe drops by 21 and the bank drops by 20. The 1 cedi fee stays in the bank.
4. **Scheduled payouts.** Agreed. The details page shows the amount before charges, the charges, and the amount after charges.
5. **Profit counts the scheduled payout after charges.** Your example said 1,005, 50 and 1,050. I'm reading it as Paystack scheduling 1,050, charging 50, and profit counting 1,000. Please confirm.
6. **Money not yet scheduled.** Taken exactly as Paystack reports it, with no charges taken off. That matches what you said.

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

## Reconciliation checker (new request)
- A "Check my figures" panel on the new page. Finance admins type in what they see: the bank statement balance, the Paystack dashboard, each supplier's site, and any debts.
- An AI compares those figures with the page's live numbers. It lists every gap with its size and the likely cause, for example a refund Paystack hasn't taken back yet, a supplier reading that's out of date, a top-up not recorded, or a payout still on its way.
- It's advice only. It never changes balances or profit, and it says when a gap can't be explained.
- Only finance admins can use it. Each check is saved with who ran it and when.

## Technical details
- Reconciliation: a protected backend function receives the typed figures plus the page snapshot. It works out the gaps itself first, then asks the AI (default model, structured answer) to explain them. The results are stored in an admin-only table in the live database. The AI key stays on the server, and running out of AI credits or being refused shows a clear message.
- Paystack figure = pending_transfers (GHS) + net of pending/processing settlements − Σ(amount − deducted_amount) for refunds where fully_deducted is false.
- Wallet refunds stay as wallet liabilities, with no bank movement.
- These reuse the existing top-up, partner capital, master spend, agent payout and liability records, with a dated starting snapshot. The function must be deployed to the live backend on your side.
- Tests: a top-up of 1,000 + 10 lowers profit by 10; a business cost of 100 lowers profit by 100; returning capital and putting capital in leave profit unchanged; a 21 agent payout gives owed −21 and bank −20; a Paystack refund not yet taken back leaves profit unchanged.
