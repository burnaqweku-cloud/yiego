-- DY Services: MTN AFA registration (13 Nov 2026).
-- An AFA order is a paid form, not a PIN: once paid it is 'processing' with one row in service_registrations.
-- That row is registered once (by the supplier link, or by the owner by hand) and the order becomes 'delivered'.
-- One number can only be in progress or registered once, so a number is never paid for and sent twice.
-- The product starts hidden (is_active = false) until the owner switches it on.

alter table phase1.service_orders drop constraint if exists service_orders_status_check;
alter table phase1.service_orders add constraint service_orders_status_check
  check (status in ('awaiting_payment','paid_waiting_stock','processing','delivered','refunded','cancelled','expired'));

create table if not exists phase1.service_registrations (
  order_id uuid primary key references phase1.service_orders(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sending','submitted','unclear','rejected','done','cancelled')),
  supplier text, supplier_reference text, cost numeric(12,2), attempts int not null default 0, last_reply jsonb, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz, done_at timestamptz);
alter table phase1.service_registrations enable row level security;
create index if not exists service_orders_afa_phone_idx on phase1.service_orders ((details->>'afa_phone')) where details ? 'afa_phone';

insert into phase1.service_products (code, kind, name, blurb, customer_price, agent_price, is_active, sort_order, low_stock_at)
values ('afa-mtn','afa','MTN AFA Registration','Put an MTN number on AFA for cheaper calls.',12,11,false,30,0)
on conflict (code) do nothing;

-- Checks and tidies the AFA form. Raises a named error for the first thing that is wrong.
create or replace function phase1.service_afa_details(p jsonb) returns jsonb language plpgsql stable as $$
declare v_name text := regexp_replace(trim(coalesce(p->>'full_name', '')), '\s+', ' ', 'g');
  v_phone text := phase1.service_norm_phone(p->>'afa_phone');
  v_card text := upper(regexp_replace(coalesce(p->>'ghana_card', ''), '[^A-Za-z0-9]', '', 'g'));
  v_dob date; v_job text := regexp_replace(trim(coalesce(p->>'occupation', '')), '\s+', ' ', 'g');
  v_region text := trim(coalesce(p->>'region', '')); v_address text := regexp_replace(trim(coalesce(p->>'address', '')), '\s+', ' ', 'g');
begin
  if length(v_name) < 5 or length(v_name) > 80 or v_name !~ '^[A-Za-z][A-Za-z .''-]+ [A-Za-z .''-]+$' then raise exception 'afa_name_invalid'; end if;
  if v_phone is null or v_phone !~ '^0(24|25|53|54|55|59)' then raise exception 'afa_phone_invalid'; end if;
  if v_card !~ '^GHA[0-9]{10}$' then raise exception 'afa_card_invalid'; end if;
  v_card := 'GHA-' || substr(v_card, 4, 9) || '-' || substr(v_card, 13, 1);
  begin v_dob := (p->>'dob')::date; exception when others then raise exception 'afa_dob_invalid'; end;
  if v_dob is null or v_dob < date '1900-01-01' or v_dob > (current_date - interval '16 years') then raise exception 'afa_dob_invalid'; end if;
  if length(v_job) < 2 or length(v_job) > 60 then raise exception 'afa_job_invalid'; end if;
  if v_region not in ('Ahafo','Ashanti','Bono','Bono East','Central','Eastern','Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North') then raise exception 'afa_region_invalid'; end if;
  if length(v_address) < 5 or length(v_address) > 200 then raise exception 'afa_address_invalid'; end if;
  return jsonb_build_object('full_name', v_name, 'afa_phone', v_phone, 'ghana_card', v_card, 'dob', to_char(v_dob, 'YYYY-MM-DD'), 'occupation', v_job, 'region', v_region, 'address', v_address);
end $$;

-- True when this number already has a paid AFA order that is in progress or done (other than p_except).
create or replace function phase1.service_afa_taken(p_phone text, p_except uuid default null) returns boolean language sql stable security definer set search_path = phase1, public as $$
  select exists (select 1 from phase1.service_orders o join phase1.service_products p on p.code = o.product_code
    where p.kind = 'afa' and o.details->>'afa_phone' = p_phone and o.paid_at is not null and o.status in ('processing','delivered') and o.id is distinct from p_except) $$;

-- New order (not yet paid). Checkers get their PINs put on hold; AFA gets its form checked and stored.
drop function if exists phase1.service_order_new(uuid,text,int,text,text,text,text);
create or replace function phase1.service_order_new(p_user uuid, p_product text, p_qty int, p_phone text, p_email text, p_method text, p_device text, p_details jsonb default null)
returns phase1.service_orders language plpgsql security definer set search_path = phase1, public as $$
declare p phase1.service_products; o phase1.service_orders; v_phone text := phase1.service_norm_phone(p_phone); v_fee numeric; v_details jsonb := '{}'::jsonb;
begin
  select * into p from phase1.service_products where code = p_product and is_active;
  if p.code is null then raise exception 'service_unavailable'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'quantity_invalid'; end if;
  if p.kind = 'afa' then
    if p_qty <> 1 then raise exception 'quantity_invalid'; end if;
    v_details := phase1.service_afa_details(coalesce(p_details, '{}'::jsonb));
    if phase1.service_afa_taken(v_details->>'afa_phone') then raise exception 'afa_already_registered'; end if;
    v_phone := coalesce(v_phone, v_details->>'afa_phone');
  end if;
  if v_phone is null then raise exception 'phone_invalid'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'email_invalid'; end if;
  v_fee := case when p_method = 'paystack' then round(p.customer_price * p_qty * 0.04, 2) else 0 end;
  -- One open hold per phone or device: starting again lets go of the PINs held for an earlier unpaid try (that order still delivers if it is paid).
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where status = 'reserved' and order_id in (
    select x.id from phase1.service_orders x where x.paid_at is null and x.status = 'awaiting_payment' and (x.phone = v_phone or (p_device is not null and x.device_id = left(p_device, 80))));
  insert into phase1.service_orders (reference, product_code, quantity, unit_price, amount, fee_amount, user_id, guest_email, phone, device_id, payment_method, details)
  values ('SV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p.code, p_qty, p.customer_price, p.customer_price * p_qty, v_fee,
          p_user, nullif(lower(trim(coalesce(p_email, ''))), ''), v_phone, left(p_device, 80), p_method, v_details)
  returning * into o;
  -- Not enough in stock is not a refusal: the order is taken, waits as 'paid_waiting_stock' once paid, and delivers by itself when stock is added.
  if p.kind = 'checker' then perform phase1.service_hold(o.id, p.code, p_qty, 20); end if;
  return o;
end $$;

-- Gives a paid order what was bought. Checkers: the PINs. AFA: a place in the registration queue. Safe to call any number of times.
create or replace function phase1.service_fulfil(p_order uuid) returns text language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; p phase1.service_products; v_have int; v_cost numeric; v_left int; v_takeover boolean; v_dupe boolean;
begin
  select * into o from phase1.service_orders where id = p_order for update;
  if o.id is null or o.paid_at is null or o.status not in ('awaiting_payment','paid_waiting_stock','expired','cancelled') then return coalesce(o.status, 'missing'); end if;
  select * into p from phase1.service_products where code = o.product_code;
  if p.kind = 'afa' then
    -- Two people (or one person twice) can pay for the same number at the same moment: only the first is registered.
    perform pg_advisory_xact_lock(hashtext('afa:' || coalesce(o.details->>'afa_phone', o.id::text)));
    v_dupe := phase1.service_afa_taken(o.details->>'afa_phone', o.id);
    update phase1.service_orders set status = 'processing', updated_at = now() where id = o.id;
    insert into phase1.service_registrations (order_id, status, note) values (o.id, case when v_dupe then 'rejected' else 'queued' end, case when v_dupe then 'This number already has a paid AFA order. Refund this one.' end) on conflict do nothing;
    if v_dupe then perform phase1.service_alert_admins('afa-dupe:' || o.reference, 'AFA paid twice for one number', o.reference || ': ' || (o.details->>'afa_phone') || ' already has a paid AFA order. It was not sent again. Refund it.'); end if;
    begin
      perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
        headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
    exception when others then null; end;
    return 'processing';
  end if;
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

-- The registration went through: the order is done. p_cost is what was actually charged for it, p_account where that money came from.
create or replace function phase1.service_registration_done(p_order uuid, p_cost numeric, p_account text, p_supplier text default null, p_supplier_reference text default null, p_actor uuid default null) returns text
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; p phase1.service_products; v_takeover boolean; v_cost numeric := round(coalesce(p_cost, 0), 2);
begin
  select * into o from phase1.service_orders where id = p_order for update;
  if o.id is null then return 'missing'; end if;
  if o.status <> 'processing' then return o.status; end if;
  if v_cost < 0 then raise exception 'cost_invalid'; end if;
  if not exists (select 1 from phase1.finance_accounts where code = p_account and kind in ('asset','funding')) then raise exception 'paid_from_invalid'; end if;
  select * into p from phase1.service_products where code = o.product_code;
  update phase1.service_orders set status = 'delivered', delivered_at = now(), cost_amount = v_cost, updated_at = now() where id = o.id;
  update phase1.service_registrations set status = 'done', cost = v_cost, supplier = coalesce(p_supplier, supplier), supplier_reference = coalesce(p_supplier_reference, supplier_reference), done_at = now(), updated_at = now() where order_id = o.id;
  perform phase1.finance_post('service_delivered', o.reference, now(), o.amount,
    jsonb_build_array(jsonb_build_object('account','services_owed','amount', o.amount), jsonb_build_object('account','service_revenue','amount', -o.amount),
                      jsonb_build_object('account','cost_of_services','amount', v_cost), jsonb_build_object('account', p_account, 'amount', -v_cost)),
    case when p_actor is null then 'auto' else 'manual' end, null, p.name, jsonb_build_object('order', o.id, 'cost', v_cost, 'paid_from', p_account), p_actor);
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
  return 'delivered';
end $$;

-- Owner: "I registered this one myself". Cost is what you were charged; paid from the bank, your own money or Kora.
create or replace function phase1.admin_service_registration_done(p_order uuid, p_cost numeric, p_paid_from text, p_note text default null) returns text
language plpgsql security definer set search_path = phase1, public as $$
declare r phase1.service_registrations;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'master_required'; end if;
  if p_paid_from not in ('bank','outside_funding','kora_held') then raise exception 'paid_from_invalid'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'cost_invalid'; end if;
  select * into r from phase1.service_registrations where order_id = p_order for update;
  if r.order_id is null then raise exception 'not_a_registration'; end if;
  -- While the supplier link is in the middle of sending it, wait: marking it by hand now could mean paying for it twice.
  if r.status = 'sending' and r.updated_at > now() - interval '10 minutes' then raise exception 'registration_sending'; end if;
  update phase1.service_registrations set note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note), supplier = coalesce(supplier, 'manual'), updated_at = now() where order_id = p_order;
  return phase1.service_registration_done(p_order, p_cost, p_paid_from, null, null, auth.uid());
