-- Reseller API, step 3 (owner, 21 Nov 2026: "do the webhook, do everything that's necessary ... for a professional
-- API ... make sure it's secure ... someone cannot try to make money from it"):
--   * webhooks: every change of an API order's status is posted to the seller's https address, signed with their own
--     secret (HMAC-SHA256 over "<unix time>.<body>"), retried for about a day; test keys get test events
--   * the seller can lock their live key to their server's IP addresses
--   * failed key attempts are logged per IP and an IP with 30 failures in 10 minutes is refused for a while
--   * an account banned or deleted at sign-in level can't use its keys; nothing is sold during site maintenance
--   * the same reference sent again with a different number or bundle is refused instead of answered with the
--     first order; test orders are capped at 1,000 a day; request ids are logged
--   * logs, delivered webhooks and test orders older than 30 days are cleared every night

-- ── Tables ──────────────────────────────────────────────────────────────────────────────────────────────────────
alter table phase1.api_clients add column if not exists webhook_secret text;
alter table phase1.api_clients add column if not exists webhook_updated_at timestamptz;
alter table phase1.api_clients add column if not exists allowed_ips text[];
alter table phase1.api_requests add column if not exists request_id text;
create index if not exists api_requests_ip_fail_idx on phase1.api_requests (ip, created_at desc) where status = 401;

create table if not exists phase1.api_webhook_events (
  id bigserial primary key,
  client_id uuid not null references phase1.api_clients(id) on delete cascade,
  order_id uuid references phase1.orders(id) on delete set null,
  event text not null,
  test boolean not null default false,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  last_status int,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_webhook_events_due_idx on phase1.api_webhook_events (next_attempt_at, id) where status = 'pending';
create index if not exists api_webhook_events_client_idx on phase1.api_webhook_events (client_id, created_at desc);
alter table phase1.api_webhook_events enable row level security;

create table if not exists phase1.api_webhook_wake (id int primary key default 1 check (id = 1), woke_at timestamptz);
alter table phase1.api_webhook_wake enable row level security;

-- The Worker in front of api.datayego.com proves itself with this secret, so the API can trust the caller's IP it passes.
insert into phase1.internal_secrets (key, value)
select 'api_proxy', encode(extensions.gen_random_bytes(24), 'hex')
where not exists (select 1 from phase1.internal_secrets where key = 'api_proxy');

-- ── Order status as the seller sees it (one place) ───────────────────────────────────────────────────────────────
create or replace function phase1.api_status_of(p_status text, p_resolution text, p_purchase text, p_ref text)
returns text language sql immutable as $$
  select case
    when p_status = 'delivered' then 'delivered'
    when p_status = 'refunded' then 'refunded'
    when p_status = 'cancelled' then 'cancelled'
    when p_resolution = 'awaiting_verification' then 'verifying'
    when p_status in ('failed', 'failed_needs_review') then 'on_hold'
    when p_purchase is null and p_ref is null then 'queued'
    else 'processing' end
$$;

create or replace function phase1.api_order_json(p_order uuid)
returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object(
    'reference', o.order_reference,
    'your_reference', o.api_reference,
    'status', s.status,
    'message', case s.status
      when 'delivered' then 'Delivered.'
      when 'refunded' then 'Refunded to your DataYego balance.'
      when 'cancelled' then 'Cancelled.'
      when 'verifying' then 'MTN is verifying this number before its first bundle. This can take a few weeks. It will be delivered automatically once verified.'
      when 'on_hold' then 'We are checking this order.'
      when 'queued' then 'Waiting its turn to be sent.'
      else 'Sent to the network. Delivering.' end,
    'bundle', jsonb_build_object('id', coalesce(p.app_product_code, p.id::text), 'network', n.name, 'size_gb', p.capacity_gb),
    'phone', o.recipient_phone,
    'price', o.amount,
    'currency', 'GHS',
    'created_at', o.created_at,
    'delivered_at', case when s.status = 'delivered' then o.closed_at end
  )
  from phase1.orders o join phase1.data_products p on p.id = o.product_id join phase1.networks n on n.id = o.network_id
  cross join lateral (select phase1.api_status_of(o.status::text, o.admin_resolution_status, o.supplier_purchase_id, o.supplier_order_reference) status) s
  where o.id = p_order;
$$;

-- ── Webhook address rules (also checked again, with DNS, by the sender) ──────────────────────────────────────────
create or replace function phase1.api_webhook_url_problem(p_url text)
returns text language plpgsql immutable as $$
declare v_auth text; v_host text; v_port text;
begin
  if p_url is null or length(p_url) > 500 then return 'Use an address of up to 500 characters.'; end if;
  if p_url !~ '^https://' then return 'The address must start with https://'; end if;
  if p_url ~ '\s' then return 'The address can''t contain spaces.'; end if;
  v_auth := substring(p_url from '^https://([^/?#]*)');
  if v_auth is null or v_auth = '' then return 'Add the server name, e.g. https://yoursite.com/webhook'; end if;
  if position('@' in v_auth) > 0 then return 'Don''t put a username or password in the address.'; end if;
  if v_auth ~ '^\[' then return 'Use a domain name, not an IP address.'; end if;
  v_host := lower(split_part(v_auth, ':', 1));
  v_port := nullif(split_part(v_auth, ':', 2), '');
  if v_port is not null and v_port <> '443' then return 'Use the normal https port (443).'; end if;
  if v_host ~ '^[0-9.]+$' then return 'Use a domain name, not an IP address.'; end if;
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then return 'That server name doesn''t look right.'; end if;
  if v_host ~ '(^|\.)(localhost|local|internal|lan|home|corp|intranet|localdomain|arpa)$' or v_host = 'metadata.google.internal' then
    return 'That address can''t be reached from the internet.';
  end if;
  if v_host ~ '(^|\.)datayego\.com$' or v_host ~ '(^|\.)yiego\.shop$' or v_host = 'nhxgebulvqhtiiotetoo.supabase.co' then
    return 'Use your own server''s address.';
  end if;
  return null;
end $$;

-- ── Queueing events ─────────────────────────────────────────────────────────────────────────────────────────────
-- Wakes the sender at most every 5 seconds. Never waits on a lock (it runs inside order updates).
create or replace function phase1.api_webhook_wake()
returns void language plpgsql security definer set search_path = phase1, public as $$
declare v_last timestamptz;
begin
  if not pg_try_advisory_xact_lock(7744110) then return; end if;
  select woke_at into v_last from phase1.api_webhook_wake where id = 1;
  if v_last is not null and v_last > now() - interval '5 seconds' then return; end if;
  insert into phase1.api_webhook_wake (id, woke_at) values (1, now()) on conflict (id) do update set woke_at = excluded.woke_at;
  perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/api-webhooks', body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')),
    timeout_milliseconds := 60000);
