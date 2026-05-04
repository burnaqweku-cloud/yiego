CREATE TABLE IF NOT EXISTS public.paystack_init_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context text NOT NULL DEFAULT 'agent_subscription',
  agent_id uuid,
  intent_type text,
  plan text,
  amount_expected numeric,
  error_message text,
  raw_response text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paystack_init_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view init error logs"
ON public.paystack_init_error_logs
FOR SELECT TO authenticated
USING (public.is_admin());