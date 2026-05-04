-- ─── Notification dispatch infrastructure ────────────────────────────
-- A tiny config table holds the SUPABASE URL + service role key used by
-- DB triggers to invoke the notify-event Edge Function via pg_net.
-- Populated by a separate INSERT (project-specific values).

CREATE TABLE IF NOT EXISTS public.notify_runtime_config (
  id boolean PRIMARY KEY DEFAULT true,
  function_base_url text NOT NULL,
  service_role_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT only_one_row CHECK (id = true)
);

ALTER TABLE public.notify_runtime_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage notify config" ON public.notify_runtime_config;
CREATE POLICY "Admins manage notify config" ON public.notify_runtime_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── Helper: fire-and-forget call to notify-event ────────────────────
CREATE OR REPLACE FUNCTION public._fire_notify_event(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  cfg record;
BEGIN
  SELECT function_base_url, service_role_key, enabled
    INTO cfg
  FROM public.notify_runtime_config
  WHERE id = true
  LIMIT 1;

  IF cfg IS NULL OR cfg.enabled = false THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := cfg.function_base_url || '/functions/v1/notify-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', cfg.service_role_key
    ),
    body := payload,
    timeout_milliseconds := 4000
  );
EXCEPTION WHEN OTHERS THEN
  -- Never break the originating transaction
  RAISE LOG '_fire_notify_event failed: % %', SQLERRM, SQLSTATE;
END;
$$;

