
-- Finance Ledger Entries
CREATE TABLE public.finance_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  entry_date date NOT NULL DEFAULT current_date,
  type text NOT NULL CHECK (type IN ('paystack_payout_in','supplier_topup_out','business_expense_out','agent_commission_paid_out','manual_adjustment')),
  direction text NOT NULL CHECK (direction IN ('credit','debit')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'GHS',
  reference text,
  description text NOT NULL,
  category text,
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','system')),
  source_id uuid,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void'))
);

CREATE INDEX idx_finance_ledger_created_at ON public.finance_ledger_entries (created_at DESC);
CREATE INDEX idx_finance_ledger_entry_date ON public.finance_ledger_entries (entry_date DESC);
CREATE INDEX idx_finance_ledger_type ON public.finance_ledger_entries (type);
CREATE UNIQUE INDEX idx_finance_ledger_system_unique ON public.finance_ledger_entries (type, source_id) WHERE source = 'system' AND status = 'posted';

ALTER TABLE public.finance_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage finance ledger"
  ON public.finance_ledger_entries FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Finance Settings (single-row)
CREATE TABLE public.finance_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  starting_balance numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage finance settings"
  ON public.finance_settings FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Insert default row
INSERT INTO public.finance_settings (id, starting_balance) VALUES (true, 0);

-- Finance Monthly Snapshots
CREATE TABLE public.finance_monthly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month text NOT NULL UNIQUE,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  closing_balance numeric(12,2) NOT NULL DEFAULT 0,
  total_in numeric(12,2) NOT NULL DEFAULT 0,
  total_out numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_monthly_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage finance snapshots"
  ON public.finance_monthly_snapshots FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
