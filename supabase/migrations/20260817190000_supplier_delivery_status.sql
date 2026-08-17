-- Live delivery-speed signal, so the site can tell customers the truth about
-- how long a bundle is taking right now.
--
-- DataMartGH publishes a delivery tracker on its API: a scanner state, a
-- backlog size, and the placed/delivered timestamps of the order it most
-- recently completed. The difference between those two timestamps is the real
-- current lag, and it is the same number their own dashboard shows as
-- "Fast lane · 5h 35m". We snapshot it here rather than calling the supplier
-- from the browser, which would leak the API key and hammer their rate limit.

create table if not exists phase1.supplier_delivery_status (
  supplier_id uuid primary key references phase1.suppliers(id) on delete cascade,
  -- 'live' | 'waiting' | 'unknown' — the supplier's own scanner state.
  scanner_state text not null default 'unknown',
  -- Their prose status line. Shown to admins, never parsed for a number.
  message text,
  -- Measured lag of the last completed order, in minutes.
  last_lag_minutes numeric,
  pending_batches integer,
  stats jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  error_message text,
  updated_at timestamptz not null default now()
);

alter table phase1.supplier_delivery_status enable row level security;
grant select on phase1.supplier_delivery_status to anon, authenticated, service_role;
grant insert, update on phase1.supplier_delivery_status to service_role;

-- The snapshot carries no customer or pricing data, so it is safe to read
-- publicly; the checkout banner is rendered for signed-out visitors too.
drop policy if exists supplier_delivery_status_public_read on phase1.supplier_delivery_status;
create policy supplier_delivery_status_public_read
  on phase1.supplier_delivery_status for select
  using (true);

-- Admin-controlled wording. Whatever is typed here wins over the measured
-- number, which is the manual mode the owner asked for.
alter table phase1.suppliers
  add column if not exists delivery_estimate_manual text,
  add column if not exists delivery_estimate_updated_at timestamptz,
  -- Above this many minutes of measured lag, the site stops saying "minutes"
  -- and shows the honest slow-delivery notice instead.
  add column if not exists delivery_slow_threshold_minutes integer not null default 45;

comment on column phase1.suppliers.delivery_estimate_manual is
  'Admin override shown to customers verbatim, e.g. "usually 1-5 minutes". Overrides the measured signal when set.';

notify pgrst, 'reload schema';
