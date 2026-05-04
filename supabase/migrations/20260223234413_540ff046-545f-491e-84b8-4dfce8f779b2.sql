
-- ══════════════════════════════════════════════════════════════
-- Payment Reconciliation System — Tables, Enums, RLS, Indexes
-- ══════════════════════════════════════════════════════════════

-- A) payment_events — canonical record of every payment event
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'paystack',
  provider_reference text NOT NULL,
  provider_transaction_id text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  customer_email text,
  customer_phone text,
  user_id uuid,
  agent_id uuid,
  store_id uuid,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_provider_reference_unique UNIQUE (provider_reference)
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage payment_events"
  ON public.payment_events FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_payment_events_reference ON public.payment_events (provider_reference);
CREATE INDEX idx_payment_events_status ON public.payment_events (status);
CREATE INDEX idx_payment_events_created ON public.payment_events (created_at DESC);

-- B) reconciliation_cases — each case needing admin attention
CREATE TABLE public.reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_event_id uuid NOT NULL REFERENCES public.payment_events(id),
  case_type text NOT NULL DEFAULT 'payment_success_order_missing',
  severity text NOT NULL DEFAULT 'high',
  state text NOT NULL DEFAULT 'open',
  reason_code text,
  reason_detail text,
  intended_channel text DEFAULT 'normal_user',
  intended_user_id uuid,
  intended_agent_id uuid,
  intended_store_id uuid,
  intended_product jsonb,
  intended_recipient text,
  expected_order_amount numeric,
  linked_order_id text,
  resolution_type text,
  resolved_by_admin_id uuid,
  resolved_at timestamptz,
  processing_lock boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid,
  lock_version int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_cases_unique_per_event UNIQUE (payment_event_id, case_type)
);

ALTER TABLE public.reconciliation_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage reconciliation_cases"
  ON public.reconciliation_cases FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_recon_cases_state ON public.reconciliation_cases (state);
CREATE INDEX idx_recon_cases_severity ON public.reconciliation_cases (severity);
CREATE INDEX idx_recon_cases_created ON public.reconciliation_cases (created_at DESC);
CREATE INDEX idx_recon_cases_payment_event ON public.reconciliation_cases (payment_event_id);

-- C) reconciliation_actions — full audit trail
CREATE TABLE public.reconciliation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.reconciliation_cases(id),
  admin_id uuid NOT NULL,
  action_type text NOT NULL,
  action_payload_json jsonb DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage reconciliation_actions"
  ON public.reconciliation_actions FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_recon_actions_case ON public.reconciliation_actions (case_id);
CREATE INDEX idx_recon_actions_created ON public.reconciliation_actions (created_at DESC);

-- D) reconciliation_notes — admin notes on cases
CREATE TABLE public.reconciliation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.reconciliation_cases(id),
  admin_id uuid NOT NULL,
  note_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage reconciliation_notes"
  ON public.reconciliation_notes FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE INDEX idx_recon_notes_case ON public.reconciliation_notes (case_id);

-- Updated_at trigger for payment_events
CREATE TRIGGER update_payment_events_updated_at
  BEFORE UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for reconciliation_cases
CREATE TRIGGER update_reconciliation_cases_updated_at
  BEFORE UPDATE ON public.reconciliation_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
