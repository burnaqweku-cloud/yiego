-- Admin -> API (owner, 21 Nov 2026: "Go ahead" on the admin API-customers page).
--   admin_api_clients()                      every applicant and seller with their figures (any admin)
--   admin_api_set_status(client, status)     approve ('active'), pause ('suspended'), resume ('active'),
--                                            turn down ('declined': removes a pending application) (master)
--   admin_api_prices(client)                 every bundle: our cost, customer and agent price, API price,
--                                            and the seller's own price when a client is given (any admin)
--   admin_api_set_price(product, price)      the standard API price; null takes the bundle off the API (master)
--   admin_api_set_client_price(client, product, price)  one seller's own price; null goes back to standard (master)
--   admin_api_set_enabled(on)                the whole API on or off (master)
-- An approved applicant gets a phone notification and one text (agent texts switch and sender, spaced like
-- approval texts). Prices below what the routed supplier charges are refused.

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
        'special_prices', (select count(*) from phase1.api_client_prices cp where cp.client_id = c.id)
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

create or replace function phase1.admin_api_set_status(p_client uuid, p_status text)
returns text language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients; s phase1.sms_settings; v_phone text; v_name text; v_agent boolean; v_last timestamptz; v_link text;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  select * into c from phase1.api_clients where id = p_client for update;
  if c.id is null then raise exception 'not_found'; end if;
  if p_status = 'declined' then
    if c.status <> 'pending' then raise exception 'only_pending'; end if;
    delete from phase1.api_clients where id = c.id;
    return 'declined';
  end if;
  if p_status not in ('active', 'suspended') then raise exception 'bad_status'; end if;
  if c.status = p_status then return p_status; end if;
  update phase1.api_clients set status = p_status,
    approved_at = case when p_status = 'active' and approved_at is null then now() else approved_at end,
    approved_by = case when p_status = 'active' and approved_by is null then auth.uid() else approved_by end
  where id = c.id;
  if p_status = 'active' and c.status = 'pending' then
    v_agent := exists (select 1 from phase1.agents a where a.user_id = c.user_id and a.status::text = 'active');
    v_link := case when v_agent then '/agent/api' else '/account/api' end;
    perform phase1.push_enqueue('alert', 'api_approved:' || c.id, 'API access approved',
      'Your API access is ready. Open your API page to make your keys.', v_link, null, null, c.user_id);
    -- One text, the way agent approval texts go: same switch and sender, 5 minutes after the last queued text.
    select * into s from phase1.sms_settings where id = true;
    v_phone := phase1.service_norm_phone(c.contact_phone);
    if coalesce(s.agents_enabled, false) and v_phone is not null then
      select split_part(btrim(coalesce(full_name, '')), ' ', 1) into v_name from phase1.profiles where id = c.user_id;
      select max(t) into v_last from (
        select coalesce(x.not_before, x.created_at) as t from phase1.sms_queue x where x.status = 'pending'
        union all select x.sent_at from phase1.sms_queue x where x.status = 'sent' and x.sent_at > now() - interval '5 minutes') z;
      insert into phase1.sms_queue (kind, phone, message, sender, dedupe_key, not_before)
      values ('api_approved', v_phone,
        'Hi ' || coalesce(nullif(v_name, ''), 'there') || ', your DY API access is approved. Sign in at datayego.com' || v_link || ' to make your keys.',
        left(coalesce(s.agents_sender, 'Dyverify'), 11), 'api_approved:' || c.id,
        case when v_last is null then null else greatest(now(), v_last + interval '5 minutes') end)
      on conflict (dedupe_key) do nothing;
      perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/service-pay', body := '{"action":"run"}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')),
        timeout_milliseconds := 30000);
    end if;
  end if;
  return p_status;
end $$;

