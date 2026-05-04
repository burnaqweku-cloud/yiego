-- Drop the overly permissive guest SELECT policy
DROP POLICY IF EXISTS "Guests can lookup orders" ON public.orders;
