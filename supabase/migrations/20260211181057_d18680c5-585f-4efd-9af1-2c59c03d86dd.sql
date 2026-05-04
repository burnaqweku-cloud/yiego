
-- SMS Logs table
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  to_number text NOT NULL,
  message text NOT NULL,
  event_type text NOT NULL,
  user_id uuid,
  agent_id uuid,
  order_id text,
  reference text,
  status text NOT NULL DEFAULT 'queued',
  provider_response text,
  provider_message_id text,
  error_message text,
  attempts integer NOT NULL DEFAULT 0
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sms logs" ON public.sms_logs
  FOR ALL USING (is_admin());

CREATE POLICY "Staff can view sms logs" ON public.sms_logs
  FOR SELECT USING (is_admin_or_staff());

-- Index for dedupe lookups
CREATE INDEX idx_sms_logs_dedupe ON public.sms_logs (event_type, order_id, reference, agent_id, status);
CREATE INDEX idx_sms_logs_rate ON public.sms_logs (to_number, created_at);

-- SMS settings rows in site_settings
INSERT INTO public.site_settings (key, value) VALUES
  ('sms_enabled', 'true'),
  ('sms_welcome_sms', 'true'),
  ('sms_wallet_deposit_success', 'true'),
  ('sms_order_paid_wallet', 'true'),
  ('sms_order_paid_direct', 'true'),
  ('sms_agent_application_received', 'true'),
  ('sms_agent_approved', 'true'),
  ('sms_agent_subscription_active', 'true'),
  ('sms_withdrawal_requested', 'true'),
  ('sms_withdrawal_paid', 'true')
ON CONFLICT (key) DO NOTHING;
