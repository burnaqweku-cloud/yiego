-- 1. Add transfer tracking columns to agent_withdrawals
ALTER TABLE public.agent_withdrawals
  ADD COLUMN IF NOT EXISTS paystack_recipient_code text,
  ADD COLUMN IF NOT EXISTS paystack_transfer_code text,
  ADD COLUMN IF NOT EXISTS paystack_transfer_reference text,
  ADD COLUMN IF NOT EXISTS paystack_transfer_id bigint,
  ADD COLUMN IF NOT EXISTS paystack_transfer_status text,
  ADD COLUMN IF NOT EXISTS payout_initiated_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_failure_reason text,
  ADD COLUMN IF NOT EXISTS paystack_raw_response jsonb;

-- 2. Unique partial index on transfer reference (prevents same ref being used twice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_withdrawals_paystack_transfer_reference
  ON public.agent_withdrawals (paystack_transfer_reference)
  WHERE paystack_transfer_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_withdrawals_paystack_transfer_code
  ON public.agent_withdrawals (paystack_transfer_code)
  WHERE paystack_transfer_code IS NOT NULL;

-- 3. Add Paystack recipient cache to agent_payout_profiles
ALTER TABLE public.agent_payout_profiles
  ADD COLUMN IF NOT EXISTS paystack_recipient_code text,
  ADD COLUMN IF NOT EXISTS paystack_recipient_created_at timestamptz;

-- 4. Webhook event log (idempotency)
CREATE TABLE IF NOT EXISTS public.paystack_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paystack_event_id text UNIQUE,
  event_type text NOT NULL,
  transfer_reference text,
  transfer_code text,
  withdrawal_id uuid REFERENCES public.agent_withdrawals(id) ON DELETE SET NULL,
  status text,
  raw_payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processing_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paystack_transfer_events_ref
  ON public.paystack_transfer_events (transfer_reference);
CREATE INDEX IF NOT EXISTS idx_paystack_transfer_events_code
  ON public.paystack_transfer_events (transfer_code);
CREATE INDEX IF NOT EXISTS idx_paystack_transfer_events_withdrawal
  ON public.paystack_transfer_events (withdrawal_id);

ALTER TABLE public.paystack_transfer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read transfer events" ON public.paystack_transfer_events;
CREATE POLICY "Admins read transfer events"
  ON public.paystack_transfer_events
  FOR SELECT
  USING (public.is_admin_or_staff());

-- (No INSERT/UPDATE/DELETE policies — service role bypasses RLS)

-- 5. Withdrawal audit logs (used by admin UI; create if missing)
CREATE TABLE IF NOT EXISTS public.withdrawal_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.agent_withdrawals(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_audit_logs_withdrawal
  ON public.withdrawal_audit_logs (withdrawal_id, created_at DESC);

ALTER TABLE public.withdrawal_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read withdrawal audit logs" ON public.withdrawal_audit_logs;
CREATE POLICY "Admins read withdrawal audit logs"
  ON public.withdrawal_audit_logs
  FOR SELECT
  USING (public.is_admin_or_staff());

DROP POLICY IF EXISTS "Admins insert withdrawal audit logs" ON public.withdrawal_audit_logs;
CREATE POLICY "Admins insert withdrawal audit logs"
  ON public.withdrawal_audit_logs
  FOR INSERT
  WITH CHECK (public.is_admin_or_staff() AND actor_id = auth.uid());