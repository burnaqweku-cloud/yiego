
-- Drop all existing restrictive policies on site_settings
DROP POLICY IF EXISTS "Admins can manage settings" ON public.site_settings;
DROP POLICY IF EXISTS "Authenticated users can view all settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public can view non-sensitive settings" ON public.site_settings;

-- Recreate as PERMISSIVE (OR logic) so any matching policy grants access

-- Admins get full CRUD
CREATE POLICY "Admins can manage settings"
ON public.site_settings
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Authenticated users can read all settings
CREATE POLICY "Authenticated users can view all settings"
ON public.site_settings
FOR SELECT
TO authenticated
USING (true);

-- Anon/public can only read non-sensitive keys
CREATE POLICY "Public can view non-sensitive settings"
ON public.site_settings
FOR SELECT
TO anon
USING (key = ANY (ARRAY['system_online','system_status_message','status_text','agent_activation_fee','support_whatsapp','support_email']));
