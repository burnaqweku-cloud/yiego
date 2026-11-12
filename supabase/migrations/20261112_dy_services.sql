-- DY Services, stage 1 (12 Nov 2026): result checkers sold from our own stock of PINs.
-- Own tables, so nothing here can touch data orders. Every PIN is sold once: it is reserved for the buyer
-- while they pay and marked sold when the payment is confirmed. A payment that finds no stock waits
-- ('paid_waiting_stock'), alerts the admins and is delivered the moment stock is added.
-- Payment: wallet (one atomic call) or Paystack (the existing webhook stores the event; a trigger here
-- confirms the order; the service-pay function double-checks on return and every few minutes).

create table if not exists phase1.service_products (
  code text primary key, kind text not null check (kind in ('checker','afa')),
  name text not null, blurb text not null default '',
  customer_price numeric(10,2) not null check (customer_price > 0), agent_price numeric(10,2) not null check (agent_price > 0),
  is_active boolean not null default true, sort_order int not null default 0, low_stock_at int not null default 5,
  updated_at timestamptz not null default now());

create table if not exists phase1.service_stock_batches (
  id uuid primary key default gen_random_uuid(), product_code text not null references phase1.service_products(code),
  quantity int not null, total_cost numeric(12,2) not null, paid_from text not null, note text,
  created_by uuid, created_at timestamptz not null default now());

