-- Fix the Telegram order-status notification trigger.
-- Previous version: hit '<base>/telegram-notify-customer' (missing /functions/v1/)
-- and used an empty service_role_key from notify_runtime_config (gateway 401).
-- New version: mirrors the working notify-event pattern — correct functions URL +
-- NOTIFY_TRIGGER_SECRET from vault. Also fires on transition INTO 'Failed'.

CREATE OR REPLACE FUNCTION public.notify_telegram_on_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_event  TEXT;
BEGIN
  -- Decide which event (if any) to fire
  IF NEW.telegram_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'Delivered' AND COALESCE(OLD.status, '') <> 'Delivered' THEN
    v_event := 'delivered';
  ELSIF NEW.status = 'Failed' AND COALESCE(OLD.status, '') <> 'Failed' THEN
    v_event := 'failed';
  ELSE
    RETURN NEW;
  END IF;

  -- function_base_url from notify_runtime_config (project base URL)
  SELECT function_base_url
    INTO v_url
  FROM public.notify_runtime_config
  WHERE id = TRUE
  LIMIT 1;

  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- Shared trigger secret from the vault (same secret notify-event uses)
  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'NOTIFY_TRIGGER_SECRET'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE LOG 'notify_telegram_on_delivered: NOTIFY_TRIGGER_SECRET missing from vault';
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/telegram-notify-customer',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-internal-key', v_secret
      ),
      body    := jsonb_build_object(
        'order_id', NEW.order_id,
        'event',    v_event
      ),
      timeout_milliseconds := 4000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block the order update
    RAISE LOG 'notify_telegram_on_delivered failed: % %', SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Recreate the trigger so it fires on status transitions to BOTH Delivered and Failed.
DROP TRIGGER IF EXISTS trg_orders_telegram_delivered ON public.orders;
CREATE TRIGGER trg_orders_telegram_delivered
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_telegram_on_delivered();