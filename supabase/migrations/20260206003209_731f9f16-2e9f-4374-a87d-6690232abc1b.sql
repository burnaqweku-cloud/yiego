
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network TEXT NOT NULL CHECK (network IN ('MTN', 'Telecel', 'AirtelTigo')),
  bundle_size_gb NUMERIC NOT NULL,
  price_ghs NUMERIC NOT NULL,
  delivery_type TEXT NOT NULL DEFAULT 'Instant' CHECK (delivery_type IN ('Instant', 'Manual')),
  active BOOLEAN NOT NULL DEFAULT true,
  popular BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_number TEXT NOT NULL,
  network TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  bundle_size_gb NUMERIC NOT NULL,
  amount_ghs NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processing', 'Delivered', 'Failed')),
  supplier_reference TEXT,
  delivery_note TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create site_notices table
CREATE TABLE public.site_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT false,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'outage')),
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  affected_network TEXT NOT NULL DEFAULT 'All',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_notices ENABLE ROW LEVEL SECURITY;

-- Create site_settings table
CREATE TABLE public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

-- Helper function: check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_site_notices_updated_at BEFORE UPDATE ON public.site_notices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());

-- User roles: only admins can manage
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Products: publicly readable, admin-writable
CREATE POLICY "Anyone can view active products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.is_admin());

-- Orders: complex access
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Guests can lookup orders" ON public.orders FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can delete orders" ON public.orders FOR DELETE TO authenticated USING (public.is_admin());

-- Site notices: publicly readable, admin-writable
CREATE POLICY "Anyone can view notices" ON public.site_notices FOR SELECT USING (true);
CREATE POLICY "Admins can manage notices" ON public.site_notices FOR ALL TO authenticated USING (public.is_admin());

-- Site settings: publicly readable, admin-writable
CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.site_settings FOR ALL TO authenticated USING (public.is_admin());

-- Seed default products
INSERT INTO public.products (network, bundle_size_gb, price_ghs, delivery_type, active, popular) VALUES
  ('MTN', 1, 5.50, 'Instant', true, true),
  ('MTN', 2, 10.00, 'Instant', true, false),
  ('MTN', 3, 14.00, 'Instant', true, true),
  ('MTN', 5, 22.00, 'Instant', true, true),
  ('MTN', 10, 40.00, 'Manual', true, false),
  ('MTN', 15, 55.00, 'Manual', true, false),
  ('MTN', 20, 70.00, 'Manual', true, false),
  ('Telecel', 1, 5.00, 'Instant', true, false),
  ('Telecel', 2, 9.50, 'Instant', true, true),
  ('Telecel', 5, 21.00, 'Instant', true, false),
  ('Telecel', 10, 38.00, 'Manual', true, false),
  ('Telecel', 15, 52.00, 'Manual', true, false),
  ('AirtelTigo', 1, 4.50, 'Instant', true, false),
  ('AirtelTigo', 2, 8.50, 'Instant', true, false),
  ('AirtelTigo', 5, 20.00, 'Instant', true, true),
  ('AirtelTigo', 10, 36.00, 'Manual', true, false),
  ('AirtelTigo', 20, 65.00, 'Manual', true, false);

-- Seed default site notice
INSERT INTO public.site_notices (enabled, severity, title, message, affected_network)
VALUES (false, 'info', '', '', 'All');

-- Seed default site settings
INSERT INTO public.site_settings (key, value) VALUES
  ('whatsapp_number', '233200000000'),
  ('whatsapp_message', 'Hello DataSika Support, I need help with my order.');
