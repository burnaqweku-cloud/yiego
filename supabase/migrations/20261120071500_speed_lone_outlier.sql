-- 20 Nov 2026: one order stuck at the supplier since the evening before (YG-6C828AE25A) kept MTN's longest wait at
-- ~12 hours while every new order landed in 2-20 minutes, because the outlier rule only compared the longest wait
-- with the next longest, and it was the only order waiting. Now, with nobody else waiting, it is compared with the
-- network's typical time right now (the median), and left out when it is more than 2 hours beyond it. When orders
-- are genuinely stuck the median is itself long, so nothing true is hidden.
create or replace function phase1.delivery_speed_by_network()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'phase1', 'public'
as $function$
  with base as (
    select n.name as network, o.id, o.paid_at, o.status,
      coalesce((select max(e.created_at) from phase1.order_events e join phase1.suppliers s on s.id = o.supplier_id
                where e.order_id = o.id and e.event_type = 'supplier.fulfillment_started' and e.metadata->>'supplier' = s.code), o.paid_at) as started_at,
      (select max(e.created_at) from phase1.order_events e where e.order_id = o.id and e.to_status = 'delivered') as delivered_at
    from phase1.orders o join phase1.networks n on n.id = o.network_id
    where o.payment_status = 'succeeded' and o.paid_at >= now() - interval '24 hours'
      and (n.speed_reset_at is null or o.paid_at >= n.speed_reset_at)
      and o.status in ('processing','pending_supplier','delivered')
      and coalesce(o.admin_resolution_status,'') not in ('awaiting_verification','wrong_network')
      and (o.status = 'delivered' or ((o.supplier_purchase_id is not null or o.supplier_order_reference is not null)
           and lower(coalesce(o.supplier_status,'')) not in ('failed','rejected','cancelled','canceled','refunded','refund','not_approved')))
      and not exists (select 1 from phase1.order_events v where v.order_id = o.id and (v.message ilike '%verification%' or v.to_status = 'awaiting_verification'))),
  m as (
    select network, greatest(0, extract(epoch from (coalesce(delivered_at, now()) - started_at))/60) as mins, delivered_at is null as open
    from base where (delivered_at is null) or (delivered_at is not null and paid_at >= now() - interval '1 hour')),
  per as (select network, count(*) as n, percentile_cont(0.5) within group (order by mins) as med, (count(*) filter (where open)) * 2 > count(*) as med_open from m group by network),
  waits as (
    select network, (array_agg(w order by w desc))[1] as w1, (array_agg(w order by w desc))[2] as w2
    from (select network, greatest(0, extract(epoch from (now() - paid_at))/60) as w from base where delivered_at is null) x
    group by network),
  longest as (
    select w.network, case when w.w1 - coalesce(w.w2, p.med) > 120 then w.w2 else w.w1 end as mins
    from waits w left join per p on p.network = w.network)
  select coalesce((select jsonb_object_agg(per.network, jsonb_build_object('window', '1h', 'sample', per.n, 'at_least', per.med_open, 'median_minutes', round(per.med::numeric, 1))
      || case when l.mins is not null then jsonb_build_object('longest_minutes', round(l.mins::numeric, 1)) else '{}'::jsonb end)
    from per left join longest l on l.network = per.network), '{}'::jsonb)
$function$;
