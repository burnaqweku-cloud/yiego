
-- Add PWA tracking fields to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pwa_user boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pwa_first_detected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS pwa_last_seen_at timestamp with time zone;

-- Create pwa_devices table for guest tracking
CREATE TABLE IF NOT EXISTS public.pwa_devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_fingerprint text NOT NULL UNIQUE,
  is_pwa boolean NOT NULL DEFAULT false,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  first_pwa_detected_at timestamp with time zone,
  last_pwa_seen_at timestamp with time zone,
  user_agent text,
  platform text NOT NULL DEFAULT 'unknown',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on pwa_devices
ALTER TABLE public.pwa_devices ENABLE ROW LEVEL SECURITY;

-- Anyone can upsert their device record (needed for guest tracking)
CREATE POLICY "Anyone can upsert pwa devices"
  ON public.pwa_devices
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update own pwa device"
  ON public.pwa_devices
  FOR UPDATE
  USING (true);

-- Admin/staff can view all device records
CREATE POLICY "Admin or staff can view pwa devices"
  ON public.pwa_devices
  FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Anyone can select own device by fingerprint"
  ON public.pwa_devices
  FOR SELECT
  USING (true);