end $$;

-- What the buyer sees of an order: PINs only once delivered; for AFA only the name and number (never the ID card).
create or replace function phase1.service_order_json(o phase1.service_orders) returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object('reference', o.reference, 'token', o.token, 'product', o.product_code, 'kind', p.kind, 'name', p.name, 'quantity', o.quantity, 'amount', o.amount, 'fee', o.fee_amount,
    'phone', o.phone, 'status', o.status, 'paid', o.paid_at is not null, 'method', o.payment_method, 'created_at', o.created_at, 'delivered_at', o.delivered_at,
    'afa', case when p.kind = 'afa' then jsonb_build_object('name', o.details->>'full_name', 'phone', o.details->>'afa_phone') end,
    'pins', case when o.status = 'delivered' then coalesce((select jsonb_agg(jsonb_build_object('serial', s.serial, 'pin', s.pin) order by s.created_at, s.id) from phase1.service_pins s where s.order_id = o.id and s.status = 'sold'), '[]'::jsonb) else '[]'::jsonb end)
  from phase1.service_products p where p.code = o.product_code $$;

drop function if exists phase1.service_buy_wallet(text,int,text,text);
create or replace function phase1.service_buy_wallet(p_product text, p_qty int, p_phone text, p_device text default null, p_details jsonb default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; w phase1.wallets; v_entry uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  o := phase1.service_order_new(auth.uid(), p_product, p_qty, p_phone, null, 'wallet', p_device, p_details);
  select * into w from phase1.wallets where user_id = auth.uid() for update;
  if w.id is null or w.balance < o.amount then raise exception 'insufficient_balance'; end if;
  insert into phase1.wallet_ledger_entries (wallet_id, user_id, direction, type, amount, balance_before, balance_after, status, reference, note)
  values (w.id, w.user_id, 'debit', 'purchase', o.amount, w.balance, w.balance - o.amount, 'posted', o.reference, case when o.quantity > 1 then o.quantity || ' x ' else '' end || (select name from phase1.service_products where code = o.product_code))
  returning id into v_entry;
  update phase1.wallets set balance = balance - o.amount, updated_at = now() where id = w.id;
  update phase1.service_orders set wallet_ledger_entry_id = v_entry where id = o.id;
  perform phase1.service_paid(o.id);
  select * into o from phase1.service_orders where id = o.id;
  return phase1.service_order_json(o);
end $$;

drop function if exists phase1.service_checkout_start(uuid,text,int,text,text,text);
create or replace function phase1.service_checkout_start(p_user uuid, p_product text, p_qty int, p_phone text, p_email text, p_device text, p_details jsonb default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; v_ref text := 'SVPAY-' || replace(gen_random_uuid()::text, '-', '');
begin
  o := phase1.service_order_new(p_user, p_product, p_qty, p_phone, p_email, 'paystack', p_device, p_details);
  update phase1.service_orders set pay_reference = v_ref where id = o.id;
  return jsonb_build_object('id', o.id, 'reference', o.reference, 'token', o.token, 'pay_reference', v_ref, 'total', o.amount + o.fee_amount, 'amount', o.amount, 'fee', o.fee_amount, 'phone', o.phone,
    'email', coalesce(o.guest_email, (select email from auth.users where id = p_user)), 'name', (select name from phase1.service_products where code = o.product_code));
end $$;

-- Public: what is on sale. AFA needs no stock.
create or replace function phase1.service_catalog() returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'price', p.customer_price, 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0,
    'left', phase1.service_stock_left(p.code)) order by p.sort_order), '[]'::jsonb)
  from phase1.service_products p where p.is_active $$;

