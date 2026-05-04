-- ============================================================
-- Migrate notification trigger auth from service_role_key
-- (in plain table) to dedicated NOTIFY_TRIGGER_SECRET in Vault
-- ============================================================

-- 1) Ensure the vault extension is enabled (it is on Supabase by default)
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2) Insert NOTIFY_TRIGGER_SECRET into vault (idempotent)
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'NOTIFY_TRIGGER_SECRET';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(
      '54f34ea10dfc693c463f3c675713d004c83a1e293dbcbdc26dd2d0f80f80fb5c',
      'NOTIFY_TRIGGER_SECRET',
      'Shared secret used by Postgres triggers to authenticate against the notify-event Edge Function. Replaces use of SUPABASE_SERVICE_ROLE_KEY in public.notify_runtime_config.'
    );
  ELSE
    PERFORM vault.update_secret(
      v_existing,
      '54f34ea10dfc693c463f3c675713d004c83a1e293dbcbdc26dd2d0f80f80fb5c',
      'NOTIFY_TRIGGER_SECRET',
      'Shared secret used by Postgres triggers to authenticate against the notify-event Edge Function.'
    );
  END IF;
END $$;

-- 3) Replace _fire_notify_event so it reads the secret from vault
CREATE OR REPLACE FUNCTION public._fire_notify_event(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  cfg record;
  v_secret text;
BEGIN
  SELECT function_base_url, enabled
    INTO cfg
  FROM public.notify_runtime_config
  WHERE id = true
  LIMIT 1;

  IF cfg IS NULL OR cfg.enabled = false THEN
    RETURN;
  END IF;

  -- Read shared secret from Vault (encrypted at rest)
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'NOTIFY_TRIGGER_SECRET'
  LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE LOG '_fire_notify_event: NOTIFY_TRIGGER_SECRET missing from vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := cfg.function_base_url || '/functions/v1/notify-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', v_secret
    ),
    body := payload,
    timeout_milliseconds := 4000
  );
EXCEPTION WHEN OTHERS THEN
  -- Never break the originating transaction
  RAISE LOG '_fire_notify_event failed: % %', SQLERRM, SQLSTATE;
END;
$function$;

-- 4) Wipe the service role key from notify_runtime_config
--    (keep the row + function_base_url + enabled flag intact)
UPDATE public.notify_runtime_config
SET service_role_key = ''
WHERE id = true;

-- 5) Lock down the column: revoke all access to it from non-superusers.
--    The column technically remains for schema compatibility but is now empty
--    and unreadable by clients (RLS on this table already blocks anon/auth).
REVOKE ALL ON public.notify_runtime_config FROM anon, authenticated;