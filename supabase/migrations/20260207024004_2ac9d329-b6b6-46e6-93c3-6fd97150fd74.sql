
-- Drop the constraint (which also drops the underlying index)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_unique;
DROP INDEX IF EXISTS public.idx_profiles_username;

-- Re-create as a case-insensitive unique index
CREATE UNIQUE INDEX profiles_username_ci_unique ON public.profiles (lower(username));
CREATE INDEX idx_profiles_username_ci ON public.profiles (lower(username));

-- Create a SECURITY DEFINER function to resolve username → email + suspended status
-- This allows unauthenticated users to look up email by username without exposing the profiles table
CREATE OR REPLACE FUNCTION public.resolve_username_login(p_username text)
RETURNS TABLE(email text, is_suspended boolean, suspended_reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.email, p.suspended, p.suspended_reason
  FROM public.profiles p
  WHERE lower(p.username) = lower(p_username)
  LIMIT 1;
$$;

-- Update check_username_available to be case-insensitive
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE lower(username) = lower(p_username)
  );
$$;
