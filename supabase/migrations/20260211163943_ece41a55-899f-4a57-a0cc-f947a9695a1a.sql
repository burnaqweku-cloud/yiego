
-- Support tickets v2 with chat threads
CREATE TABLE public.support_tickets_v2 (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_type text NOT NULL DEFAULT 'user' CHECK (ticket_type IN ('user', 'agent')),
  created_by uuid NOT NULL,
  agent_id uuid REFERENCES public.agents(id),
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  related_order_id text,
  customer_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ticket_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets_v2(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('user', 'agent', 'admin')),
  sender_id uuid NOT NULL,
  message_text text NOT NULL,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_by_user boolean NOT NULL DEFAULT false,
  read_by_agent boolean NOT NULL DEFAULT false,
  read_by_admin boolean NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX idx_support_tickets_v2_created_by ON public.support_tickets_v2(created_by);
CREATE INDEX idx_support_tickets_v2_agent_id ON public.support_tickets_v2(agent_id);
CREATE INDEX idx_support_tickets_v2_status ON public.support_tickets_v2(status);
CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);

-- Triggers for updated_at
CREATE TRIGGER update_support_tickets_v2_updated_at
  BEFORE UPDATE ON public.support_tickets_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.support_tickets_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- RLS for support_tickets_v2
CREATE POLICY "Users can view own tickets" ON public.support_tickets_v2
  FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Users can create own tickets" ON public.support_tickets_v2
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admin or staff can view all tickets" ON public.support_tickets_v2
  FOR SELECT USING (is_admin_or_staff());

CREATE POLICY "Admin or staff can update tickets" ON public.support_tickets_v2
  FOR UPDATE USING (is_admin_or_staff());

-- RLS for ticket_messages
CREATE POLICY "Users can view messages of own tickets" ON public.ticket_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_tickets_v2 t WHERE t.id = ticket_id AND t.created_by = auth.uid())
  );

CREATE POLICY "Users can send messages to own tickets" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.support_tickets_v2 t WHERE t.id = ticket_id AND t.created_by = auth.uid())
  );

CREATE POLICY "Admin or staff can view all messages" ON public.ticket_messages
  FOR SELECT USING (is_admin_or_staff());

CREATE POLICY "Admin or staff can send messages" ON public.ticket_messages
  FOR INSERT WITH CHECK (is_admin_or_staff());

CREATE POLICY "Admin or staff can update messages" ON public.ticket_messages
  FOR UPDATE USING (is_admin_or_staff());

CREATE POLICY "Users can update own ticket messages read status" ON public.ticket_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.support_tickets_v2 t WHERE t.id = ticket_id AND t.created_by = auth.uid())
  );

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
