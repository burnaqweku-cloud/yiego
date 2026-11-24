-- Admin → Operations → Status: a switch for the delivery speed shown across the site (owner, 24 Nov 2026:
-- "Do something that can make me turn off delivery speed status"). Stored in site_settings 'delivery_speed' as
-- {"enabled": true|false}. true (the default, and when the row is missing) keeps everything as it was. false hides
-- every speed figure customers and agents see at once: the speed pill and line in the bundle lists, the shop band's
-- "right now" line, the slow range board, the home page strip, the delivery-times page and agents' order notes. The
-- latest-delivery card steps aside too, since its figures are speed claims (its own "Latest delivery card" switch is
-- untouched). The site decides all of this (src/hooks/useLatestDelivery.ts, useLiveSpeeds); this function only
-- carries the switch.
-- public_latest_delivery() carries it as one extra key, "_speed", so the site reads it in the same call it already
-- makes. Copies of the site from before this change skip that key (it has no phone number, so it never passes as a
-- delivery), and copies of the server from before this change send no "_speed" key, which the new site reads as on.

create or replace function phase1.admin_delivery_speed_rule() returns jsonb
language plpgsql stable security definer set search_path to 'phase1', 'public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return coalesce((select jsonb_build_object('enabled', coalesce((s.value->>'enabled')::boolean, true), 'updated_at', s.updated_at,
            'updated_by', (select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email) from auth.users u where u.id = s.updated_by))
          from phase1.site_settings s where s.key = 'delivery_speed'), jsonb_build_object('enabled', true, 'updated_at', null, 'updated_by', null));
end $$;

create or replace function phase1.admin_set_delivery_speed_rule(p_enabled boolean) returns void
language plpgsql security definer set search_path to 'phase1', 'public' as $$
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  insert into phase1.site_settings (key, value, updated_by) values ('delivery_speed', jsonb_build_object('enabled', coalesce(p_enabled, true)), auth.uid())
  on conflict (key) do update set value = jsonb_build_object('enabled', coalesce(p_enabled, true)), updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function phase1.admin_delivery_speed_rule() from public, anon;
revoke all on function phase1.admin_set_delivery_speed_rule(boolean) from public, anon;
grant execute on function phase1.admin_delivery_speed_rule() to authenticated, service_role;
grant execute on function phase1.admin_set_delivery_speed_rule(boolean) to authenticated, service_role;

-- Same body as 20261119170000_latest_delivery_no_cap.sql, plus the "_speed" key next to "_rule".
create or replace function phase1.public_latest_delivery()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'phase1', 'public'
as $function$
  select coalesce((select jsonb_object_agg(x.network, jsonb_build_object('gb', x.gb, 'phone', x.phone, 'paid_at', x.paid_at, 'delivered_at', x.delivered_at,
           'age_seconds', greatest(0, floor(extract(epoch from (now() - x.delivered_at))))::int))
  from (select distinct on (n.id) n.name as network, dp.capacity_gb as gb, left(o.recipient_phone,3)||'*****'||right(o.recipient_phone,2) as phone, o.paid_at, d.at as delivered_at
        from phase1.orders o join phase1.networks n on n.id=o.network_id join phase1.data_products dp on dp.id=o.product_id
          cross join lateral (select max(e.created_at) as at from phase1.order_events e where e.order_id=o.id and e.to_status::text='delivered') d
        where o.status::text='delivered' and o.payment_status::text='succeeded' and o.paid_at is not null
          and o.updated_at > now()-interval '3 days' and d.at >= o.paid_at
          and coalesce(o.admin_resolution_status::text,'') not in ('awaiting_verification','wrong_network')
          and not exists (select 1 from phase1.order_events v where v.order_id=o.id and (v.message ilike '%verification%' or v.to_status::text='awaiting_verification'))
          and o.recipient_phone ~ '^0[0-9]{9}$' and dp.capacity_gb > 0
        order by n.id, d.at desc, o.paid_at desc) x), '{}'::jsonb)
  || jsonb_build_object('_rule', jsonb_build_object('always', coalesce((select (s.value->>'always')::boolean from phase1.site_settings s where s.key = 'latest_delivery'), false)),
                        '_speed', jsonb_build_object('enabled', coalesce((select (s.value->>'enabled')::boolean from phase1.site_settings s where s.key = 'delivery_speed'), true)));
$function$;
