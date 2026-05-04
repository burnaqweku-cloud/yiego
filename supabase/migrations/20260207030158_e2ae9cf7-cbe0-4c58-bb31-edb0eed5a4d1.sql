-- Fix 1: Remove the overly permissive anonymous SELECT policy on orders
-- Guest order lookups are already securely handled by the lookup-order edge function
DROP POLICY IF EXISTS "Guests can lookup orders" ON public.orders;