exception when others then null;
end $$;

create or replace function phase1.api_webhook_enqueue(p_client uuid, p_order uuid, p_event text, p_payload jsonb, p_test boolean, p_after interval default interval '0')
returns bigint language plpgsql security definer set search_path = phase1, public as $$
declare v_id bigint;
begin
  if not exists (select 1 from phase1.api_clients where id = p_client and webhook_url is not null and webhook_secret is not null) then return null; end if;
  insert into phase1.api_webhook_events (client_id, order_id, event, test, payload, next_attempt_at)
  values (p_client, p_order, p_event, coalesce(p_test, false), p_payload, now() + coalesce(p_after, interval '0'))
  returning id into v_id;
  if coalesce(p_after, interval '0') <= interval '0' then perform phase1.api_webhook_wake(); end if;
  return v_id;
end $$;

-- Every change of the status a seller sees becomes one event. Never stops the order update itself.
create or replace function phase1.orders_api_webhook_trigger()
returns trigger language plpgsql security definer set search_path = phase1, public as $$
declare v_old text; v_new text;
begin
  begin
    v_old := phase1.api_status_of(old.status::text, old.admin_resolution_status, old.supplier_purchase_id, old.supplier_order_reference);
    v_new := phase1.api_status_of(new.status::text, new.admin_resolution_status, new.supplier_purchase_id, new.supplier_order_reference);
    if v_old is distinct from v_new then
      perform phase1.api_webhook_enqueue(new.api_client_id, new.id, 'order.' || v_new, jsonb_build_object('order', phase1.api_order_json(new.id)), false);
    end if;
  exception when others then null;
  end;
  return null;
end $$;
create or replace trigger zz_orders_api_webhook_trg after update on phase1.orders
  for each row when (new.api_client_id is not null) execute function phase1.orders_api_webhook_trigger();

