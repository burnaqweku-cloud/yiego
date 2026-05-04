
-- ==============================================
-- FIX: Change auto_provision_agent from BEFORE to AFTER INSERT trigger
-- The BEFORE trigger was causing FK violations because it tried to 
-- insert into agents (referencing application_id) before the 
-- agent_applications row existed.
-- ==============================================

-- 1. Drop the existing BEFORE INSERT trigger
DROP TRIGGER IF EXISTS auto_provision_agent ON public.agent_applications;

-- 2. Recreate the function for AFTER INSERT (returns NULL, handles upsert)
CREATE OR REPLACE FUNCTION public.auto_provision_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
  v_agent_id uuid;
  v_existing_agent_id uuid;
BEGIN
  -- Check if agent already exists for this user (idempotency / re-apply)
  SELECT id INTO v_existing_agent_id FROM public.agents WHERE user_id = NEW.user_id;

  IF v_existing_agent_id IS NOT NULL THEN
    -- Update existing agent with new application reference
    UPDATE public.agents SET
      application_id = NEW.id,
      store_name = NEW.store_name,
      store_description = NEW.store_description,
      store_logo_url = NEW.store_logo_url,
      whatsapp_number = NEW.whatsapp_number,
      store_email = NEW.store_email,
      region = NEW.region,
      status = 'pending_review',
      updated_at = now()
    WHERE id = v_existing_agent_id;
    RETURN NULL;
  END IF;

  -- Generate unique slug from store name
  v_slug := lower(regexp_replace(NEW.store_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  v_slug := regexp_replace(v_slug, '\s+', '-', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := left(v_slug, 40);
  v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);

  -- Create agent record with status 'pending_review'
  INSERT INTO public.agents (user_id, application_id, store_name, store_slug, store_description, store_logo_url, whatsapp_number, store_email, region, status)
  VALUES (NEW.user_id, NEW.id, NEW.store_name, v_slug, NEW.store_description, NEW.store_logo_url, NEW.whatsapp_number, NEW.store_email, NEW.region, 'pending_review')
  RETURNING id INTO v_agent_id;

  -- Create agent wallet
  INSERT INTO public.agent_wallets (agent_id) VALUES (v_agent_id);

  -- Add agent role (no-op if already exists)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NULL;
END;
$function$;

-- 3. Create the trigger as AFTER INSERT (application row exists when trigger fires)
CREATE TRIGGER auto_provision_agent
AFTER INSERT ON public.agent_applications
FOR EACH ROW
EXECUTE FUNCTION public.auto_provision_agent();

-- ==============================================
-- Create error logging table for failed submissions
-- ==============================================
CREATE TABLE IF NOT EXISTS public.agent_application_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  payload jsonb,
  error_message text,
  error_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_application_errors ENABLE ROW LEVEL SECURITY;

-- Admins can view errors for debugging
CREATE POLICY "Admins can view application errors"
ON public.agent_application_errors
FOR SELECT
USING (is_admin());

-- Authenticated users can log their own errors
CREATE POLICY "Users can log own application errors"
ON public.agent_application_errors
FOR INSERT
WITH CHECK (user_id = auth.uid());
