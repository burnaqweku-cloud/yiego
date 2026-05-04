
-- Add snapshot + idempotency columns to agent_orders
ALTER TABLE public.agent_orders
  ADD COLUMN IF NOT EXISTS supplier_cost_at_purchase numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_base_price_at_purchase numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_store_price_at_purchase numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_profit_at_purchase numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS datasika_profit_at_purchase numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profit_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profit_credited_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'agent_store';

-- Add order_source to normal orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'direct';

-- Update existing normal orders: guest if user_id is null, logged_in otherwise
UPDATE public.orders
  SET order_source = CASE
    WHEN user_id IS NULL THEN 'guest'
    WHEN is_checkpoint = true THEN 'checkpoint'
    ELSE 'normal_logged_in'
  END
  WHERE order_source = 'direct';

-- Create unique constraint on agent_wallet_transactions for idempotent profit credits
-- Use a partial unique index to prevent duplicate profit credits per order
CREATE UNIQUE INDEX IF NOT EXISTS agent_wallet_txn_profit_unique
  ON public.agent_wallet_transactions (agent_id, order_id)
  WHERE type = 'profit_credit';
