
-- Fix: Admin/staff SELECT policy on profiles should only apply to authenticated users
DROP POLICY IF EXISTS "Admin or staff can view all profiles" ON public.profiles;

CREATE POLICY "Admin or staff can view all profiles"
ON public.profiles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (is_admin_or_staff());

-- Also fix: orders INSERT policy should require authentication and matching user_id
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

CREATE POLICY "Authenticated users can create orders"
ON public.orders
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
