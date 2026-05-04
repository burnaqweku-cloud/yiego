
-- Create agent_activity_logs table for tracking all agent-related events
CREATE TABLE public.agent_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  meta JSONB DEFAULT '{}',
  actor_id UUID,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can manage activity logs
CREATE POLICY "Admins can manage agent activity logs"
ON public.agent_activity_logs
FOR ALL USING (is_admin());

-- Agents can view their own activity
CREATE POLICY "Agents can view own activity logs"
ON public.agent_activity_logs
FOR SELECT USING (agent_id = get_my_agent_id());

-- Performance indexes
CREATE INDEX idx_agent_activity_agent ON public.agent_activity_logs(agent_id);
CREATE INDEX idx_agent_activity_event ON public.agent_activity_logs(event_type);
CREATE INDEX idx_agent_activity_created ON public.agent_activity_logs(created_at DESC);
