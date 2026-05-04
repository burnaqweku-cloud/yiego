
-- Table to track agent WhatsApp channel banner dismissals (7-day reappear logic)
CREATE TABLE public.agent_channel_dismissals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(agent_id)
);

ALTER TABLE public.agent_channel_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agents can manage own dismissals"
ON public.agent_channel_dismissals
FOR ALL
USING (agent_id = get_my_agent_id())
WITH CHECK (agent_id = get_my_agent_id());

CREATE POLICY "Admins can manage all dismissals"
ON public.agent_channel_dismissals
FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Backfill missing profits for orders that have cost_price_ghs but null profit_ghs
UPDATE public.orders
SET profit_ghs = amount_ghs - COALESCE(cost_price_ghs, 0)
WHERE profit_ghs IS NULL
  AND cost_price_ghs IS NOT NULL
  AND status IN ('Paid', 'Processing', 'Delivered');

-- Also backfill orders where cost_price_ghs is null but product_id exists
UPDATE public.orders o
SET 
  cost_price_ghs = p.cost_price_ghs,
  profit_ghs = o.amount_ghs - COALESCE(p.cost_price_ghs, 0)
FROM public.products p
WHERE o.product_id = p.id
  AND o.profit_ghs IS NULL
  AND o.status IN ('Paid', 'Processing', 'Delivered');

-- Add customer_name column to orders table for guest checkout name requirement
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_name') THEN
    ALTER TABLE public.orders ADD COLUMN customer_name text;
  END IF;
END $$;
