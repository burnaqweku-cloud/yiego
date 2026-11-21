-- DataYego reseller API, step 1 (owner, 21 Nov 2026: "our own API that will be giving the price to people").
-- Anyone can apply (agents too); the owner approves. A seller calls the edge function `api` with a secret key; the
-- key is stored only as a SHA-256 hash. Orders are paid from the seller's own DataYego wallet (no minimum top-up, no
-- daily limit), at the standard API price or the seller's own price (api_client_prices beats api_prices), never below
-- what the supplier charges us. A paid API order is not sent from the request: it joins the supplier's send queue
-- (status processing + supplier_retry_after now) and that supplier's sync job sends queued orders one after another,
-- so a burst of API orders never hits DataBundlesHub's "one purchase at a time" all at once. The seller never sees
-- "busy": they get an order reference at once and check its status. API orders never email, text or notify anyone:
-- the seller talks to their own customer.

-- ── Who can use it ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists phase1.api_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references phase1.profiles(id),
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  contact_phone text,
  website text,
  note text,
  webhook_url text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid
);

create table if not exists phase1.api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references phase1.api_clients(id) on delete cascade,
  mode text not null check (mode in ('live', 'test')),
  key_hash text not null unique,
  key_hint text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_client_idx on phase1.api_keys (client_id);

