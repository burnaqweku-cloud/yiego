-- DY Services for agents (13 Nov 2026).
-- An agent chooses which services their store sells and at what price (never below our agent price).
-- A store order carries the agent and the margin (their price minus the agent price); the margin is credited
-- when the order is delivered, by the code that already delivers service orders. An agent buying for
-- themselves from the dashboard pays the agent price from their wallet and earns no margin.
-- Sub-agents pay the same agent price as everyone else here: there is no parent share on services.

create table if not exists phase1.agent_service_prices (
  agent_id uuid not null references phase1.agents(id) on delete cascade,
  product_code text not null references phase1.service_products(code),
  price numeric(10,2) not null check (price > 0), enabled boolean not null default false,
  updated_at timestamptz not null default now(), primary key (agent_id, product_code));
alter table phase1.agent_service_prices enable row level security;
create index if not exists service_orders_agent_idx on phase1.service_orders (agent_id, created_at desc) where agent_id is not null;

-- Where a store lives: its own domain when connected, otherwise its DataYego address.
create or replace function phase1.service_store_site(p_agent uuid) returns text language sql stable security definer set search_path = phase1, public as $$
  select case when custom_domain_status = 'active' and custom_domain is not null then 'https://' || custom_domain else 'https://' || slug || '.datayego.com' end from phase1.agents where id = p_agent $$;

-- The agent dashboard: every service, what we charge the agent, what they charge, whether their store sells it, and their recent sales.
create or replace function phase1.agent_services() returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare a phase1.agents;
begin
  select * into a from phase1.agents where user_id = auth.uid();
  if a.id is null then raise exception 'not_an_agent'; end if;
  return jsonb_build_object(
    'active', a.status = 'active',
    'products', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'agent_price', p.agent_price, 'customer_price', p.customer_price,
        'price', greatest(coalesce(s.price, p.customer_price), p.agent_price), 'enabled', coalesce(s.enabled, false), 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0) order by p.sort_order)
      from phase1.service_products p left join phase1.agent_service_prices s on s.product_code = p.code and s.agent_id = a.id where p.is_active), '[]'::jsonb),
    'earned', (select coalesce(sum(agent_margin), 0) from phase1.service_orders where agent_id = a.id and not agent_self and status = 'delivered'),
    'sales', coalesce((select jsonb_agg(to_jsonb(x)) from (select o.reference, p.name, o.quantity, o.amount, o.agent_margin as margin, o.agent_self as self, o.status, coalesce(o.paid_at, o.created_at) as at,
        left(o.phone, 3) || '****' || right(o.phone, 3) as phone
        from phase1.service_orders o join phase1.service_products p on p.code = o.product_code where o.agent_id = a.id and o.paid_at is not null order by o.paid_at desc limit 30) x), '[]'::jsonb));
end $$;

create or replace function phase1.agent_service_set(p_product text, p_price numeric, p_enabled boolean) returns boolean language plpgsql security definer set search_path = phase1, public as $$
declare v_agent uuid; p phase1.service_products;
begin
  select id into v_agent from phase1.agents where user_id = auth.uid();
  if v_agent is null then raise exception 'not_an_agent'; end if;
  select * into p from phase1.service_products where code = p_product and is_active;
  if p.code is null then raise exception 'service_unavailable'; end if;
  if p_price is null or p_price < p.agent_price then raise exception 'below_agent_price:%', p.agent_price; end if;
  if p_price > p.customer_price * 5 then raise exception 'price_too_high'; end if;
  insert into phase1.agent_service_prices (agent_id, product_code, price, enabled) values (v_agent, p.code, round(p_price, 2), coalesce(p_enabled, false))
  on conflict (agent_id, product_code) do update set price = excluded.price, enabled = excluded.enabled, updated_at = now();
  return true;
end $$;