create or replace function phase1.admin_api_prices(p_client uuid default null)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'product_id', p.id, 'id', coalesce(p.app_product_code, p.id::text), 'network', n.name, 'size_gb', p.capacity_gb,
      'cost', (r.route->>'cost')::numeric, 'supplier', r.route->>'code',
      'customer_price', p.customer_price, 'agent_price', p.agent_price,
      'api_price', ap.price,
      'special_price', cp.price,
      'available', (not n.is_paused and not coalesce(p.is_paused, false) and r.route is not null and (r.route->>'sender') is not null)
    ) order by n.name, p.capacity_gb)
    from phase1.data_products p join phase1.networks n on n.id = p.network_id
    cross join lateral (select phase1.api_route(p.id) route) r
    left join phase1.api_prices ap on ap.product_id = p.id
    left join phase1.api_client_prices cp on cp.product_id = p.id and cp.client_id = p_client
    where p.is_active and n.is_active), '[]'::jsonb);
end $$;

-- Shared check: a price must be above zero and not below what the routed supplier charges for the bundle.
create or replace function phase1.admin_api_price_ok(p_product uuid, p_price numeric)
returns void language plpgsql stable security definer set search_path = phase1, public as $$
declare v_cost numeric;
begin
  if p_price is null or p_price <= 0 or p_price > 10000 then raise exception 'bad_price'; end if;
  if not exists (select 1 from phase1.data_products where id = p_product) then raise exception 'not_found'; end if;
  v_cost := (phase1.api_route(p_product)->>'cost')::numeric;
  if v_cost is not null and p_price < v_cost then raise exception 'below_cost:%', v_cost; end if;
end $$;

create or replace function phase1.admin_api_set_price(p_product uuid, p_price numeric)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  if p_price is null then delete from phase1.api_prices where product_id = p_product; return; end if;
  perform phase1.admin_api_price_ok(p_product, p_price);
  insert into phase1.api_prices (product_id, price, updated_at, updated_by) values (p_product, round(p_price, 2), now(), auth.uid())
  on conflict (product_id) do update set price = excluded.price, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function phase1.admin_api_set_client_price(p_client uuid, p_product uuid, p_price numeric)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  if not exists (select 1 from phase1.api_clients where id = p_client) then raise exception 'not_found'; end if;
  if p_price is null then delete from phase1.api_client_prices where client_id = p_client and product_id = p_product; return; end if;
  perform phase1.admin_api_price_ok(p_product, p_price);
  insert into phase1.api_client_prices (client_id, product_id, price, updated_at, updated_by) values (p_client, p_product, round(p_price, 2), now(), auth.uid())
  on conflict (client_id, product_id) do update set price = excluded.price, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function phase1.admin_api_set_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = phase1, public as $$
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  insert into phase1.site_settings (key, value, updated_by) values ('api', jsonb_build_object('enabled', coalesce(p_enabled, false)), auth.uid())
  on conflict (key) do update set value = jsonb_build_object('enabled', coalesce(p_enabled, false)), updated_at = now(), updated_by = auth.uid();
end $$;

revoke execute on function phase1.admin_api_clients() from public, anon;
revoke execute on function phase1.admin_api_set_status(uuid, text) from public, anon;
revoke execute on function phase1.admin_api_prices(uuid) from public, anon;
revoke execute on function phase1.admin_api_price_ok(uuid, numeric) from public, anon, authenticated;
revoke execute on function phase1.admin_api_set_price(uuid, numeric) from public, anon;
revoke execute on function phase1.admin_api_set_client_price(uuid, uuid, numeric) from public, anon;
revoke execute on function phase1.admin_api_set_enabled(boolean) from public, anon;
grant execute on function phase1.admin_api_clients() to authenticated;
grant execute on function phase1.admin_api_set_status(uuid, text) to authenticated;
grant execute on function phase1.admin_api_prices(uuid) to authenticated;
grant execute on function phase1.admin_api_set_price(uuid, numeric) to authenticated;
grant execute on function phase1.admin_api_set_client_price(uuid, uuid, numeric) to authenticated;
grant execute on function phase1.admin_api_set_enabled(boolean) to authenticated;
