-- Route delivery notifications via notify-trigger-relay, which has the
-- service-role key in its env and forwards to notify-event. This avoids
-- having to store the service-role key in the database and sidesteps
-- any gateway JWT enforcement issues for trigger-originated calls.
CREATE OR REPLACE FUNCTION public.notify_telegram_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_event  TEXT;
BEGIN
  IF NEW.telegram_chat_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'Delivered' AND COALESCE(OLD.status, '') <> 'Delivered' THEN
    v_event := 'telegram_order_delivered';
  ELSIF NEW.status = 'Failed' AND COALESCE(OLD.status, '') <> 'Failed' THEN
    v_event := 'telegram_order_failed';
  ELSE
    RETURN NEW;
  END IF;

  SELECT function_base_url INTO v_url
  FROM public.notify_runtime_config WHERE id = TRUE LIMIT 1;
  IF v_url IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'NOTIFY_TRIGGER_SECRET' LIMIT 1;
  IF v_secret IS NULL THEN RETURN NEW; END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/notify-trigger-relay',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-internal-key', v_secret
      ),
      body    := jsonb_build_object(
        'event', v_event,
        'data',  jsonb_build_object('order_id', NEW.order_id)
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'notify_telegram_on_delivered failed: % %', SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$function$;