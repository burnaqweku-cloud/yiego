# Roadmap

## Supplier credit confirmations
- [x] Compare screenshots: only AG-9BE935AE0E (0542117427) remains in review with explicit completed credit; two other credited matches already customer-refunded. GHS 15.80 has no identifiable order. Findings in docs/supplier-credit-confirmations.md.
- [x] Prepare administrator-only supplier-credit controls, evidence/readback in order lookup/details and review queue, and narrow SQL RPC; never issue a refund or change order/finance status.
- [x] Activate RPC on the active external phase1 database (anon denied, non-admin/AAL1 rejected).
- [ ] Save AG-9BE935AE0E confirmation — waiting on the owner to tick it in Admin (needs their own admin sign-in with two-factor; four admins exist, so it is not saved on their behalf).
- [x] Seven marker-rule tests and ten refund tests pass; preview build OK. Signed-out browser redirects to /auth and shows no private evidence. No live order, refund or financial records changed.
- [ ] Verify saved confirmation/permissions on the active database and authenticated admin readback; blocked by external RPC activation and unavailable external authenticated browser access.

## Refund policy planning
- [x] Prepare a plan for full supplier-failure refunds and fee-excluding Paystack refunds on MTN verification holds, with wallet refunds unchanged.
- [x] Recover authoritative refund source and inspect live phase1 accounting; add shared admin refund preview, exact Paystack fee calculation, supplier credit confirmation and draft checkout/refund notices. Protected refund-policy deployed externally; signed-out/invalid sessions return 401. Ten refund rule tests plus fifteen Finance tests pass; preview build OK.
- [x] Fee-deducted MTN verification refunds live (25 Oct): order lock against double refund/send, actual Paystack fee re-verified, retained fee booked (dry-run on a real order balanced 4.26 → 4.17 refund, 0.09 kept).
- [ ] First real fee-deducted refund by an admin with two-factor — not tested end-to-end yet (needs owner's admin sign-in).

## Pending-fee profit estimate
- [x] Add a small 2%-of-unscheduled-money estimate inside the existing profit card, preserve main profit/refund rules, and correct payout wording; all 15 calculation tests pass and preview build is OK.
- [x] Publish confirmed from the live site's own files (datayego.com): the Finance page chunk carries the "Estimated profit after pending fees" line and its 2%-of-unscheduled maths, and the Paystack page chunk carries "Paystack Refund" / "Refund not yet deducted". A signed-in visual look at the rendered card is still blocked by external-backend auth, so figures were checked from records and Paystack's API rather than a rendered page.

## Deliver-all profit estimate
- [x] Show what profit becomes if every healthy in-progress order delivers, inside the same profit card, with the number of orders it is based on. Verification holds, supplier rejections under review and wrong-network orders are left out and named as not counted; orders with no recorded supplier cost add nothing. 24 calculation tests pass, preview build OK, live records show 1 healthy order (GHS 9.00) of 74 open paid orders (66 verification, 4 review, 3 wrong network). Signed-in visual readback remains blocked by external-backend auth.

## Roxy’s store complaint
- [x] Disabled Roxy’s pre-renewal visitor forwarding only; transaction assertions verified all 37 prices and other settings unchanged. Public browser readback shows the original store name, design and saved bundle prices; renewal is active through 24 November.

## Rebuilt Finance page
- [x] Finance (rebuilt) page + Paystack details page with approved profit rules; 10 rule tests passed. Old pages kept for comparison.
- [x] Live Paystack reading (15:36 UTC) parsed through the page's own code: held GHS 2,466.04, profit GHS 315.36. Signed-in browser render still blocked — the preview mints a session for the managed backend while the app is pinned to the external one.

## New Finance Page
- [x] Add Paystack comparison cards, refresh/error states and currency-safe readings; fifteen calculation tests passed, preview build OK. Keep separate readings out of profit until overlap is proven.
- [x] paystack-holdings on the active external service now accepts a signed-in administrator (live probe: 401 "Authentication required" with no token, 401 "Invalid session" with a bad one) and its answer parses through the page's own schema; signed-in browser readback remains blocked above.
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
