
-- 1. Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  api_base_url text,
  supports_webhooks boolean NOT NULL DEFAULT false,
  last_balance numeric,
  last_balance_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage suppliers" ON public.suppliers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 2. Create routing_rules table
CREATE TABLE IF NOT EXISTS public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage routing_rules" ON public.routing_rules
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Unique constraint: only one ACTIVE route per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_routing_rules_active_product
  ON public.routing_rules (product_id) WHERE status = 'ACTIVE';

-- 3. Create supplier_balance_snapshots table
CREATE TABLE IF NOT EXISTS public.supplier_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  balance numeric NOT NULL,
  source text NOT NULL DEFAULT 'API',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage supplier_balance_snapshots" ON public.supplier_balance_snapshots
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 4. Create webhook_events table
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id),
  event_name text,
  signature_valid boolean,
  payload_raw jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_status text NOT NULL DEFAULT 'pending',
  error_message text
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage webhook_events" ON public.webhook_events
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 5. Add validity_days to products (default 90)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS validity_days integer NOT NULL DEFAULT 90;

-- 6. Add supplier_id to orders (nullable, for tracking which supplier handled it)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id);

-- 7. Seed the two suppliers
INSERT INTO public.suppliers (code, name, is_active, supports_webhooks)
VALUES 
  ('SUPPLIER_A', 'Supplier A', true, true),
  ('DATAMART', 'DataMart', true, true)
ON CONFLICT (code) DO NOTHING;
