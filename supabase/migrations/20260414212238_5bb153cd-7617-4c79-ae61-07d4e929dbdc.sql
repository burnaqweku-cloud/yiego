
-- AI conversation sessions
CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  user_type TEXT NOT NULL DEFAULT 'guest',
  guest_name TEXT,
  user_email TEXT,
  username TEXT,
  source_page TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  outcome TEXT,
  ticket_id UUID,
  ticket_code TEXT,
  user_message_count INT NOT NULL DEFAULT 0,
  ai_message_count INT NOT NULL DEFAULT 0,
  has_evidence BOOLEAN NOT NULL DEFAULT false,
  escalation_attempted BOOLEAN NOT NULL DEFAULT false,
  escalation_blocked BOOLEAN NOT NULL DEFAULT false,
  manager_review BOOLEAN NOT NULL DEFAULT false,
  quality_rating TEXT,
  admin_notes TEXT,
  flags TEXT[] DEFAULT '{}',
  last_user_message_preview TEXT,
  last_ai_message_preview TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  UNIQUE(session_id)
);

-- AI conversation messages
CREATE TABLE public.ai_conversation_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  event_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_ai_conversations_created ON public.ai_conversations(created_at DESC);
CREATE INDEX idx_ai_conversations_status ON public.ai_conversations(status);
CREATE INDEX idx_ai_conversations_outcome ON public.ai_conversations(outcome);
CREATE INDEX idx_ai_conversations_user_type ON public.ai_conversations(user_type);
CREATE INDEX idx_ai_conversations_session ON public.ai_conversations(session_id);
CREATE INDEX idx_ai_conversation_messages_conv ON public.ai_conversation_messages(conversation_id, created_at);

-- Enable RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;

-- Admin/staff can read all
CREATE POLICY "Admins can view ai_conversations"
  ON public.ai_conversations FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

CREATE POLICY "Admins can update ai_conversations"
  ON public.ai_conversations FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff());

CREATE POLICY "Admins can view ai_conversation_messages"
  ON public.ai_conversation_messages FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

-- Service role handles inserts from edge functions (bypasses RLS)

-- Timestamp trigger
CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
