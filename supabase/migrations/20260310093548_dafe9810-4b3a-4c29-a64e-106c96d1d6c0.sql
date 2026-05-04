
-- Add unique idempotency constraint for profit credits and reversals
-- This prevents double-crediting even under race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_wallet_txn_idempotency 
  ON public.agent_wallet_transactions(agent_id, order_id, type) 
  WHERE order_id IS NOT NULL AND type IN ('profit_credit', 'profit_reversal');