create table if not exists phase1.service_orders (
  id uuid primary key default gen_random_uuid(), reference text not null unique,
  token uuid not null default gen_random_uuid() unique,
  product_code text not null references phase1.service_products(code), quantity int not null check (quantity between 1 and 1000),
  unit_price numeric(10,2) not null, amount numeric(12,2) not null, fee_amount numeric(12,2) not null default 0, cost_amount numeric(12,2),
  user_id uuid, guest_email text, phone text not null, device_id text,
  agent_id uuid, agent_price numeric(10,2), agent_margin numeric(12,2), agent_self boolean not null default false,
  payment_method text not null check (payment_method in ('wallet','paystack')), pay_reference text unique,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','paid_waiting_stock','delivered','refunded','cancelled','expired')),
  paid_at timestamptz, delivered_at timestamptz, refunded_at timestamptz, refund_method text, refund_reference text, refund_reason text,
  wallet_ledger_entry_id uuid, details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists service_orders_user_idx on phase1.service_orders (user_id, created_at desc);
create index if not exists service_orders_status_idx on phase1.service_orders (status, created_at);

create table if not exists phase1.service_pins (
  id uuid primary key default gen_random_uuid(), product_code text not null references phase1.service_products(code),
  batch_id uuid references phase1.service_stock_batches(id), serial text not null, pin text not null, cost numeric(12,4) not null default 0,
  status text not null default 'available' check (status in ('available','reserved','sold','void')),
  order_id uuid references phase1.service_orders(id), reserved_until timestamptz, sold_at timestamptz, created_at timestamptz not null default now(),
  unique (product_code, serial));
create index if not exists service_pins_pick_idx on phase1.service_pins (product_code, created_at) where status in ('available','reserved');
create index if not exists service_pins_order_idx on phase1.service_pins (order_id);

create table if not exists phase1.service_outbox (
  order_id uuid primary key references phase1.service_orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  sms text, email text, attempts int not null default 0, created_at timestamptz not null default now(), sent_at timestamptz);

alter table phase1.service_products enable row level security;
alter table phase1.service_stock_batches enable row level security;
alter table phase1.service_orders enable row level security;
alter table phase1.service_pins enable row level security;
alter table phase1.service_outbox enable row level security;

insert into phase1.service_products (code, kind, name, blurb, customer_price, agent_price, sort_order) values
 ('checker-wassce','checker','WASSCE Results Checker','Check WASSCE results for this year or any past year. Also works for SSCE, ABCE and GBCE.',20,19,10),
 ('checker-bece','checker','BECE Results Checker','Check BECE results for this year or any past year.',20,19,20)
on conflict (code) do nothing;

insert into phase1.finance_accounts (code, name, kind, sort_order) values
 ('stock_services','Result checker stock (unsold PINs)','asset',15),
 ('services_owed','Services paid, not yet delivered','liability',46),
 ('service_revenue','Services sold','income',42),
 ('cost_of_services','Cost of services sold','expense',52)
on conflict (code) do nothing;

create or replace function phase1.service_norm_phone(p text) returns text language sql immutable as $$
  select case when d ~ '^233[0-9]{9}$' then '0' || substr(d, 4) when d ~ '^0[0-9]{9}$' then d when d ~ '^[0-9]{9}$' then '0' || d else null end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x $$;

-- How many PINs can be sold right now (free, or held by someone whose time ran out).
create or replace function phase1.service_stock_left(p_product text) returns int language sql stable security definer set search_path = phase1, public as $$
  select count(*)::int from phase1.service_pins where product_code = p_product and (status = 'available' or (status = 'reserved' and reserved_until < now())) $$;

-- Holds PINs for an order. All or nothing.
create or replace function phase1.service_hold(p_order uuid, p_product text, p_qty int, p_minutes int default 20) returns boolean
language plpgsql security definer set search_path = phase1, public as $$
declare v_ids uuid[];
begin
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where product_code = p_product and status = 'reserved' and reserved_until < now();
  select array_agg(id) into v_ids from (select id from phase1.service_pins where product_code = p_product and status = 'available' order by created_at, id limit p_qty for update skip locked) x;
  if coalesce(array_length(v_ids, 1), 0) < p_qty then return false; end if;
  update phase1.service_pins set status = 'reserved', order_id = p_order, reserved_until = now() + make_interval(mins => p_minutes) where id = any(v_ids);
  return true;
end $$;

create or replace function phase1.service_alert_admins(p_key text, p_title text, p_body text) returns void language plpgsql security definer set search_path = phase1, public as $$
declare a record;
begin
  for a in select user_id from phase1.admin_users where is_active loop
    perform phase1.push_enqueue('alert', p_key || ':' || a.user_id, p_title, p_body, '/admin/services', null, null, a.user_id);
  end loop;
exception when others then null;
end $$;

-- Gives a paid order its PINs. Safe to call any number of times.
create or replace function phase1.service_fulfil(p_order uuid) returns text language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; p phase1.service_products; v_have int; v_cost numeric; v_left int; v_takeover boolean;
begin
  select * into o from phase1.service_orders where id = p_order for update;
  if o.id is null or o.paid_at is null or o.status not in ('awaiting_payment','paid_waiting_stock','expired','cancelled') then return coalesce(o.status, 'missing'); end if;
  select * into p from phase1.service_products where code = o.product_code;
  -- Keep what is still held for this order; take more if the hold ran out.
  select count(*) into v_have from phase1.service_pins where order_id = o.id and status = 'reserved';
  if v_have < o.quantity then
    update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where order_id = o.id and status = 'reserved';
    if not phase1.service_hold(o.id, o.product_code, o.quantity, 5) then
      update phase1.service_orders set status = 'paid_waiting_stock', updated_at = now() where id = o.id;
      perform phase1.service_alert_admins('svc-wait:' || o.reference, 'A paid order is waiting for stock', o.quantity || ' x ' || p.name || ' (' || o.reference || ') is paid but there are no PINs left. Add stock and it delivers by itself.');
      return 'paid_waiting_stock';
    end if;
  end if;
  update phase1.service_pins set status = 'sold', sold_at = now(), reserved_until = null where order_id = o.id and status = 'reserved';
  select round(coalesce(sum(cost), 0), 2) into v_cost from phase1.service_pins where order_id = o.id and status = 'sold';
  update phase1.service_orders set status = 'delivered', delivered_at = now(), cost_amount = v_cost, updated_at = now() where id = o.id;
  perform phase1.finance_post('service_delivered', o.reference, now(), o.amount,
    jsonb_build_array(jsonb_build_object('account','services_owed','amount', o.amount), jsonb_build_object('account','service_revenue','amount', -o.amount),
                      jsonb_build_object('account','cost_of_services','amount', v_cost), jsonb_build_object('account','stock_services','amount', -v_cost)),
    'auto', null, o.quantity || ' x ' || p.name, jsonb_build_object('order', o.id, 'cost', v_cost));
  if o.agent_id is not null and coalesce(o.agent_margin, 0) > 0 and not o.agent_self then
    select profit_to_platform into v_takeover from phase1.agents where id = o.agent_id;
    if not coalesce(v_takeover, false) then
      perform phase1.agent_ledger_post(o.agent_id, 'credit', 'sale', o.agent_margin, o.reference, 'Margin on ' || p.name);
      perform phase1.finance_post('agent_margin', o.reference, now(), o.agent_margin,
        jsonb_build_array(jsonb_build_object('account','agent_margin','amount', o.agent_margin), jsonb_build_object('account','owed_to_agents','amount', -o.agent_margin)),
        'auto', null, 'Agent margin on a service sale', jsonb_build_object('agent_id', o.agent_id));
    end if;
  end if;
  insert into phase1.service_outbox (order_id) values (o.id) on conflict do nothing;
  begin
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  exception when others then null; end;
  v_left := phase1.service_stock_left(o.product_code);
  if v_left = 0 then perform phase1.service_alert_admins('svc-out:' || o.product_code || ':' || to_char(now(), 'YYYYMMDD'), p.name || ' is sold out', 'The last PIN was just sold. Add stock to keep selling.');
  elsif v_left <= p.low_stock_at then perform phase1.service_alert_admins('svc-low:' || o.product_code || ':' || to_char(now(), 'YYYYMMDD'), p.name || ': ' || v_left || ' left', 'Stock is running low. Add more PINs soon.');
  end if;
  return 'delivered';
end $$;

-- Marks an order paid (books the money) and delivers it. Used by the wallet call, the payment trigger and the checker.
create or replace function phase1.service_paid(p_order uuid) returns text language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders;
begin
  select * into o from phase1.service_orders where id = p_order for update;
  if o.id is null then return 'missing'; end if;
  if o.paid_at is null then
    if o.status not in ('awaiting_payment','expired','cancelled') then return o.status; end if;
    update phase1.service_orders set paid_at = now(), updated_at = now() where id = o.id;
    perform phase1.finance_post('service_paid', o.reference, now(), o.amount + o.fee_amount,
      jsonb_build_array(jsonb_build_object('account', case when o.payment_method = 'wallet' then 'customer_wallets' else 'paystack_transit' end, 'amount', o.amount + o.fee_amount),
                        jsonb_build_object('account','services_owed','amount', -o.amount), jsonb_build_object('account','fee_income','amount', -o.fee_amount)),
      'auto', null, null, jsonb_build_object('order', o.id, 'via', o.payment_method));
  end if;
  return phase1.service_fulfil(o.id);
end $$;

-- Paystack told us a payment went through (webhook trigger or the checker). Amount in cedis.
create or replace function phase1.service_payment_received(p_reference text, p_paid numeric) returns text language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders;
begin
  select * into o from phase1.service_orders where pay_reference = p_reference;
  if o.id is null then return 'not_ours'; end if;
  if p_paid + 0.005 < o.amount + o.fee_amount then return 'underpaid'; end if;
  return phase1.service_paid(o.id);
end $$;

create or replace function phase1.payment_events_service_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
begin
  begin
    if new.event_type = 'charge.success' and new.provider::text = 'paystack' and new.provider_reference like 'SVPAY-%'
       and new.payload->'data'->>'status' = 'success' and coalesce(new.payload->'data'->>'currency', 'GHS') = 'GHS' then
      perform phase1.service_payment_received(new.provider_reference, coalesce((new.payload->'data'->>'amount')::numeric, 0) / 100);
    end if;
  exception when others then
    perform phase1.log_system_error('service_payment', new.provider_reference, sqlerrm, '{}'::jsonb);
  end;
  return new;
end $$;
drop trigger if exists zz_payment_events_service_trg on phase1.payment_events;
create trigger zz_payment_events_service_trg after insert or update on phase1.payment_events for each row execute function phase1.payment_events_service_trigger();

-- New order (not yet paid) with its PINs on hold. Internal.
create or replace function phase1.service_order_new(p_user uuid, p_product text, p_qty int, p_phone text, p_email text, p_method text, p_device text)
returns phase1.service_orders language plpgsql security definer set search_path = phase1, public as $$
declare p phase1.service_products; o phase1.service_orders; v_phone text := phase1.service_norm_phone(p_phone); v_fee numeric;
begin
  select * into p from phase1.service_products where code = p_product and is_active;
  if p.code is null then raise exception 'service_unavailable'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'quantity_invalid'; end if;
  if v_phone is null then raise exception 'phone_invalid'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'email_invalid'; end if;
  v_fee := case when p_method = 'paystack' then round(p.customer_price * p_qty * 0.04, 2) else 0 end;
  -- One open hold per phone or device: starting again lets go of the PINs held for an earlier unpaid try (that order still delivers if it is paid).
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where status = 'reserved' and order_id in (
    select x.id from phase1.service_orders x where x.paid_at is null and x.status = 'awaiting_payment' and (x.phone = v_phone or (p_device is not null and x.device_id = left(p_device, 80))));
  insert into phase1.service_orders (reference, product_code, quantity, unit_price, amount, fee_amount, user_id, guest_email, phone, device_id, payment_method)
  values ('SV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p.code, p_qty, p.customer_price, p.customer_price * p_qty, v_fee,
          p_user, nullif(lower(trim(coalesce(p_email, ''))), ''), v_phone, left(p_device, 80), p_method)
  returning * into o;
  -- Not enough in stock is not a refusal: the order is taken, waits as 'paid_waiting_stock' once paid, and delivers by itself when stock is added.
  perform phase1.service_hold(o.id, p.code, p_qty, 20);
  return o;
end $$;

-- What the buyer sees of an order: the PINs only once it is delivered.
create or replace function phase1.service_order_json(o phase1.service_orders) returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object('reference', o.reference, 'token', o.token, 'product', o.product_code, 'name', p.name, 'quantity', o.quantity, 'amount', o.amount, 'fee', o.fee_amount,
    'phone', o.phone, 'status', o.status, 'paid', o.paid_at is not null, 'method', o.payment_method, 'created_at', o.created_at, 'delivered_at', o.delivered_at,
    'pins', case when o.status = 'delivered' then coalesce((select jsonb_agg(jsonb_build_object('serial', s.serial, 'pin', s.pin) order by s.created_at, s.id) from phase1.service_pins s where s.order_id = o.id and s.status = 'sold'), '[]'::jsonb) else '[]'::jsonb end)
  from phase1.service_products p where p.code = o.product_code $$;

-- Pay from the wallet: one call, all or nothing.
create or replace function phase1.service_buy_wallet(p_product text, p_qty int, p_phone text, p_device text default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; w phase1.wallets; v_entry uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  o := phase1.service_order_new(auth.uid(), p_product, p_qty, p_phone, null, 'wallet', p_device);
  select * into w from phase1.wallets where user_id = auth.uid() for update;
  if w.id is null or w.balance < o.amount then raise exception 'insufficient_balance'; end if;
  insert into phase1.wallet_ledger_entries (wallet_id, user_id, direction, type, amount, balance_before, balance_after, status, reference, note)
  values (w.id, w.user_id, 'debit', 'purchase', o.amount, w.balance, w.balance - o.amount, 'posted', o.reference, o.quantity || ' x ' || (select name from phase1.service_products where code = o.product_code))
  returning id into v_entry;
  update phase1.wallets set balance = balance - o.amount, updated_at = now() where id = w.id;
  update phase1.service_orders set wallet_ledger_entry_id = v_entry where id = o.id;
  perform phase1.service_paid(o.id);
  select * into o from phase1.service_orders where id = o.id;
  return phase1.service_order_json(o);
end $$;

-- Paystack checkout, step 1 (called by the service-pay function with the server key): the order and its payment reference.
create or replace function phase1.service_checkout_start(p_user uuid, p_product text, p_qty int, p_phone text, p_email text, p_device text) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; v_ref text := 'SVPAY-' || replace(gen_random_uuid()::text, '-', '');
begin
  o := phase1.service_order_new(p_user, p_product, p_qty, p_phone, p_email, 'paystack', p_device);
  update phase1.service_orders set pay_reference = v_ref where id = o.id;
  return jsonb_build_object('id', o.id, 'reference', o.reference, 'token', o.token, 'pay_reference', v_ref, 'total', o.amount + o.fee_amount, 'amount', o.amount, 'fee', o.fee_amount, 'phone', o.phone,
    'email', coalesce(o.guest_email, (select email from auth.users where id = p_user)), 'name', (select name from phase1.service_products where code = o.product_code));
end $$;

-- The checkout could not be opened: let the PINs go.
create or replace function phase1.service_checkout_abort(p_order uuid) returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  update phase1.service_orders set status = 'cancelled', updated_at = now() where id = p_order and status = 'awaiting_payment' and paid_at is null;
  if found then update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where order_id = p_order and status = 'reserved'; end if;
end $$;

-- Housekeeping: unpaid orders older than an hour are closed (a late payment still delivers).
create or replace function phase1.service_sweep() returns void language sql security definer set search_path = phase1, public as $$
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where status = 'reserved' and reserved_until < now();
  update phase1.service_orders set status = 'expired', updated_at = now() where status = 'awaiting_payment' and paid_at is null and created_at < now() - interval '1 hour' $$;

-- Public: what is on sale and whether it is in stock.
create or replace function phase1.service_catalog() returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'price', p.customer_price, 'in_stock', phase1.service_stock_left(p.code) > 0,
    'left', phase1.service_stock_left(p.code)) order by p.sort_order), '[]'::jsonb)
  from phase1.service_products p where p.is_active $$;

