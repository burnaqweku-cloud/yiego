-- 1. orders.status_updated_at + trigger + index
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.orders
  SET status_updated_at = COALESCE(updated_at, created_at, now())
  WHERE status_updated_at = created_at OR status_updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.orders_set_status_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_updated_at ON public.orders;
CREATE TRIGGER trg_orders_status_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_set_status_updated_at();

CREATE INDEX IF NOT EXISTS idx_orders_user_status_updated
  ON public.orders(user_id, status_updated_at DESC)
  WHERE user_id IS NOT NULL;

-- 2. profiles.orders_last_seen_at (NULL = never seen)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS orders_last_seen_at timestamptz;

-- 3. notifications: structured related entity + read_at
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_entity_type text,
  ADD COLUMN IF NOT EXISTS related_entity_id text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

UPDATE public.notifications
  SET read_at = COALESCE(read_at, created_at)
  WHERE read = true AND read_at IS NULL;