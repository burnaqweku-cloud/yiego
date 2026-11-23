-- The last delivered order at the top of Admin → Orders (23 Nov 2026, owner). The same choice of order as the public
-- latest-delivery card (public_latest_delivery: delivered and paid, delivered after payment, not an MTN-verification
-- order, within 3 days), one per network, but with what an admin needs: the reference, the full number, the supplier,
-- where it was bought (our site, a store, the API) and the order id to open it. Any admin; read-only.
create or replace function phase1.admin_last_delivered()
 returns jsonb language plpgsql stable security definer set search_path to 'phase1', 'public' as $function$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return coalesce((select jsonb_object_agg(x.network, jsonb_build_object('id', x.id, 'reference', x.order_reference, 'gb', x.gb, 'phone', x.recipient_phone,
      'paid_at', x.paid_at, 'delivered_at', x.delivered_at, 'supplier', x.supplier, 'store', x.store, 'api', x.api, 'amount', x.amount))
    from (select distinct on (n.id) n.name as network, o.id, o.order_reference, dp.capacity_gb as gb, o.recipient_phone, o.paid_at, d.at as delivered_at, o.amount,
            (select s.name from phase1.suppliers s where s.id = o.supplier_id) as supplier,
            (select a.store_name from phase1.agents a where a.id = o.agent_id) as store, o.api_client_id is not null as api
          from phase1.orders o join phase1.networks n on n.id = o.network_id join phase1.data_products dp on dp.id = o.product_id
            cross join lateral (select max(e.created_at) as at from phase1.order_events e where e.order_id = o.id and e.to_status::text = 'delivered') d
          where o.status::text = 'delivered' and o.payment_status::text = 'succeeded' and o.paid_at is not null
            and o.updated_at > now() - interval '3 days' and d.at >= o.paid_at
            and coalesce(o.admin_resolution_status::text, '') not in ('awaiting_verification', 'wrong_network')
            and not exists (select 1 from phase1.order_events v where v.order_id = o.id and (v.message ilike '%verification%' or v.to_status::text = 'awaiting_verification'))
            and dp.capacity_gb > 0
          order by n.id, d.at desc, o.paid_at desc) x), '{}'::jsonb);
end $function$;

revoke execute on function phase1.admin_last_delivered() from public, anon;
grant execute on function phase1.admin_last_delivered() to authenticated;
