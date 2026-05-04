
-- Add ticket_code column
ALTER TABLE public.admin_support_tickets
ADD COLUMN ticket_code TEXT;

-- Function to generate a random ticket code
CREATE OR REPLACE FUNCTION public.generate_ticket_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempts INT := 0;
BEGIN
  IF NEW.ticket_code IS NULL THEN
    LOOP
      v_code := 'TK-';
      FOR i IN 1..5 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM public.admin_support_tickets WHERE ticket_code = v_code) THEN
        NEW.ticket_code := v_code;
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts > 20 THEN
        -- Fallback: longer code
        v_code := 'TK-';
        FOR i IN 1..8 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;
        NEW.ticket_code := v_code;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate ticket code on insert
CREATE TRIGGER trg_generate_ticket_code
BEFORE INSERT ON public.admin_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.generate_ticket_code();

-- Backfill existing tickets
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempts INT;
BEGIN
  FOR r IN SELECT id FROM public.admin_support_tickets WHERE ticket_code IS NULL LOOP
    v_attempts := 0;
    LOOP
      v_code := 'TK-';
      FOR i IN 1..5 LOOP
        v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
      END LOOP;
      IF NOT EXISTS (SELECT 1 FROM public.admin_support_tickets WHERE ticket_code = v_code) THEN
        UPDATE public.admin_support_tickets SET ticket_code = v_code WHERE id = r.id;
        EXIT;
      END IF;
      v_attempts := v_attempts + 1;
      IF v_attempts > 20 THEN
        v_code := 'TK-';
        FOR i IN 1..8 LOOP
          v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
        END LOOP;
        UPDATE public.admin_support_tickets SET ticket_code = v_code WHERE id = r.id;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Make it NOT NULL after backfill
ALTER TABLE public.admin_support_tickets ALTER COLUMN ticket_code SET NOT NULL;

-- Unique index on ticket_code
CREATE UNIQUE INDEX idx_admin_support_tickets_ticket_code ON public.admin_support_tickets (ticket_code);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_admin_support_tickets_status ON public.admin_support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_admin_support_tickets_created_at ON public.admin_support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_support_tickets_metadata ON public.admin_support_tickets USING GIN (ticket_metadata);
CREATE INDEX IF NOT EXISTS idx_admin_support_tickets_assigned ON public.admin_support_tickets (assigned_to) WHERE assigned_to IS NOT NULL;
