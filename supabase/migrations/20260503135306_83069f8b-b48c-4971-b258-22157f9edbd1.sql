ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS batched_at timestamptz;
ALTER TABLE public.agent_orders ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.agent_orders ADD COLUMN IF NOT EXISTS batched_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON public.orders(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_orders_batch_id ON public.agent_orders(batch_id) WHERE batch_id IS NOT NULL;