-- Admin page data, now with the AFA registrations (form details are for admins only).
create or replace function phase1.admin_services() returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare today timestamptz := date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return jsonb_build_object(
    'can_edit', phase1.caller_is_admin(null, true),
    'products', (select jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'customer_price', p.customer_price, 'agent_price', p.agent_price, 'is_active', p.is_active, 'low_stock_at', p.low_stock_at,
        'left', phase1.service_stock_left(p.code), 'held', (select count(*) from phase1.service_pins s where s.product_code = p.code and s.status = 'reserved' and s.reserved_until >= now()),
        'stock_value', (select round(coalesce(sum(cost), 0), 2) from phase1.service_pins s where s.product_code = p.code and s.status in ('available','reserved')),
        'sold', (select coalesce(sum(o.quantity), 0) from phase1.service_orders o where o.product_code = p.code and o.status = 'delivered'),
        'sold_today', (select coalesce(sum(o.quantity), 0) from phase1.service_orders o where o.product_code = p.code and o.status = 'delivered' and o.delivered_at >= today)) order by p.sort_order) from phase1.service_products p),
    'totals', (select jsonb_build_object('sales', coalesce(sum(amount), 0), 'cost', coalesce(sum(cost_amount), 0), 'margins', coalesce(sum(case when agent_self then 0 else coalesce(agent_margin, 0) end), 0), 'orders', count(*),
        'sales_today', coalesce(sum(amount) filter (where delivered_at >= today), 0), 'profit_today', coalesce(sum(amount - coalesce(cost_amount, 0) - case when agent_self then 0 else coalesce(agent_margin, 0) end) filter (where delivered_at >= today), 0))
      from phase1.service_orders where status = 'delivered'),
    'waiting', (select count(*) from phase1.service_orders where status = 'paid_waiting_stock'),
    'registering', (select count(*) from phase1.service_orders where status = 'processing'),
    'orders', coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id, o.reference, p.name, p.kind, o.quantity, o.amount, o.fee_amount, o.cost_amount, o.phone, o.status, o.payment_method, o.agent_id, o.agent_margin, o.created_at, o.paid_at, o.delivered_at,
        (select b.sms || ' / ' || coalesce(b.email, '-') from phase1.service_outbox b where b.order_id = o.id) as sent
        from phase1.service_orders o join phase1.service_products p on p.code = o.product_code where o.paid_at is not null order by o.paid_at desc limit 60) x), '[]'::jsonb),
    'registrations', coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id, o.reference, o.status, o.amount, o.fee_amount, o.cost_amount, o.phone, o.payment_method, o.paid_at, o.delivered_at, o.details,
        r.status as step, r.note, r.supplier, r.supplier_reference, r.updated_at as step_at
        from phase1.service_orders o join phase1.service_registrations r on r.order_id = o.id where o.paid_at is not null
        order by (o.status = 'processing') desc, o.paid_at desc limit 60) x), '[]'::jsonb),
    'batches', coalesce((select jsonb_agg(to_jsonb(x)) from (select b.id, p.name, b.quantity, b.total_cost, b.paid_from, b.note, b.created_at from phase1.service_stock_batches b join phase1.service_products p on p.code = b.product_code order by b.created_at desc limit 20) x), '[]'::jsonb));
