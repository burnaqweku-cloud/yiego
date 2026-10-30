# DataSika completion checklist

External active project only; do not deploy to the unused managed backend.

## Deployment prerequisites
- Obtain external project management deployment access; the sandbox currently has external database access but no external function deployment token.
- Fetch and compare deployed entrypoints before replacing them: live payment/admin functions may have changes not mirrored in source. Preserve those changes.
- Confirm DATASIKA_API_KEY remains configured on the external functions service.

## Affected entrypoints
Deploy every entrypoint whose dependency graph reaches `_shared/fulfillment.ts`, `_shared/supplierAdapters.ts`, or `_shared/paymentSettlement.ts`: create-wallet-data-order, reconcile-guest-order, order-payment-action, datamartgh-webhook, paystack-webhook, admin-mtn-verification, admin-order-action, sync-dbh-order-status, sync-instantdata-order-status, sync-emmadataking-order-status, sync-datasika-order-status. Include any deployed-only payment entrypoints using fulfillment. Do not replace live functions blindly from stale source.

## Activation and verification
- After deployment, apply `docs/sql/datasika-enable-mappings.sql` on external phase1.
- Snapshot and assert networks' preferred/fallback supplier IDs and products' forced/fallback supplier IDs are unchanged.
- Check external cron authentication, balance and catalog; check the existing delivered test API-06C34266FE without purchasing again.
- Verify signed-in admin DataSika choices and recheck. A fresh through-app paid order needs owner approval and wallet funding; prior direct API test is not end-to-end app verification.
- Owner chooses DataSika under Admin → Suppliers → MTN → Delivered by, Fallback, or an individual bundle's Always via. No route is changed as part of installation.