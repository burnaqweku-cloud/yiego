
-- Admin support tickets table (escalation system for WhatsApp support)
CREATE TABLE public.admin_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  assigned_to uuid,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
  issue_type text NOT NULL CHECK (issue_type IN ('deposit_not_reflected', 'order_not_delivered', 'wrong_number', 'refund_request', 'wallet_issue', 'account_issue', 'other')),
  customer_phone text,
  reference_type text NOT NULL DEFAULT 'none' CHECK (reference_type IN ('order_id', 'deposit_id', 'paystack_reference', 'none')),
  reference_value text,
  linked_order_id text,
  linked_deposit_id uuid,
  linked_user_id uuid,
  notes text,
  resolution_type text CHECK (resolution_type IN ('credited_wallet', 'resent_fulfillment', 'status_updated', 'confirmed_delivered', 'refund_issued', 'customer_error', 'other')),
  resolution_notes text
);

CREATE INDEX idx_admin_support_tickets_status_created ON public.admin_support_tickets (status, created_at DESC);
CREATE INDEX idx_admin_support_tickets_phone ON public.admin_support_tickets (customer_phone);
CREATE INDEX idx_admin_support_tickets_ref ON public.admin_support_tickets (reference_value);

-- Ticket messages / audit trail
CREATE TABLE public.admin_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.admin_support_tickets(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_admin_ticket_messages_ticket ON public.admin_ticket_messages (ticket_id, created_at);

-- Auto-update updated_at on ticket changes
CREATE OR REPLACE FUNCTION public.update_admin_ticket_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_admin_ticket_updated_at
  BEFORE UPDATE ON public.admin_support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_admin_ticket_updated_at();

-- RLS: admin and staff only
ALTER TABLE public.admin_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or staff can manage admin_support_tickets"
  ON public.admin_support_tickets FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

CREATE POLICY "Admin or staff can manage admin_ticket_messages"
  ON public.admin_ticket_messages FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());
