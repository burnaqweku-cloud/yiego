# Rebuilt Finance Page — brainstorm and plan

Your plan is solid. It follows one simple rule: **profit = what we have − what we owe − partner capital.** Below are the cards, the buttons, the gaps I found, and how to close each one.

## The page

```text
[ Record top-up ]  [ Take money out v ]  [ Partner put in ]

Money at bank | Money at Paystack (tap for details) | At suppliers | Money we owe | Profit
```

1. **Money at bank** — cash in the account. It starts from today's real bank figure. After that it changes only through:
   - Paystack payouts arriving: plus the amount actually received, read from Paystack.
   - Top-ups: minus the amount **plus** charges (1,000 + 10 = 1,010 out).
   - Taking money out: minus the amount.
   - Agent withdrawals marked paid: minus what we actually sent (21 requested, 20 sent).
   - Partner putting money in: plus the amount.
2. **Money at Paystack** — read live from Paystack only, with no record of our own.
   - Scheduled payouts after charges, plus money received that isn't scheduled yet, minus refunds Paystack hasn't taken back yet (see gap 1).
   - **Tapping it opens a details page.** It shows each scheduled payout (before charges, charges, after charges, date), the money not yet scheduled, refunds still waiting to be taken back, and when Paystack was last read.
   - If Paystack can't be reached, the page shows no totals rather than a guess.
3. **At suppliers** — each supplier's reported balance (DBH, DataMart, etc.), plus a total. A top-up adds the 1,000 here straight away, until the supplier's next reading comes in.
4. **Money we owe** — customer wallets, paid but not delivered, refunds due, and agent earnings.
5. **Profit** — bank + Paystack (after charges) + suppliers − money we owe − partner capital (GHS 2,400 today).

## Buttons
- **Record top-up**: choose a supplier, enter the amount and the charge. The bank drops by both, and the supplier goes up by the amount. Profit drops only by the charge, which is correct.
- **Take money out**, with two kinds:
  - **Business cost** (subscriptions, SMS and so on): the bank drops and profit drops.
  - **Return capital to partners**: the bank drops and partner capital drops too, so profit stays the same.
- **Partner put in**: the bank goes up and partner capital goes up, so profit stays the same.

## Refunds — you're right, with one fix
A refund clears what we owe. We record nothing against Paystack, because Paystack takes it from a future payout itself.

## Gaps found, and fixes
1. **Refund timing (the important one).** We stop owing the money the moment we refund, but Paystack's figure only drops after it takes the money back from a payout. Without a fix, profit would look too high in between. **Fix:** subtract the refunds Paystack itself lists as "not yet taken back". Today that's one refund of GHS 18.72.
2. **Charges on unscheduled money.** Paystack doesn't tell us the payout charge until it schedules the money, so profit is slightly high for that short time. It corrects itself when the payout is scheduled. I'll show a small note.
3. **Supplier readings lag behind.** The top-up adds the amount to the supplier straight away until the next reading arrives, and the page warns when a reading is old.
4. **Weekend payouts.** These are fine: the money stays in "scheduled" until it lands, then moves to the bank at the after-charges amount. Profit doesn't move.
5. **Bank starting figure.** The page starts from one figure we agree on today. Old top-ups, SMS costs and other history stay saved but aren't counted again.
6. **Paystack refusing to answer.** The page shows no totals rather than wrong ones.

## Old pages
The current Finance and New Finance pages stay untouched and reachable for comparison. The new page gets its own menu item. We decide later which one to retire.

## Technical details
- Paystack figure = pending_transfers (GHS) + net of pending/processing settlements − sum(amount − deducted_amount) of refunds where fully_deducted is false. All read from Paystack's API in the existing protected read-only function, extended to return the full refund list.
- New page plus a details page for the Paystack card. These reuse the existing bank, top-up, partner capital, master spend, agent payout and liability records, so history is kept and no cash is deducted twice.
- Add a "return capital" kind to taking money out, so it reduces partner funding instead of booking a cost.
- The starting point is a dated snapshot. Earlier entries stay readable but are left out of the new page.
- Tests: top-up 1,000 + 10 lowers profit by exactly 10; a business cost of 100 lowers profit by 100; returning capital leaves profit unchanged; a refund not yet taken back leaves profit unchanged.
- The function must be deployed to the live backend on your side. This sandbox can't deploy there.
