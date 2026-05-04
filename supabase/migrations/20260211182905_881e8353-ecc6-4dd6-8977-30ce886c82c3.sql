
-- Add enhanced logging columns to sms_logs
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS request_url text,
  ADD COLUMN IF NOT EXISTS request_method text DEFAULT 'POST',
  ADD COLUMN IF NOT EXISTS request_payload text,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS provider_response_code text;