-- ── The sender's side (edge function api-webhooks, service role only) ───────────────────────────────────────────
create or replace function phase1.api_webhook_claim(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v jsonb;
begin
  perform phase1.api_service_only();
  with picked as (
    select e.id from phase1.api_webhook_events e
    where e.status = 'pending' and e.next_attempt_at <= now() and (e.claimed_until is null or e.claimed_until < now())
    order by e.next_attempt_at, e.id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update skip locked),
  upd as (
    update phase1.api_webhook_events e set claimed_until = now() + interval '2 minutes', attempts = e.attempts + 1
    from picked where e.id = picked.id
    returning e.id, e.client_id, e.event, e.test, e.payload, e.created_at, e.attempts)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'client_id', u.client_id, 'event', u.event, 'test', u.test, 'payload', u.payload,
           'created_at', u.created_at, 'attempts', u.attempts, 'url', c.webhook_url, 'secret', c.webhook_secret) order by u.id), '[]'::jsonb)
  into v from upd u join phase1.api_clients c on c.id = u.client_id;
  return v;
end $$;

-- Retries: 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h; after the 8th try it is marked failed (about a day in all).
create or replace function phase1.api_webhook_done(p_id bigint, p_ok boolean, p_status int, p_error text, p_final boolean default false)
returns void language plpgsql security definer set search_path = phase1, public as $$
declare e phase1.api_webhook_events;
begin
  perform phase1.api_service_only();
  select * into e from phase1.api_webhook_events where id = p_id for update;
  if e.id is null then return; end if;
  if p_ok then
    update phase1.api_webhook_events set status = 'delivered', delivered_at = now(), last_status = p_status, last_error = null, claimed_until = null where id = p_id;
  elsif p_final or e.attempts >= 8 then
    update phase1.api_webhook_events set status = 'failed', last_status = p_status, last_error = left(p_error, 300), claimed_until = null where id = p_id;
  else
    update phase1.api_webhook_events set last_status = p_status, last_error = left(p_error, 300), claimed_until = null,
      next_attempt_at = now() + (array[interval '1 minute', interval '5 minutes', interval '15 minutes', interval '1 hour', interval '3 hours', interval '6 hours', interval '12 hours'])[greatest(1, least(e.attempts, 7))]
    where id = p_id;
  end if;
end $$;

create or replace function phase1.api_webhook_tick()
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  if exists (select 1 from phase1.api_webhook_events where status = 'pending' and next_attempt_at <= now() and (claimed_until is null or claimed_until < now())) then
    perform phase1.api_webhook_wake();
  end if;
end $$;

create or replace function phase1.api_cleanup()
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare a int; b int; c int;
begin
  delete from phase1.api_requests where created_at < now() - interval '30 days'; get diagnostics a = row_count;
  delete from phase1.api_webhook_events where status in ('delivered', 'failed') and created_at < now() - interval '30 days'; get diagnostics b = row_count;
  delete from phase1.api_test_orders where created_at < now() - interval '30 days'; get diagnostics c = row_count;
  return jsonb_build_object('requests', a, 'webhooks', b, 'test_orders', c);
end $$;

-- ── Key check, now with the caller's IP ─────────────────────────────────────────────────────────────────────────
create or replace function phase1.api_auth2(p_hash text, p_ip text, p_request text default null)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare k phase1.api_keys; c phase1.api_clients; v_recent int; v_ip inet; v_ok boolean;
begin
  perform phase1.api_service_only();
  begin v_ip := nullif(p_ip, '')::inet; exception when others then v_ip := null; end;
  -- Someone guessing keys: 30 wrong keys from one IP in 10 minutes and that IP is refused until it calms down.
  if p_ip is not null and p_ip <> '' and
     (select count(*) from phase1.api_requests where ip = left(p_ip, 60) and status = 401 and created_at > now() - interval '10 minutes') >= 30 then
    return jsonb_build_object('error', 'too_many_failures');
  end if;
  if not coalesce((select (value->>'enabled')::boolean from phase1.site_settings where key = 'api'), false) then
    return jsonb_build_object('error', 'api_closed');
  end if;
  select * into k from phase1.api_keys where key_hash = p_hash and revoked_at is null;
  if k.id is null then
    insert into phase1.api_requests (client_id, key_id, method, path, status, ms, ip, request_id) values (null, null, 'AUTH', 'invalid_key', 401, 0, left(p_ip, 60), left(p_request, 40));
    return jsonb_build_object('error', 'invalid_key');
  end if;
  select * into c from phase1.api_clients where id = k.client_id;
  if c.status <> 'active' then return jsonb_build_object('error', 'account_not_active'); end if;
  -- The account behind the key must still be allowed to sign in.
  if not exists (select 1 from auth.users u where u.id = c.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until < now()))
     or exists (select 1 from phase1.profiles pr where pr.id = c.user_id and pr.status::text <> 'active') then
    return jsonb_build_object('error', 'account_not_active');
  end if;
  -- A live key locked to the seller's servers.
  if k.mode = 'live' and c.allowed_ips is not null and cardinality(c.allowed_ips) > 0 then
    begin
      v_ok := v_ip is not null and exists (select 1 from unnest(c.allowed_ips) a where v_ip <<= a::inet);
    exception when others then v_ok := false;
    end;
    if not v_ok then return jsonb_build_object('error', 'ip_not_allowed', 'ip', p_ip, 'client_id', c.id, 'key_id', k.id); end if;
  end if;
  select count(*) into v_recent from phase1.api_requests where key_id = k.id and created_at > now() - interval '60 seconds';
  if v_recent >= 120 then return jsonb_build_object('error', 'rate_limited', 'client_id', c.id, 'key_id', k.id, 'remaining', 0); end if;
  if k.last_used_at is null or k.last_used_at < now() - interval '1 minute' then update phase1.api_keys set last_used_at = now() where id = k.id; end if;
  return jsonb_build_object('client_id', c.id, 'key_id', k.id, 'mode', k.mode, 'name', c.name, 'remaining', greatest(0, 119 - v_recent));
