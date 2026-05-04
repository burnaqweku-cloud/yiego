
-- ========================================================================
-- PAYSTACK TRANSACTIONS TABLE
-- Stores every Paystack transaction (success, failed, abandoned, etc.)
-- ========================================================================
CREATE TABLE public.paystack_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  paystack_id bigint UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  channel text,
  currency text NOT NULL DEFAULT 'GHS',
  amount integer NOT NULL,
  fees integer,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  customer_email text,
  customer_phone text,
  customer_name text,
  authorization_brand text,
  authorization_last4 text,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  purpose text,
  linked_user_id uuid,
  linked_order_id text,
  linked_deposit_id text,
  linked_agent_subscription_id text,
  reconciliation_status text NOT NULL DEFAULT 'unreviewed',
  reconciliation_reason text,
  last_checked_at timestamptz
);

-- Indexes
CREATE INDEX idx_pt_customer_phone ON public.paystack_transactions (customer_phone);
CREATE INDEX idx_pt_customer_email ON public.paystack_transactions (customer_email);
CREATE INDEX idx_pt_status ON public.paystack_transactions (status);
CREATE INDEX idx_pt_paid_at ON public.paystack_transactions (paid_at DESC);
CREATE INDEX idx_pt_recon_status ON public.paystack_transactions (reconciliation_status);
CREATE INDEX idx_pt_purpose ON public.paystack_transactions (purpose);
CREATE INDEX idx_pt_raw ON public.paystack_transactions USING gin (raw);
CREATE INDEX idx_pt_metadata ON public.paystack_transactions USING gin (metadata);

-- RLS
ALTER TABLE public.paystack_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and staff can view transactions"
  ON public.paystack_transactions FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

CREATE POLICY "Admin can insert transactions"
  ON public.paystack_transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update transactions"
  ON public.paystack_transactions FOR UPDATE
  TO authenticated
  USING (public.is_admin());

-- Service role bypass for edge functions (webhook/sync)
CREATE POLICY "Service role full access to transactions"
  ON public.paystack_transactions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ========================================================================
-- EXTEND admin_support_tickets with transaction linking
-- ========================================================================
ALTER TABLE public.admin_support_tickets
  ADD COLUMN IF NOT EXISTS linked_transaction_reference text,
  ADD COLUMN IF NOT EXISTS linked_case_id uuid;
