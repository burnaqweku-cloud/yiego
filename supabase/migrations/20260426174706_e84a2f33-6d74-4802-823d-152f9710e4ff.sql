
-- ─────────────────────────────────────────────────────────────
-- 1. orders.telegram_chat_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_orders_telegram_chat_id
  ON public.orders (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. telegram_link_tokens (magic-link & email-link flows)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  channel TEXT NOT NULL DEFAULT 'web' CHECK (channel IN ('web','email')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by_chat_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_token
  ON public.telegram_link_tokens (token);
CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user
  ON public.telegram_link_tokens (user_id);

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

-- Server-only: no policies = no anon/authenticated access.
-- Edge functions use service_role which bypasses RLS.

-- ─────────────────────────────────────────────────────────────
-- 3. telegram_payment_intents.outcome
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.telegram_payment_intents
  ADD COLUMN IF NOT EXISTS outcome TEXT;

-- ─────────────────────────────────────────────────────────────
-- 4. Order delivered → fire-and-forget Telegram notify
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_telegram_on_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  -- Only fire on transition INTO 'Delivered'
  IF NEW.status IS DISTINCT FROM 'Delivered' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'Delivered' THEN
    RETURN NEW;
  END IF;
  IF NEW.telegram_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT function_base_url, service_role_key
    INTO v_url, v_key
  FROM public.notify_runtime_config
  WHERE id = TRUE
  LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/telegram-notify-customer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := jsonb_build_object(
        'chat_id', NEW.telegram_chat_id,
        'order_id', NEW.order_id,
        'event', 'delivered'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the order update
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_telegram_delivered ON public.orders;
CREATE TRIGGER trg_orders_telegram_delivered
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_telegram_on_delivered();
