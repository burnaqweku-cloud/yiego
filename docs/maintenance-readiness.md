# Maintenance controls

## Available in the app

- Admin → Operations → Maintenance (`/admin/maintenance`).
- All verified administrators may view it; the existing master/AAL2 settings RPC controls saving.
- Editable title, reason, expected-return text, and blocked-action message. Preview is local and does not activate maintenance.
- Stored under `phase1.site_settings` → `agent_plan.value.maintenance`, preserving plan/pricing/payout fields. This namespace is used because the existing row is already publicly readable and protected from client writes; no new database grants are required for the notice.
- Main site and every store tree show the full-page notice on load/reload while enabled. Dismissal is memory-only, not a persistent bypass. Content changes re-display it. Realtime updates plus a ten-second refresh/focus refresh cover open tabs.
- Customers retain navigation, filters, order tracking, history reads, sign-in/out, and already-paid reconciliation. New purchases, deposits, subscriptions, withdrawals and business mutations return a maintenance error in this app.
- Browser enforcement is not a security boundary. Older app versions or direct calls can bypass it until server deployment below is complete.

## External server deployment required

Source guard `supabase/functions/_shared/maintenance.ts` is wired into:

- `create-guest-data-payment`
- `create-wallet-data-order`
- `create-wallet-deposit`
- `order-payment-action` (lookup/list pending are preserved)
- `agent-subscribe`

The guard uses a server-verified caller ID, requires AAL2 and an active admin row for exemption, and fails closed on settings read failure. It must be deployed to the active external service, not the unused managed backend. Compare deployed entrypoints before replacement to preserve existing live-only functionality; these source files also contain previously prepared provider changes.

Complete direct-RPC coverage before calling this bypass-proof: add server maintenance assertions to every customer business mutation, including wallet payments, payout requests, store/account changes, cancellations, recipient fixes, domain purchases and application submissions. Service-role boundaries must use verified caller identities, not request-body IDs. Do not block supplier delivery/status jobs, payment callbacks, refunds or credit reconciliation of payments already accepted.

No live maintenance activation, schema change or external function deployment was performed for this task. The setting is absent/off on the active database at verification time.

## Verified

Ten concrete policy/server tests; public browser simulation verified full-page notice, dismissal, order tracking, reload, direct prices arrival and HTTP 503 purchase blocking. Desktop and phone screenshots show no horizontal overflow; no runtime errors. Admin save/exemption are simulated browser checks, not authenticated production readback. A real signed-in external administrator session is unavailable in this environment.