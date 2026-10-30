-- Run only AFTER all sending functions have been deployed with the DataSika adapter.
-- Makes existing MTN bundles selectable; does not choose DataSika for any route.
begin;
update phase1.supplier_product_mappings m
set is_active = true
from phase1.suppliers s, phase1.data_products p, phase1.networks n
where m.supplier_id = s.id and s.code = 'datasika'
  and m.product_id = p.id and p.network_id = n.id and lower(n.code) = 'mtn'
  and m.supplier_network_code = 'MTN'
  and m.supplier_price > 0 and m.supplier_capacity::numeric = p.capacity_gb;
commit;