end $$;

-- Refund. 'wallet' puts the money in the buyer's DataYego wallet; 'manual' records money you sent yourself (or a Paystack refund done by the service-pay function).
create or replace function phase1.admin_service_refund(p_order uuid, p_method text, p_reference text default null, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; w phase1.wallets; v_back numeric; v_delivered boolean; r phase1.service_registrations;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'master_required'; end if;
  select * into o from phase1.service_orders where id = p_order for update;
  if o.id is null or o.paid_at is null then raise exception 'order_not_paid'; end if;
  if o.status = 'refunded' then raise exception 'already_refunded'; end if;
  if p_method not in ('wallet','manual','paystack') then raise exception 'method_invalid'; end if;
  select * into r from phase1.service_registrations where order_id = o.id for update;
  -- An AFA form that is being sent right now cannot be refunded until we know how that went.
  if r.order_id is not null and r.status = 'sending' and r.updated_at > now() - interval '10 minutes' then raise exception 'registration_sending'; end if;
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
  update phase1.service_registrations set status = 'cancelled', updated_at = now() where order_id = o.id and status <> 'done';
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

revoke all on function phase1.service_afa_details(jsonb), phase1.service_afa_taken(text,uuid), phase1.service_order_new(uuid,text,int,text,text,text,text,jsonb),
  phase1.service_registration_done(uuid,numeric,text,text,text,uuid), phase1.service_checkout_start(uuid,text,int,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function phase1.service_checkout_start(uuid,text,int,text,text,text,jsonb), phase1.service_registration_done(uuid,numeric,text,text,text,uuid) to service_role;
revoke all on function phase1.service_buy_wallet(text,int,text,text,jsonb), phase1.admin_service_registration_done(uuid,numeric,text,text) from public, anon;
grant execute on function phase1.service_buy_wallet(text,int,text,text,jsonb), phase1.admin_service_registration_done(uuid,numeric,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------
-- Supplier link: OtessData (POST /api/v1/afa/register). The service-pay function sends each queued form once,
-- with the order reference as its Idempotency-Key, and reports back here. The cost is the amount OtessData
-- says it charged (never a stored price) and comes out of the OtessData wallet (float_otessdata).
-- The supplier row is 'paused' on purpose: it shows in Finance and top-ups but is never offered for data orders.
alter table phase1.service_registrations add column if not exists key_no int not null default 0;
alter table phase1.service_registrations add column if not exists alerted_at timestamptz;

insert into phase1.suppliers (code, name, base_url, status, display_order, is_customer_visible, low_balance_threshold, metadata)
select 'otessdata', 'OtessData', 'https://www.otessdata.app/api/v1', 'paused', 30, false, 50, jsonb_build_object('notes', 'MTN AFA registration only (DY Services). Added 2026-11-13.', 'topup_fee_rate', 0)
where not exists (select 1 from phase1.suppliers where code = 'otessdata');
insert into phase1.finance_accounts (code, name, kind, supplier_id, sort_order)
select 'float_otessdata', 'Supplier float · OtessData', 'asset', (select id from phase1.suppliers where code = 'otessdata'), 25
where not exists (select 1 from phase1.finance_accounts where code = 'float_otessdata');

-- What the sender should send now. p_auto = false (no API key yet): nothing is handed out, the admins are told once per order instead.
create or replace function phase1.service_registration_claim(p_auto boolean) returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v jsonb; r record;
begin
  -- A send that never reported back is not retried by itself: it may have gone through.
  for r in update phase1.service_registrations x set status = 'unclear', note = 'We sent this and got no answer. Check it on OtessData before trying again.', updated_at = now()
           where x.status = 'sending' and x.updated_at < now() - interval '10 minutes' returning x.order_id loop
    perform phase1.service_alert_admins('afa-unclear:' || r.order_id, 'AFA registration needs checking', 'One registration was sent but we got no answer. Open DY Services to check it.');
  end loop;
  if not coalesce(p_auto, false) then
    for r in update phase1.service_registrations x set alerted_at = now() from phase1.service_orders o
             where o.id = x.order_id and x.status = 'queued' and x.alerted_at is null and o.status = 'processing' returning o.reference, o.details loop
      perform phase1.service_alert_admins('afa-new:' || r.reference, 'New AFA registration', (r.details->>'full_name') || ', ' || (r.details->>'afa_phone') || ' (' || r.reference || ') is paid and waiting to be registered.');
    end loop;
    return '[]'::jsonb;
  end if;
  with picked as (
    update phase1.service_registrations x set status = 'sending', attempts = x.attempts + 1, supplier = 'otessdata', updated_at = now()
    where x.order_id in (select q.order_id from phase1.service_registrations q join phase1.service_orders o on o.id = q.order_id
                         where q.status = 'queued' and o.status = 'processing' and (q.attempts = 0 or q.updated_at < now() - interval '15 minutes')
                         order by q.created_at limit 10 for update of q skip locked)
    returning x.order_id, x.key_no)
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'reference', o.reference, 'key', o.reference || case when picked.key_no > 0 then '-' || picked.key_no else '' end, 'details', o.details)), '[]'::jsonb) into v
  from picked join phase1.service_orders o on o.id = picked.order_id;
  return v;