-- ── Prices: one standard list, and a seller's own price on any bundle ─────────────────────────────────────────
create table if not exists phase1.api_prices (
  product_id uuid primary key references phase1.data_products(id),
  price numeric(12, 2) not null check (price > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists phase1.api_client_prices (
  client_id uuid not null references phase1.api_clients(id) on delete cascade,
  product_id uuid not null references phase1.data_products(id),
  price numeric(12, 2) not null check (price > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (client_id, product_id)
);
-- Stand-in until the owner sends the API prices: the agent price.
insert into phase1.api_prices (product_id, price)
select p.id, p.agent_price from phase1.data_products p where p.is_active and p.agent_price is not null and p.agent_price > 0
on conflict (product_id) do nothing;

-- ── Every request, for rate limits and the seller's usage ──────────────────────────────────────────────────────
create table if not exists phase1.api_requests (
  id bigserial primary key,
  client_id uuid,
  key_id uuid,
  method text,
  path text,
  status int,
  ms int,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists api_requests_key_time_idx on phase1.api_requests (key_id, created_at desc);
create index if not exists api_requests_client_time_idx on phase1.api_requests (client_id, created_at desc);

-- Test-key orders: checked like real ones, never paid, never sent.
create table if not exists phase1.api_test_orders (
  reference text primary key,
  client_id uuid not null references phase1.api_clients(id) on delete cascade,
  your_reference text,
  product_id uuid not null references phase1.data_products(id),
  phone text not null,
  price numeric(12, 2) not null,
  created_at timestamptz not null default now()
);
create unique index if not exists api_test_orders_ref_uniq on phase1.api_test_orders (client_id, your_reference) where your_reference is not null;

-- When each supplier's send job was last woken for API orders (a wake at most every 10 seconds per supplier).
create table if not exists phase1.api_sender_wake (supplier_id uuid primary key, woke_at timestamptz not null);

alter table phase1.orders add column if not exists api_client_id uuid references phase1.api_clients(id);
alter table phase1.orders add column if not exists api_reference text;
create unique index if not exists orders_api_reference_uniq on phase1.orders (api_client_id, api_reference) where api_client_id is not null and api_reference is not null;
create index if not exists orders_api_client_idx on phase1.orders (api_client_id, created_at desc) where api_client_id is not null;

alter table phase1.api_clients enable row level security;
alter table phase1.api_keys enable row level security;
alter table phase1.api_prices enable row level security;
alter table phase1.api_client_prices enable row level security;
alter table phase1.api_requests enable row level security;
alter table phase1.api_test_orders enable row level security;
alter table phase1.api_sender_wake enable row level security;

insert into phase1.site_settings (key, value) values ('api', '{"enabled": true}'::jsonb) on conflict (key) do nothing;

-- ── Only the API function (service role) may call these ─────────────────────────────────────────────────────────
create or replace function phase1.api_service_only() returns void language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then raise exception 'not_allowed'; end if;
end $$;

-- Issue a key. The plain key is returned once and never stored.
create or replace function phase1.api_issue_key(p_client uuid, p_mode text default 'live')
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v_key text; v_id uuid;
begin
  perform phase1.api_service_only();
  if p_mode not in ('live', 'test') then raise exception 'bad_mode'; end if;
  v_key := 'dy_' || p_mode || '_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into phase1.api_keys (client_id, mode, key_hash, key_hint)
  values (p_client, p_mode, encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), left(v_key, 12) || '…' || right(v_key, 4))
  returning id into v_id;
  return jsonb_build_object('key_id', v_id, 'key', v_key, 'mode', p_mode);
end $$;

-- Who is calling: the key's client, if the key is live and the client active, within 120 requests a minute.
create or replace function phase1.api_auth(p_hash text)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare k phase1.api_keys; c phase1.api_clients; v_recent int;
begin
  perform phase1.api_service_only();
  if not coalesce((select (value->>'enabled')::boolean from phase1.site_settings where key = 'api'), false) then
    return jsonb_build_object('error', 'api_closed');
  end if;
  select * into k from phase1.api_keys where key_hash = p_hash and revoked_at is null;
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;
  select * into c from phase1.api_clients where id = k.client_id;
  if c.status <> 'active' then return jsonb_build_object('error', 'account_not_active'); end if;
  select count(*) into v_recent from phase1.api_requests where key_id = k.id and created_at > now() - interval '60 seconds';
  if v_recent >= 120 then return jsonb_build_object('error', 'rate_limited'); end if;
  if k.last_used_at is null or k.last_used_at < now() - interval '1 minute' then update phase1.api_keys set last_used_at = now() where id = k.id; end if;
  return jsonb_build_object('client_id', c.id, 'key_id', k.id, 'mode', k.mode, 'name', c.name);
end $$;

create or replace function phase1.api_log(p_client uuid, p_key uuid, p_method text, p_path text, p_status int, p_ms int, p_ip text)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.api_service_only();
  insert into phase1.api_requests (client_id, key_id, method, path, status, ms, ip) values (p_client, p_key, p_method, left(p_path, 200), p_status, p_ms, left(p_ip, 60));
end $$;

-- The seller's price for a bundle: their own price if set, else the standard API price, else not sold to them.
create or replace function phase1.api_price(p_client uuid, p_product uuid)
returns numeric language sql stable security definer set search_path = phase1, public as $$
  select coalesce((select cp.price from phase1.api_client_prices cp where cp.client_id = p_client and cp.product_id = p_product),
                  (select ap.price from phase1.api_prices ap where ap.product_id = p_product));
$$;

-- Which supplier would deliver a bundle, what it charges, and whose send job takes the queue (null: none).
create or replace function phase1.api_route(p_product uuid)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare p phase1.data_products; n phase1.networks; v_supplier uuid; m record;
begin
  select * into p from phase1.data_products where id = p_product;
  select * into n from phase1.networks where id = p.network_id;
  v_supplier := coalesce(p.forced_supplier_id, n.preferred_supplier_id);
  select mp.supplier_price, s.code, s.id into m from phase1.supplier_product_mappings mp join phase1.suppliers s on s.id = mp.supplier_id
   where mp.product_id = p_product and mp.supplier_id = v_supplier and mp.is_active and s.status = 'active' order by mp.id limit 1;
  if m.id is null then return null; end if;
  return jsonb_build_object('supplier_id', m.id, 'code', m.code, 'cost', coalesce(m.supplier_price, p.cost_price),
    'sender', case m.code when 'databundleshub' then 'sync-dbh-order-status' when 'instantdatagh' then 'sync-instantdata-order-status' end);
end $$;

create or replace function phase1.api_balance(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare w phase1.wallets;
begin
  perform phase1.api_service_only();
  select wl.* into w from phase1.wallets wl join phase1.api_clients c on c.user_id = wl.user_id where c.id = p_client;
  return jsonb_build_object('balance', coalesce(w.balance, 0), 'currency', 'GHS');
end $$;

-- The bundles a seller can buy, at their price.
create or replace function phase1.api_bundles(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
begin
  perform phase1.api_service_only();
  return coalesce((
    select jsonb_agg(b order by b->>'network', (b->>'size_gb')::numeric)
    from (
      select jsonb_build_object(
        'id', coalesce(p.app_product_code, p.id::text),
        'network', n.name,
        'size_gb', p.capacity_gb,
        'validity', p.validity,
        'price', phase1.api_price(p_client, p.id),
        'currency', 'GHS',
        'available', (not n.is_paused and not coalesce(p.is_paused, false) and r.route is not null and (r.route->>'sender') is not null
                      and phase1.api_price(p_client, p.id) >= (r.route->>'cost')::numeric)
      ) b
      from phase1.data_products p join phase1.networks n on n.id = p.network_id
      cross join lateral (select phase1.api_route(p.id) route) r
      where p.is_active and n.is_active and phase1.api_price(p_client, p.id) is not null
    ) x
  ), '[]'::jsonb);
end $$;

-- One order as the seller sees it.
create or replace function phase1.api_order_json(p_order uuid)
returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object(
    'reference', o.order_reference,
    'your_reference', o.api_reference,
    'status', case
      when o.status::text = 'delivered' then 'delivered'
      when o.status::text = 'refunded' then 'refunded'
      when o.status::text = 'cancelled' then 'cancelled'
      when o.admin_resolution_status = 'awaiting_verification' then 'verifying'
      when o.status::text in ('failed', 'failed_needs_review') then 'on_hold'
      when o.supplier_purchase_id is null and o.supplier_order_reference is null then 'queued'
      else 'processing' end,
    'message', case
      when o.status::text = 'delivered' then 'Delivered.'
      when o.status::text = 'refunded' then 'Refunded to your DataYego balance.'
      when o.status::text = 'cancelled' then 'Cancelled.'
      when o.admin_resolution_status = 'awaiting_verification' then 'MTN is verifying this number before its first bundle. This can take a few weeks. It will be delivered automatically once verified.'
      when o.status::text in ('failed', 'failed_needs_review') then 'We are checking this order.'
      when o.supplier_purchase_id is null and o.supplier_order_reference is null then 'Waiting its turn to be sent.'
      else 'Sent to the network. Delivering.' end,
    'bundle', jsonb_build_object('id', coalesce(p.app_product_code, p.id::text), 'network', n.name, 'size_gb', p.capacity_gb),
    'phone', o.recipient_phone,
    'price', o.amount,
    'currency', 'GHS',
    'created_at', o.created_at,
    'delivered_at', case when o.status::text = 'delivered' then o.closed_at end
  )
  from phase1.orders o join phase1.data_products p on p.id = o.product_id join phase1.networks n on n.id = o.network_id
  where o.id = p_order;
$$;

create or replace function phase1.api_test_order_json(t phase1.api_test_orders)
returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object('reference', t.reference, 'your_reference', t.your_reference, 'test', true,
    'status', case when t.created_at > now() - interval '30 seconds' then 'queued' else 'delivered' end,
    'message', 'Test order: nothing was charged or sent.',
    'bundle', jsonb_build_object('id', coalesce(p.app_product_code, p.id::text), 'network', n.name, 'size_gb', p.capacity_gb),
    'phone', t.phone, 'price', t.price, 'currency', 'GHS', 'created_at', t.created_at,
    'delivered_at', case when t.created_at <= now() - interval '30 seconds' then t.created_at + interval '30 seconds' end)
  from phase1.data_products p join phase1.networks n on n.id = p.network_id where p.id = t.product_id;
$$;

-- Wake a supplier's send job (at most every 10 seconds); its minute-by-minute run picks up anything left.
create or replace function phase1.api_wake_sender(p_supplier uuid, p_function text)
returns void language plpgsql security definer set search_path = phase1, public as $$
declare v_last timestamptz;
begin
  select woke_at into v_last from phase1.api_sender_wake where supplier_id = p_supplier for update;
  if v_last is not null and v_last > now() - interval '10 seconds' then return; end if;
  insert into phase1.api_sender_wake (supplier_id, woke_at) values (p_supplier, now())
  on conflict (supplier_id) do update set woke_at = excluded.woke_at;
  begin
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/' || p_function, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 60000);
  exception when others then null;
  end;
end $$;

-- Place an order. Returns {order} or {error, message}; the same your_reference twice returns the first order.
create or replace function phase1.api_place_order(p_client uuid, p_mode text, p_bundle text, p_phone text, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare
  c phase1.api_clients; p phase1.data_products; n phase1.networks; w phase1.wallets; t phase1.api_test_orders;
  v_phone text; v_on text; v_price numeric; v_route jsonb; v_existing uuid; v_order uuid; v_ref text; v_ledger text; v_after numeric;
  v_ref_in text := nullif(trim(coalesce(p_reference, '')), '');
begin
  perform phase1.api_service_only();
  select * into c from phase1.api_clients where id = p_client and status = 'active';
  if c.id is null then return jsonb_build_object('error', 'account_not_active'); end if;

  if v_ref_in is not null and v_ref_in !~ '^[A-Za-z0-9._:-]{1,64}$' then
    return jsonb_build_object('error', 'bad_reference', 'message', 'reference may only use letters, numbers and . _ : - (up to 64).');
  end if;
  if v_ref_in is not null then
    if p_mode = 'test' then
      select * into t from phase1.api_test_orders where client_id = p_client and your_reference = v_ref_in;
      if t.reference is not null then return jsonb_build_object('order', phase1.api_test_order_json(t), 'existing', true); end if;
    else
      select id into v_existing from phase1.orders where api_client_id = p_client and api_reference = v_ref_in;
      if v_existing is not null then return jsonb_build_object('order', phase1.api_order_json(v_existing), 'existing', true); end if;
    end if;
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_phone ~ '^233[0-9]{9}$' then v_phone := '0' || substr(v_phone, 4); elsif v_phone ~ '^[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^0[0-9]{9}$' then return jsonb_build_object('error', 'invalid_phone', 'message', 'phone must be a 10-digit Ghana number, e.g. 0241234567.'); end if;

  select * into p from phase1.data_products where (app_product_code = p_bundle or id::text = p_bundle) and is_active limit 1;
  if p.id is null then return jsonb_build_object('error', 'unknown_bundle', 'message', 'No bundle with that id. Get the list from GET /v1/bundles.'); end if;
  select * into n from phase1.networks where id = p.network_id and is_active;
  if n.id is null or n.is_paused or coalesce(p.is_paused, false) then
    return jsonb_build_object('error', 'bundle_unavailable', 'message', 'This bundle is not available right now. Try again later.');
  end if;

  v_on := phase1.network_for_prefix(v_phone);
  if v_on is null then return jsonb_build_object('error', 'invalid_phone', 'message', v_phone || ' is not a Ghana mobile number.'); end if;
  if lower(v_on) <> lower(n.name) then
    return jsonb_build_object('error', 'wrong_network', 'message', v_phone || ' is a ' || v_on || ' number, but this bundle is for ' || n.name || '.');
  end if;

  v_price := phase1.api_price(p_client, p.id);
  if v_price is null then return jsonb_build_object('error', 'bundle_not_offered', 'message', 'This bundle is not on your price list.'); end if;
  v_route := phase1.api_route(p.id);
  if v_route is null or (v_route->>'sender') is null or v_price < (v_route->>'cost')::numeric then
    return jsonb_build_object('error', 'bundle_unavailable', 'message', 'This bundle is not available right now. Try again later.');
  end if;

  if p_mode = 'test' then
    insert into phase1.api_test_orders (reference, client_id, your_reference, product_id, phone, price)
    values ('TEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p_client, v_ref_in, p.id, v_phone, v_price)
    returning * into t;
    return jsonb_build_object('order', phase1.api_test_order_json(t));
  end if;

  select * into w from phase1.wallets where user_id = c.user_id and status = 'active' for update;
  if w.id is null then return jsonb_build_object('error', 'no_wallet', 'message', 'Your DataYego wallet is not set up. Sign in at datayego.com once, then try again.'); end if;
  if w.balance < v_price then
    return jsonb_build_object('error', 'insufficient_balance', 'message', 'Your balance (GHS ' || to_char(w.balance, 'FM999999990.00') || ') is too low for this bundle (GHS ' || to_char(v_price, 'FM999999990.00') || '). Top up and try again.', 'balance', w.balance);
  end if;

  -- Same steps as a wallet order on the site (create_wallet_data_order), so finance and refunds treat it the same.
  v_order := gen_random_uuid();
  v_ref := 'YG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_ledger := 'YGW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_after := w.balance - v_price;
  begin
    -- paid_at now: finance books it as a wallet sale (customer_wallets -> owed_deliveries) the moment it is paid.
    insert into phase1.orders (id, order_reference, user_id, recipient_phone, network_id, product_id, supplier_id, amount, cost_amount, currency, status, payment_status, paid_at, supplier_idempotency_key, api_client_id, api_reference)
    values (v_order, v_ref, c.user_id, v_phone, p.network_id, p.id, (v_route->>'supplier_id')::uuid, v_price, (v_route->>'cost')::numeric, 'GHS', 'paid', 'succeeded', now(), gen_random_uuid()::text, p_client, v_ref_in);
  exception when unique_violation then
    -- The same reference arrived twice at the same moment: hand back the first order.
    select id into v_existing from phase1.orders where api_client_id = p_client and api_reference = v_ref_in;
    if v_existing is not null then return jsonb_build_object('order', phase1.api_order_json(v_existing), 'existing', true); end if;
    raise;
  end;
  insert into phase1.wallet_ledger_entries (wallet_id, user_id, direction, type, amount, balance_before, balance_after, status, reference, order_id, note)
  values (w.id, c.user_id, 'debit', 'purchase', v_price, w.balance, v_after, 'posted', v_ledger, v_order, 'API data purchase');
  update phase1.wallets set balance = v_after, updated_at = now() where id = w.id;
  update phase1.orders set wallet_ledger_entry_id = (select id from phase1.wallet_ledger_entries where reference = v_ledger) where id = v_order;
  insert into phase1.order_events (order_id, event_type, from_status, to_status, message, metadata) values
    (v_order, 'wallet.purchase_debited', 'created', 'paid', 'Wallet debited for data purchase', jsonb_build_object('ledgerReference', v_ledger, 'balanceAfter', v_after)),
    (v_order, 'api.order_received', 'paid', 'processing', 'API order from ' || c.name || coalesce(' (their reference ' || v_ref_in || ')', ''), jsonb_build_object('client', p_client, 'your_reference', v_ref_in)),
    -- No email: the seller tells their own customer. These mark the confirmation emails as handled.
    (v_order, 'notification.email_sent', null, null, 'API order: no email (the seller tells their customer)', jsonb_build_object('api', true)),
    (v_order, 'notification.verifying_email_sent', null, null, 'API order: no email (the seller tells their customer)', jsonb_build_object('api', true));
  -- Into the supplier's send queue.
  update phase1.orders set status = 'processing', supplier_retry_after = now() where id = v_order;
  perform phase1.api_wake_sender((v_route->>'supplier_id')::uuid, v_route->>'sender');
  return jsonb_build_object('order', phase1.api_order_json(v_order), 'balance', v_after);
end $$;

create or replace function phase1.api_get_order(p_client uuid, p_mode text, p_reference text)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare v_id uuid; t phase1.api_test_orders;
begin
  perform phase1.api_service_only();
  if p_mode = 'test' then
    select * into t from phase1.api_test_orders where client_id = p_client and (reference = p_reference or your_reference = p_reference);
    if t.reference is null then return null; end if;
    return phase1.api_test_order_json(t);
  end if;
  select id into v_id from phase1.orders where api_client_id = p_client and (order_reference = p_reference or api_reference = p_reference) order by created_at desc limit 1;
  if v_id is null then return null; end if;
  return phase1.api_order_json(v_id);
end $$;

create or replace function phase1.api_list_orders(p_client uuid, p_mode text, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
begin
  perform phase1.api_service_only();
  if p_mode = 'test' then
    return coalesce((select jsonb_agg(phase1.api_test_order_json(t) order by t.created_at desc) from (select * from phase1.api_test_orders where client_id = p_client order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) t), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(phase1.api_order_json(o.id) order by o.created_at desc) from (select id, created_at from phase1.orders where api_client_id = p_client order by created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 100)) o), '[]'::jsonb);
end $$;

-- ── API orders never notify anyone ─────────────────────────────────────────────────────────────────────────────
create or replace function phase1.orders_push_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
declare v_url text := '/track-order?reference=' || new.order_reference; v_phone text := coalesce(new.recipient_phone, 'your number');
begin
  if new.api_client_id is not null then return new; end if;  -- API orders: the seller tells their own customer
  begin
    if new.paid_at is not null and old.paid_at is null and new.status not in ('delivered','refunded','cancelled') then
      perform phase1.push_enqueue('order_paid', 'order_paid:' || new.id, 'Payment received', 'We have your payment. Your data for ' || v_phone || ' is on its way.', v_url, new.id);
    end if;
    if new.status is distinct from old.status and new.status = 'delivered' then
      perform phase1.push_enqueue('order_delivered', 'order_delivered:' || new.id, 'Data delivered', 'Your data for ' || v_phone || ' has been delivered. Thank you for buying with DataYego.', v_url, new.id);
    elsif new.status is distinct from old.status and new.status = 'refunded' then
      perform phase1.push_enqueue('order_refunded', 'order_refunded:' || new.id, 'Order refunded', 'Your order for ' || v_phone || ' was refunded (' || coalesce(new.currency, 'GHS') || ' ' || trim(to_char(new.amount, 'FM999990.00')) || ').', v_url, new.id);
    end if;
  exception when others then null;
  end;
  return new;
end $$;

create or replace function phase1.enqueue_order_sms() returns trigger language plpgsql security definer set search_path to '' as $$
declare s phase1.sms_settings%rowtype;
begin
  if new.api_client_id is not null then return new; end if;  -- API orders: never text the seller's customer
  if not exists(select 1 from phase1.order_sms_control where enabled) then return new; end if;
  select * into s from phase1.sms_settings where id;
  if new.agent_id is not null and not coalesce(s.store_orders_enabled, true) then return new; end if;
  if new.payment_status::text='succeeded' then
    if coalesce(s.purchase_enabled, true) and (tg_op='INSERT' or old.payment_status::text is distinct from 'succeeded') then
      insert into phase1.order_sms_outbox(order_id,kind) values(new.id,'purchase') on conflict do nothing;
    end if;
    if coalesce(s.delivered_enabled, true) and new.status::text='delivered' and (tg_op='INSERT' or old.status::text is distinct from 'delivered') then
      insert into phase1.order_sms_outbox(order_id,kind) values(new.id,'delivered') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function phase1.seed_verified_order_sms() returns integer language plpgsql security definer set search_path to '' as $$
declare inserted integer; s phase1.sms_settings%rowtype;
begin
  if not exists(select 1 from phase1.order_sms_control where enabled) then return 0; end if;
  select * into s from phase1.sms_settings where id;
  if not coalesce(s.verified_enabled, true) then return 0; end if;
  insert into phase1.order_sms_outbox(order_id,kind)
  select distinct o.id,'verified' from phase1.orders o join phase1.networks n on n.id=o.network_id
  where lower(n.code)='mtn' and o.payment_status::text='succeeded'
    and o.api_client_id is null  -- API orders: never text the seller's customer
    and (o.agent_id is null or coalesce(s.store_orders_enabled, true))
    and o.status::text='delivered'
    and exists(select 1 from phase1.order_events e where e.order_id=o.id and e.event_type in ('notification.verified_email_sent','supplier.number_approved','supplier.verification_cleared'))
    and not exists(select 1 from phase1.order_events e where e.order_id=o.id and e.event_type='notification.verified_sms_sent')
  on conflict do nothing;
  get diagnostics inserted=row_count; return inserted;
end $$;