end $$;

create or replace function phase1.api_log2(p_client uuid, p_key uuid, p_method text, p_path text, p_status int, p_ms int, p_ip text, p_request text)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.api_service_only();
  insert into phase1.api_requests (client_id, key_id, method, path, status, ms, ip, request_id)
  values (p_client, p_key, left(p_method, 10), left(p_path, 200), p_status, p_ms, left(p_ip, 60), left(p_request, 40));
end $$;

-- ── Placing an order (same as step 1, plus: maintenance, reference conflicts, test cap, test webhooks) ───────────
create or replace function phase1.api_place_order(p_client uuid, p_mode text, p_bundle text, p_phone text, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare
  c phase1.api_clients; p phase1.data_products; n phase1.networks; w phase1.wallets; t phase1.api_test_orders; o phase1.orders;
  v_phone text; v_on text; v_price numeric; v_route jsonb; v_existing uuid; v_order uuid; v_ref text; v_ledger text; v_after numeric;
  v_ref_in text := nullif(trim(coalesce(p_reference, '')), '');
  v_json jsonb;
begin
  perform phase1.api_service_only();
  select * into c from phase1.api_clients where id = p_client and status = 'active';
  if c.id is null then return jsonb_build_object('error', 'account_not_active'); end if;
  if p_mode not in ('live', 'test') then return jsonb_build_object('error', 'server_error'); end if;
  if p_mode = 'live' and coalesce((select (value->'maintenance'->>'enabled')::boolean from phase1.site_settings where key = 'agent_plan'), false) then
    return jsonb_build_object('error', 'maintenance');
  end if;

  if v_ref_in is not null and v_ref_in !~ '^[A-Za-z0-9._:-]{1,64}$' then
    return jsonb_build_object('error', 'bad_reference', 'message', 'reference may only use letters, numbers and . _ : - (up to 64).');
  end if;

  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_phone ~ '^233[0-9]{9}$' then v_phone := '0' || substr(v_phone, 4); elsif v_phone ~ '^[0-9]{9}$' then v_phone := '0' || v_phone; end if;

  select * into p from phase1.data_products where (app_product_code = p_bundle or id::text = p_bundle) and is_active limit 1;

  -- The same reference again: the first order comes back, but only if it is the same order (same number, same bundle).
  if v_ref_in is not null then
    if p_mode = 'test' then
      select * into t from phase1.api_test_orders where client_id = p_client and your_reference = v_ref_in;
      if t.reference is not null then
        if t.phone <> v_phone or p.id is null or t.product_id <> p.id then return jsonb_build_object('error', 'reference_conflict'); end if;
        return jsonb_build_object('order', phase1.api_test_order_json(t), 'existing', true);
      end if;
    else
      select * into o from phase1.orders where api_client_id = p_client and api_reference = v_ref_in;
      if o.id is not null then
        if o.recipient_phone <> v_phone or p.id is null or o.product_id <> p.id then return jsonb_build_object('error', 'reference_conflict'); end if;
        return jsonb_build_object('order', phase1.api_order_json(o.id), 'existing', true);
      end if;
    end if;
  end if;

  if v_phone !~ '^0[0-9]{9}$' then return jsonb_build_object('error', 'invalid_phone', 'message', 'phone must be a 10-digit Ghana number, e.g. 0241234567.'); end if;
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
  -- Never sell below what the supplier charges us, whatever price is on record.
  if v_route is null or (v_route->>'sender') is null or v_price <= 0 or v_price < (v_route->>'cost')::numeric then
    return jsonb_build_object('error', 'bundle_unavailable', 'message', 'This bundle is not available right now. Try again later.');
  end if;

  if p_mode = 'test' then
    if (select count(*) from phase1.api_test_orders where client_id = p_client and created_at > now() - interval '1 day') >= 1000 then
      return jsonb_build_object('error', 'test_limit');
    end if;
    begin
      insert into phase1.api_test_orders (reference, client_id, your_reference, product_id, phone, price)
      values ('TEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p_client, v_ref_in, p.id, v_phone, v_price)
      returning * into t;
    exception when unique_violation then
      select * into t from phase1.api_test_orders where client_id = p_client and your_reference = v_ref_in;
      if t.reference is not null then return jsonb_build_object('order', phase1.api_test_order_json(t), 'existing', true); end if;
      raise;
    end;
    -- A test order "delivers" after 30 seconds: send the matching test webhook then.
    v_json := phase1.api_test_order_json(t);
    perform phase1.api_webhook_enqueue(p_client, null, 'order.delivered',
      jsonb_build_object('order', v_json || jsonb_build_object('status', 'delivered', 'delivered_at', t.created_at + interval '30 seconds')), true, interval '30 seconds');
    return jsonb_build_object('order', v_json);
  end if;

  select * into w from phase1.wallets where user_id = c.user_id and status = 'active' for update;
  if w.id is null then return jsonb_build_object('error', 'no_wallet', 'message', 'Your DataYego wallet is not set up. Sign in at datayego.com once, then try again.'); end if;
  if w.balance < v_price then
    return jsonb_build_object('error', 'insufficient_balance', 'message', 'Your balance (GHS ' || to_char(w.balance, 'FM999999990.00') || ') is too low for this bundle (GHS ' || to_char(v_price, 'FM999999990.00') || '). Top up and try again.', 'balance', w.balance);
  end if;

  v_order := gen_random_uuid();
  v_ref := 'YG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_ledger := 'YGW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_after := w.balance - v_price;
  begin
    insert into phase1.orders (id, order_reference, user_id, recipient_phone, network_id, product_id, supplier_id, amount, cost_amount, currency, status, payment_status, paid_at, supplier_idempotency_key, api_client_id, api_reference)
    values (v_order, v_ref, c.user_id, v_phone, p.network_id, p.id, (v_route->>'supplier_id')::uuid, v_price, (v_route->>'cost')::numeric, 'GHS', 'paid', 'succeeded', now(), gen_random_uuid()::text, p_client, v_ref_in);
  exception when unique_violation then
    select * into o from phase1.orders where api_client_id = p_client and api_reference = v_ref_in;
    if o.id is not null then
      if o.recipient_phone <> v_phone or o.product_id <> p.id then return jsonb_build_object('error', 'reference_conflict'); end if;
      return jsonb_build_object('order', phase1.api_order_json(o.id), 'existing', true);
    end if;
    raise;
  end;
  insert into phase1.wallet_ledger_entries (wallet_id, user_id, direction, type, amount, balance_before, balance_after, status, reference, order_id, note)
  values (w.id, c.user_id, 'debit', 'purchase', v_price, w.balance, v_after, 'posted', v_ledger, v_order, 'API data purchase');
  update phase1.wallets set balance = v_after, updated_at = now() where id = w.id;
  update phase1.orders set wallet_ledger_entry_id = (select id from phase1.wallet_ledger_entries where reference = v_ledger) where id = v_order;
  insert into phase1.order_events (order_id, event_type, from_status, to_status, message, metadata) values
    (v_order, 'wallet.purchase_debited', 'created', 'paid', 'Wallet debited for data purchase', jsonb_build_object('ledgerReference', v_ledger, 'balanceAfter', v_after)),
    (v_order, 'api.order_received', 'paid', 'processing', 'API order from ' || c.name || coalesce(' (their reference ' || v_ref_in || ')', ''), jsonb_build_object('client', p_client, 'your_reference', v_ref_in)),
    (v_order, 'notification.email_sent', null, null, 'API order: no email (the seller tells their customer)', jsonb_build_object('api', true)),
    (v_order, 'notification.verifying_email_sent', null, null, 'API order: no email (the seller tells their customer)', jsonb_build_object('api', true));
  update phase1.orders set status = 'processing', supplier_retry_after = now() where id = v_order;
  perform phase1.api_wake_sender((v_route->>'supplier_id')::uuid, v_route->>'sender');
  return jsonb_build_object('order', phase1.api_order_json(v_order), 'balance', v_after);
end $$;

-- ── Listing orders with filters and paging ──────────────────────────────────────────────────────────────────────
create or replace function phase1.api_list_orders2(p_client uuid, p_mode text, p_limit int default 50, p_before timestamptz default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100); v_rows jsonb; v_more boolean;
begin
  perform phase1.api_service_only();
  if p_mode = 'test' then
    select coalesce(jsonb_agg(j order by (j->>'created_at') desc), '[]'::jsonb) into v_rows from (
      select phase1.api_test_order_json(t) j from phase1.api_test_orders t
      where t.client_id = p_client and (p_before is null or t.created_at < p_before)
        and (p_status is null or p_status = case when t.created_at > now() - interval '30 seconds' then 'queued' else 'delivered' end)
      order by t.created_at desc limit v_limit + 1) x;
  else
    select coalesce(jsonb_agg(phase1.api_order_json(x.id) order by x.created_at desc), '[]'::jsonb) into v_rows from (
      select o.id, o.created_at from phase1.orders o
      where o.api_client_id = p_client and (p_before is null or o.created_at < p_before)
        and (p_status is null or phase1.api_status_of(o.status::text, o.admin_resolution_status, o.supplier_purchase_id, o.supplier_order_reference) = p_status)
      order by o.created_at desc limit v_limit + 1) x;
  end if;
  v_more := jsonb_array_length(v_rows) > v_limit;
  if v_more then v_rows := v_rows - v_limit; end if;
  return jsonb_build_object('orders', v_rows, 'has_more', v_more,
    'next_before', case when v_more then v_rows->(v_limit - 1)->>'created_at' end);
end $$;

-- ── The seller's own controls (signed-in account) ───────────────────────────────────────────────────────────────
create or replace function phase1.my_api_client_active()
returns phase1.api_clients language plpgsql stable security definer set search_path = phase1, public as $$
declare c phase1.api_clients;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from phase1.api_clients where user_id = auth.uid();
  if c.id is null or c.status <> 'active' then raise exception 'not_active'; end if;
  return c;
end $$;

create or replace function phase1.my_api_set_webhook(p_url text)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients; v_url text := nullif(btrim(coalesce(p_url, '')), ''); v_problem text; v_secret text;
begin
  c := phase1.my_api_client_active();
  if v_url is null then
    update phase1.api_clients set webhook_url = null, webhook_updated_at = now() where id = c.id;
    -- Nothing more goes out to the old address.
    update phase1.api_webhook_events set status = 'failed', last_error = 'Webhook address removed', claimed_until = null where client_id = c.id and status = 'pending';
    return jsonb_build_object('url', null);
  end if;
  v_problem := phase1.api_webhook_url_problem(v_url);
  if v_problem is not null then raise exception 'bad_url:%', v_problem; end if;
  v_secret := coalesce(c.webhook_secret, 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex'));
  update phase1.api_clients set webhook_url = v_url, webhook_secret = v_secret, webhook_updated_at = now() where id = c.id;
  return jsonb_build_object('url', v_url, 'new_secret', c.webhook_secret is null);
end $$;

create or replace function phase1.my_api_webhook_secret(p_rotate boolean default false)
returns text language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients; v_secret text;
begin
  c := phase1.my_api_client_active();
  if c.webhook_url is null then raise exception 'no_webhook'; end if;
  if p_rotate or c.webhook_secret is null then
    v_secret := 'whsec_' || encode(extensions.gen_random_bytes(24), 'hex');
    update phase1.api_clients set webhook_secret = v_secret, webhook_updated_at = now() where id = c.id;
    return v_secret;
  end if;
  return c.webhook_secret;
end $$;

create or replace function phase1.my_api_test_webhook()
returns bigint language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients;
begin
  c := phase1.my_api_client_active();
  if c.webhook_url is null then raise exception 'no_webhook'; end if;
  if (select count(*) from phase1.api_webhook_events where client_id = c.id and event = 'ping' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_tests';
  end if;
  return phase1.api_webhook_enqueue(c.id, null, 'ping', jsonb_build_object('message', 'Test event from DataYego. Your webhook works.'), true);
end $$;

create or replace function phase1.my_api_resend_webhook(p_id bigint)
returns void language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients;
begin
  c := phase1.my_api_client_active();
  if c.webhook_url is null then raise exception 'no_webhook'; end if;
  update phase1.api_webhook_events set status = 'pending', attempts = 0, next_attempt_at = now(), claimed_until = null, last_error = null
  where id = p_id and client_id = c.id and status in ('failed', 'delivered');
  if not found then raise exception 'not_found'; end if;
  perform phase1.api_webhook_wake();
end $$;

-- Allowed IP addresses for the live key: up to 10 addresses or ranges; an empty list means any address.
create or replace function phase1.my_api_set_allowed_ips(p_ips text[])
returns text[] language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients; v text; v_out text[] := '{}';
begin
  c := phase1.my_api_client_active();
  if p_ips is not null then
    foreach v in array p_ips loop
      v := btrim(v);
      continue when v = '';
      begin
        v_out := array_append(v_out, (v::cidr)::text);
      exception when others then raise exception 'bad_ip:%', left(v, 60);
      end;
    end loop;
  end if;
  if cardinality(v_out) > 10 then raise exception 'too_many_ips'; end if;
  update phase1.api_clients set allowed_ips = case when cardinality(v_out) = 0 then null else v_out end where id = c.id;
  return case when cardinality(v_out) = 0 then null else v_out end;
end $$;

-- my_api_account (step 2) plus the webhook and IP settings.
create or replace function phase1.my_api_account()
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare c phase1.api_clients; v_day timestamptz;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from phase1.api_clients where user_id = auth.uid();
  if c.id is null then return jsonb_build_object('status', 'none'); end if;
  v_day := date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
  return jsonb_build_object(
    'status', c.status,
    'name', c.name,
    'applied_at', c.created_at,
    'approved_at', c.approved_at,
    'keys', case when c.status = 'active' then coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'mode', k.mode, 'hint', k.key_hint, 'created_at', k.created_at, 'last_used_at', k.last_used_at) order by k.mode)
      from (select distinct on (mode) * from phase1.api_keys where client_id = c.id and revoked_at is null order by mode, created_at desc) k), '[]'::jsonb)
      else '[]'::jsonb end,
    'today', (select jsonb_build_object(
        'orders', count(*),
        'spent', coalesce(sum(o.amount) filter (where o.status::text not in ('refunded', 'cancelled')), 0),
        'delivered', count(*) filter (where o.status::text = 'delivered'))
      from phase1.orders o where o.api_client_id = c.id and o.created_at >= v_day),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
          'reference', j->>'reference', 'your_reference', j->>'your_reference', 'status', j->>'status',
          'network', j->'bundle'->>'network', 'size_gb', (j->'bundle'->>'size_gb')::numeric,
          'phone', j->>'phone', 'price', (j->>'price')::numeric, 'created_at', j->>'created_at') order by x.created_at desc)
      from (select o.id, o.created_at, phase1.api_order_json(o.id) j from phase1.orders o
            where o.api_client_id = c.id order by o.created_at desc limit 20) x), '[]'::jsonb),
    'prices', case when c.status = 'active' then coalesce((
      select jsonb_agg(jsonb_build_object('id', b->>'id', 'network', b->>'network', 'size_gb', (b->>'size_gb')::numeric,
                                          'price', (b->>'price')::numeric, 'available', (b->>'available')::boolean))
      from jsonb_array_elements(phase1.api_bundles_for(c.id)) b), '[]'::jsonb)
      else '[]'::jsonb end,
    'webhook', case when c.status = 'active' then jsonb_build_object(
      'url', c.webhook_url,
      'secret_hint', case when c.webhook_secret is not null then left(c.webhook_secret, 10) || '…' || right(c.webhook_secret, 4) end,
      'deliveries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'event', e.event, 'test', e.test, 'status', e.status, 'attempts', e.attempts,
            'last_status', e.last_status, 'last_error', e.last_error, 'created_at', e.created_at, 'delivered_at', e.delivered_at,
            'next_attempt_at', case when e.status = 'pending' then e.next_attempt_at end, 'reference', e.payload->'order'->>'reference') order by e.id desc)
          from (select * from phase1.api_webhook_events where client_id = c.id order by id desc limit 15) e), '[]'::jsonb)) end,
    'allowed_ips', to_jsonb(c.allowed_ips)
  );
