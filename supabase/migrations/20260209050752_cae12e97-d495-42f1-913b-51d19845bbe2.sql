
-- FIX 1: profiles - Replace broken PERMISSIVE false policy with RESTRICTIVE auth check
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;

CREATE POLICY "Require authentication for profiles"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- FIX 2: agent_applications - Add restrictive auth-only policy for sensitive PII
CREATE POLICY "Require authentication for agent_applications"
ON public.agent_applications
AS RESTRICTIVE
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