-- Public: what is on sale. With a store, only what that store sells, at its prices.
drop function if exists phase1.service_catalog();
create or replace function phase1.service_catalog(p_store text default null) returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select case when p_store is null or p_store = '' then
    (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'price', p.customer_price, 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0,
      'left', phase1.service_stock_left(p.code)) order by p.sort_order), '[]'::jsonb) from phase1.service_products p where p.is_active)
  else
    (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'price', greatest(s.price, p.agent_price), 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0,
      'left', phase1.service_stock_left(p.code)) order by p.sort_order), '[]'::jsonb)
     from phase1.agents a join phase1.agent_service_prices s on s.agent_id = a.id and s.enabled join phase1.service_products p on p.code = s.product_code and p.is_active
     where a.slug = p_store and a.status = 'active')
  end $$;

-- New order (not yet paid). p_store = bought in that agent's store at the store's price; p_as_agent = the agent buying for themselves at the agent price.
drop function if exists phase1.service_order_new(uuid,text,int,text,text,text,text,jsonb);
create or replace function phase1.service_order_new(p_user uuid, p_product text, p_qty int, p_phone text, p_email text, p_method text, p_device text, p_details jsonb default null, p_store text default null, p_as_agent boolean default false)
returns phase1.service_orders language plpgsql security definer set search_path = phase1, public as $$
declare p phase1.service_products; o phase1.service_orders; v_phone text := phase1.service_norm_phone(p_phone); v_fee numeric; v_details jsonb := '{}'::jsonb;
  v_unit numeric; v_agent uuid; v_margin numeric; v_self boolean := false; v_store_price numeric;
begin
  select * into p from phase1.service_products where code = p_product and is_active;
  if p.code is null then raise exception 'service_unavailable'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'quantity_invalid'; end if;
  v_unit := p.customer_price;
  if p_store is not null and p_store <> '' then
    select a.id, greatest(s.price, p.agent_price) into v_agent, v_store_price from phase1.agents a join phase1.agent_service_prices s on s.agent_id = a.id and s.product_code = p.code and s.enabled
      where a.slug = p_store and a.status = 'active';
    if v_agent is null then raise exception 'service_unavailable'; end if;
    v_unit := v_store_price; v_margin := round((v_unit - p.agent_price) * p_qty, 2);
  elsif coalesce(p_as_agent, false) then
    select id into v_agent from phase1.agents where user_id = p_user and status = 'active';
    if v_agent is null or p_user is null then raise exception 'not_an_agent'; end if;
    v_unit := p.agent_price; v_margin := 0; v_self := true;
  end if;
  if p.kind = 'afa' then
    if p_qty <> 1 then raise exception 'quantity_invalid'; end if;
    v_details := phase1.service_afa_details(coalesce(p_details, '{}'::jsonb));
    if phase1.service_afa_taken(v_details->>'afa_phone') then raise exception 'afa_already_registered'; end if;
    v_phone := coalesce(v_phone, v_details->>'afa_phone');
  end if;
  if v_phone is null then raise exception 'phone_invalid'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'email_invalid'; end if;
  v_fee := case when p_method = 'paystack' then round(v_unit * p_qty * 0.04, 2) else 0 end;
  -- One open hold per phone or device: starting again lets go of the PINs held for an earlier unpaid try (that order still delivers if it is paid).
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where status = 'reserved' and order_id in (
    select x.id from phase1.service_orders x where x.paid_at is null and x.status = 'awaiting_payment' and (x.phone = v_phone or (p_device is not null and x.device_id = left(p_device, 80))));
  insert into phase1.service_orders (reference, product_code, quantity, unit_price, amount, fee_amount, user_id, guest_email, phone, device_id, payment_method, details, agent_id, agent_price, agent_margin, agent_self)
  values ('SV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p.code, p_qty, v_unit, v_unit * p_qty, v_fee,
          p_user, nullif(lower(trim(coalesce(p_email, ''))), ''), v_phone, left(p_device, 80), p_method, v_details, v_agent, case when v_agent is not null then p.agent_price end, v_margin, v_self)
  returning * into o;
  -- Not enough in stock is not a refusal: the order is taken, waits as 'paid_waiting_stock' once paid, and delivers by itself when stock is added.
  if p.kind = 'checker' then perform phase1.service_hold(o.id, p.code, p_qty, 20); end if;
  return o;
