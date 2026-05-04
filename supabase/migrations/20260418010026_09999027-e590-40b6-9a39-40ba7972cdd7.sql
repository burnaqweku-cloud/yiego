-- Backfill orders table
UPDATE public.orders
SET
  supplier_order_id = (supplier_raw_response::jsonb->'data'->>'order_id'),
  supplier_reference = COALESCE(
    supplier_raw_response::jsonb->'data'->>'reference',
    supplier_reference
  )
WHERE supplier_id = '786f18b7-681d-4aa8-bb07-cb16dca2bdd1'
  AND status IN ('Pending','Processing')
  AND supplier_raw_response IS NOT NULL
  AND (supplier_raw_response::jsonb->'data'->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND created_at > now() - interval '14 days';

-- Backfill agent_orders (no supplier_id column there; key off raw response trace)
UPDATE public.agent_orders
SET
  supplier_order_id = (supplier_raw_response::jsonb->'data'->>'order_id'),
  supplier_reference = COALESCE(
    supplier_raw_response::jsonb->'data'->>'reference',
    supplier_reference
  )
WHERE status IN ('Pending','Processing','Paid','pending','processing','paid')
  AND supplier_raw_response IS NOT NULL
  AND supplier_raw_response LIKE '%api-gateway%'
  AND (supplier_raw_response::jsonb->'data'->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND created_at > now() - interval '14 days';