
-- Wallets table
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance_ghs numeric NOT NULL DEFAULT 0 CHECK (balance_ghs >= 0),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all wallets" ON public.wallets
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update wallets" ON public.wallets
  FOR UPDATE USING (is_admin());

CREATE POLICY "Authenticated users can create own wallet" ON public.wallets
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Wallet transactions table
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('deposit', 'debit', 'refund')),
  amount_ghs numeric NOT NULL CHECK (amount_ghs > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  reference text,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own transactions" ON public.wallet_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all transactions" ON public.wallet_transactions
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update transactions" ON public.wallet_transactions
  FOR UPDATE USING (is_admin());

-- Trigger to update wallet updated_at
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert system status settings if not exist
INSERT INTO public.site_settings (key, value) VALUES ('system_online', 'true')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.site_settings (key, value) VALUES ('system_status_message', 'Orders are processing normally.')
  ON CONFLICT (key) DO NOTHING;
