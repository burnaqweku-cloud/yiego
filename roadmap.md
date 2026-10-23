# Roadmap

## First-purchase promotions
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
