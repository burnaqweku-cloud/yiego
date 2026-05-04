-- Allow anon/public to read maintenance-related settings
CREATE POLICY "Anon can read maintenance settings"
ON public.site_settings
FOR SELECT
TO anon
USING (key IN ('site_maintenance_enabled', 'maintenance_message', 'maintenance_eta'));

-- Enable realtime for site_settings
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;