
-- Auto-provision agent record when application is submitted (no admin approval needed)
CREATE OR REPLACE FUNCTION public.auto_provision_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_slug text;
  v_agent_id uuid;
BEGIN
  -- Generate slug from store name
  v_slug := lower(regexp_replace(NEW.store_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  v_slug := regexp_replace(v_slug, '\s+', '-', 'g');
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  v_slug := left(v_slug, 40);
  v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);

  -- Create agent record with status 'approved' (awaiting activation)
  INSERT INTO public.agents (user_id, application_id, store_name, store_slug, store_description, store_logo_url, whatsapp_number, store_email, region, status)
  VALUES (NEW.user_id, NEW.id, NEW.store_name, v_slug, NEW.store_description, NEW.store_logo_url, NEW.whatsapp_number, NEW.store_email, NEW.region, 'approved')
  RETURNING id INTO v_agent_id;

  -- Create agent wallet
  INSERT INTO public.agent_wallets (agent_id) VALUES (v_agent_id);

  -- Add agent role (no-op if already exists)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Auto-set application status to approved
  NEW.status := 'approved';

  RETURN NEW;
END;
$$;

-- Trigger on application insert
CREATE TRIGGER on_agent_application_insert
  BEFORE INSERT ON public.agent_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_provision_agent();
