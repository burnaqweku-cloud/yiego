-- Reseller API, step 2 (owner, 21 Nov 2026: "Go ahead"): what the seller's API page needs.
--   my_api_account()  the signed-in account's API status, keys (hints only), today's figures, latest orders, prices
--   my_api_apply()    anyone signed in applies (agents too); the master account gets a phone alert
--   my_api_new_key()  makes a live or test key for an active seller, retiring that mode's old key; the plain key is
--                     returned this once and only its SHA-256 is kept
-- The api_* functions stay for the edge function only (service role); the browser reaches only my_api_*.

-- Bundle list without the service-role check, for my_api_account (never granted to the browser).
create or replace function phase1.api_bundles_for(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
begin
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

create or replace function phase1.api_bundles(p_client uuid)
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
begin
  perform phase1.api_service_only();
  return phase1.api_bundles_for(p_client);
end $$;

-- Key making without the service-role check (never granted to the browser).
create or replace function phase1.api_new_key_core(p_client uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare v_key text; v_id uuid;
begin
  if p_mode not in ('live', 'test') then raise exception 'bad_mode'; end if;
  v_key := 'dy_' || p_mode || '_' || replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  insert into phase1.api_keys (client_id, mode, key_hash, key_hint)
  values (p_client, p_mode, encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), left(v_key, 12) || '…' || right(v_key, 4))
  returning id into v_id;
  return jsonb_build_object('key_id', v_id, 'key', v_key, 'mode', p_mode);
end $$;

create or replace function phase1.api_issue_key(p_client uuid, p_mode text default 'live')
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
begin
  perform phase1.api_service_only();
  return phase1.api_new_key_core(p_client, p_mode);
end $$;

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
      else '[]'::jsonb end
  );
end $$;

create or replace function phase1.my_api_apply(p_name text, p_phone text, p_website text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients; v_phone text; v_name text; v_email text; m record;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  v_name := left(btrim(coalesce(p_name, '')), 80);
  if length(v_name) < 2 then raise exception 'name_needed'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if v_phone ~ '^233\d{9}$' then v_phone := '0' || right(v_phone, 9); end if;
  if v_phone !~ '^0\d{9}$' then raise exception 'phone_needed'; end if;
  select * into c from phase1.api_clients where user_id = auth.uid() for update;
  if c.id is not null then
    -- Already applied: a pending application can be corrected, anything else stays as it is.
    if c.status = 'pending' then
      update phase1.api_clients set name = v_name, contact_phone = v_phone, website = nullif(left(btrim(coalesce(p_website, '')), 200), ''),
        note = nullif(left(btrim(coalesce(p_note, '')), 1000), '') where id = c.id;
    end if;
    return jsonb_build_object('status', c.status);
  end if;
  insert into phase1.api_clients (user_id, name, status, contact_phone, website, note)
  values (auth.uid(), v_name, 'pending', v_phone, nullif(left(btrim(coalesce(p_website, '')), 200), ''), nullif(left(btrim(coalesce(p_note, '')), 1000), ''))
  returning * into c;
  select email into v_email from auth.users where id = auth.uid();
  -- Phone alert to the master account only (kind 'alert' goes to the given account's phones).
  for m in select u.user_id from phase1.admin_users u where u.role = 'master' and u.is_active loop
    perform phase1.push_enqueue('alert', 'api_apply:' || c.id || ':' || m.user_id, 'API application',
      v_name || ' (' || coalesce(v_email, v_phone) || ') applied for API access. Phone ' || v_phone || '.',
      '/admin', null, null, m.user_id);
  end loop;
  return jsonb_build_object('status', 'pending');
end $$;

create or replace function phase1.my_api_new_key(p_mode text)
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare c phase1.api_clients;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_mode not in ('live', 'test') then raise exception 'bad_mode'; end if;
  select * into c from phase1.api_clients where user_id = auth.uid() for update;
  if c.id is null or c.status <> 'active' then raise exception 'not_active'; end if;
  if (select count(*) from phase1.api_keys where client_id = c.id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_keys';
  end if;
  update phase1.api_keys set revoked_at = now() where client_id = c.id and mode = p_mode and revoked_at is null;
  return phase1.api_new_key_core(c.id, p_mode);
end $$;

-- Only the edge function (service role) may call the api_* functions; the browser gets my_api_*.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'phase1' and p.proname like 'api\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
revoke execute on function phase1.my_api_account() from public, anon;
revoke execute on function phase1.my_api_apply(text, text, text, text) from public, anon;
revoke execute on function phase1.my_api_new_key(text) from public, anon;
grant execute on function phase1.my_api_account() to authenticated;
grant execute on function phase1.my_api_apply(text, text, text, text) to authenticated;
grant execute on function phase1.my_api_new_key(text) to authenticated;
