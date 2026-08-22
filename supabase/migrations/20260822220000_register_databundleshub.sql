-- ══════════════════════════════════════════════════════════════
-- Register DataBundlesHub as supplier #2.
--
-- It stands beside DataMartGH rather than replacing it. Only the
-- products mapped to it can route to it, so switching it on is a
-- per-bundle decision, not a cutover.
--
-- supplier_network_code holds OUR network name (MTN / TELECEL /
-- AIRTELTIGO), not their wire code: the adapter compares it with
-- the network it reads off the recipient's prefix, and refuses the
-- order when the two disagree. They accept no network override, so
-- that check is the only thing standing between a ported number
-- and a delivery to the wrong network.
-- ══════════════════════════════════════════════════════════════
insert into phase1.suppliers (code, name, base_url, status, display_order, is_customer_visible)
values ('databundleshub', 'DataBundlesHub', 'https://databundleshub.com', 'active', 5, false)
on conflict (code) do update
  set base_url = excluded.base_url,
      status = excluded.status,
      display_order = excluded.display_order;

-- Start with the one bundle proven end to end on a live order.
insert into phase1.supplier_product_mappings
  (product_id, supplier_id, supplier_network_code, supplier_capacity, supplier_price, customer_price, is_active)
select dp.id, s.id, 'MTN', dp.capacity_gb::text, 4.00, dp.customer_price, true
from phase1.data_products dp
cross join phase1.suppliers s
where dp.app_product_code = 'mtn-1' and s.code = 'databundleshub'
on conflict do nothing;

notify pgrst, 'reload schema';