end $$;

-- How a send went. 'done' = registered and charged p_cost; 'rejected' = refused, nothing charged; 'no_funds' = our OtessData wallet is short (stays queued);
-- 'submitted' = accepted but not finished yet; 'unclear' = no clear answer, a person must check.
create or replace function phase1.service_registration_result(p_order uuid, p_outcome text, p_cost numeric default null, p_supplier_reference text default null, p_note text default null, p_reply jsonb default null, p_balance numeric default null)
returns text language plpgsql security definer set search_path = phase1, public as $$
declare r phase1.service_registrations; o phase1.service_orders; v_note text := left(nullif(trim(coalesce(p_note, '')), ''), 300);
begin
  select * into r from phase1.service_registrations where order_id = p_order for update;
  if r.order_id is null then return 'missing'; end if;
  if r.status not in ('sending','submitted') then return r.status; end if;
  select * into o from phase1.service_orders where id = p_order;
  update phase1.service_registrations set last_reply = coalesce(p_reply, last_reply), supplier_reference = coalesce(p_supplier_reference, supplier_reference), updated_at = now() where order_id = p_order;
  if p_balance is not null then perform phase1.finance_note_supplier_balance('otessdata', p_balance, now(), 'afa_register', null, false); end if;
  if p_outcome = 'done' then
    if p_cost is null or p_cost <= 0 then
      update phase1.service_registrations set status = 'unclear', note = 'Registered, but OtessData did not say what it charged. Check it and mark it done with the cost.' where order_id = p_order;
      perform phase1.service_alert_admins('afa-cost:' || o.reference, 'AFA registered, cost missing', o.reference || ' went through but the charge was not in the reply. Open DY Services to finish it.');
      return 'unclear';
    end if;
    update phase1.service_registrations set submitted_at = coalesce(submitted_at, now()), note = null where order_id = p_order;
    return phase1.service_registration_done(p_order, p_cost, 'float_otessdata', 'otessdata', p_supplier_reference, null);
  elsif p_outcome = 'no_funds' then
    update phase1.service_registrations set status = 'queued', note = coalesce(v_note, 'The OtessData wallet is too low. Top it up and this goes by itself.') where order_id = p_order;
    perform phase1.service_alert_admins('afa-funds:' || to_char(now(), 'YYYYMMDDHH24'), 'AFA registrations are waiting', coalesce(v_note, 'The OtessData wallet is too low. Top it up and they go by themselves.'));
    return 'queued';
  elsif p_outcome = 'submitted' then
    update phase1.service_registrations set status = 'submitted', submitted_at = coalesce(submitted_at, now()), note = coalesce(v_note, 'Sent. Waiting for OtessData to finish it.') where order_id = p_order;
    return 'submitted';
  elsif p_outcome = 'rejected' then
    update phase1.service_registrations set status = 'rejected', note = coalesce(v_note, 'OtessData refused this registration. Nothing was charged.') where order_id = p_order;
    perform phase1.service_alert_admins('afa-rejected:' || o.reference, 'AFA registration refused', o.reference || ': ' || coalesce(v_note, 'OtessData refused it') || '. Try again or refund the buyer.');
    return 'rejected';
  end if;
  update phase1.service_registrations set status = 'unclear', note = coalesce(v_note, 'No clear answer from OtessData. Check it there before trying again.') where order_id = p_order;
  perform phase1.service_alert_admins('afa-unclear:' || o.reference, 'AFA registration needs checking', o.reference || ' was sent but the answer was not clear. Check it on OtessData.');
  return 'unclear';
