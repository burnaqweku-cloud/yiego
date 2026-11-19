-- 19 Nov 2026 (owner: "Last delivered order doesn't need to have a limit cap"): the last delivered order is no longer
-- dropped after 6 hours, so the slow range keeps its "From" figure while a network is stuck (that afternoon MTN's last
-- delivery was 10:35, so the card showed "From 9.4 hours  Up to 9.4 hours"). It looks back 3 days only so the lookup
-- stays quick (33 ms). The fast latest-delivery card keeps its own 6-hour rule in the site (FRESH_HOURS in
-- src/lib/latestDelivery.ts, deliveryToShow), so an old quick delivery is still never shown as news.
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
  || jsonb_build_object('_rule', jsonb_build_object('always', coalesce((select (s.value->>'always')::boolean from phase1.site_settings s where s.key = 'latest_delivery'), false)));
$function$;
