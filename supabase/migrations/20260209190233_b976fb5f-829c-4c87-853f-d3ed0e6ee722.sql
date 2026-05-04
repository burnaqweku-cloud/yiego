DROP POLICY IF EXISTS "Public can view non-sensitive settings" ON public.site_settings;

CREATE POLICY "Public can view non-sensitive settings"
ON public.site_settings
AS RESTRICTIVE
FOR SELECT
USING (key = ANY (ARRAY['system_online'::text, 'system_status_message'::text, 'status_text'::text, 'agent_activation_fee'::text, 'support_whatsapp'::text, 'support_email'::text]));