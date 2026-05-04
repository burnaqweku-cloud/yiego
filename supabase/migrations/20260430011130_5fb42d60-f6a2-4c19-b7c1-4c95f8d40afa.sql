
-- ─────────────────────────────────────────────────────────────────────
-- Phase 1A: Bulk Dispatch Queue Foundation (additive, idempotent)
-- ─────────────────────────────────────────────────────────────────────

-- 1. agent_orders: add failure_reason + queue_state
ALTER TABLE public.agent_orders
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS queue_state text;

-- 2. orders: add queue_state
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS queue_state text;

-- 3. dispatch_batch_items: add order_table column
ALTER TABLE public.dispatch_batch_items
  ADD COLUMN IF NOT EXISTS order_table text NOT NULL DEFAULT 'orders';

-- 3a. Add CHECK constraint on order_table (NOT VALID first, then VALIDATE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dispatch_batch_items_order_table_check'
      AND conrelid = 'public.dispatch_batch_items'::regclass
  ) THEN
    ALTER TABLE public.dispatch_batch_items
      ADD CONSTRAINT dispatch_batch_items_order_table_check
      CHECK (order_table IN ('orders', 'agent_orders')) NOT VALID;
    ALTER TABLE public.dispatch_batch_items
      VALIDATE CONSTRAINT dispatch_batch_items_order_table_check;
  END IF;
END $$;

-- 3b. queue_state CHECK constraints (allow null + restricted set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_queue_state_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_queue_state_check
      CHECK (queue_state IS NULL OR queue_state IN
        ('queued','batched','sent','delivered','failed','released'))
      NOT VALID;
    ALTER TABLE public.orders VALIDATE CONSTRAINT orders_queue_state_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_orders_queue_state_check'
  ) THEN
    ALTER TABLE public.agent_orders
      ADD CONSTRAINT agent_orders_queue_state_check
      CHECK (queue_state IS NULL OR queue_state IN
        ('queued','batched','sent','delivered','failed','released'))
      NOT VALID;
    ALTER TABLE public.agent_orders VALIDATE CONSTRAINT agent_orders_queue_state_check;
  END IF;
END $$;

-- 4. Partial indexes for batch generation (only over queued rows)
CREATE INDEX IF NOT EXISTS idx_orders_queue_state_network
  ON public.orders (network, queue_state, created_at)
  WHERE queue_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_orders_queue_state_network
  ON public.agent_orders (network, queue_state, created_at)
  WHERE queue_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_batch_items_order_table
  ON public.dispatch_batch_items (order_table, order_uuid);

-- 5. Feature flag row (off by default — keeps live behavior identical)
INSERT INTO public.site_settings (key, value)
VALUES ('bulk_dispatch_queue_enabled', '{"enabled":false,"updated_at":"2026-04-30T00:00:00Z"}')
ON CONFLICT (key) DO NOTHING;

-- 6. Comments documenting the polymorphic relationship
COMMENT ON COLUMN public.dispatch_batch_items.order_uuid IS
  'Polymorphic FK: references orders.id when order_table=''orders'', or agent_orders.id when order_table=''agent_orders''. No DB-level FK because PostgreSQL does not support polymorphic FKs. Integrity is enforced at the application layer (RPCs).';

COMMENT ON COLUMN public.dispatch_batch_items.order_table IS
  'Discriminator for the polymorphic order_uuid column. Allowed values: ''orders'', ''agent_orders''.';

COMMENT ON COLUMN public.orders.queue_state IS
  'Bulk dispatch queue lifecycle state. NULL means the order is not in the queue (auto-dispatched). Values: queued, batched, sent, delivered, failed, released.';

COMMENT ON COLUMN public.agent_orders.queue_state IS
  'Bulk dispatch queue lifecycle state. NULL means the order is not in the queue (auto-dispatched). Values: queued, batched, sent, delivered, failed, released.';
