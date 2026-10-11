-- 2026-10-11 — Ported numbers: confirm before payment, instead of failing after it.
-- A customer bought AirtelTigo for 0245986568 (024 is an MTN prefix, the SIM is ported AirtelTigo).
-- The fulfillment preflight blocked it AFTER payment (preflight_number_prefix_is_mtn_not_airteltigo).
-- Applied via execute_sql:
alter table phase1.orders
  add column if not exists prefix_mismatch_confirmed boolean not null default false,
  add column if not exists prefix_mismatch_confirmed_at timestamptz;
-- Written by supabase/functions/_shared/numberPrefix.ts (recordPrefixConfirmation) from
-- create-guest-data-payment and order-payment-action(prepare), only when the number's prefix really
-- points to a different network than the order's. Event: order.prefix_mismatch_confirmed.
