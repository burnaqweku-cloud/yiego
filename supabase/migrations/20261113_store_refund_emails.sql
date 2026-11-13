-- The refund email to an agent's customers carries the store's name only.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- Follows 20261113_store_order_emails.sql. The refund email (sent by refund-order) still reached store customers as
-- "DataYego", with our name in its header. Same cure, and again no money function is redeployed:
--   * zz_store_refund_email_trg on order_events: when a refund is recorded for a store order ('refund.completed'),
--     the refund email is queued in store_order_email_outbox (kind 'refunded', with what went back, why and how) and
--     'notification.refund_email_sent' is written at once. refund-order checks that event before sending its own
--     email, so it skips it.
--   * store-order-email sends it as "<Store name> <stores@datayego.com>", same words as before, the store's name in
--     the header and "<Store name> · payments secured by Paystack" at the foot.
-- Refunds of main-site orders are untouched.

alter table phase1.store_order_email_outbox add column if not exists details jsonb;
alter table phase1.store_order_email_outbox drop constraint if exists store_order_email_outbox_kind_check;
alter table phase1.store_order_email_outbox add constraint store_order_email_outbox_kind_check check (kind in ('confirmed', 'verifying', 'refunded'));

-- The reason typed for a refund, read back out of the refund's own record ("Refunded via paystack (ref 1) — reason").
create or replace function phase1.refund_reason_of(p_message text)
returns text language sql immutable as $function$
  select case when r = coalesce(p_message, '') then null else nullif(btrim(r), '') end
  from (select regexp_replace(coalesce(p_message, ''), '^Refunded via [a-z_]+( \(ref [^)]*\))?( — GHS [0-9.]+ after Paystack fee GHS [0-9.]+)? — ', '') as r) x
$function$;

create or replace function phase1.store_refund_email_trigger()
returns trigger language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare o phase1.orders; v_to text; v_id bigint;
begin
  begin
    select * into o from phase1.orders where id = new.order_id;
    if not found or o.agent_id is null then return new; end if;
    if exists (select 1 from phase1.order_events e where e.order_id = new.order_id and e.event_type = 'notification.refund_email_sent') then return new; end if;
    v_to := coalesce(nullif(btrim(o.guest_email), ''), (select p.email from phase1.profiles p where p.id = o.user_id), (select u.email::text from auth.users u where u.id = o.user_id));
    if v_to is null or position('@' in v_to) = 0 then return new; end if;
    insert into phase1.store_order_email_outbox (order_id, kind, email, details)
      values (new.order_id, 'refunded', v_to, jsonb_build_object('amount', coalesce(nullif(new.metadata->>'refundAmount', '')::numeric, o.amount),
        'reason', left(phase1.refund_reason_of(new.message), 300), 'method', new.metadata->>'method'))
      on conflict (order_id, kind) do nothing returning id into v_id;
    if v_id is null then return new; end if;
    insert into phase1.order_events (order_id, event_type, message, metadata)
      values (new.order_id, 'notification.refund_email_sent', 'Refund email queued (store name only)', jsonb_build_object('to', v_to, 'via', 'store-order-email'));
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/store-order-email', body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  exception when others then null; -- an email must never stand in the way of a refund
  end;
  return new;
end $function$;
drop trigger if exists zz_store_refund_email_trg on phase1.order_events;
create trigger zz_store_refund_email_trg after insert on phase1.order_events for each row when (new.event_type = 'refund.completed') execute function phase1.store_refund_email_trigger();

create or replace function phase1.store_order_email_claim(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare v jsonb;
begin
  with due as (select x.id from phase1.store_order_email_outbox x where x.status = 'pending' and x.attempts < 3 and (x.claimed_until is null or x.claimed_until < now())
    order by x.id limit greatest(1, least(coalesce(p_limit, 20), 50)) for update skip locked),
  picked as (update phase1.store_order_email_outbox x set attempts = attempts + 1, claimed_until = now() + interval '4 minutes' from due where x.id = due.id returning x.id, x.order_id, x.kind, x.email, x.details)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'email', p.email, 'reference', o.order_reference, 'amount', o.amount, 'currency', coalesce(o.currency, 'GHS'), 'phone', o.recipient_phone,
    'bundle', coalesce(dp.name, 'Data bundle'), 'network', coalesce(n.name, ''), 'store', a.store_name, 'slug', a.slug,
    'domain', case when a.custom_domain is not null and a.custom_domain_status = 'active' then a.custom_domain end,
    'email_domain', case when a.email_domain is not null and a.email_domain_status = 'verified' then a.email_domain end,
    'details', p.details) order by p.id), '[]'::jsonb) into v
  from picked p join phase1.orders o on o.id = p.order_id join phase1.agents a on a.id = o.agent_id
    left join phase1.data_products dp on dp.id = o.product_id left join phase1.networks n on n.id = o.network_id;
  return v;
end $function$;

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
    'email_domain', case when a.email_domain is not null and a.email_domain_status = 'verified' then a.email_domain end,
    'details', jsonb_build_object('amount', 9, 'reason', 'Supplier out of stock', 'method', 'paystack'));
end $function$;

revoke all on function phase1.store_order_email_claim(int), phase1.store_order_email_sample(uuid, text) from public, anon, authenticated;
grant execute on function phase1.store_order_email_claim(int), phase1.store_order_email_sample(uuid, text) to service_role;
