-- DataMart (Supplier B) failed-status watch window support
-- Adds tracking columns to both orders and agent_orders so the
-- poller can keep checking failed DataMart orders for up to 24h
-- in case DataMart later reprocesses and delivers them.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_failed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS supplier_status_watch_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_supplier_sync_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_supplier_status text NULL;

ALTER TABLE public.agent_orders
  ADD COLUMN IF NOT EXISTS supplier_failed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS supplier_status_watch_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_supplier_sync_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_supplier_status text NULL;

-- Indexes to make the poller query efficient when scanning failed orders
-- still inside their watch window.
CREATE INDEX IF NOT EXISTS idx_orders_failed_watch
  ON public.orders (supplier_status_watch_until)
  WHERE status = 'Failed' AND supplier_status_watch_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_orders_failed_watch
  ON public.agent_orders (supplier_status_watch_until)
  WHERE status = 'Failed' AND supplier_status_watch_until IS NOT NULL;