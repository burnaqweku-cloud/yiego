
-- Fix: Replace overly permissive service_role policies with proper checks
DROP POLICY IF EXISTS "Service role full access to transactions" ON public.paystack_transactions;

-- Service role doesn't need explicit RLS policies - it bypasses RLS by default.
-- The existing admin policies are sufficient for authenticated users.
