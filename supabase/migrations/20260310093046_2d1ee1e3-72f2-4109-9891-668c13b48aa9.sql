
-- Append-only audit table for agent profit diagnostics
CREATE TABLE public.agent_profit_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  agent_id uuid NOT NULL,
  previous_status text,
  new_status text,
  profit_ghs numeric,
  profit_credited boolean DEFAULT false,
  wallet_credit_exists boolean DEFAULT false,
  wallet_credit_amount numeric,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_profit_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or staff can view agent_profit_audit_logs"
  ON public.agent_profit_audit_logs FOR SELECT TO authenticated
  USING (is_admin_or_staff());

CREATE POLICY "Admin or staff can insert agent_profit_audit_logs"
  ON public.agent_profit_audit_logs FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_staff());

-- Index for fast lookups
CREATE INDEX idx_agent_profit_audit_agent ON public.agent_profit_audit_logs(agent_id);
CREATE INDEX idx_agent_profit_audit_order ON public.agent_profit_audit_logs(order_id);