create or replace function phase1.service_order_view(p_token uuid) returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select phase1.service_order_json(o) from phase1.service_orders o where o.token = p_token $$;

create or replace function phase1.service_my_orders() returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select coalesce(jsonb_agg(phase1.service_order_json(o) order by o.created_at desc), '[]'::jsonb)
  from phase1.service_orders o where o.user_id = auth.uid() and o.paid_at is not null and o.created_at > now() - interval '400 days' $$;

-- Sender side.
create or replace function phase1.service_outbox_claim() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v jsonb;
begin
  perform phase1.service_sweep();
  with picked as (update phase1.service_outbox x set attempts = attempts + 1 where x.status = 'pending' and x.attempts < 3 returning x.order_id)
  select coalesce(jsonb_agg(phase1.service_order_json(o) || jsonb_build_object('id', o.id, 'email', coalesce(o.guest_email, (select email from auth.users u where u.id = o.user_id)), 'user_id', o.user_id)), '[]'::jsonb) into v
  from picked join phase1.service_orders o on o.id = picked.order_id;
  return jsonb_build_object('deliver', v,
    'check', coalesce((select jsonb_agg(o.pay_reference) from phase1.service_orders o where o.paid_at is null and o.pay_reference is not null and o.status in ('awaiting_payment','expired') and o.created_at between now() - interval '3 hours' and now() - interval '90 seconds'), '[]'::jsonb));
