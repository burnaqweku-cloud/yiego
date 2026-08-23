-- Zola's real cost prices, read from its own API.
--
-- A purchase that exceeds the float is refused but still returns the price, so
-- every figure here came from the supplier rather than a guess, without buying
-- anything. Two bands: GHS 4.00 per GB up to 15GB, GHS 3.90 from 20GB.
--
-- 12, 35, 45 and 100GB answered INVALID_CAPACITY - they do not sell those
-- sizes - so those offers are switched off. Leaving them on would let someone
-- pay for a bundle the supplier refuses.
--
-- 2 to 6GB are left unpriced: each costs less than the float, so probing them
-- would have placed real orders. They still sell, and their cost fills in from
-- the first real order of each size.
update phase1.supplier_product_mappings m
set supplier_price = case dp.capacity_gb::numeric
      when 1 then 4.00 when 8 then 32.00 when 10 then 40.00 when 15 then 60.00
      when 20 then 78.00 when 25 then 97.50 when 30 then 117.00
      when 40 then 156.00 when 50 then 195.00 end
from phase1.data_products dp, phase1.suppliers s
where dp.id = m.product_id and s.id = m.supplier_id and s.code = 'databundleshub'
  and dp.capacity_gb::numeric in (1,8,10,15,20,25,30,40,50);

update phase1.supplier_product_mappings m
set is_active = false
from phase1.data_products dp, phase1.suppliers s
where dp.id = m.product_id and s.id = m.supplier_id and s.code = 'databundleshub'
  and dp.capacity_gb::numeric in (12,35,45,100);

notify pgrst, 'reload schema';
