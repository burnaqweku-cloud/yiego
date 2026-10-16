-- Sub-agents ("agent network") — fixes from the 16 Oct audit, before the feature is switched on.
-- Applied to production 16 Oct 2026 via the Supabase MCP (execute_sql), in this order.

-- 1. Coupons and announcements: RLS policies existed but the role had no table grants, so every
--    read/insert from the dashboard failed with "permission denied".
grant select, insert, update on phase1.network_coupons to authenticated;
grant select, insert, update on phase1.network_announcements to authenticated;

-- 2. join_network created a sub store under any open parent with no application and no approval.
--    Nothing in the UI calls it; the application flow (network_apply → network_application_decide) is the only door.
revoke execute on function phase1.join_network(text, text, text, text) from authenticated, anon, public;

-- 3. Background errors are recorded instead of swallowed. Ledger triggers used `exception when others then return new`,
--    which hid every failure. Admins can read this table.
create table if not exists phase1.system_errors (
  id bigserial primary key,
  source text not null,
  reference text,
  message text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table phase1.system_errors enable row level security;
drop policy if exists system_errors_admin_read on phase1.system_errors;
create policy system_errors_admin_read on phase1.system_errors for select to authenticated using (private.is_phase1_admin());
grant select on phase1.system_errors to authenticated;

create or replace function phase1.log_system_error(p_source text, p_reference text, p_message text, p_detail jsonb default null)
returns void language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  insert into phase1.system_errors (source, reference, message, detail) values (p_source, p_reference, left(p_message, 2000), p_detail);
exception when others then null;
end $$;
revoke execute on function phase1.log_system_error(text, text, text, jsonb) from public, anon, authenticated;

create or replace function phase1.parent_order_settle() returns trigger
language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  if new.parent_agent_id is null or coalesce(new.parent_margin,0) <= 0 then return new; end if;
  if new.status='delivered' and old.status is distinct from 'delivered' and new.paid_at >= phase1.finance_start_at() then
    perform phase1.agent_ledger_post(new.parent_agent_id, 'credit', 'sale', new.parent_margin, new.order_reference, 'Margin on an order sold by your agent');
    perform phase1.finance_post('agent_margin', new.order_reference || ':parent', now(), new.parent_margin, jsonb_build_array(jsonb_build_object('account','agent_margin','amount', new.parent_margin), jsonb_build_object('account','owed_to_agents','amount', -new.parent_margin)), 'auto', new.supplier_id, 'Parent agent margin earned on delivery', jsonb_build_object('agent_id', new.parent_agent_id, 'sub_agent_id', new.agent_id), null);
  elsif new.status='refunded' and old.status='delivered' and exists (select 1 from phase1.agent_ledger_entries where agent_id=new.parent_agent_id and reference=new.order_reference and type='sale') then
    perform phase1.agent_ledger_post(new.parent_agent_id, 'debit', 'refund', new.parent_margin, new.order_reference, 'Order refunded; margin taken back');
    perform phase1.finance_post('agent_margin_reversed', new.order_reference || ':parent', now(), new.parent_margin, jsonb_build_array(jsonb_build_object('account','agent_margin','amount', -new.parent_margin), jsonb_build_object('account','owed_to_agents','amount', new.parent_margin)), 'auto', new.supplier_id, 'Parent agent margin reversed on refund', jsonb_build_object('agent_id', new.parent_agent_id), null);
  end if;
  return new;
exception when others then
  perform phase1.log_system_error('parent_order_settle', new.order_reference, sqlerrm, jsonb_build_object('status', new.status, 'parent_agent_id', new.parent_agent_id, 'parent_margin', new.parent_margin));
  return new;
end $$;

create or replace function phase1.agent_order_settle() returns trigger
language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  if new.agent_id is null or coalesce(new.agent_margin,0) <= 0 then return new; end if;
  if new.status='delivered' and old.status is distinct from 'delivered' and new.paid_at >= phase1.finance_start_at() then
    perform phase1.agent_ledger_post(new.agent_id, 'credit', 'sale', new.agent_margin, new.order_reference, 'Margin on delivered order');
    perform phase1.finance_post('agent_margin', new.order_reference, now(), new.agent_margin,
      jsonb_build_array(jsonb_build_object('account','agent_margin','amount', new.agent_margin), jsonb_build_object('account','owed_to_agents','amount', -new.agent_margin)),
      'auto', new.supplier_id, 'Agent margin earned on delivery', jsonb_build_object('agent_id', new.agent_id), null);
  elsif new.status='refunded' and old.status='delivered' and exists (select 1 from phase1.agent_ledger_entries where agent_id=new.agent_id and reference=new.order_reference and type='sale') then
    perform phase1.agent_ledger_post(new.agent_id, 'debit', 'refund', new.agent_margin, new.order_reference, 'Order refunded; margin taken back');
    perform phase1.finance_post('agent_margin_reversed', new.order_reference, now(), new.agent_margin,
      jsonb_build_array(jsonb_build_object('account','agent_margin','amount', -new.agent_margin), jsonb_build_object('account','owed_to_agents','amount', new.agent_margin)),
      'auto', new.supplier_id, 'Agent margin reversed on refund', jsonb_build_object('agent_id', new.agent_id), null);
  end if;
  return new;
exception when others then
  perform phase1.log_system_error('agent_order_settle', new.order_reference, sqlerrm, jsonb_build_object('status', new.status, 'agent_id', new.agent_id, 'agent_margin', new.agent_margin));
  return new;
end $$;

-- 4. Fee payment: a bad intent (sub with no parent, etc.) used to abort the whole payment_events insert — the
--    5 Oct failure mode. network_fee_paid now refuses clearly, and the trigger records the error and lets the
--    event through; admin_network_fee_reapply() re-runs it once the cause is fixed. It also emails both sides.
create or replace function phase1.network_fee_paid(p_intent_id uuid) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $$
declare i record; v_agent uuid; v_parent uuid; v_base numeric; v_fee numeric; v_months int; v_until date; v_status text; v_coupon uuid; v_sub_name text;
begin
  select * into i from phase1.payment_intents where id = p_intent_id and purpose = 'network_fee' and status = 'succeeded';
  if i.id is null then return jsonb_build_object('skipped','intent_not_succeeded'); end if;
  if exists (select 1 from phase1.finance_entries where kind = 'network_fee' and reference = i.provider_reference) then return jsonb_build_object('skipped','already_applied'); end if;
  v_agent := (i.metadata->>'agent_id')::uuid; v_months := greatest(coalesce((i.metadata->>'months')::int, 1), 1); v_coupon := nullif(i.metadata->>'coupon_id','')::uuid;
  v_base := coalesce((i.metadata->>'baseAmount')::numeric, i.amount); v_fee := coalesce((i.metadata->>'feeAmount')::numeric, 0);
  select parent_agent_id, status::text, store_name into v_parent, v_status, v_sub_name from phase1.agents where id = v_agent;
  if v_agent is null or v_sub_name is null then raise exception 'network_fee: sub-agent % not found', v_agent; end if;
  if v_parent is null then raise exception 'network_fee: agent % has no parent', v_agent; end if;
  update phase1.agents set paid_until = (case when v_status='active' then greatest(coalesce(paid_until, current_date), current_date) else current_date end + (v_months || ' months')::interval)::date,
    status = case when status in ('awaiting_payment','paused','lapsed') then 'active' else status end, updated_at = now() where id = v_agent returning paid_until into v_until;
  if v_coupon is not null then update phase1.network_coupons set uses = uses + 1 where id = v_coupon; end if;
  perform phase1.agent_ledger_post(v_parent, 'credit', 'sale', v_base, i.provider_reference, 'Agent fee from ' || v_sub_name);
  perform phase1.finance_post('network_fee', i.provider_reference, coalesce(i.verified_at, now()), i.amount,
    jsonb_build_array(jsonb_build_object('account','paystack_transit','amount', i.amount), jsonb_build_object('account','owed_to_agents','amount', -v_base), jsonb_build_object('account','fee_income','amount', -v_fee)),
    'auto', null, 'Sub-agent fee, passed to parent agent', jsonb_build_object('agent_id', v_agent, 'parent_agent_id', v_parent, 'base', v_base, 'fee', v_fee, 'months', v_months, 'coupon_id', v_coupon), null);
  perform net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/agent-notify',
    jsonb_build_object('kind','network_fee','intentId', i.id), '{}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')), 15000);
  return jsonb_build_object('agent_id', v_agent, 'paid_until', v_until);