end $$;
create or replace function phase1.service_outbox_done(p_order uuid, p_sms text, p_email text) returns void language sql security definer set search_path = phase1, public as $$
  update phase1.service_outbox set status = case when p_sms = 'sent' or p_email = 'sent' or attempts >= 3 then 'sent' else 'pending' end, sms = p_sms, email = p_email, sent_at = now() where order_id = p_order $$;

-- Admin.
create or replace function phase1.admin_services() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare today timestamptz := date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return jsonb_build_object(
    'can_edit', phase1.caller_is_admin(null, true),
    'products', (select jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'customer_price', p.customer_price, 'agent_price', p.agent_price, 'is_active', p.is_active, 'low_stock_at', p.low_stock_at,
        'left', phase1.service_stock_left(p.code), 'held', (select count(*) from phase1.service_pins s where s.product_code = p.code and s.status = 'reserved' and s.reserved_until >= now()),
        'stock_value', (select round(coalesce(sum(cost), 0), 2) from phase1.service_pins s where s.product_code = p.code and s.status in ('available','reserved')),
        'sold', (select count(*) from phase1.service_pins s where s.product_code = p.code and s.status = 'sold'),
        'sold_today', (select coalesce(sum(o.quantity), 0) from phase1.service_orders o where o.product_code = p.code and o.status = 'delivered' and o.delivered_at >= today)) order by p.sort_order) from phase1.service_products p),
    'totals', (select jsonb_build_object('sales', coalesce(sum(amount), 0), 'cost', coalesce(sum(cost_amount), 0), 'margins', coalesce(sum(case when agent_self then 0 else coalesce(agent_margin, 0) end), 0), 'orders', count(*),
        'sales_today', coalesce(sum(amount) filter (where delivered_at >= today), 0), 'profit_today', coalesce(sum(amount - coalesce(cost_amount, 0) - case when agent_self then 0 else coalesce(agent_margin, 0) end) filter (where delivered_at >= today), 0))
      from phase1.service_orders where status = 'delivered'),
    'waiting', (select count(*) from phase1.service_orders where status = 'paid_waiting_stock'),
    'orders', coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id, o.reference, p.name, o.quantity, o.amount, o.fee_amount, o.cost_amount, o.phone, o.status, o.payment_method, o.agent_id, o.agent_margin, o.created_at, o.paid_at, o.delivered_at,
        (select b.sms || ' / ' || coalesce(b.email, '-') from phase1.service_outbox b where b.order_id = o.id) as sent
        from phase1.service_orders o join phase1.service_products p on p.code = o.product_code where o.paid_at is not null order by o.paid_at desc limit 60) x), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(to_jsonb(x)) from (select b.id, p.name, b.quantity, b.total_cost, b.paid_from, b.note, b.created_at from phase1.service_stock_batches b join phase1.service_products p on p.code = b.product_code order by b.created_at desc limit 20) x), '[]'::jsonb));
