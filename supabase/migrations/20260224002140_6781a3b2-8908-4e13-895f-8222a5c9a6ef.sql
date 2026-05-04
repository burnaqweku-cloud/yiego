
-- Fix: Replace overly permissive insert policy with admin-or-service-role approach
-- The service role bypasses RLS anyway, so we only need admin policy
DROP POLICY IF EXISTS "Service role can insert supplier_ledger" ON public.supplier_ledger;
