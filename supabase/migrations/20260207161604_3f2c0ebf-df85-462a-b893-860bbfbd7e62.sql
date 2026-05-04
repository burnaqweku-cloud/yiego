
-- Add display_order and supplier_last_updated to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_last_updated timestamp with time zone;

-- Create pricing_overrides table for manual price overrides (normal + agent)
CREATE TABLE IF NOT EXISTS public.pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_type text NOT NULL DEFAULT 'normal' CHECK (customer_type IN ('normal', 'agent')),
  pricing_mode text NOT NULL DEFAULT 'auto' CHECK (pricing_mode IN ('auto', 'manual')),
  manual_price numeric,
  markup_percent_override numeric,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (product_id, customer_type)
);

-- Enable RLS
ALTER TABLE public.pricing_overrides ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can manage pricing overrides"
ON public.pricing_overrides FOR ALL
USING (public.is_admin());

-- Anyone can read pricing overrides (needed for price computation on frontend)
CREATE POLICY "Anyone can view pricing overrides"
ON public.pricing_overrides FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_pricing_overrides_updated_at
BEFORE UPDATE ON public.pricing_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add agent pricing site_settings keys if not exist
INSERT INTO public.site_settings (key, value) VALUES
  ('agent_pricing_method', 'cost_plus_markup'),
  ('agent_markup_percent', '5'),
  ('agent_discount_percent', '10'),
  ('normal_markup_type', 'percent'),
  ('normal_markup_fixed', '0'),
  ('rounding_step', '0.01')
ON CONFLICT DO NOTHING;
