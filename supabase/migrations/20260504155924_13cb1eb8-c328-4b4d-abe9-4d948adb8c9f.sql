
-- Campaign Banners (Phase 1)
CREATE TABLE IF NOT EXISTS public.campaign_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  template_type TEXT NOT NULL DEFAULT 'promo',
  image_url TEXT,
  primary_button_text TEXT,
  primary_button_url TEXT,
  secondary_button_text TEXT,
  secondary_button_url TEXT,
  audience_type TEXT NOT NULL DEFAULT 'all',
  target_pages JSONB NOT NULL DEFAULT '["all"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  frequency_type TEXT NOT NULL DEFAULT 'once_per_day',
  max_views_per_user INTEGER,
  show_delay_seconds INTEGER NOT NULL DEFAULT 0,
  dismiss_behavior TEXT NOT NULL DEFAULT 'follow_frequency',
  priority INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cb_enabled ON public.campaign_banners(is_enabled);
CREATE INDEX IF NOT EXISTS idx_cb_window ON public.campaign_banners(start_at, end_at);

ALTER TABLE public.campaign_banners ENABLE ROW LEVEL SECURITY;

-- Admin/staff can manage; everyone (anon + auth) can read enabled banners only
CREATE POLICY "Admins manage campaign banners"
ON public.campaign_banners FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Public read enabled banners"
ON public.campaign_banners FOR SELECT
TO anon, authenticated
USING (is_enabled = true);

-- Updated_at trigger
CREATE TRIGGER trg_cb_updated_at
BEFORE UPDATE ON public.campaign_banners
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Events table
CREATE TABLE IF NOT EXISTS public.campaign_banner_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID NOT NULL REFERENCES public.campaign_banners(id) ON DELETE CASCADE,
  user_id UUID,
  anonymous_id TEXT,
  event_type TEXT NOT NULL,
  page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cbe_banner_user ON public.campaign_banner_events(banner_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cbe_banner_anon ON public.campaign_banner_events(banner_id, anonymous_id);
CREATE INDEX IF NOT EXISTS idx_cbe_created ON public.campaign_banner_events(created_at);

ALTER TABLE public.campaign_banner_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert their own event (used for tracking)
CREATE POLICY "Anyone can insert banner events"
ON public.campaign_banner_events FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only admin/staff read events
CREATE POLICY "Admins read banner events"
ON public.campaign_banner_events FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_banners;
