
-- Payment Intents table: tracks purchase context BEFORE payment
CREATE TABLE public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paystack_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Payment status
  payment_status text NOT NULL DEFAULT 'pending',
  
  -- Order context
  order_type text NOT NULL DEFAULT 'user',
  user_id uuid,
  agent_id uuid,
  store_id uuid,
  
  -- Purchase details
  recipient_number text NOT NULL,
  network text NOT NULL,
  bundle_id uuid,
  bundle_size_gb numeric NOT NULL,
  expected_amount numeric NOT NULL,
  
  -- Support fields
  guest_email text,
  created_ip text,
  created_device text,
  
  -- Fulfillment
  order_created boolean NOT NULL DEFAULT false,
  order_id text,
  
  -- Uniqueness on paystack_reference
  CONSTRAINT payment_intents_paystack_reference_key UNIQUE (paystack_reference)
);

-- RLS
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

-- Admin-only read policy
CREATE POLICY "Admins can read all payment intents"
  ON public.payment_intents FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

-- Service role insert (edge functions use service role)
-- No insert policy needed for anon/authenticated since edge functions use service_role_key

-- Index for fast lookups
CREATE INDEX idx_payment_intents_reference ON public.payment_intents (paystack_reference);
CREATE INDEX idx_payment_intents_recipient ON public.payment_intents (recipient_number);
CREATE INDEX idx_payment_intents_order_created ON public.payment_intents (order_created) WHERE order_created = false;
CREATE INDEX idx_payment_intents_payment_status ON public.payment_intents (payment_status);

-- Updated_at trigger
CREATE TRIGGER update_payment_intents_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
