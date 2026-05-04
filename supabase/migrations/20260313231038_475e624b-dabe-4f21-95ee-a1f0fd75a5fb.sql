
-- Phase 1: Add promo/subscription fields to agents table (ADD ONLY)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS agent_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS discount_extension_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_extended_until timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_plan text;

-- Phase 1: Create agent_subscription_payment_intents table
CREATE TABLE IF NOT EXISTS public.agent_subscription_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  intent_type text NOT NULL DEFAULT 'activation',
  plan text NOT NULL DEFAULT 'monthly',
  amount_expected numeric NOT NULL,
  paystack_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'initialized',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on intents
ALTER TABLE public.agent_subscription_payment_intents ENABLE ROW LEVEL SECURITY;

-- Agents can view their own intents
CREATE POLICY "Agents can view own intents"
  ON public.agent_subscription_payment_intents
  FOR SELECT TO authenticated
  USING (agent_id = public.get_my_agent_id());

-- Admin/staff can view all
CREATE POLICY "Admin can view all intents"
  ON public.agent_subscription_payment_intents
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff());

-- Admin can insert (edge functions use service role so this is for completeness)
CREATE POLICY "Admin can insert intents"
  ON public.agent_subscription_payment_intents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff());

-- Backfill agent_approved_at for existing active agents that don't have it set
UPDATE public.agents
SET agent_approved_at = COALESCE(activation_paid_at, created_at),
    activation_discount_expires_at = COALESCE(activation_paid_at, created_at)
WHERE status = 'active' AND agent_approved_at IS NULL;
