
-- Create SMS queue table for reliable delivery
CREATE TABLE public.sms_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key text NOT NULL,
  to_number text NOT NULL,
  message text NOT NULL,
  event_type text NOT NULL,
  user_id uuid NULL,
  agent_id uuid NULL,
  order_id text NULL,
  reference text NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 5,
  next_retry_at timestamp with time zone NOT NULL DEFAULT now(),
  last_http_status integer NULL,
  last_response text NULL,
  last_error text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sms_queue_idempotency_key_unique UNIQUE (idempotency_key)
);

-- Index for queue processing: pick items ready to process
CREATE INDEX idx_sms_queue_processing ON public.sms_queue (status, next_retry_at)
  WHERE status IN ('queued', 'retrying');

-- Index for idempotency lookups
CREATE INDEX idx_sms_queue_idempotency ON public.sms_queue (idempotency_key);

-- Enable RLS
ALTER TABLE public.sms_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage the queue
CREATE POLICY "Admins can manage sms queue"
  ON public.sms_queue FOR ALL
  USING (is_admin());

-- Trigger to update updated_at
CREATE TRIGGER update_sms_queue_updated_at
  BEFORE UPDATE ON public.sms_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_cron and pg_net extensions for scheduled processing
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
