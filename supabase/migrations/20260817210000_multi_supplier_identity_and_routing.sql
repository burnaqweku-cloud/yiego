-- ══════════════════════════════════════════════════════════════
-- Multi-supplier, step 1: identity and deterministic routing.
--
-- Each supplier stands on its own: customers see a name we invent
-- for it, its own delivery wording, and its own prices. Nothing
-- here changes how the existing supplier behaves.
-- ══════════════════════════════════════════════════════════════

-- What the customer sees. Never the real supplier name.
alter table phase1.suppliers
  add column if not exists public_name text,
  add column if not exists public_blurb text,
  add column if not exists is_customer_visible boolean not null default false,
  add column if not exists display_order integer not null default 100;

comment on column phase1.suppliers.public_name is
  'Customer-facing label invented by us (e.g. "MTN Duva"). The real supplier name is never shown.';
comment on column phase1.suppliers.is_customer_visible is
  'Only visible suppliers appear as a choice in the shop.';

-- Each supplier prices its own offer. customer_price on data_products stays as
-- the fallback for rows no supplier has priced yet.
alter table phase1.supplier_product_mappings
  add column if not exists customer_price numeric(12,2);

comment on column phase1.supplier_product_mappings.customer_price is
  'What the customer pays for this bundle from THIS supplier. Null falls back to data_products.customer_price.';

-- Routing must be deterministic: with more than one supplier, "limit 1" without
-- an order is a coin toss. Every lookup now resolves through this.
create or replace function phase1.resolve_supplier_mapping(p_product_id uuid, p_supplier_id uuid default null)
returns phase1.supplier_product_mappings
language sql stable security definer set search_path = phase1, public as $$
  select m.*
  from phase1.supplier_product_mappings m
  join phase1.suppliers s on s.id = m.supplier_id
  where m.product_id = p_product_id
    and m.is_active
    and s.status = 'active'
    and (p_supplier_id is null or m.supplier_id = p_supplier_id)
  order by
    -- an explicitly chosen supplier always wins
    (m.supplier_id = coalesce(p_supplier_id, m.supplier_id)) desc,
    s.display_order asc,
    s.created_at asc,
    m.id asc
  limit 1;
$$;

revoke all on function phase1.resolve_supplier_mapping(uuid, uuid) from public, anon, authenticated;
grant execute on function phase1.resolve_supplier_mapping(uuid, uuid) to service_role;

-- Backfill: the existing supplier keeps today's prices and stays hidden until
-- it is given a public name.
update phase1.supplier_product_mappings m
set customer_price = dp.customer_price
from phase1.data_products dp
where dp.id = m.product_id and m.customer_price is null;

update phase1.suppliers set display_order = 10 where code = 'datamartgh';

notify pgrst, 'reload schema';
