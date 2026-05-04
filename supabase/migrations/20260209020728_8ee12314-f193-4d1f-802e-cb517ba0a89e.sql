
-- ===== AGENT SUBSCRIPTIONS TABLE =====
CREATE TABLE public.agent_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  plan_price_standard NUMERIC NOT NULL DEFAULT 50,
  plan_price_current NUMERIC NOT NULL DEFAULT 35,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL DEFAULT 'active',
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  next_billing_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  expiry_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  paystack_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage subscriptions"
ON public.agent_subscriptions FOR ALL
USING (is_admin());

CREATE POLICY "Agents can view own subscriptions"
ON public.agent_subscriptions FOR SELECT
USING (agent_id = get_my_agent_id());

-- Index for quick lookups
CREATE INDEX idx_agent_subscriptions_agent_id ON public.agent_subscriptions(agent_id);
CREATE INDEX idx_agent_subscriptions_status ON public.agent_subscriptions(status);

-- ===== NOTIFICATIONS TABLE =====
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all notifications"
ON public.notifications FOR ALL
USING (is_admin());

CREATE POLICY "Admin or staff can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (is_admin_or_staff());

-- Indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);
