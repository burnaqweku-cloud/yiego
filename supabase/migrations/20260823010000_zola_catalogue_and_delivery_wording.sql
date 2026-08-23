-- Give Zola a catalogue, and the delivery sentence the team wants shown.
--
-- Customer prices mirror the existing plan so the two are directly comparable.
-- supplier_price is deliberately left null: only the 1GB rate has been seen on
-- a real invoice, and a guessed cost would quietly misreport margin. It fills
-- in as real orders come back.
--
-- Their Telecel starts at 10GB, so smaller Telecel bundles are not mapped —
-- offering one would sell something they will refuse to deliver.
insert into phase1.supplier_product_mappings
  (product_id, supplier_id, supplier_network_code, supplier_capacity, supplier_price, customer_price, is_active)
select
  dp.id,
  s.id,
  case when dp.app_product_code like 'mtn%' then 'MTN'
       when dp.app_product_code like 'tel%' then 'TELECEL'
       else 'AIRTELTIGO' end,
  dp.capacity_gb::text,
  case when dp.capacity_gb = 1 and dp.app_product_code like 'mtn%' then 4.00 else null end,
  dp.customer_price,
  true
from phase1.data_products dp
cross join phase1.suppliers s
where s.code = 'databundleshub'
  and dp.is_active
  and not (dp.app_product_code like 'tel%' and dp.capacity_gb < 10)
  and not exists (
    select 1 from phase1.supplier_product_mappings m
    where m.product_id = dp.id and m.supplier_id = s.id
  );

update phase1.suppliers
set delivery_panel = jsonb_build_object('banner', 'Orders are delivered within 5-30 minutes.'),
    delivery_estimate_updated_at = now()
where code = 'databundleshub';

notify pgrst, 'reload schema';
