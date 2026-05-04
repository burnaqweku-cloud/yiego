
-- Fix 1: Remove overly permissive "Require authentication for profiles" policy
-- The existing "Users can view own profile" and "Admin or staff can view all profiles" policies are sufficient
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- Fix 2: Remove overly permissive "Require authentication for agent_applications" policy
-- The existing "Users can view own application" and "Admin or staff can view all applications" policies are sufficient
DROP POLICY IF EXISTS "Require authentication for agent_applications" ON public.agent_applications;
