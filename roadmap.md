# Roadmap

## Rebuilt Finance page
- [x] Finance (rebuilt) page + Paystack details page with approved profit rules; 10 rule tests passed. Old pages kept for comparison.

## New Finance Page
- [x] Add Paystack comparison cards, refresh/error states and currency-safe readings; fifteen calculation tests passed, preview build OK. Keep separate readings out of profit until overlap is proven.
- [ ] Deploy updated paystack-holdings admin/JWT access to the active external service and verify signed-in live readback; external deployment credential is unavailable. Existing internal-only lookup returned GHS 606.20 pending transfers and GHS 1,485.18 scheduled net at 10:56 UTC; it refuses browser access until redeployed.
- [ ] Confirm the pending Oct 24 payout books bank +1,485.18 and Paystack -1,485.18 with profit unchanged once Paystack marks it paid; the 38.27 in that record is Paystack "deductions" (refunds already booked), not a new fee.
- [ ] Use Paystack's verified all-held-money figure as the primary asset and retain our ledger for comparison; blocked because documented /balance returns integration available balance, not a verified total of unsettled collections plus scheduled subaccount payouts. Needs Paystack confirmation of a supported all-held-money source before changing profit.
- [x] Remove the unused manual Paystack deduction section and retain recorded pending payouts; eleven finance tests passed. Payout/withdrawal explanations are source-based, not a live accounting audit.
- [x] Match the old Finance balance cards and make the current profit arithmetic visible; signed-in live balance verification remains blocked below.
- [x] Add separate current-assets-minus-liabilities-and-capital profit page with existing finance left intact; include every liability and opening/net partner funding account, with supplier timestamps and provisional Paystack adjustments.
- [x] Verify nine calculation rules and recorded bank-spend path; keep historical expenses without re-deducting them and compare since-start totals.
- [ ] Verify signed-in live page and real expense readback; external authenticated/MFA browser session is unavailable. Public access protection passed; no live money was changed.

## First-purchase promotions
- [x] Promotion link opens the main shop with promo prices shown as normal prices (no banner); old /promo links redirect. Guests and accounts allowed; one use per device, number and account, server-checked; ineligible shoppers get normal prices. Rollback DB tests pass; guest flow verified up to the payment button.
- [ ] Confirm one real guest promo payment is charged GH₵4.11 (needs a real payment; the live guest checkout function was not redeployed).
- [x] Split Promotions into its own admin dropdown with separate overview, pricing, settings, traffic, daily results, bundle results and ad-link pages; seven promotion tests passed. Signed-in visual verification remains blocked by unavailable external authenticated browser access.
- [x] Add visit → signup → purchase reporting, source/campaign links, date filters, daily/source/bundle breakdowns and CSV export; real TikTok visit/signup click ingestion verified, actual account/payment/refund attribution passed external rollback tests.
- [x] Add /promo and Admin → Promotions with per-bundle prices, activation, editable message, copied link and paid/pending/sales/discount totals. MTN 1GB initialized at GHS 3.95.
- [x] Apply account-only first-purchase reservations, permanent paid/refunded history, immutable price snapshots and late-repeat-payment reconciliation to the external database; reuse deployed prepared-order payments without new functions.
- [x] Pass seven unit tests and rolled-back external database tests; public offer, signup return link and mobile layout verified; latest build OK.
- [ ] Verify signed-in admin reporting/saving and customer checkout end to end, including parallel requests; external authenticated browser access is unavailable. Frontend remains unpublished; do not launch the ad until that final check and publishing.

## Unpaid orders
- [x] Add admin unpaid-only cancellation by order ID or recipient search; apply row-locked cancellation and late-payment safeguards to the external database.
- [x] Build storefront unpaid-order details, continue-payment and cancel controls, and clear duplicate-order handling.
- [x] Pass unit and external rollback tests for ownership, paid-order protection, cancellation release and late payments; public tracking opens without runtime errors.
- [ ] Deploy unpaid-order-action and updated create-guest-data-payment, track-order and order-payment-action to the external project; external function deployment credential is unavailable.
- [ ] Verify an authenticated admin cancellation and real storefront customer flow after deployment; external authenticated browser session is unavailable. Frontend remains unpublished.

## Sub-agent controls
- [x] Add confirmed deactivate/reactivate actions for parent-owned sub-agents; frontend awaits publishing.
- [x] Apply ownership checks and preserve administrator suspensions; rollback tests validate status changes, record preservation and store blocking.
- [ ] Verify the buttons in a signed-in parent session; authenticated browser checks are unavailable for the external backend.

## SMS (Vynfy)
- [x] Add purchase/delivery order IDs and agent store links to all four variants; test and deploy.
- [x] Wire only four order SMS notifications: paid purchase, delivered, MTN verified/delivered, MTN verified/on its way.
- [x] Use real bundle, purchase date/time and recipient records; secure the queue and prevent duplicates.
- [x] Deploy and validate wiring without sending customer SMS while sender approval is pending.
- [x] Switch sender to approved Datayego and send one sample to +233557375894 (provider accepted).
- [ ] Deploy updated sender/test allowlist to the external functions; external deployment credential is unavailable.
- [ ] Enable customer sending only after the owner confirms test receipt and explicitly requests activation.
