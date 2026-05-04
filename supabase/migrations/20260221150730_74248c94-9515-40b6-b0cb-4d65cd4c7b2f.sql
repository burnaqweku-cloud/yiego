-- Drop the overly permissive anonymous SELECT policy on orders
DROP POLICY IF EXISTS "Guests can lookup orders" ON public.orders;