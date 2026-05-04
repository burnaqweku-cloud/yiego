
CREATE TABLE public.supplier_plan_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code text NOT NULL,
  internal_network text NOT NULL,
  provider_network_id text NOT NULL,
  provider_network_name text,
  size_gb numeric NOT NULL,
  provider_plan_id text NOT NULL,
  provider_plan_name text,
  provider_price numeric,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(supplier_code, internal_network, size_gb)
);

ALTER TABLE public.supplier_plan_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage supplier plan mappings"
ON public.supplier_plan_mappings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