end $$;

-- What the buyer sees of an order. A store order also says which store it is from, so the email and the page carry the store's name.
create or replace function phase1.service_order_json(o phase1.service_orders) returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object('reference', o.reference, 'token', o.token, 'product', o.product_code, 'kind', p.kind, 'name', p.name, 'quantity', o.quantity, 'amount', o.amount, 'fee', o.fee_amount,
    'phone', o.phone, 'status', o.status, 'paid', o.paid_at is not null, 'method', o.payment_method, 'created_at', o.created_at, 'delivered_at', o.delivered_at,
    'afa', case when p.kind = 'afa' then jsonb_build_object('name', o.details->>'full_name', 'phone', o.details->>'afa_phone') end,
    'store', case when o.agent_id is not null and not o.agent_self then (select jsonb_build_object('name', a.store_name, 'site', phase1.service_store_site(a.id)) from phase1.agents a where a.id = o.agent_id) end,
    'pins', case when o.status = 'delivered' then coalesce((select jsonb_agg(jsonb_build_object('serial', s.serial, 'pin', s.pin) order by s.created_at, s.id) from phase1.service_pins s where s.order_id = o.id and s.status = 'sold'), '[]'::jsonb) else '[]'::jsonb end)
  from phase1.service_products p where p.code = o.product_code $$;

drop function if exists phase1.service_buy_wallet(text,int,text,text,jsonb);
create or replace function phase1.service_buy_wallet(p_product text, p_qty int, p_phone text, p_device text default null, p_details jsonb default null, p_store text default null, p_as_agent boolean default false) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; w phase1.wallets; v_entry uuid;
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  o := phase1.service_order_new(auth.uid(), p_product, p_qty, p_phone, null, 'wallet', p_device, p_details, p_store, p_as_agent);
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

drop function if exists phase1.service_checkout_start(uuid,text,int,text,text,text,jsonb);
create or replace function phase1.service_checkout_start(p_user uuid, p_product text, p_qty int, p_phone text, p_email text, p_device text, p_details jsonb default null, p_store text default null) returns jsonb
language plpgsql security definer set search_path = phase1, public as $$
declare o phase1.service_orders; v_ref text := 'SVPAY-' || replace(gen_random_uuid()::text, '-', '');
begin
  o := phase1.service_order_new(p_user, p_product, p_qty, p_phone, p_email, 'paystack', p_device, p_details, p_store, false);
  update phase1.service_orders set pay_reference = v_ref where id = o.id;
  return jsonb_build_object('id', o.id, 'reference', o.reference, 'token', o.token, 'pay_reference', v_ref, 'total', o.amount + o.fee_amount, 'amount', o.amount, 'fee', o.fee_amount, 'phone', o.phone,
    'email', coalesce(o.guest_email, (select email from auth.users where id = p_user)), 'name', (select name from phase1.service_products where code = o.product_code),
    'site', case when o.agent_id is not null then phase1.service_store_site(o.agent_id) end);
end $$;

revoke all on function phase1.service_store_site(uuid), phase1.service_order_new(uuid,text,int,text,text,text,text,jsonb,text,boolean), phase1.service_checkout_start(uuid,text,int,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function phase1.service_checkout_start(uuid,text,int,text,text,text,jsonb,text) to service_role;
grant execute on function phase1.service_catalog(text) to anon, authenticated, service_role;
revoke all on function phase1.service_buy_wallet(text,int,text,text,jsonb,text,boolean), phase1.agent_services(), phase1.agent_service_set(text,numeric,boolean) from public, anon;
grant execute on function phase1.service_buy_wallet(text,int,text,text,jsonb,text,boolean), phase1.agent_services(), phase1.agent_service_set(text,numeric,boolean) to authenticated, service_role;
