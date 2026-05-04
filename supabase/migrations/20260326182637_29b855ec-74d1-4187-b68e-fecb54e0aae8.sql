
-- Add supplier_timestamp to agent_orders (orders already has it)
ALTER TABLE public.agent_orders ADD COLUMN IF NOT EXISTS supplier_timestamp timestamptz;

-- Create supplier_status_sync_logs table
CREATE TABLE IF NOT EXISTS public.supplier_status_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'webhook',
  local_order_table text NOT NULL,
  local_order_id text NOT NULL,
  supplier_reference text,
  supplier_status text,
  mapped_platform_status text,
  previous_local_status text,
  applied boolean NOT NULL DEFAULT false,
  reason text,
  raw_meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: only admins can view sync logs
ALTER TABLE public.supplier_status_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or staff can view sync logs"
  ON public.supplier_status_sync_logs
  FOR SELECT
  TO authenticated
  USING (is_admin_or_staff());

CREATE POLICY "Service role manages sync logs"
  ON public.supplier_status_sync_logs
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
