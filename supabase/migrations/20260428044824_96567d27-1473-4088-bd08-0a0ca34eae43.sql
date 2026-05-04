
ALTER TABLE public.support_tickets_v2 ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.ticket_messages    ALTER COLUMN sender_id  DROP NOT NULL;

ALTER TABLE public.support_tickets_v2
  ADD COLUMN IF NOT EXISTS ticket_code               text UNIQUE,
  ADD COLUMN IF NOT EXISTS telegram_chat_id          bigint,
  ADD COLUMN IF NOT EXISTS telegram_user_id          bigint,
  ADD COLUMN IF NOT EXISTS telegram_username         text,
  ADD COLUMN IF NOT EXISTS assigned_agent_telegram_id bigint,
  ADD COLUMN IF NOT EXISTS assigned_agent_name       text,
  ADD COLUMN IF NOT EXISTS last_user_message_at      timestamptz,
  ADD COLUMN IF NOT EXISTS close_reason              text,
  ADD COLUMN IF NOT EXISTS source                    text NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_support_tickets_v2_telegram_chat_id
  ON public.support_tickets_v2 (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_v2_ticket_code
  ON public.support_tickets_v2 (ticket_code) WHERE ticket_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_v2_open_telegram
  ON public.support_tickets_v2 (telegram_chat_id, status)
  WHERE status IN ('open', 'in_progress') AND telegram_chat_id IS NOT NULL;

ALTER TABLE public.ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_sender_type_check;
ALTER TABLE public.ticket_messages
  ADD CONSTRAINT ticket_messages_sender_type_check
  CHECK (sender_type = ANY (ARRAY['user'::text, 'agent'::text, 'admin'::text, 'system'::text]));

ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS sender_telegram_id bigint,
  ADD COLUMN IF NOT EXISTS sender_name        text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='support_tickets_v2' AND policyname='Service role manages tickets') THEN
    CREATE POLICY "Service role manages tickets" ON public.support_tickets_v2
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ticket_messages' AND policyname='Service role manages messages') THEN
    CREATE POLICY "Service role manages messages" ON public.ticket_messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_dsa_ticket_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempts int := 0;
  byte_val int;
BEGIN
  LOOP
    candidate := 'DSA-';
    FOR i IN 1..5 LOOP
      byte_val := (get_byte(gen_random_bytes(1), 0) % 32);
      candidate := candidate || substr(alphabet, byte_val + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.support_tickets_v2 WHERE ticket_code = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 30 THEN RAISE EXCEPTION 'Could not generate unique ticket_code after 30 tries'; END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.telegram_admin_command_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id   bigint NOT NULL,
  telegram_username  text,
  telegram_chat_id   bigint,
  command            text NOT NULL,
  args               text,
  ticket_code        text,
  ticket_id          uuid,
  result             text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_admin_cmd_user ON public.telegram_admin_command_log (telegram_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_admin_cmd_ticket ON public.telegram_admin_command_log (ticket_code) WHERE ticket_code IS NOT NULL;

ALTER TABLE public.telegram_admin_command_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_admin_command_log' AND policyname='Admins or staff can read tg admin cmd log') THEN
    CREATE POLICY "Admins or staff can read tg admin cmd log" ON public.telegram_admin_command_log
      FOR SELECT TO authenticated USING (public.is_admin_or_staff());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='telegram_admin_command_log' AND policyname='Service role writes tg admin cmd log') THEN
    CREATE POLICY "Service role writes tg admin cmd log" ON public.telegram_admin_command_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
