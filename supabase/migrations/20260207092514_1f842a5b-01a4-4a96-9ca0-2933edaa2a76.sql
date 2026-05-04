
-- Update auto_provision_agent to set status to 'pending_review' instead of 'approved'
CREATE OR REPLACE FUNCTION public.auto_provision_agent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Create agent record with status 'pending_review'
  INSERT INTO public.agents (user_id, application_id, store_name, store_slug, store_description, store_logo_url, whatsapp_number, store_email, region, status)
  VALUES (NEW.user_id, NEW.id, NEW.store_name, v_slug, NEW.store_description, NEW.store_logo_url, NEW.whatsapp_number, NEW.store_email, NEW.region, 'pending_review')
  RETURNING id INTO v_agent_id;

  -- Create agent wallet
  INSERT INTO public.agent_wallets (agent_id) VALUES (v_agent_id);

  -- Add agent role (no-op if already exists)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, 'agent')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Auto-set application status to pending_review
  NEW.status := 'pending_review';

  RETURN NEW;
END;
$function$;

-- Also update the RLS policy on agents to allow pending_review agents to view their own record
-- (already handled by existing "Agents can view own record" policy using user_id = auth.uid())

-- Update agents RLS: allow agents to view own record regardless of status (already exists)
-- No changes needed for RLS since "Agents can view own record" uses user_id = auth.uid()
