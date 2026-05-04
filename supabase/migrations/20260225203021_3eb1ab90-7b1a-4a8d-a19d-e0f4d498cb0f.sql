
-- Add wholesale columns to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_wholesale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS order_channel text,
  ADD COLUMN IF NOT EXISTS wholesale_unit_price numeric,
  ADD COLUMN IF NOT EXISTS wholesale_total_price numeric,
  ADD COLUMN IF NOT EXISTS agent_note text,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS supplier_attempts integer NOT NULL DEFAULT 0;

-- Create wholesale_batches table
CREATE TABLE IF NOT EXISTS public.wholesale_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_user_id uuid NOT NULL,
  raw_input_text text NOT NULL DEFAULT '',
  parsed_count integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create wholesale_batch_items table
CREATE TABLE IF NOT EXISTS public.wholesale_batch_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.wholesale_batches(id),
  line_number integer NOT NULL DEFAULT 0,
  network text NOT NULL DEFAULT '',
  bundle text NOT NULL DEFAULT '',
  recipient text NOT NULL DEFAULT '',
  validation_status text NOT NULL DEFAULT 'valid',
  validation_error text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_is_wholesale ON public.orders(is_wholesale) WHERE is_wholesale = true;
CREATE INDEX IF NOT EXISTS idx_orders_order_channel ON public.orders(order_channel);
CREATE INDEX IF NOT EXISTS idx_wholesale_batches_agent ON public.wholesale_batches(agent_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_batch_items_batch ON public.wholesale_batch_items(batch_id);

-- RLS for wholesale_batches
ALTER TABLE public.wholesale_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can manage own batches" ON public.wholesale_batches
  FOR ALL USING (agent_user_id = auth.uid())
  WITH CHECK (agent_user_id = auth.uid());

CREATE POLICY "Admins can manage all batches" ON public.wholesale_batches
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- RLS for wholesale_batch_items
ALTER TABLE public.wholesale_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batch items" ON public.wholesale_batch_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.wholesale_batches b
      WHERE b.id = wholesale_batch_items.batch_id
      AND b.agent_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wholesale_batches b
      WHERE b.id = wholesale_batch_items.batch_id
      AND b.agent_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all batch items" ON public.wholesale_batch_items
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());
