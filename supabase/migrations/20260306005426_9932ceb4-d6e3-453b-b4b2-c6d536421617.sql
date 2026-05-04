
-- Create paystack_sync_runs audit table
CREATE TABLE public.paystack_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  range text,
  fetched_count integer DEFAULT 0,
  upserted_count integer DEFAULT 0,
  already_existed_count integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  debug jsonb DEFAULT '{}'::jsonb,
  triggered_by uuid
);

ALTER TABLE public.paystack_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and staff can view sync runs" ON public.paystack_sync_runs
  FOR SELECT TO authenticated USING (is_admin_or_staff());

CREATE POLICY "Admin can insert sync runs" ON public.paystack_sync_runs
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Admin can update sync runs" ON public.paystack_sync_runs
  FOR UPDATE TO authenticated USING (is_admin());
