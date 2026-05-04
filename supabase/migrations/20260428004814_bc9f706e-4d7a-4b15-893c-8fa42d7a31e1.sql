-- Registry of Telegram Mini Apps registered with BotFather
CREATE TABLE public.tg_miniapps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  app_name TEXT NOT NULL UNIQUE,
  route TEXT NOT NULL,
  telegram_app_short_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tg_miniapps ENABLE ROW LEVEL SECURITY;

-- Admins can read; only service role writes (no policy needed for service role)
CREATE POLICY "Admins can view tg_miniapps"
ON public.tg_miniapps
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_tg_miniapps_updated_at
BEFORE UPDATE ON public.tg_miniapps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the three apps
INSERT INTO public.tg_miniapps (app_name, route, telegram_app_short_name, description) VALUES
  ('link',    '/tg/link',    'link',    'Link your DataSika account to Telegram'),
  ('deposit', '/tg/deposit', 'deposit', 'Top up your DataSika wallet'),
  ('pay',     '/tg/pay',     'pay',     'Pay for a DataSika order');