
-- Phase 1: Payout Profiles table
CREATE TABLE public.agent_payout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  label text,
  momo_number text NOT NULL,
  momo_name text NOT NULL,
  network text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payout_profiles_agent ON public.agent_payout_profiles(agent_id);

ALTER TABLE public.agent_payout_profiles ENABLE ROW LEVEL SECURITY;

-- Agents can manage their own profiles
CREATE POLICY "Agents manage own payout profiles"
  ON public.agent_payout_profiles
  FOR ALL
  TO authenticated
  USING (agent_id = public.get_my_agent_id())
  WITH CHECK (agent_id = public.get_my_agent_id());

-- Admin/Staff can view all
CREATE POLICY "Admin/Staff view all payout profiles"
  ON public.agent_payout_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

-- Phase 2: Add nullable columns to agent_withdrawals
ALTER TABLE public.agent_withdrawals
  ADD COLUMN IF NOT EXISTS payout_momo_name text,
  ADD COLUMN IF NOT EXISTS payout_network text,
  ADD COLUMN IF NOT EXISTS payout_profile_id uuid REFERENCES public.agent_payout_profiles(id),
  ADD COLUMN IF NOT EXISTS review_flag text,
  ADD COLUMN IF NOT EXISTS internal_note text;

-- Phase 3: Withdrawal audit logs
CREATE TABLE public.withdrawal_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.agent_withdrawals(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_withdrawal_audit_withdrawal ON public.withdrawal_audit_logs(withdrawal_id);

ALTER TABLE public.withdrawal_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin/Staff can view audit logs
CREATE POLICY "Admin/Staff view withdrawal audit logs"
  ON public.withdrawal_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

-- Admin can insert audit logs
CREATE POLICY "Admin/Staff insert withdrawal audit logs"
  ON public.withdrawal_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff());

-- Agents can view audit logs for their own withdrawals
CREATE POLICY "Agents view own withdrawal audit logs"
  ON public.withdrawal_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_withdrawals aw
      WHERE aw.id = withdrawal_id
      AND aw.agent_id = public.get_my_agent_id()
    )
  );