end $$;

create or replace function phase1.payment_events_network_fee() returns trigger
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_intent phase1.payment_intents%rowtype;
begin
  if new.event_type <> 'charge.success' then return new; end if;
  select * into v_intent from phase1.payment_intents where provider_reference = new.provider_reference and purpose = 'network_fee' and status = 'pending';
  if v_intent.id is null then return new; end if;
  if coalesce((new.payload->'data'->>'amount')::numeric / 100, 0) < v_intent.amount then return new; end if;
  update phase1.payment_intents set status = 'succeeded', verified_at = now() where id = v_intent.id;
  begin
    perform phase1.network_fee_paid(v_intent.id);
  exception when others then
    perform phase1.log_system_error('payment_events_network_fee', new.provider_reference, sqlerrm, jsonb_build_object('intent_id', v_intent.id, 'metadata', v_intent.metadata));
  end;
  return new;
end $$;

-- Admin: re-run a fee that errored (idempotent — skips if already applied).
create or replace function phase1.admin_network_fee_reapply(p_intent_id uuid) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_only'; end if;
  return phase1.network_fee_paid(p_intent_id);
end $$;

-- 5. A parent raising a price used to leave their subs priced below it (sub margin clamped to 0 while the parent
--    still earned). Subs below the new floor are lifted to it; the next time they open Prices they see the change.
create or replace function phase1.agent_set_price(p_product_id uuid, p_price numeric) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_agent uuid; v_floor numeric; v_is_parent boolean;
begin
  select id, parent_agent_id is null into v_agent, v_is_parent from phase1.agents where user_id = auth.uid();
  if v_agent is null then raise exception 'not_an_agent'; end if;
  if not exists (select 1 from phase1.data_products where id = p_product_id and is_active) then raise exception 'unknown_product'; end if;
  v_floor := phase1.agent_cost_price(v_agent, p_product_id);
  if p_price < v_floor then raise exception 'below_agent_price:%', v_floor; end if;
  insert into phase1.agent_prices (agent_id, product_id, price) values (v_agent, p_product_id, round(p_price,2)) on conflict (agent_id, product_id) do update set price = excluded.price, updated_at = now();
  if v_is_parent then
    update phase1.agent_prices sp set price = round(p_price,2), updated_at = now()
    from phase1.agents s where s.id = sp.agent_id and s.parent_agent_id = v_agent and sp.product_id = p_product_id and sp.price < round(p_price,2);
  end if;
