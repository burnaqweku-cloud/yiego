-- Fix: prevent username enumeration by always returning exactly one row
-- If username not found, returns NULL email and is_suspended=false
-- This makes found/not-found responses indistinguishable

CREATE OR REPLACE FUNCTION public.resolve_username_login(p_username text)
 RETURNS TABLE(email text, is_suspended boolean, suspended_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_suspended boolean;
  v_reason text;
BEGIN
  SELECT p.email, p.suspended, p.suspended_reason
  INTO v_email, v_suspended, v_reason
  FROM public.profiles p
  WHERE lower(p.username) = lower(p_username)
  LIMIT 1;

  -- Always return exactly one row regardless of whether username exists
  -- This prevents attackers from distinguishing found vs not-found
  RETURN QUERY SELECT v_email, COALESCE(v_suspended, false), v_reason;
END;
$function$;

-- Fix agent-logos storage: restrict INSERT to only agent owners
-- Drop the existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload agent logos" ON storage.objects;

-- Create restrictive INSERT policy: only upload to your own agent folder
CREATE POLICY "Agents can upload own logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'agent-logos'
  AND auth.uid() IS NOT NULL
  AND auth.uid() IN (
    SELECT user_id FROM public.agents WHERE id::text = (storage.foldername(name))[1]
  )
);

-- Add DELETE policy so agents can manage their own logos
CREATE POLICY "Agents can delete own logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'agent-logos'
  AND auth.uid() IN (
    SELECT user_id FROM public.agents WHERE id::text = (storage.foldername(name))[1]
  )
);