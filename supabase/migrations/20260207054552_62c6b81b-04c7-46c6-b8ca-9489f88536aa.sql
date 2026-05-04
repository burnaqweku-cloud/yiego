
-- ========================================
-- AGENT/RESELLER SYSTEM SCHEMA
-- ========================================

-- 1. Add 'agent' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';

-- 2. Add agent wholesale price column to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS agent_price_ghs NUMERIC;

-- ========================================
-- TABLES
-- ========================================

-- 3. Agent Applications
CREATE TABLE public.agent_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- Step 1: Store Info
  store_name TEXT NOT NULL,
  store_description TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  store_email TEXT NOT NULL,
  region TEXT NOT NULL,
  store_logo_url TEXT,
  -- Step 2: Identity
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  personal_phone TEXT NOT NULL,
  personal_email TEXT,
  -- Step 3: Business Plan
  selling_method TEXT NOT NULL,
  expected_customers TEXT NOT NULL,
  sold_before BOOLEAN NOT NULL DEFAULT false,
  referral_source TEXT,
  agreed_no_scam BOOLEAN NOT NULL DEFAULT false,
  agreed_min_price BOOLEAN NOT NULL DEFAULT false,
  agreed_suspension BOOLEAN NOT NULL DEFAULT false,
  -- Admin
  status TEXT NOT NULL DEFAULT 'pending_review',
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_applications ENABLE ROW LEVEL SECURITY;

-- 4. Agents (created when application is approved)
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  application_id UUID REFERENCES public.agent_applications(id),
  store_name TEXT NOT NULL,
  store_slug TEXT NOT NULL UNIQUE,
  store_description TEXT NOT NULL DEFAULT '',
  store_logo_url TEXT,
  whatsapp_number TEXT NOT NULL,
  store_email TEXT NOT NULL,
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  activation_paid BOOLEAN NOT NULL DEFAULT false,
  activation_paid_at TIMESTAMPTZ,
  activation_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- 5. Agent Wallets
CREATE TABLE public.agent_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  available_balance NUMERIC NOT NULL DEFAULT 0,
  pending_balance NUMERIC NOT NULL DEFAULT 0,
  total_earned NUMERIC NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_wallets ENABLE ROW LEVEL SECURITY;

-- 6. Agent Wallet Transactions
CREATE TABLE public.agent_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount_ghs NUMERIC NOT NULL,
  description TEXT,
  reference TEXT,
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_wallet_transactions ENABLE ROW LEVEL SECURITY;

-- 7. Agent Orders
CREATE TABLE public.agent_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id),
  order_id TEXT NOT NULL UNIQUE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  network TEXT NOT NULL,
  bundle_size_gb NUMERIC NOT NULL,
  product_id UUID REFERENCES public.products(id),
  agent_selling_price NUMERIC NOT NULL,
  agent_cost_price NUMERIC NOT NULL,
  profit_ghs NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'paystack',
  paystack_reference TEXT UNIQUE,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  supplier_status TEXT,
  supplier_order_id TEXT,
  supplier_reference TEXT,
  supplier_message TEXT,
  supplier_raw_response TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_orders ENABLE ROW LEVEL SECURITY;

-- 8. Agent Withdrawals
CREATE TABLE public.agent_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  amount_ghs NUMERIC NOT NULL,
  momo_number TEXT NOT NULL,
  momo_network TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_withdrawals ENABLE ROW LEVEL SECURITY;

-- 9. Agent Pricing Overrides
CREATE TABLE public.agent_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  network TEXT,
  markup_percent NUMERIC,
  custom_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, product_id)
);
ALTER TABLE public.agent_pricing ENABLE ROW LEVEL SECURITY;

-- ========================================
-- HELPER FUNCTIONS
-- ========================================

CREATE OR REPLACE FUNCTION public.get_my_agent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.agents
  WHERE user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_active_agent()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agents
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
$$;

-- ========================================
-- RLS POLICIES
-- ========================================

-- Agent Applications
CREATE POLICY "Users can create own application"
ON public.agent_applications FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own application"
ON public.agent_applications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admin or staff can view all applications"
ON public.agent_applications FOR SELECT
USING (is_admin_or_staff());

CREATE POLICY "Admin can manage applications"
ON public.agent_applications FOR UPDATE
USING (is_admin());

-- Agents
CREATE POLICY "Public can view active agents"
ON public.agents FOR SELECT
USING (status = 'active');

CREATE POLICY "Agents can view own record"
ON public.agents FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Agents can update own store"
ON public.agents FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admin can manage agents"
ON public.agents FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Agent Wallets
CREATE POLICY "Agents can view own wallet"
ON public.agent_wallets FOR SELECT
USING (agent_id = get_my_agent_id());

CREATE POLICY "Admin can manage agent wallets"
ON public.agent_wallets FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Agent Wallet Transactions
CREATE POLICY "Agents can view own wallet transactions"
ON public.agent_wallet_transactions FOR SELECT
USING (agent_id = get_my_agent_id());

CREATE POLICY "Admin can manage agent wallet transactions"
ON public.agent_wallet_transactions FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Agent Orders
CREATE POLICY "Agents can view own orders"
ON public.agent_orders FOR SELECT
USING (agent_id = get_my_agent_id());

CREATE POLICY "Admin or staff can manage agent orders"
ON public.agent_orders FOR ALL
USING (is_admin_or_staff())
WITH CHECK (is_admin_or_staff());

-- Agent Withdrawals
CREATE POLICY "Agents can create own withdrawals"
ON public.agent_withdrawals FOR INSERT
WITH CHECK (agent_id = get_my_agent_id());

CREATE POLICY "Agents can view own withdrawals"
ON public.agent_withdrawals FOR SELECT
USING (agent_id = get_my_agent_id());

CREATE POLICY "Admin can manage withdrawals"
ON public.agent_withdrawals FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Agent Pricing
CREATE POLICY "Public can read agent pricing"
ON public.agent_pricing FOR SELECT
USING (true);

CREATE POLICY "Agents can manage own pricing"
ON public.agent_pricing FOR ALL
USING (agent_id = get_my_agent_id())
WITH CHECK (agent_id = get_my_agent_id());

CREATE POLICY "Admin can manage all agent pricing"
ON public.agent_pricing FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ========================================
-- TRIGGERS
-- ========================================

CREATE TRIGGER update_agent_applications_updated_at
BEFORE UPDATE ON public.agent_applications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agents_updated_at
BEFORE UPDATE ON public.agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_orders_updated_at
BEFORE UPDATE ON public.agent_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_pricing_updated_at
BEFORE UPDATE ON public.agent_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_wallets_updated_at
BEFORE UPDATE ON public.agent_wallets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- STORAGE
-- ========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('agent-logos', 'agent-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view agent logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'agent-logos');

CREATE POLICY "Authenticated users can upload agent logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'agent-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update own agent logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'agent-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ========================================
-- DEFAULT SETTINGS
-- ========================================

INSERT INTO public.site_settings (key, value)
SELECT 'agent_activation_fee', '50'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'agent_activation_fee');

INSERT INTO public.site_settings (key, value)
SELECT 'agent_min_markup_percent', '5'
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'agent_min_markup_percent');
