# First-purchase promotions

- Public link: `https://datayego.com/promo`. Admin: `/admin/promotions`.
- Initial offer: MTN 1GB, base GHS 3.95. Paystack adds the ordinary 4% fee (GHS 0.16), total GHS 4.11, at checkout only. Other bundles are disabled until selected by the administrator.
- Admin can edit title/message, activate/pause and set separate bundle prices. Existing reserved orders retain their agreed price when settings change.
- Accounts are required. Any previous paid/refunded order associated with the account, payer account, or matching guest checkout email/phone disqualifies it. A refund does not restore first-time status. Unpaid cancellation releases a reservation.
- This is account-based enforcement, not a guarantee that one person cannot create multiple identities. No device tracking or identity verification was added.
- Authenticated `promotion_prepare_order` atomically prepares and snapshots the order; ordinary prepared-order wallet/Paystack payment and fulfillment remain authoritative. Per-account advisory locks and the reservation index serialize reservations. Existing recipient order reuse is refused, never repriced.
- Late repeat promotional payments are recorded closed for manual reconciliation rather than automatically dispatched.
- External phase1 SQL applied from `docs/sql/first-purchase-promotions.sql`, with later replacement of `promotion_prepare_order` and `guard_promotion_order_snapshot` matching their final definitions. No actual customer order was edited during tests.
- Verified: seven unit tests, external database rollback tests, public price and account-creation return link, desktop/mobile rendering, no browser runtime errors, successful preview build.
- Not verified: authenticated administrator save, real customer payment through the UI, parallel request stress test. External hosted auth cannot be injected into this preview. Publishing was not requested, so the production frontend has not been published.

Tests: `bunx vitest run src/lib/promotions.test.ts src/lib/unpaidOrders.test.ts` and `node scripts/test-promotions-db.cjs`. Use `--with-schema` only before applying the schema.

## Promotion reporting
- Admin section includes visitor/signup/account/buyer funnel, conversion percentages, prepared/paid/delivered/pending/cancelled/refunded orders, net bundle sales and discounts, daily/source/campaign/bundle breakdowns, Ghana date filtering, CSV export and tagged TikTok/Facebook/Instagram/WhatsApp/YouTube link generator.
- Applied `docs/sql/promotion-analytics.sql` externally. Private capability-bound browser visits use first-touch acquisition attribution. Actual new auth rows establish account counts; existing sign-ins and duplicate signup responses cannot create new-account conversions. Redemptions are uniquely keyed by order; purchases and refunds are derived from order records, never browser claims.
- Date reports are visitor cohorts: first visits in the selected Ghana dates and conversions before the end date. Sessions and order statuses reflect the latest state; session totals are not historical snapshots. Visitor estimates cannot identify the same person across devices or guarantee ad-platform parity. Tracking does not reconstruct previous visits. No ad spend/ROAS is claimed without spend data.
- Verified live visitor + signup click both returned 200 and persisted as one TikTok visitor, one signup start, zero actual accounts. Test tracking row removed afterwards. Signup, checkout, paid buyer and refund accounting passed rolled-back external fixtures; 7 pricing/reporting unit tests passed. Authenticated administrator UI remains unverified because external browser authentication is unavailable.
- Tests: `bunx vitest run src/lib/promotionAnalytics.test.ts src/lib/promotions.test.ts` and `node scripts/test-promotion-analytics-db.cjs`.