
-- Add cost_price and markup_percent to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price_ghs numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS markup_percent numeric DEFAULT NULL;

-- Add supplier_raw_response to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_raw_response text DEFAULT NULL;

-- Insert default pricing settings into site_settings (if not exists)
INSERT INTO public.site_settings (key, value)
VALUES 
  ('default_markup_percent', '15'),
  ('mtn_markup_percent', ''),
  ('telecel_markup_percent', ''),
  ('airteltigo_markup_percent', ''),
  ('rounding_mode', '2_decimals')
ON CONFLICT (key) DO NOTHING;
