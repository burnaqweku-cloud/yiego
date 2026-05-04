
-- Fix wallets table: drop policies scoped to 'public' and recreate scoped to 'authenticated'
DROP POLICY IF EXISTS "Admin or staff can view all wallets" ON public.wallets;
DROP POLICY IF EXISTS "Admins can update wallets" ON public.wallets;
DROP POLICY IF EXISTS "Authenticated users can create own wallet" ON public.wallets;
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;

CREATE POLICY "Admin or staff can view all wallets"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (is_admin_or_staff());

CREATE POLICY "Admins can update wallets"
  ON public.wallets FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "Authenticated users can create own wallet"
  ON public.wallets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own wallet"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