end $$;

-- 6. Renewal reminders: subs get the parent's name and fee instead of the DataYego plan quote. Created as a new
--    function (agents_due_for_reminder_v2; agent-reminders calls this one) because a DROP was blocked by the
--    MCP approval prompt; the old agents_due_for_reminder() is left in place, unused.
create function phase1.agents_due_for_reminder_v2()
returns table(agent_id uuid, user_id uuid, store_name text, paid_until date, kind text, parent_name text, parent_fee numeric)
language sql stable security definer set search_path to 'phase1','public' as $$
  with due as (
    select id, user_id, store_name, paid_until, '3d'::text as kind, parent_agent_id from phase1.agents where status='active' and paid_until = current_date + 3 and reminder_3d_sent_for is distinct from paid_until
    union all
    select id, user_id, store_name, paid_until, 'due', parent_agent_id from phase1.agents where status='active' and paid_until = current_date and reminder_due_sent_for is distinct from paid_until
    union all
    select id, user_id, store_name, paid_until, 'grace', parent_agent_id from phase1.agents where status='active' and paid_until = current_date - 1 and reminder_grace_sent_for is distinct from paid_until
  )
  select d.id, d.user_id, d.store_name, d.paid_until, d.kind, p.store_name, p.network_fee
  from due d left join phase1.agents p on p.id = d.parent_agent_id
$$;
revoke execute on function phase1.agents_due_for_reminder_v2() from public, anon, authenticated;
