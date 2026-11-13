-- Order emails to an agent's customers carry the store's name only.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- An agent wrote in: his customers see our name. The order email sent by the payment functions went to store
-- customers from the sender "DataYego", ending "payments secured by DataYego" (807 such emails in 30 days).
-- That email is built inside two dozen server functions; instead of redeploying every payment function, the database
-- now takes over this one email for store orders:
--   * zz_store_order_email_trg on orders: when a paid store order is handed to the supplier (or is held), the order's
--     email is queued in store_order_email_outbox and the usual "email sent" event is written at once. The payment
--     functions check that event before sending their own, so they skip it.
--   * Edge function store-order-email sends what is queued, as "<Store name> <stores@datayego.com>", with
--     "<Store name> · payments secured by Paystack" at the foot and links to the store's own address.
--   * Same rules as before for which email (on its way / we're verifying) and when; only orders of the last 14 days,
--     and only when the order's state has just changed, so an old order is never emailed again.
-- Main-site orders are untouched.

create table if not exists phase1.store_order_email_outbox (
  id bigint generated always as identity primary key,
  order_id uuid not null references phase1.orders(id) on delete cascade,
  kind text not null check (kind in ('confirmed', 'verifying')),
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, kind)
);
create index if not exists store_order_email_outbox_pending on phase1.store_order_email_outbox (id) where status = 'pending';
alter table phase1.store_order_email_outbox enable row level security; -- no policies: only the server reads it
revoke all on phase1.store_order_email_outbox from public, anon, authenticated;
grant select, insert, update on phase1.store_order_email_outbox to service_role;

create or replace function phase1.store_order_email_trigger()
returns trigger language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare handed boolean; held boolean; ev text; v_to text; v_id bigint;
begin
  begin
    if new.agent_id is null or new.payment_status::text <> 'succeeded' or new.created_at < now() - interval '14 days' then return new; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.payment_status is not distinct from new.payment_status
      and old.supplier_purchase_id is not distinct from new.supplier_purchase_id and old.supplier_order_reference is not distinct from new.supplier_order_reference
      and old.admin_resolution_status is not distinct from new.admin_resolution_status then return new; end if;
    -- the same two cases the payment functions use
    handed := (nullif(new.supplier_purchase_id, '') is not null or nullif(new.supplier_order_reference, '') is not null) and new.status::text not in ('failed', 'failed_needs_review', 'cancelled', 'refunded');
    held := not handed and (new.status::text in ('failed', 'failed_needs_review') or coalesce(new.admin_resolution_status, '') in ('wrong_network', 'awaiting_verification'));
    if not handed and not held then return new; end if;
    ev := case when handed then 'notification.email_sent' else 'notification.verifying_email_sent' end;
    if exists (select 1 from phase1.order_events e where e.order_id = new.id and e.event_type = ev) then return new; end if;
    v_to := coalesce(nullif(btrim(new.guest_email), ''), (select p.email from phase1.profiles p where p.id = new.user_id));
    if v_to is null or position('@' in v_to) = 0 then return new; end if;
    insert into phase1.store_order_email_outbox (order_id, kind, email) values (new.id, case when handed then 'confirmed' else 'verifying' end, v_to)
      on conflict (order_id, kind) do nothing returning id into v_id;
    if v_id is null then return new; end if;
    insert into phase1.order_events (order_id, event_type, message, metadata)
      values (new.id, ev, case when handed then 'Order confirmation email queued (store name only)' else 'Payment received / verifying email queued (store name only)' end,
        jsonb_build_object('to', v_to, 'store', (select a.slug from phase1.agents a where a.id = new.agent_id), 'via', 'store-order-email'));
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/store-order-email', body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  exception when others then null; -- an email problem must never get in the way of an order
  end;
  return new;
end $function$;
drop trigger if exists zz_store_order_email_trg on phase1.orders;
create trigger zz_store_order_email_trg after insert or update on phase1.orders for each row when (new.agent_id is not null) execute function phase1.store_order_email_trigger();

create or replace function phase1.store_order_email_claim(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare v jsonb;
begin
  with due as (select x.id from phase1.store_order_email_outbox x where x.status = 'pending' and x.attempts < 3 and (x.claimed_until is null or x.claimed_until < now())
    order by x.id limit greatest(1, least(coalesce(p_limit, 20), 50)) for update skip locked),
  picked as (update phase1.store_order_email_outbox x set attempts = attempts + 1, claimed_until = now() + interval '4 minutes' from due where x.id = due.id returning x.id, x.order_id, x.kind, x.email)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'email', p.email, 'reference', o.order_reference, 'amount', o.amount, 'currency', coalesce(o.currency, 'GHS'), 'phone', o.recipient_phone,
    'bundle', coalesce(dp.name, 'Data bundle'), 'network', coalesce(n.name, ''), 'store', a.store_name, 'slug', a.slug,
    'domain', case when a.custom_domain is not null and a.custom_domain_status = 'active' then a.custom_domain end,
    'email_domain', case when a.email_domain is not null and a.email_domain_status = 'verified' then a.email_domain end) order by p.id), '[]'::jsonb) into v
  from picked p join phase1.orders o on o.id = p.order_id join phase1.agents a on a.id = o.agent_id
    left join phase1.data_products dp on dp.id = o.product_id left join phase1.networks n on n.id = o.network_id;
  return v;
end $function$;

create or replace function phase1.store_order_email_done(p_id bigint, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path to 'phase1', 'public' as $function$
  update phase1.store_order_email_outbox set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
    sent_at = case when p_ok then now() else sent_at end, last_error = case when p_ok then null else left(coalesce(p_error, 'failed'), 300) end, claimed_until = null
  where id = p_id $function$;

-- A made-up order for one store, addressed to an admin's own email, so the owner can see the email.
create or replace function phase1.store_order_email_sample(p_user uuid, p_store text default null)
returns jsonb language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare v_to text; a phase1.agents;
begin
  if coalesce(phase1.admin_role(p_user), '') not in ('admin', 'master') then raise exception 'admin_required'; end if;
  select p.email into v_to from phase1.profiles p where p.id = p_user;
  if v_to is null then raise exception 'no_email'; end if;
  select x.* into a from phase1.agents x where p_store is null or x.slug = p_store order by (x.slug = p_store) desc nulls last, x.created_at limit 1;
  if not found then raise exception 'store_not_found'; end if;
  return jsonb_build_object('id', 0, 'kind', 'confirmed', 'email', v_to, 'reference', 'AG-SAMPLE0001', 'amount', 9, 'currency', 'GHS', 'phone', '0240000000', 'bundle', 'MTN Data — 2GB', 'network', 'MTN',
    'store', a.store_name, 'slug', a.slug, 'domain', case when a.custom_domain is not null and a.custom_domain_status = 'active' then a.custom_domain end,
    'email_domain', case when a.email_domain is not null and a.email_domain_status = 'verified' then a.email_domain end);
end $function$;

revoke all on function phase1.store_order_email_claim(int), phase1.store_order_email_done(bigint, boolean, text), phase1.store_order_email_sample(uuid, text) from public, anon, authenticated;
grant execute on function phase1.store_order_email_claim(int), phase1.store_order_email_done(bigint, boolean, text), phase1.store_order_email_sample(uuid, text) to service_role;

-- a second try for anything that did not go the first time
select cron.unschedule(jobid) from cron.job where jobname = 'store-order-email';
select cron.schedule('store-order-email', '*/2 * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/store-order-email',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=60000) where exists (select 1 from phase1.store_order_email_outbox where status = 'pending' and attempts < 3 and (claimed_until is null or claimed_until < now()))$job$);
