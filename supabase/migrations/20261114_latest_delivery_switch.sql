-- Admin → Operations → Status: a switch for the latest-delivery card (owner, 14 Nov 2026). Applied live 14 Nov 2026.
-- Stored in site_settings 'latest_delivery' as {"always": true|false}. false (the default, and when the row is missing)
-- keeps the rule the site was built with: the card shows only a delivery that took 30 minutes or less while the network
-- is not slow. true shows the latest real delivery however long it took. Either way it still needs a delivery in the last
-- 6 hours and a network that is not paused (the site decides that part, lib/latestDelivery.ts).
-- public_latest_delivery() carries the switch as one extra key, "_rule", so the site reads it in the same call. Copies of
-- the site from before this change skip that key (it has no phone number, so it never passes as a delivery).

create or replace function phase1.admin_latest_delivery_rule() returns jsonb
language plpgsql stable security definer set search_path to 'phase1', 'public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return coalesce((select jsonb_build_object('always', coalesce((s.value->>'always')::boolean, false), 'updated_at', s.updated_at,
            'updated_by', (select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email) from auth.users u where u.id = s.updated_by))
          from phase1.site_settings s where s.key = 'latest_delivery'), jsonb_build_object('always', false, 'updated_at', null, 'updated_by', null));
end $$;

create or replace function phase1.admin_set_latest_delivery_rule(p_always boolean) returns void
language plpgsql security definer set search_path to 'phase1', 'public' as $$
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  insert into phase1.site_settings (key, value, updated_by) values ('latest_delivery', jsonb_build_object('always', coalesce(p_always, false)), auth.uid())
  on conflict (key) do update set value = jsonb_build_object('always', coalesce(p_always, false)), updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function phase1.admin_latest_delivery_rule() from public, anon;
revoke all on function phase1.admin_set_latest_delivery_rule(boolean) from public, anon;
grant execute on function phase1.admin_latest_delivery_rule() to authenticated, service_role;
grant execute on function phase1.admin_set_latest_delivery_rule(boolean) to authenticated, service_role;

create or replace function phase1.public_latest_delivery() returns jsonb language sql stable security definer set search_path to 'phase1','public' as $$
  select coalesce((select jsonb_object_agg(x.network, jsonb_build_object('gb', x.gb, 'phone', x.phone, 'paid_at', x.paid_at, 'delivered_at', x.delivered_at,
           'age_seconds', greatest(0, floor(extract(epoch from (now() - x.delivered_at))))::int))
  from (select distinct on (n.id) n.name as network, dp.capacity_gb as gb, left(o.recipient_phone,3)||'*****'||right(o.recipient_phone,2) as phone, o.paid_at, d.at as delivered_at
        from phase1.orders o join phase1.networks n on n.id=o.network_id join phase1.data_products dp on dp.id=o.product_id
          cross join lateral (select max(e.created_at) as at from phase1.order_events e where e.order_id=o.id and e.to_status::text='delivered') d
        where o.status::text='delivered' and o.payment_status::text='succeeded' and o.paid_at is not null
          and o.updated_at > now()-interval '7 hours' and d.at > now()-interval '6 hours' and d.at >= o.paid_at
          and coalesce(o.admin_resolution_status::text,'') not in ('awaiting_verification','wrong_network')
          and not exists (select 1 from phase1.order_events v where v.order_id=o.id and (v.message ilike '%verification%' or v.to_status::text='awaiting_verification'))
          and o.recipient_phone ~ '^0[0-9]{9}$' and dp.capacity_gb > 0
        order by n.id, d.at desc, o.paid_at desc) x), '{}'::jsonb)
  || jsonb_build_object('_rule', jsonb_build_object('always', coalesce((select (s.value->>'always')::boolean from phase1.site_settings s where s.key = 'latest_delivery'), false)));
$$;
