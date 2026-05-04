
-- Fix view to use SECURITY INVOKER so RLS on underlying tables is enforced
ALTER VIEW public.admin_orders_view SET (security_invoker = on);
