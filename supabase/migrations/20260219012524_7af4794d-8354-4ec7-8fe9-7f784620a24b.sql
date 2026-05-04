
-- Table to store OneSignal subscription player IDs per user
CREATE TABLE IF NOT EXISTS public.onesignal_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  device_type TEXT DEFAULT 'web',
  platform TEXT DEFAULT 'unknown',
  user_agent TEXT,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);

-- Table to track push notification send logs (dedup + audit)
CREATE TABLE IF NOT EXISTS public.push_notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  onesignal_notification_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  segment TEXT DEFAULT 'All',
  url TEXT,
  triggered_by TEXT DEFAULT 'admin',
  entity_type TEXT,
  entity_id TEXT,
  recipients INT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  idempotency_key TEXT UNIQUE,
  error_message TEXT
);

-- Enable RLS
ALTER TABLE public.onesignal_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_logs ENABLE ROW LEVEL SECURITY;

-- onesignal_players policies
CREATE POLICY "Users can manage own player IDs"
  ON public.onesignal_players
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Guests can insert anonymous player IDs"
  ON public.onesignal_players
  FOR INSERT
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Admins can view all player IDs"
  ON public.onesignal_players
  FOR SELECT
  USING (is_admin_or_staff());

-- push_notification_logs policies
CREATE POLICY "Admins can manage push logs"
  ON public.push_notification_logs
  FOR ALL
  USING (is_admin_or_staff())
  WITH CHECK (is_admin_or_staff());
