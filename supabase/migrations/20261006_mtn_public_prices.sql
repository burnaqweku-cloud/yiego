-- Applied 6 Oct 2026 via Supabase MCP execute_sql (data change, owner's new public MTN prices).
-- Verified afterwards in a separate query. agent_price and store_default_price unchanged.
update phase1.data_products p set customer_price = v.price
from (values (1,4.10),(2,9.00),(3,13.50),(4,18.00),(5,22.40),(6,26.20),(8,35.80),(10,43.00),(15,64.80),(20,84.50),(25,108.00),(30,130.00),(40,171.70),(50,199.00)) v(gb,price)
where p.network_id = (select id from phase1.networks where code='mtn') and p.is_active and p.capacity_gb = v.gb;
-- Previous public prices: 4.00, 8.72, 13.07, 17.44, 21.79, 25.94, 34.65, 41.47, 62.37, 81.38, 103.95, 124.95, 164.85, 195.00
