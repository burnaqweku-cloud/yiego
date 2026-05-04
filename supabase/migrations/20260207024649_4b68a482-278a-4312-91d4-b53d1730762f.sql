
-- Explicitly deny anonymous access to profiles table
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
AS PERMISSIVE
FOR SELECT
TO anon
USING (false);