end $$;

-- Owner: send it again. After a clear refusal it goes as a fresh request; after an unclear answer it reuses the same key, so OtessData can't charge twice.
create or replace function phase1.admin_service_registration_retry(p_order uuid) returns text language plpgsql security definer set search_path = phase1, public as $$
declare r phase1.service_registrations;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'master_required'; end if;
  select * into r from phase1.service_registrations where order_id = p_order for update;
  if r.order_id is null then raise exception 'not_a_registration'; end if;
  if r.status not in ('rejected','unclear') or not exists (select 1 from phase1.service_orders where id = p_order and status = 'processing') then return r.status; end if;
  if phase1.service_afa_taken((select details->>'afa_phone' from phase1.service_orders where id = p_order), p_order) then raise exception 'afa_already_registered'; end if;
  update phase1.service_registrations set status = 'queued', attempts = 0, key_no = key_no + case when r.status = 'rejected' then 1 else 0 end, note = null, updated_at = now() where order_id = p_order;
  begin
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  exception when others then null; end;
  return 'queued';
end $$;

revoke all on function phase1.service_registration_claim(boolean), phase1.service_registration_result(uuid,text,numeric,text,text,jsonb,numeric) from public, anon, authenticated;
grant execute on function phase1.service_registration_claim(boolean), phase1.service_registration_result(uuid,text,numeric,text,text,jsonb,numeric) to service_role;
revoke all on function phase1.admin_service_registration_retry(uuid) from public, anon;
grant execute on function phase1.admin_service_registration_retry(uuid) to authenticated, service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'service-pay';
select cron.schedule('service-pay', '*/2 * * * *', $job$select net.http_post(url:='https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay',body:='{"action":"run"}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')),timeout_milliseconds:=60000) where exists (select 1 from phase1.service_orders where (paid_at is null and pay_reference is not null and created_at > now() - interval '3 hours') or status = 'awaiting_payment') or exists (select 1 from phase1.service_outbox where status = 'pending') or exists (select 1 from phase1.sms_queue where status = 'pending') or exists (select 1 from phase1.service_registrations where status in ('queued','sending'))$job$);
