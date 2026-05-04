ALTER TABLE public.support_tickets_v2
ADD COLUMN IF NOT EXISTS satisfaction_rating smallint
  CHECK (satisfaction_rating IS NULL OR (satisfaction_rating BETWEEN 1 AND 5));