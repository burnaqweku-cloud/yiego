
ALTER TABLE public.admin_support_tickets
  ADD COLUMN IF NOT EXISTS resolution_code text,
  ADD COLUMN IF NOT EXISTS resolution_message text,
  ADD COLUMN IF NOT EXISTS resolved_by text,
  ADD COLUMN IF NOT EXISTS user_notified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_support_tickets.resolution_code IS 'Structured resolution action code (e.g. order_created_now, credited_successfully)';
COMMENT ON COLUMN public.admin_support_tickets.resolution_message IS 'User-facing message generated from resolution code';
COMMENT ON COLUMN public.admin_support_tickets.user_notified IS 'Whether the user has been notified of the resolution';
