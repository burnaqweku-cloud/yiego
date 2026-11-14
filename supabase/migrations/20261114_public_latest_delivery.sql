-- The latest order that arrived on each network, for the "Latest delivery" card every visitor sees above the bundles
-- (14 Nov 2026). Public and read-only: the bundle size, the number with its middle hidden, when it was paid, when it
-- landed, and how long ago that was by the server's clock. One real order per network, never a total.
-- An order MTN held to verify the number, or one sent to the wrong network, is not a delivery time and is left out.
create or replace function phase1.public_latest_delivery()
returns jsonb
language sql
stable
security definer
set search_path to 'phase1', 'public'
as $$
  select coalesce(jsonb_object_agg(x.network, jsonb_build_object(
           'gb', x.gb, 'phone', x.phone, 'paid_at', x.paid_at, 'delivered_at', x.delivered_at,
           'age_seconds', greatest(0, floor(extract(epoch from (now() - x.delivered_at))))::int)), '{}'::jsonb)
  from (
    select distinct on (n.id) n.name as network, dp.capacity_gb as gb,
           left(o.recipient_phone, 3) || '*****' || right(o.recipient_phone, 2) as phone, o.paid_at, d.at as delivered_at
    from phase1.orders o
      join phase1.networks n on n.id = o.network_id
      join phase1.data_products dp on dp.id = o.product_id
      cross join lateral (select max(e.created_at) as at from phase1.order_events e where e.order_id = o.id and e.to_status::text = 'delivered') d
    where o.status::text = 'delivered' and o.payment_status::text = 'succeeded' and o.paid_at is not null
      and o.updated_at > now() - interval '7 hours' and d.at > now() - interval '6 hours' and d.at >= o.paid_at
      and coalesce(o.admin_resolution_status::text, '') not in ('awaiting_verification', 'wrong_network')
      and not exists (select 1 from phase1.order_events v where v.order_id = o.id and (v.message ilike '%verification%' or v.to_status::text = 'awaiting_verification'))
      and o.recipient_phone ~ '^0[0-9]{9}$' and dp.capacity_gb > 0
    order by n.id, d.at desc, o.paid_at desc
  ) x;
$$;

revoke all on function phase1.public_latest_delivery() from public;
grant execute on function phase1.public_latest_delivery() to anon, authenticated, service_role;
