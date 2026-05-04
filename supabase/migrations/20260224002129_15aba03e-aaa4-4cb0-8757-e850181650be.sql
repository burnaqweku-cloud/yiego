
-- ═══════════════════════════════════════════════════════════════
-- Supplier Shadow Wallet & Supplier Ledger
-- ═══════════════════════════════════════════════════════════════

-- 1) supplier_shadow_wallet — single-row config
CREATE TABLE public.supplier_shadow_wallet (
  id boolean NOT NULL DEFAULT true PRIMARY KEY,
  starting_balance_ghs numeric NOT NULL DEFAULT 0,
  starting_balance_set_at timestamptz,
  starting_balance_set_by uuid,
  current_balance_ghs numeric NOT NULL DEFAULT 0,
  last_computed_at timestamptz DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_shadow_wallet_singleton CHECK (id = true)
);

ALTER TABLE public.supplier_shadow_wallet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage supplier_shadow_wallet"
  ON public.supplier_shadow_wallet FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2) supplier_ledger — transaction log
CREATE TABLE public.supplier_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_ghs numeric NOT NULL CHECK (amount_ghs > 0),
  order_id text,
  supplier_reference text,
  note text,
  reconciliation_status text NOT NULL DEFAULT 'reconciled' CHECK (reconciliation_status IN ('reconciled', 'unreconciled')),
  evidence_url text,
  CONSTRAINT supplier_ledger_valid_type CHECK (type IN (
    'supplier_topup',
    'supplier_spend_order',
    'supplier_refund_reversal',
    'supplier_adjustment'
  ))
);

ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage supplier_ledger"
  ON public.supplier_ledger FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Service role insert policy for edge functions
CREATE POLICY "Service role can insert supplier_ledger"
  ON public.supplier_ledger FOR INSERT
  WITH CHECK (true);

-- 3) Seed the singleton row
INSERT INTO public.supplier_shadow_wallet (id, starting_balance_ghs)
VALUES (true, 0)
ON CONFLICT (id) DO NOTHING;
