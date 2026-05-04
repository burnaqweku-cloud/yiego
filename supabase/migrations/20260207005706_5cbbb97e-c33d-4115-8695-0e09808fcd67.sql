
-- Page views tracking table for analytics
CREATE TABLE public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  page_path text NOT NULL,
  referrer text,
  user_agent text,
  device_type text DEFAULT 'desktop',
  browser text,
  country text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert page views (anonymous tracking)
CREATE POLICY "Anyone can insert page views"
  ON public.page_views FOR INSERT
  WITH CHECK (true);

-- Only admins/staff can read analytics
CREATE POLICY "Admins can read page views"
  ON public.page_views FOR SELECT
  USING (public.is_admin_or_staff());

-- Only admins can delete page views (cleanup)
CREATE POLICY "Admins can delete page views"
  ON public.page_views FOR DELETE
  USING (public.is_admin());

-- Index for fast queries
CREATE INDEX idx_page_views_created_at ON public.page_views (created_at DESC);
CREATE INDEX idx_page_views_session ON public.page_views (session_id);
CREATE INDEX idx_page_views_path ON public.page_views (page_path);

-- Enable realtime for live visitor tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.page_views;
