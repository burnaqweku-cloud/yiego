
-- Add Paystack fields to orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paystack_reference text,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';

-- Add provider and paystack_reference to wallet_transactions
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS paystack_reference text;

-- Create paystack_payments audit table
CREATE TABLE IF NOT EXISTS public.paystack_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('deposit', 'order')),
  amount_ghs numeric NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'pending',
  channel text,
  customer_email text,
  paid_at timestamp with time zone,
  verified_at timestamp with time zone,
  raw_response jsonb,
  linked_order_id text,
  linked_wallet_txn_id uuid,
  user_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paystack_payments ENABLE ROW LEVEL SECURITY;

-- RLS policies for paystack_payments
CREATE POLICY "Users can view own paystack payments"
  ON public.paystack_payments
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admin or staff can view all paystack payments"
  ON public.paystack_payments
  FOR SELECT
  USING (is_admin_or_staff());

CREATE POLICY "Admin can manage paystack payments"
  ON public.paystack_payments
  FOR ALL
  USING (is_admin());

-- Service role needs insert access (for edge functions via service role)
-- Edge functions use service role key so RLS is bypassed

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_paystack_payments_reference ON public.paystack_payments(reference);
CREATE INDEX IF NOT EXISTS idx_paystack_payments_linked_order ON public.paystack_payments(linked_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_paystack_reference ON public.orders(paystack_reference);