-- ─── Trigger: orders → Delivered  →  user push + in-app ──────────────
CREATE OR REPLACE FUNCTION public.trg_orders_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Delivered'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND COALESCE(NEW.is_checkpoint, false) = false
     AND NEW.user_id IS NOT NULL THEN
    PERFORM public._fire_notify_event(jsonb_build_object(
      'event', 'order_delivered',
      'user_id', NEW.user_id,
      'idempotencyKey', 'order_delivered:' || NEW.order_id,
      'data', jsonb_build_object(
        'order_id', NEW.order_id,
        'network', NEW.network,
        'bundle_size_gb', NEW.bundle_size_gb,
        'amount', NEW.amount_ghs
      )
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_status_notify_trg ON public.orders;
CREATE TRIGGER orders_status_notify_trg
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_orders_status_notify();

-- ─── Trigger: agent_orders → Delivered  →  agent push + in-app ───────
CREATE OR REPLACE FUNCTION public.trg_agent_orders_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'Delivered'
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public._fire_notify_event(jsonb_build_object(
      'event', 'agent_order_delivered',
      'agent_id', NEW.agent_id,
      'idempotencyKey', 'agent_order_delivered:' || NEW.order_id,
      'data', jsonb_build_object(
        'order_id', NEW.order_id,
        'network', NEW.network,
        'bundle_size_gb', NEW.bundle_size_gb,
        'customer_phone', NEW.customer_phone,
        'amount', NEW.agent_selling_price
      )
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_orders_status_notify_trg ON public.agent_orders;
CREATE TRIGGER agent_orders_status_notify_trg
  AFTER UPDATE OF status ON public.agent_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_agent_orders_status_notify();

-- ─── Trigger: agent_orders INSERT (Paid)  →  agent "new sale" ────────
CREATE OR REPLACE FUNCTION public.trg_agent_orders_new_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'paid' THEN
    PERFORM public._fire_notify_event(jsonb_build_object(
      'event', 'agent_new_sale',
      'agent_id', NEW.agent_id,
      'idempotencyKey', 'agent_new_sale:' || NEW.order_id,
      'data', jsonb_build_object(
        'order_id', NEW.order_id,
        'network', NEW.network,
        'bundle_size_gb', NEW.bundle_size_gb,
        'customer_phone', NEW.customer_phone,
        'amount', NEW.agent_selling_price
      )
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_orders_new_sale_trg ON public.agent_orders;
CREATE TRIGGER agent_orders_new_sale_trg
  AFTER INSERT ON public.agent_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_agent_orders_new_sale();

-- ─── Trigger: agent_withdrawals status change  →  agent push ─────────
CREATE OR REPLACE FUNCTION public.trg_withdrawals_status_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.status = 'paid' THEN
      v_event := 'withdrawal_paid';
    ELSIF NEW.status = 'approved' THEN
      v_event := 'withdrawal_approved';
    ELSIF NEW.status = 'rejected' THEN
      v_event := 'withdrawal_rejected';
    ELSE
      RETURN NEW;
    END IF;

    PERFORM public._fire_notify_event(jsonb_build_object(
      'event', v_event,
      'agent_id', NEW.agent_id,
      'idempotencyKey', v_event || ':' || NEW.id::text,
      'data', jsonb_build_object(
        'withdrawal_id', NEW.id,
        'amount', NEW.amount_ghs,
        'momo_network', NEW.momo_network,
        'momo_number', NEW.momo_number
      )
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_status_notify_trg ON public.agent_withdrawals;
CREATE TRIGGER withdrawals_status_notify_trg
  AFTER UPDATE OF status ON public.agent_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_withdrawals_status_notify();

-- ─── Trigger: agent_withdrawals INSERT  →  admin "new withdrawal" ────
CREATE OR REPLACE FUNCTION public.trg_withdrawals_new_admin_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_name text;
BEGIN
  SELECT a.store_name INTO v_store_name FROM public.agents a WHERE a.id = NEW.agent_id;

  PERFORM public._fire_notify_event(jsonb_build_object(
    'event', 'admin_new_withdrawal',
    'to_admins', true,
    'idempotencyKey', 'admin_new_withdrawal:' || NEW.id::text,
    'data', jsonb_build_object(
      'withdrawal_id', NEW.id,
      'agent_id', NEW.agent_id,
      'store_name', v_store_name,
      'amount', NEW.amount_ghs
    )
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_new_admin_notify_trg ON public.agent_withdrawals;
CREATE TRIGGER withdrawals_new_admin_notify_trg
  AFTER INSERT ON public.agent_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_withdrawals_new_admin_notify();

-- ─── Trigger: ticket_messages (admin reply)  →  user/agent push ──────
CREATE OR REPLACE FUNCTION public.trg_ticket_messages_admin_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket record;
  v_recipient uuid;
  v_is_agent boolean := false;
BEGIN
  IF NEW.sender_type <> 'admin' THEN RETURN NEW; END IF;

  SELECT t.created_by, t.ticket_type
    INTO v_ticket
  FROM public.support_tickets_v2 t
  WHERE t.id = NEW.ticket_id;

  IF v_ticket IS NULL OR v_ticket.created_by IS NULL THEN RETURN NEW; END IF;

  v_recipient := v_ticket.created_by;
  v_is_agent := v_ticket.ticket_type = 'agent';

  PERFORM public._fire_notify_event(jsonb_build_object(
    'event', 'support_reply',
    'user_id', v_recipient,
    'idempotencyKey', 'support_reply:' || NEW.id::text,
    'data', jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'preview', LEFT(COALESCE(NEW.message_text, ''), 120),
      'is_agent', v_is_agent
    )
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_messages_admin_reply_trg ON public.ticket_messages;
CREATE TRIGGER ticket_messages_admin_reply_trg
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ticket_messages_admin_reply();

-- ─── Trigger: admin_support_tickets (AI escalation)  →  admin push ───
CREATE OR REPLACE FUNCTION public.trg_admin_tickets_new_ai_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only AI-created tickets (source = ai_assistant in metadata)
  IF (NEW.ticket_metadata->>'source') = 'ai_assistant' THEN
    PERFORM public._fire_notify_event(jsonb_build_object(
      'event', 'admin_new_ai_ticket',
      'to_admins', true,
      'idempotencyKey', 'admin_new_ai_ticket:' || NEW.id::text,
      'data', jsonb_build_object(
        'ticket_id', NEW.id,
        'ticket_code', NEW.ticket_code,
        'issue_type', NEW.issue_type,
        'customer_email', NEW.customer_email,
        'customer_phone', NEW.customer_phone
      )
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_tickets_new_ai_notify_trg ON public.admin_support_tickets;
CREATE TRIGGER admin_tickets_new_ai_notify_trg
  AFTER INSERT ON public.admin_support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_admin_tickets_new_ai_notify();