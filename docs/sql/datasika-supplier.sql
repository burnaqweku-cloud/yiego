-- 2026-10-30 — DataSika as an extra MTN supplier (like EmmaDataKing). Routing unchanged:
-- mappings are inactive, so no order goes to DataSika until it is chosen in Admin → Suppliers
-- (main, fallback or "Always via"). Secret DATASIKA_API_KEY lives on the live functions project.
begin;
insert into phase1.suppliers (code, name, base_url, status, display_order, metadata)
values ('datasika', 'DataSika', 'https://nrsfvhztpzwkadwciizp.supabase.co/functions/v1', 'active', 18,
        '{"notes":"MTN via /api-buy-data (product_id from /api-catalog). Added 2026-10-30.","balance_path":"/api-wallet","topup_fee_rate":0}'::jsonb)
on conflict (code) do nothing;

insert into phase1.supplier_product_mappings (product_id, supplier_id, supplier_network_code, supplier_capacity, supplier_price, is_active, metadata)
select p.id, s.id, 'MTN', trim(to_char(p.capacity_gb, 'FM999990.##')), c.price, false, '{}'::jsonb
from phase1.data_products p
join phase1.networks n on n.id = p.network_id and upper(n.code) = 'MTN'
join (values (1,4.00),(2,8.00),(3,12.00),(4,16.00),(5,20.00),(6,24.00),(8,33.00),(10,40.00),(15,59.00),(20,78.00),(25,98.00),(30,119.00),(40,160.00),(50,195.00)) as c(gb, price)
  on c.gb = p.capacity_gb
cross join (select id from phase1.suppliers where code = 'datasika') s
on conflict (product_id, supplier_id) do nothing;

insert into phase1.finance_accounts (code, name, kind, supplier_id, sort_order)
select 'float_datasika', 'Supplier float · DataSika', 'asset', id, 24 from phase1.suppliers where code = 'datasika'
on conflict do nothing;

select cron.schedule('sync-datasika-order-status', '*/10 * * * *',
  $$select net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/sync-datasika-order-status', '{}'::jsonb, '{}'::jsonb, jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')))$$);
commit;
