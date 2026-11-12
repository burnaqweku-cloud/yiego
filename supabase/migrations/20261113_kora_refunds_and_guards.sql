-- 13 Nov 2026: Kora automatic refunds + guards from the security review.
-- Applied to the live database (schema phase1) by hand; this file is the record.

-- 1. Books: a refund paid back through Kora. Same shape as the Paystack one, taken from kora_held.
--    (Finance reads Kora's live balance, so this is the record only; nothing is deducted twice.)
create or replace function phase1.finance_clear_kora_refund(p_order_id uuid, p_refund_reference text, p_at timestamptz)
returns uuid language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare o record; v_charged numeric; v_fee numeric; v_pending numeric; v_fee_account text;
begin
  select id, order_reference, amount, supplier_id, paid_at into o from phase1.orders where id = p_order_id;
  if o.id is null or o.paid_at < phase1.finance_start_at() then return null; end if;
  if exists (select 1 from phase1.finance_entries where kind = 'refund_paid' and reference = o.order_reference) then return null; end if;
  select amount into v_charged from phase1.payment_intents where order_id = o.id and status = 'succeeded' and provider::text = 'kora' order by verified_at desc limit 1;
  if v_charged is null then return null; end if;
  v_fee := round(v_charged - o.amount, 2);
  v_pending := phase1.order_fee_pending(o.order_reference);
  v_fee_account := case when v_pending >= v_fee - 0.005 then 'fees_pending' else 'fee_income' end;
  return phase1.finance_post('refund_paid', o.order_reference, p_at, v_charged,
    jsonb_build_array(jsonb_build_object('account', 'refunds_due', 'amount', o.amount), jsonb_build_object('account', v_fee_account, 'amount', v_fee), jsonb_build_object('account', 'kora_held', 'amount', -v_charged)),
    'auto', o.supplier_id, 'Refund paid to customer by Kora, fee included (ref ' || coalesce(p_refund_reference, '?') || ')',
    jsonb_build_object('refundReference', p_refund_reference, 'method', 'kora', 'fee', v_fee), null);
end $$;
revoke all on function phase1.finance_clear_kora_refund(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function phase1.finance_clear_kora_refund(uuid, text, timestamptz) to service_role;

create or replace function phase1.order_events_refund_trigger()
returns trigger language plpgsql security definer set search_path to 'phase1', 'public' as $$
begin
  if new.event_type = 'refund.completed' and new.metadata->>'method' = 'paystack' then
    perform phase1.finance_clear_paystack_refund(new.order_id, new.metadata->>'refundReference', coalesce(new.created_at, now()));
  elsif new.event_type = 'refund.completed' and new.metadata->>'method' = 'kora' then
    perform phase1.finance_clear_kora_refund(new.order_id, new.metadata->>'refundReference', coalesce(new.created_at, now()));
  end if;
  return new;
exception when others then return new;
end $$;

-- 2. The automatic out-of-stock refund now proves it is the database calling (refund-order refuses anyone else).
create or replace function phase1.nudge_auto_refund()
returns trigger language plpgsql security definer set search_path to 'phase1', 'net', 'public' as $$
begin
  if new.status = 'failed_needs_review'
     and new.payment_status = 'succeeded'
     and coalesce(new.failure_reason, '') ~* 'out of stock'
     and (old.status is distinct from new.status or old.failure_reason is distinct from new.failure_reason)
  then
    perform net.http_post(
      'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/refund-order',
      jsonb_build_object('orderReference', new.order_reference, 'auto', true),
      '{}'::jsonb,
      jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')),
      15000);
  end if;
  return new;
end;
$$;

-- 3. A phone alert to every active admin (used when Kora says a refund failed).
create or replace function phase1.admin_alert(p_key text, p_title text, p_body text, p_link text default '/admin')
returns void language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare a record;
begin
  for a in select user_id from phase1.admin_users where is_active loop
    perform phase1.push_enqueue('alert', left(coalesce(p_key, 'alert'), 120) || ':' || a.user_id, p_title, p_body, coalesce(nullif(p_link, ''), '/admin'), null, null, a.user_id);
  end loop;
end $$;
revoke all on function phase1.admin_alert(text, text, text, text) from public, anon, authenticated;
grant execute on function phase1.admin_alert(text, text, text, text) to service_role;

-- 4. Store names: tags were already removed; stray < and > now go too, and the two other names shown in emails are cleaned the same way.
create or replace function phase1.agents_clean_text()
returns trigger language plpgsql as $$
begin
  new.store_name := left(regexp_replace(regexp_replace(coalesce(new.store_name,''), '<[^>]*>', '', 'g'), '[<>]', '', 'g'), 60);
  new.tagline := nullif(left(regexp_replace(coalesce(new.tagline,''), '<[^>]*>', '', 'g'), 120), '');
  new.about_text := nullif(left(regexp_replace(coalesce(new.about_text,''), '<[^>]*>', '', 'g'), 1200), '');
  new.hours_text := nullif(left(regexp_replace(coalesce(new.hours_text,''), '<[^>]*>', '', 'g'), 160), '');
  new.store_notice := nullif(left(regexp_replace(coalesce(new.store_notice,''), '<[^>]*>', '', 'g'), 200), '');
  if new.header_name is not null then new.header_name := regexp_replace(regexp_replace(new.header_name, '<[^>]*>', '', 'g'), '[<>]', '', 'g'); end if;
  if new.email_from_name is not null then new.email_from_name := regexp_replace(regexp_replace(new.email_from_name, '<[^>]*>', '', 'g'), '[<>]', '', 'g'); end if;
  if new.accent_color is not null and new.accent_color !~ '^#[0-9a-fA-F]{6}$' then new.accent_color := null; end if;
  return new;
end $$;

-- 5. "Submit a number to MTN" is a real purchase request to the supplier, so each visitor gets a daily allowance.
create table if not exists phase1.number_submit_hits (
  ip_hash text not null, day date not null, n integer not null default 0,
  primary key (ip_hash, day)
);
alter table phase1.number_submit_hits enable row level security; -- no policies: only the server can read or write it
revoke all on phase1.number_submit_hits from anon, authenticated;

/** How many of p_wanted new numbers this visitor may still submit today (Ghana day): 100 per visitor, 1,000 overall. Counts what it allows. */
create or replace function phase1.number_submit_allow(p_ip_hash text, p_wanted integer)
returns integer language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare v_day date := (now() at time zone 'Africa/Accra')::date; v_mine integer; v_all integer; v_ok integer;
begin
  if coalesce(p_wanted, 0) <= 0 or coalesce(p_ip_hash, '') = '' then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('number_submit_allow'));
  select coalesce(sum(n), 0) into v_all from phase1.number_submit_hits where day = v_day;
  select coalesce(sum(n), 0) into v_mine from phase1.number_submit_hits where day = v_day and ip_hash = p_ip_hash;
  v_ok := greatest(0, least(p_wanted, 100 - v_mine, 1000 - v_all));
  if v_ok > 0 then
    insert into phase1.number_submit_hits (ip_hash, day, n) values (p_ip_hash, v_day, v_ok)
    on conflict (ip_hash, day) do update set n = phase1.number_submit_hits.n + excluded.n;
  end if;
  delete from phase1.number_submit_hits where day < v_day - 7;
  return v_ok;
end $$;
revoke all on function phase1.number_submit_allow(text, integer) from public, anon, authenticated;
grant execute on function phase1.number_submit_allow(text, integer) to service_role;