end $$;

-- Add PINs: one per line, serial then PIN (labels like "Serial:" and "PIN:" are ignored). Returns what was added and what was not.
create or replace function phase1.admin_service_add_stock(p_product text, p_lines text, p_total_cost numeric, p_paid_from text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare v_line text; v_clean text; v_parts text[]; v_good text[][] := '{}'; v_bad text[] := '{}'; v_dupe text[] := '{}'; v_batch uuid; v_n int := 0; v_each numeric; r record; i int; v_seen text[] := '{}';
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'master_required'; end if;
  if not exists (select 1 from phase1.service_products where code = p_product and kind = 'checker') then raise exception 'unknown_product'; end if;
  if p_paid_from not in ('bank','outside_funding','kora_held') then raise exception 'paid_from_invalid'; end if;
  if p_total_cost is null or p_total_cost <= 0 then raise exception 'cost_invalid'; end if;
  foreach v_line in array regexp_split_to_array(coalesce(p_lines, ''), E'[\\r\\n]+') loop
    v_clean := trim(regexp_replace(regexp_replace(v_line, '\m(serial(\s*(number|no\.?))?|s/n|pin(\s*(code|number|no\.?))?)\M\s*[:#=-]*', ' ', 'gi'), '[,;|]+', ' ', 'g'));
    if v_clean = '' then continue; end if;
    v_parts := regexp_split_to_array(v_clean, '\s+');
    if array_length(v_parts, 1) <> 2 or length(v_parts[1]) < 4 or length(v_parts[2]) < 4 then v_bad := v_bad || left(trim(v_line), 60); continue; end if;
    if v_parts[1] = any(v_seen) or exists (select 1 from phase1.service_pins where product_code = p_product and serial = v_parts[1]) then v_dupe := v_dupe || v_parts[1]; continue; end if;
    v_seen := v_seen || v_parts[1]; v_good := v_good || array[[v_parts[1], v_parts[2]]];
  end loop;
  v_n := coalesce(array_length(v_good, 1), 0);
  if v_n = 0 then return jsonb_build_object('added', 0, 'not_read', to_jsonb(v_bad), 'already_in_stock', to_jsonb(v_dupe)); end if;
  v_each := round(p_total_cost / v_n, 4);
  insert into phase1.service_stock_batches (product_code, quantity, total_cost, paid_from, note, created_by) values (p_product, v_n, p_total_cost, p_paid_from, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into v_batch;
  for i in 1..v_n loop
    insert into phase1.service_pins (product_code, batch_id, serial, pin, cost) values (p_product, v_batch, v_good[i][1], v_good[i][2], v_each);
  end loop;
  perform phase1.finance_post('service_stock', 'svc-stock:' || v_batch, now(), p_total_cost,
    jsonb_build_array(jsonb_build_object('account','stock_services','amount', p_total_cost), jsonb_build_object('account', p_paid_from, 'amount', -p_total_cost)),
    'manual', null, v_n || ' PINs added' || coalesce(': ' || nullif(trim(coalesce(p_note, '')), ''), ''), jsonb_build_object('batch', v_batch, 'product', p_product, 'paid_from', p_paid_from), auth.uid());
  -- Anyone who paid while we were out of stock gets theirs now, oldest first.
  for r in select id from phase1.service_orders where status = 'paid_waiting_stock' and product_code = p_product order by paid_at loop perform phase1.service_fulfil(r.id); end loop;
  return jsonb_build_object('added', v_n, 'cost_each', round(v_each, 2), 'not_read', to_jsonb(v_bad), 'already_in_stock', to_jsonb(v_dupe), 'left', phase1.service_stock_left(p_product));
end $$;

create or replace function phase1.admin_service_set(p_product text, p_customer_price numeric, p_agent_price numeric, p_active boolean, p_low_stock_at int) returns boolean
language plpgsql security definer set search_path = phase1, public as $$
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'master_required'; end if;
  if p_customer_price <= 0 or p_agent_price <= 0 or p_agent_price > p_customer_price then raise exception 'price_invalid'; end if;
  update phase1.service_products set customer_price = round(p_customer_price, 2), agent_price = round(p_agent_price, 2), is_active = coalesce(p_active, true), low_stock_at = greatest(coalesce(p_low_stock_at, 5), 0), updated_at = now() where code = p_product;
  return found;
end $$;

-- Refund. 'wallet' puts the money in the buyer's DataYego wallet; 'manual' records money you sent yourself (or a Paystack refund done by the service-pay function).
create or replace function phase1.admin_service_refund(p_order uuid, p_method text, p_reference text default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; w phase1.wallets; v_back numeric; v_delivered boolean;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'master_required'; end if;
  select * into o from phase1.service_orders where id = p_order for update;
  if o.id is null or o.paid_at is null then raise exception 'order_not_paid'; end if;
  if o.status = 'refunded' then raise exception 'already_refunded'; end if;
  if p_method not in ('wallet','manual','paystack') then raise exception 'method_invalid'; end if;
  v_delivered := o.status = 'delivered';
  v_back := case when p_method = 'wallet' then o.amount else o.amount + o.fee_amount end;
  if p_method = 'wallet' then
    if o.user_id is null then raise exception 'no_wallet_for_guest'; end if;
    select * into w from phase1.wallets where user_id = o.user_id for update;
    if w.id is null then raise exception 'wallet_not_found'; end if;
    insert into phase1.wallet_ledger_entries (wallet_id, user_id, direction, type, amount, balance_before, balance_after, status, reference, note)
    values (w.id, w.user_id, 'credit', 'refund', v_back, w.balance, w.balance + v_back, 'posted', o.reference || ':refund', coalesce(p_reason, 'Refund'));
    update phase1.wallets set balance = balance + v_back, updated_at = now() where id = w.id;
  end if;
  -- PINs that were never shown go back on sale; ones the buyer has seen are written off.
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where order_id = o.id and status = 'reserved';
  update phase1.service_pins set status = 'void' where order_id = o.id and status = 'sold';
  perform phase1.finance_post('service_refunded', o.reference, now(), v_back,
    jsonb_build_array(jsonb_build_object('account', case when v_delivered then 'service_revenue' else 'services_owed' end, 'amount', o.amount),
                      jsonb_build_object('account','fee_income','amount', v_back - o.amount),
                      jsonb_build_object('account', case when p_method = 'wallet' then 'customer_wallets' when p_method = 'paystack' then 'paystack_transit' else 'bank' end, 'amount', -v_back)),
    'manual', null, coalesce(p_reason, 'Refund'), jsonb_build_object('order', o.id, 'method', p_method), auth.uid());
  if v_delivered and o.agent_id is not null and coalesce(o.agent_margin, 0) > 0 and exists (select 1 from phase1.agent_ledger_entries where agent_id = o.agent_id and reference = o.reference and type = 'sale') then
    perform phase1.agent_ledger_post(o.agent_id, 'debit', 'refund', o.agent_margin, o.reference, 'Service order refunded; margin taken back');
    perform phase1.finance_post('agent_margin_reversed', o.reference, now(), o.agent_margin,
      jsonb_build_array(jsonb_build_object('account','agent_margin','amount', -o.agent_margin), jsonb_build_object('account','owed_to_agents','amount', o.agent_margin)), 'auto', null, 'Agent margin reversed on refund', jsonb_build_object('agent_id', o.agent_id));
  end if;
  update phase1.service_orders set status = 'refunded', refunded_at = now(), refund_method = p_method, refund_reference = p_reference, refund_reason = p_reason, updated_at = now() where id = o.id;
  return jsonb_build_object('refunded', v_back, 'method', p_method);
end $$;

revoke all on function phase1.service_hold(uuid,text,int,int), phase1.service_alert_admins(text,text,text), phase1.service_fulfil(uuid), phase1.service_paid(uuid), phase1.service_payment_received(text,numeric),
  phase1.service_order_new(uuid,text,int,text,text,text,text), phase1.service_order_json(phase1.service_orders), phase1.service_checkout_start(uuid,text,int,text,text,text), phase1.service_checkout_abort(uuid),
  phase1.service_sweep(), phase1.service_outbox_claim(), phase1.service_outbox_done(uuid,text,text), phase1.service_stock_left(text) from public, anon, authenticated;
grant execute on function phase1.service_payment_received(text,numeric), phase1.service_checkout_start(uuid,text,int,text,text,text), phase1.service_checkout_abort(uuid), phase1.service_outbox_claim(), phase1.service_outbox_done(uuid,text,text) to service_role;
grant execute on function phase1.service_catalog(), phase1.service_order_view(uuid) to anon, authenticated, service_role;
revoke all on function phase1.service_buy_wallet(text,int,text,text), phase1.service_my_orders(), phase1.admin_services(), phase1.admin_service_add_stock(text,text,numeric,text,text), phase1.admin_service_set(text,numeric,numeric,boolean,int), phase1.admin_service_refund(uuid,text,text,text) from public, anon;
grant execute on function phase1.service_buy_wallet(text,int,text,text), phase1.service_my_orders(), phase1.admin_services(), phase1.admin_service_add_stock(text,text,numeric,text,text), phase1.admin_service_set(text,numeric,numeric,boolean,int), phase1.admin_service_refund(uuid,text,text,text) to authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'service-pay';
select cron.schedule('service-pay', '*/2 * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay',body:='{"action":"run"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=60000) where exists (select 1 from phase1.service_orders where (paid_at is null and pay_reference is not null and created_at > now() - interval '3 hours') or status = 'awaiting_payment') or exists (select 1 from phase1.service_outbox where status = 'pending')$job$);

-- Later the same day (applied live): admin_service_add_stock first picks out every "Serial Number: X ... PIN: Y" pair from
-- whatever is pasted (a whole voucher page), and only falls back to one-per-line when it finds none.

-- SMS senders (applied live 12 Nov): sms_settings gains services_enabled/services_sender (Dyservice) and
-- agents_enabled/agents_sender (Dyagents) + agent_approved_text; sender_id (verification) is now Dyverify.
-- phase1.sms_queue holds one-off texts (agent approved, via trigger zz_agent_approved_sms_trg on agent_applications),
-- drained by service-pay's run. service_info() tells the site whether PINs are also sent by SMS.
-- admin_sms_senders() / admin_sms_senders_save() back the SMS panel on /admin/services. Both switches start off.
