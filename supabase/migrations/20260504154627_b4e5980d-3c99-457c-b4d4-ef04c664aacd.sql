
CREATE TABLE IF NOT EXISTS public.ai_support_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  session_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_support_usage_user_created
  ON public.ai_support_usage (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_support_usage_session_created
  ON public.ai_support_usage (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.ai_support_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view ai_support_usage" ON public.ai_support_usage;
CREATE POLICY "Admins can view ai_support_usage"
  ON public.ai_support_usage
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());
