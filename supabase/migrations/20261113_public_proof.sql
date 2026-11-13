-- Proof for visitors an advert sends: the orders that have just gone out.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- Read-only, public, and it gives away nothing private: for the latest deliveries of the last hour the network, the
-- size and the number with its middle five digits hidden (055*****47), the way a MoMo message shows a number.
-- No totals on purpose (owner, 13 Nov 2026): a young shop's count reads as "new" to a stranger.
create or replace function phase1.public_proof()
returns jsonb language sql stable security definer set search_path to 'phase1', 'public' as $function$
  select jsonb_build_object('recent', coalesce((
    select jsonb_agg(jsonb_build_object('network', x.network, 'gb', x.gb, 'phone', x.phone, 'minutes', x.minutes) order by x.at desc)
    from (select n.name as network, dp.capacity_gb as gb, left(o.recipient_phone, 3) || '*****' || right(o.recipient_phone, 2) as phone,
                 greatest(0, floor(extract(epoch from (now() - d.at)) / 60))::int as minutes, d.at
          from phase1.orders o join phase1.networks n on n.id = o.network_id join phase1.data_products dp on dp.id = o.product_id
            cross join lateral (select max(e.created_at) as at from phase1.order_events e where e.order_id = o.id and e.to_status::text = 'delivered') d
          where o.status::text = 'delivered' and o.updated_at > now() - interval '70 minutes' and d.at > now() - interval '60 minutes'
            and o.recipient_phone ~ '^0[0-9]{9}$' and dp.capacity_gb > 0
          order by d.at desc limit 8) x), '[]'::jsonb));
$function$;
revoke all on function phase1.public_proof() from public;
grant execute on function phase1.public_proof() to anon, authenticated, service_role;
