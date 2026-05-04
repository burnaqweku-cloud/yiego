
CREATE TABLE public.supplier_c_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network TEXT NOT NULL,
  bundle_size_gb NUMERIC NOT NULL,
  plan_label TEXT NOT NULL DEFAULT '',
  supplier_cost NUMERIC NOT NULL DEFAULT 0,
  normal_selling_price NUMERIC NOT NULL DEFAULT 0,
  agent_base_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(network, bundle_size_gb)
);

ALTER TABLE public.supplier_c_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage supplier_c_pricing"
  ON public.supplier_c_pricing
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
