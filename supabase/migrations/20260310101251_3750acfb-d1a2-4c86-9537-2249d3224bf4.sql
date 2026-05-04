
CREATE TABLE IF NOT EXISTS public.backfill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  summary jsonb DEFAULT '{}'::jsonb,
  UNIQUE(run_key)
);

ALTER TABLE public.backfill_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can manage backfill_runs"
ON public.backfill_runs
FOR ALL
TO public
USING (false)
WITH CHECK (false);
