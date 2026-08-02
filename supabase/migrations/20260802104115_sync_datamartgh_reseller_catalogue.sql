-- Synchronize YieGo's sellable Phase 1 catalogue with DataMartGH's reseller
-- catalogue captured on 2026-08-02. Customer price intentionally equals the
-- supplier price for this rollout, as requested. Future supplier changes are
-- displayed live in Admin but are not automatically written to checkout prices.

-- First take the currently configured supplier networks out of sale. Products
-- found in the current catalogue below are reactivated by the upsert.
update phase1.data_products p
set is_active = false,
    updated_at = now()
from phase1.networks n
where n.id = p.network_id
  and n.code in ('mtn', 'telecel', 'airteltigo');

update phase1.supplier_product_mappings m
set is_active = false,
    updated_at = now()
from phase1.data_products p,
     phase1.suppliers s
where p.id = m.product_id
  and s.id = m.supplier_id
  and s.code = 'datamartgh';

with supplier_catalogue (
  app_product_code,
  network_code,
  supplier_network_code,
  capacity_gb,
  capacity_mb,
  supplier_price,
  display_order
) as (
  values
    ('mtn-1',   'mtn',        'YELLO',      1::numeric,   1000,   4.00::numeric,   10),
    ('mtn-2',   'mtn',        'YELLO',      2,            2000,   8.00,             20),
    ('mtn-3',   'mtn',        'YELLO',      3,            3000,  12.00,             30),
    ('mtn-4',   'mtn',        'YELLO',      4,            4000,  16.00,             40),
    ('mtn-5',   'mtn',        'YELLO',      5,            5000,  20.00,             50),
    ('mtn-6',   'mtn',        'YELLO',      6,            6000,  24.00,             60),
    ('mtn-8',   'mtn',        'YELLO',      8,            8000,  32.00,             80),
    ('mtn-10',  'mtn',        'YELLO',     10,           10000,  39.00,            100),
    ('mtn-15',  'mtn',        'YELLO',     15,           15000,  57.00,            150),
    ('mtn-20',  'mtn',        'YELLO',     20,           20000,  76.50,            200),
    ('mtn-25',  'mtn',        'YELLO',     25,           25000,  96.00,            250),
    ('mtn-30',  'mtn',        'YELLO',     30,           30000, 115.00,            300),
    ('mtn-40',  'mtn',        'YELLO',     40,           40000, 157.00,            400),
    ('mtn-50',  'mtn',        'YELLO',     50,           50000, 185.00,            500),
    ('mtn-100', 'mtn',        'YELLO',    100,          100000, 407.00,           1000),

    ('tel-5',   'telecel',    'TELECEL',    5,            5000,  19.50,             50),
    ('tel-8',   'telecel',    'TELECEL',    8,            8000,  34.64,             80),
    ('tel-10',  'telecel',    'TELECEL',   10,           10000,  36.50,            100),
    ('tel-12',  'telecel',    'TELECEL',   12,           12000,  43.70,            120),
    ('tel-15',  'telecel',    'TELECEL',   15,           15000,  52.85,            150),
    ('tel-20',  'telecel',    'TELECEL',   20,           20000,  69.80,            200),
    ('tel-25',  'telecel',    'TELECEL',   25,           25000,  86.75,            250),
    ('tel-30',  'telecel',    'TELECEL',   30,           30000, 103.70,            300),
    ('tel-35',  'telecel',    'TELECEL',   35,           35000, 120.65,            350),
    ('tel-40',  'telecel',    'TELECEL',   40,           40000, 137.60,            400),
    ('tel-45',  'telecel',    'TELECEL',   45,           45000, 154.55,            450),
    ('tel-50',  'telecel',    'TELECEL',   50,           50000, 171.50,            500),
    ('tel-100', 'telecel',    'TELECEL',  100,          100000, 341.00,           1000),

    ('at-1',    'airteltigo', 'AT_PREMIUM', 1,            1000,   3.95,             10),
    ('at-2',    'airteltigo', 'AT_PREMIUM', 2,            2000,   8.35,             20),
    ('at-3',    'airteltigo', 'AT_PREMIUM', 3,            3000,  13.25,             30),
    ('at-4',    'airteltigo', 'AT_PREMIUM', 4,            4000,  16.50,             40),
    ('at-5',    'airteltigo', 'AT_PREMIUM', 5,            5000,  19.50,             50),
    ('at-6',    'airteltigo', 'AT_PREMIUM', 6,            6000,  23.50,             60),
    ('at-8',    'airteltigo', 'AT_PREMIUM', 8,            8000,  30.50,             80),
    ('at-10',   'airteltigo', 'AT_PREMIUM',10,           10000,  38.50,            100),
    ('at-12',   'airteltigo', 'AT_PREMIUM',12,           12000,  45.50,            120),
    ('at-15',   'airteltigo', 'AT_PREMIUM',15,           15000,  57.50,            150),
    ('at-25',   'airteltigo', 'AT_PREMIUM',25,           25000,  95.00,            250),
    ('at-30',   'airteltigo', 'AT_PREMIUM',30,           30000, 115.00,            300),
    ('at-40',   'airteltigo', 'AT_PREMIUM',40,           40000, 151.00,            400),
    ('at-50',   'airteltigo', 'AT_PREMIUM',50,           50000, 190.00,            500)
), upserted as (
  insert into phase1.data_products (
    app_product_code,
    network_id,
    name,
    capacity_gb,
    capacity_mb,
    validity,
    customer_price,
    cost_price,
    is_active,
    display_order
  )
  select
    c.app_product_code,
    n.id,
    n.name || ' Data — ' || c.capacity_gb::text || 'GB',
    c.capacity_gb,
    c.capacity_mb,
    null,
    c.supplier_price,
    c.supplier_price,
    true,
    c.display_order
  from supplier_catalogue c
  join phase1.networks n on n.code = c.network_code
  on conflict (app_product_code) do update set
    network_id = excluded.network_id,
    name = excluded.name,
    capacity_gb = excluded.capacity_gb,
    capacity_mb = excluded.capacity_mb,
    validity = excluded.validity,
    customer_price = excluded.customer_price,
    cost_price = excluded.cost_price,
    is_active = true,
    display_order = excluded.display_order,
    updated_at = now()
  returning id, app_product_code
)
select count(*) from upserted;