end $$;

-- Admin list: add the webhook and IP settings.
create or replace function phase1.admin_api_clients()
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare v_day timestamptz := date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra';
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select (value->>'enabled')::boolean from phase1.site_settings where key = 'api'), false),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'status', c.status, 'phone', c.contact_phone, 'website', c.website, 'note', c.note,
        'created_at', c.created_at, 'approved_at', c.approved_at,
        'email', coalesce(pr.email, u.email), 'account_name', nullif(btrim(pr.full_name), ''),
        'agent', (select jsonb_build_object('store', coalesce(nullif(btrim(a.store_name), ''), a.slug), 'slug', a.slug, 'sub', a.parent_agent_id is not null, 'status', a.status)
                  from phase1.agents a where a.user_id = c.user_id order by a.created_at limit 1),
        'balance', coalesce(w.balance, 0),
        'keys', coalesce((select jsonb_agg(jsonb_build_object('mode', k.mode, 'hint', k.key_hint, 'created_at', k.created_at, 'last_used_at', k.last_used_at) order by k.mode)
                  from (select distinct on (mode) * from phase1.api_keys where client_id = c.id and revoked_at is null order by mode, created_at desc) k), '[]'::jsonb),
        'orders', s.orders, 'orders_today', s.today, 'delivered', s.delivered, 'waiting', s.waiting,
        'sales', s.sales, 'sales_today', s.sales_today, 'last_order_at', s.last_at,
        'requests_today', (select count(*) from phase1.api_requests r where r.client_id = c.id and r.created_at >= v_day),
        'special_prices', (select count(*) from phase1.api_client_prices cp where cp.client_id = c.id),
        'webhook_url', c.webhook_url,
        'webhook_failed_today', (select count(*) from phase1.api_webhook_events e where e.client_id = c.id and e.created_at >= v_day and (e.status = 'failed' or (e.status = 'pending' and e.attempts > 0))),
        'webhook_sent_today', (select count(*) from phase1.api_webhook_events e where e.client_id = c.id and e.created_at >= v_day and e.status = 'delivered'),
        'allowed_ips', to_jsonb(c.allowed_ips)
      ) order by (c.status = 'pending') desc, (c.status = 'active') desc, c.created_at desc)
      from phase1.api_clients c
      left join auth.users u on u.id = c.user_id
      left join phase1.profiles pr on pr.id = c.user_id
      left join phase1.wallets w on w.user_id = c.user_id
      left join lateral (
        select count(*) orders,
               count(*) filter (where o.created_at >= v_day) today,
               count(*) filter (where o.status::text = 'delivered') delivered,
               count(*) filter (where o.status::text not in ('delivered', 'refunded', 'cancelled')) waiting,
               coalesce(sum(o.amount) filter (where o.status::text not in ('refunded', 'cancelled')), 0) sales,
               coalesce(sum(o.amount) filter (where o.created_at >= v_day and o.status::text not in ('refunded', 'cancelled')), 0) sales_today,
               max(o.created_at) last_at
        from phase1.orders o where o.api_client_id = c.id) s on true), '[]'::jsonb)
  );
end $$;

-- ── Who may call what ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'phase1' and (p.proname like 'api\_%' or p.proname = 'orders_api_webhook_trigger') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
revoke execute on function phase1.my_api_client_active() from public, anon, authenticated;
do $$
declare s text;
begin
  foreach s in array array['phase1.my_api_set_webhook(text)', 'phase1.my_api_webhook_secret(boolean)', 'phase1.my_api_test_webhook()',
                           'phase1.my_api_resend_webhook(bigint)', 'phase1.my_api_set_allowed_ips(text[])', 'phase1.my_api_account()'] loop
    execute format('revoke execute on function %s from public, anon', s);
    execute format('grant execute on function %s to authenticated', s);
  end loop;
end $$;

-- ── Schedules ───────────────────────────────────────────────────────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname in ('api-webhooks', 'api-cleanup');
select cron.schedule('api-webhooks', '* * * * *', $$select phase1.api_webhook_tick()$$);
select cron.schedule('api-cleanup', '23 3 * * *', $$select phase1.api_cleanup()$$);
