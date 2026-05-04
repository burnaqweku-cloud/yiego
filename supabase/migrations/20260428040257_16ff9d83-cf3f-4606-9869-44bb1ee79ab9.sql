CREATE OR REPLACE FUNCTION public.notify_telegram_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_anon   TEXT;
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

  v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yc2Z2aHp0cHp3a2Fkd2NpaXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTU5NzQsImV4cCI6MjA4NTg5MTk3NH0.DMke3rS3C27G-TdSdm24aVMfUIp0y4B1RlcWSV_S0cw';

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/notify-event',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'apikey',         v_anon,
        'Authorization',  'Bearer ' || v_anon,
        'x-internal-key', v_secret
      ),
      body    := jsonb_build_object(
        'event', v_event,
        'data',  jsonb_build_object('order_id', NEW.order_id)
      ),
      timeout_milliseconds := 4000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'notify_telegram_on_delivered failed: % %', SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$function$;