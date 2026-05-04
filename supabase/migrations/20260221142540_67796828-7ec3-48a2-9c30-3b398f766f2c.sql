-- Allow admins to update any profile (for ban/suspend/notes)
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());
