CREATE TABLE IF NOT EXISTS public.telegram_transient_menus (
  chat_id BIGINT PRIMARY KEY,
  message_id BIGINT NOT NULL,
  prefixes TEXT[] NOT NULL DEFAULT '{}'::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_transient_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view telegram transient menus" ON public.telegram_transient_menus;
CREATE POLICY "Admins can view telegram transient menus"
  ON public.telegram_transient_menus
  FOR SELECT
  TO authenticated
  USING (is_admin());