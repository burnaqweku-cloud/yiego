-- Applied live 20 Oct 2026. Admin → MTN verification: manual check and manual, once-only sends.
-- Replaces the hourly verify-mtn-numbers job (unscheduled 20 Oct) after automatic re-sends bought 123 orders twice.
begin;

-- One row per check run ("Check all with DBH"), with the full report.
create table if not exists phase1.mtn_verification_checks (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  run_by uuid,
  numbers integer not null default 0, batches integer not null default 0,
  approved integer not null default 0, not_yet integer not null default 0, blocked integer not null default 0, unknown integer not null default 0,
  report jsonb not null default '[]'::jsonb
);
grant all on phase1.mtn_verification_checks to service_role;
revoke all on phase1.mtn_verification_checks from anon, authenticated;
alter table phase1.mtn_verification_checks enable row level security;

-- The send lock: one row per order, written BEFORE anything goes to the supplier. A second press, a second admin
-- or a refresh hits the unique key and does nothing.
create table if not exists phase1.mtn_verification_sends (
  order_id uuid primary key references phase1.orders(id) on delete cascade,
  sent_by uuid, sent_at timestamptz not null default now(),
  outcome text not null default 'sending' check (outcome in ('sending','sent','adopted','refused','failed')),
  detail text, supplier_purchase_id text, supplier_order_reference text
);
grant all on phase1.mtn_verification_sends to service_role;
revoke all on phase1.mtn_verification_sends from anon, authenticated;
alter table phase1.mtn_verification_sends enable row level security;

-- Queue: every order on verification hold, with the latest DBH answer for its number.
create or replace function phase1.admin_mtn_queue() returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_reference', o.order_reference, 'phone', o.recipient_phone, 'bundle', regexp_replace(coalesce(p.name,''), '^.*?—\s*', ''),
      'amount', o.amount, 'store_name', a.store_name, 'paid_at', coalesce(o.paid_at, o.created_at), 'held_since', o.admin_resolution_updated_at,
      'days_waiting', extract(day from now() - coalesce(o.admin_resolution_updated_at, o.created_at))::int,
      'check_status', b.status, 'check_message', b.message, 'checked_at', b.checked_at,
      'supplier_purchase_id', o.supplier_purchase_id,
      'send', (select jsonb_build_object('outcome', s.outcome, 'sent_at', s.sent_at, 'detail', s.detail) from phase1.mtn_verification_sends s where s.order_id = o.id)
    ) order by coalesce(o.admin_resolution_updated_at, o.created_at))
    from phase1.orders o
    left join phase1.data_products p on p.id = o.product_id
    left join phase1.agents a on a.id = o.agent_id
    left join phase1.beneficiary_checks b on b.msisdn = (case when regexp_replace(o.recipient_phone,'\D','','g') like '233%' then '0'||substr(regexp_replace(o.recipient_phone,'\D','','g'),4) else regexp_replace(o.recipient_phone,'\D','','g') end)
    where o.admin_resolution_status = 'awaiting_verification' and o.status::text = 'processing' and o.payment_status::text = 'succeeded'
  ), '[]'::jsonb) else null end;
$$;

-- Sent from this page: outcome and what DBH says now.
create or replace function phase1.admin_mtn_sent(p_limit integer default 100) returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'order_reference', o.order_reference, 'phone', o.recipient_phone, 'bundle', regexp_replace(coalesce(p.name,''), '^.*?—\s*', ''),
      'amount', o.amount, 'store_name', a.store_name, 'sent_at', s.sent_at, 'sent_by', (select email from phase1.profiles where id = s.sent_by),
      'outcome', s.outcome, 'detail', s.detail, 'order_status', o.status::text, 'supplier_status', o.supplier_status,
      'supplier_purchase_id', o.supplier_purchase_id, 'delivered_at', (select max(e.created_at) from phase1.order_events e where e.order_id = o.id and e.to_status = 'delivered')
    ) order by s.sent_at desc)
    from (select * from phase1.mtn_verification_sends order by sent_at desc limit greatest(1, least(coalesce(p_limit,100), 500))) s
    join phase1.orders o on o.id = s.order_id
    left join phase1.data_products p on p.id = o.product_id
    left join phase1.agents a on a.id = o.agent_id
  ), '[]'::jsonb) else null end;
$$;

-- Numbers submitted for approval without an order.
create or replace function phase1.admin_mtn_submitted() returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('msisdn', n.msisdn, 'source', n.source, 'status', n.status, 'message', n.dbh_message, 'submitted_at', n.submitted_at,
      'submit_count', n.submit_count, 'last_checked_at', n.last_checked_at, 'approved_at', n.approved_at) order by n.submitted_at desc)
    from phase1.submitted_numbers n), '[]'::jsonb) else null end;
$$;

-- Check runs, newest first.
create or replace function phase1.admin_mtn_checks(p_limit integer default 30) returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'run_at', c.run_at, 'run_by', (select email from phase1.profiles where id = c.run_by), 'numbers', c.numbers, 'batches', c.batches,
      'approved', c.approved, 'not_yet', c.not_yet, 'blocked', c.blocked, 'unknown', c.unknown, 'report', c.report) order by c.run_at desc)
    from (select * from phase1.mtn_verification_checks order by run_at desc limit greatest(1, least(coalesce(p_limit,30), 200))) c), '[]'::jsonb) else null end;
$$;

-- Everything that happened to verification orders, newest first (checks, approvals, sends, DBH answers).
create or replace function phase1.admin_mtn_history(p_limit integer default 200) returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('at', e.created_at, 'order_reference', o.order_reference, 'phone', o.recipient_phone, 'event', e.event_type, 'message', e.message) order by e.created_at desc)
    from (select * from phase1.order_events where event_type in ('supplier.awaiting_mtn_approval','supplier.number_approved','supplier.verification_cleared','admin.mtn_send','admin.mtn_send_refused','supplier.already_held','supplier.fulfillment_response','supplier.fulfillment_failed','supplier.status_update')
          and order_id in (select order_id from phase1.mtn_verification_sends union select id from phase1.orders where admin_resolution_status = 'awaiting_verification')
          order by created_at desc limit greatest(1, least(coalesce(p_limit,200), 1000))) e
    join phase1.orders o on o.id = e.order_id), '[]'::jsonb) else null end;
$$;

revoke all on function phase1.admin_mtn_queue(), phase1.admin_mtn_sent(integer), phase1.admin_mtn_submitted(), phase1.admin_mtn_checks(integer), phase1.admin_mtn_history(integer) from public, anon;
grant execute on function phase1.admin_mtn_queue(), phase1.admin_mtn_sent(integer), phase1.admin_mtn_submitted(), phase1.admin_mtn_checks(integer), phase1.admin_mtn_history(integer) to authenticated, service_role;

commit;