with supplier_catalogue (app_product_code, supplier_network_code, capacity_gb, supplier_price) as (
  values
    ('mtn-1','YELLO',1::numeric,4.00::numeric),('mtn-2','YELLO',2,8.00),('mtn-3','YELLO',3,12.00),('mtn-4','YELLO',4,16.00),('mtn-5','YELLO',5,20.00),('mtn-6','YELLO',6,24.00),('mtn-8','YELLO',8,32.00),('mtn-10','YELLO',10,39.00),('mtn-15','YELLO',15,57.00),('mtn-20','YELLO',20,76.50),('mtn-25','YELLO',25,96.00),('mtn-30','YELLO',30,115.00),('mtn-40','YELLO',40,157.00),('mtn-50','YELLO',50,185.00),('mtn-100','YELLO',100,407.00),
    ('tel-5','TELECEL',5,19.50),('tel-8','TELECEL',8,34.64),('tel-10','TELECEL',10,36.50),('tel-12','TELECEL',12,43.70),('tel-15','TELECEL',15,52.85),('tel-20','TELECEL',20,69.80),('tel-25','TELECEL',25,86.75),('tel-30','TELECEL',30,103.70),('tel-35','TELECEL',35,120.65),('tel-40','TELECEL',40,137.60),('tel-45','TELECEL',45,154.55),('tel-50','TELECEL',50,171.50),('tel-100','TELECEL',100,341.00),
    ('at-1','AT_PREMIUM',1,3.95),('at-2','AT_PREMIUM',2,8.35),('at-3','AT_PREMIUM',3,13.25),('at-4','AT_PREMIUM',4,16.50),('at-5','AT_PREMIUM',5,19.50),('at-6','AT_PREMIUM',6,23.50),('at-8','AT_PREMIUM',8,30.50),('at-10','AT_PREMIUM',10,38.50),('at-12','AT_PREMIUM',12,45.50),('at-15','AT_PREMIUM',15,57.50),('at-25','AT_PREMIUM',25,95.00),('at-30','AT_PREMIUM',30,115.00),('at-40','AT_PREMIUM',40,151.00),('at-50','AT_PREMIUM',50,190.00)
)
insert into phase1.supplier_product_mappings (
  product_id,
  supplier_id,
  supplier_network_code,
  supplier_capacity,
  supplier_price,
  is_active,
  metadata
)
select
  p.id,
  s.id,
  c.supplier_network_code,
  c.capacity_gb::text,
  c.supplier_price,
  true,
  jsonb_build_object('source', 'datamartgh_reseller_api', 'captured_at', '2026-08-02')
from supplier_catalogue c
join phase1.data_products p on p.app_product_code = c.app_product_code
join phase1.suppliers s on s.code = 'datamartgh'
on conflict (product_id, supplier_id) do update set
  supplier_network_code = excluded.supplier_network_code,
  supplier_capacity = excluded.supplier_capacity,
  supplier_price = excluded.supplier_price,
  is_active = true,
  metadata = excluded.metadata,
  updated_at = now();
