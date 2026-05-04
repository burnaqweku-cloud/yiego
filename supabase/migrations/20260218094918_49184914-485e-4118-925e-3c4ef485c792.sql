
-- Add is_checkpoint flag to orders table
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS is_checkpoint boolean NOT NULL DEFAULT false;

-- Create delivery_checkpoints table
CREATE TABLE IF NOT EXISTS public.delivery_checkpoints (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  confirmed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'PENDING',
  test_phone text NOT NULL,
  network text NOT NULL DEFAULT 'MTN',
  bundle_id text,
  bundle_name text,
  supplier_order_id text,
  internal_order_id text,
  created_by_admin_id uuid NOT NULL,
  confirmed_by_admin_id uuid,
  orders_delivered_count integer NOT NULL DEFAULT 0,
  notes text,
  CONSTRAINT delivery_checkpoints_status_check CHECK (status IN ('PENDING', 'CONFIRMED', 'PAUSED', 'LIMIT_REACHED'))
);

-- RLS for delivery_checkpoints
ALTER TABLE public.delivery_checkpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery checkpoints"
  ON public.delivery_checkpoints
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin or staff can view delivery checkpoints"
  ON public.delivery_checkpoints
  FOR SELECT
  USING (is_admin_or_staff());

-- Create checkpoint_settings table (stores admin config for checkpoint system)
CREATE TABLE IF NOT EXISTS public.checkpoint_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  test_network text NOT NULL DEFAULT 'MTN',
  test_phone text NOT NULL DEFAULT '',
  test_bundle_id text,
  test_bundle_name text,
  min_gap_hours integer NOT NULL DEFAULT 3,
  daily_max integer NOT NULL DEFAULT 5,
  active_hours_start integer NOT NULL DEFAULT 6,
  active_hours_end integer NOT NULL DEFAULT 23,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Seed a single default row
INSERT INTO public.checkpoint_settings (id, enabled, test_network, test_phone, min_gap_hours, daily_max, active_hours_start, active_hours_end)
VALUES (gen_random_uuid(), true, 'MTN', '', 3, 5, 6, 23)
ON CONFLICT DO NOTHING;

-- RLS for checkpoint_settings
ALTER TABLE public.checkpoint_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage checkpoint settings"
  ON public.checkpoint_settings
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admin or staff can view checkpoint settings"
  ON public.checkpoint_settings
  FOR SELECT
  USING (is_admin_or_staff());
