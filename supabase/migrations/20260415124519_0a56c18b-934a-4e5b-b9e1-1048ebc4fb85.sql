
-- Add handled_by to track conversation ownership (AI vs Admin)
ALTER TABLE public.ai_conversations 
  ADD COLUMN IF NOT EXISTS handled_by TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS admin_handler_id UUID,
  ADD COLUMN IF NOT EXISTS admin_handler_name TEXT,
  ADD COLUMN IF NOT EXISTS admin_joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_left_at TIMESTAMPTZ;

-- Add admin_name field to conversation messages for admin takeover messages
ALTER TABLE public.ai_conversation_messages
  ADD COLUMN IF NOT EXISTS admin_name TEXT;

-- Enable realtime for ai_conversation_messages so user & admin see live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_conversation_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_conversations;
