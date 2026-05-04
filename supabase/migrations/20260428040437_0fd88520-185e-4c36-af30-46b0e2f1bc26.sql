CREATE OR REPLACE FUNCTION public.verify_notify_trigger_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stored text;
BEGIN
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_stored
  FROM vault.decrypted_secrets WHERE name = 'NOTIFY_TRIGGER_SECRET' LIMIT 1;
  IF v_stored IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_stored = p_secret;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_notify_trigger_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_notify_trigger_secret(text) TO service_role;