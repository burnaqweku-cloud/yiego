
-- =====================================================
-- PHASE 2: Core Operations Database Changes
-- =====================================================

-- 1. Add financial tracking fields to orders table
-- Store cost, markup, and profit at time of purchase for accurate reporting
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cost_price_ghs numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS markup_percent numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS profit_ghs numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS admin_notes text DEFAULT NULL;

-- 2. Add suspension support to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS suspended_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS suspended_reason text DEFAULT NULL;

-- 3. Create support_tickets table for lightweight ticketing
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id text DEFAULT NULL,
  category text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'open',
  subject text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  admin_notes text DEFAULT NULL,
  assigned_to uuid DEFAULT NULL,
  resolved_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Admins/staff can view all tickets
CREATE POLICY "Admins can manage tickets"
ON public.support_tickets
FOR ALL
USING (is_admin_or_staff());

-- Users can view own tickets
CREATE POLICY "Users can view own tickets"
ON public.support_tickets
FOR SELECT
USING (user_id = auth.uid());

-- Users can create tickets
CREATE POLICY "Users can create own tickets"
ON public.support_tickets
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Create supplier_api_logs table for dedicated API request tracking
CREATE TABLE IF NOT EXISTS public.supplier_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  request_payload jsonb DEFAULT NULL,
  response_status text DEFAULT NULL,
  response_body jsonb DEFAULT NULL,
  response_time_ms integer DEFAULT NULL,
  success boolean NOT NULL DEFAULT false,
  error_message text DEFAULT NULL,
  supplier_balance numeric DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_api_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can access supplier logs
CREATE POLICY "Admins can manage supplier logs"
ON public.supplier_api_logs
FOR ALL
USING (is_admin());

-- Service role inserts handled by edge functions (bypasses RLS)
-- Allow insert for service role by default (edge functions use service role key)

-- 5. Update orders RLS to allow staff to view orders too
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admin or staff can view all orders"
ON public.orders
FOR SELECT
USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admin or staff can update orders"
ON public.orders
FOR UPDATE
USING (is_admin_or_staff());

-- 6. Allow staff to view profiles (for user management)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admin or staff can view all profiles"
ON public.profiles
FOR SELECT
USING (is_admin_or_staff());

-- 7. Allow staff to view wallets and transactions
DROP POLICY IF EXISTS "Admins can view all wallets" ON public.wallets;
CREATE POLICY "Admin or staff can view all wallets"
ON public.wallets
FOR SELECT
USING (is_admin_or_staff());

DROP POLICY IF EXISTS "Admins can view all transactions" ON public.wallet_transactions;
CREATE POLICY "Admin or staff can view all transactions"
ON public.wallet_transactions
FOR SELECT
USING (is_admin_or_staff());

-- 8. Allow staff to view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admin or staff can view audit logs"
ON public.audit_logs
FOR SELECT
USING (is_admin_or_staff());
