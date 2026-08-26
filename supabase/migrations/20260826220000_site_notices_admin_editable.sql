-- Admin-editable customer notices (the shop's "Important notice" first).
-- Public may read published rows; active admins manage them; the
-- admin-site-content-action edge function writes with the service role.

create table if not exists phase1.site_notices (
  slug text primary key,
  title text not null default 'Important notice',
  points jsonb not null default '[]'::jsonb,
  mtn_note text,
  is_published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table phase1.site_notices enable row level security;

create policy "site_notices_public_read" on phase1.site_notices
  for select using (is_published);

create policy "site_notices_admin_all" on phase1.site_notices
  using ((select private.is_phase1_admin()))
  with check ((select private.is_phase1_admin()));

grant select on phase1.site_notices to anon, authenticated;
grant select, insert, update, delete on phase1.site_notices to authenticated;
grant all privileges on phase1.site_notices to service_role;

insert into phase1.site_notices (slug, title, points, mtn_note)
values (
  'shop_important_notice',
  'Important notice',
  '["Delivery times may vary.","The receiving phone must not owe airtime.","No refunds for orders sent to a wrong number — double-check before paying."]'::jsonb,
  'MTN: a number ordering MTN data through us for the first time may show “Awaiting Verification” for a quick one-time check before it delivers. Future orders to that same number go through normally.'
)
on conflict (slug) do nothing;
