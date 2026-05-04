
-- Insert network availability settings into site_settings
-- Using existing site_settings table with key-value pattern
INSERT INTO public.site_settings (key, value, updated_at)
VALUES
  ('network_available_MTN', 'true', now()),
  ('network_available_Telecel', 'true', now()),
  ('network_available_AirtelTigo', 'true', now()),
  ('network_message_MTN', '', now()),
  ('network_message_Telecel', '', now()),
  ('network_message_AirtelTigo', '', now())
ON CONFLICT (key) DO NOTHING;
