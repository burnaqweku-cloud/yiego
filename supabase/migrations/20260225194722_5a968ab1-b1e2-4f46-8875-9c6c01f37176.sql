
-- Create payment_reconciliation_cases table
CREATE TABLE public.payment_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paystack_reference text NOT NULL UNIQUE,
  payment_id uuid,
  user_id uuid,
  agent_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL DEFAULT 'medium',
  reason text NOT NULL DEFAULT 'payment_success_order_missing',
  metadata jsonb DEFAULT '{}'::jsonb,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Indexes
CREATE INDEX idx_prc_status_created ON public.payment_reconciliation_cases (status, created_at DESC);
CREATE INDEX idx_prc_reference ON public.payment_reconciliation_cases (paystack_reference);

-- RLS
ALTER TABLE public.payment_reconciliation_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage payment_reconciliation_cases"
  ON public.payment_reconciliation_cases
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- updated_at trigger
CREATE TRIGGER update_prc_updated_at
  BEFORE UPDATE ON public.payment_reconciliation_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
