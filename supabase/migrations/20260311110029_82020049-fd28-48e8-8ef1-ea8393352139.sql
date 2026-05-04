
-- Dispatch attempt tracking table
CREATE TABLE public.order_dispatch_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  supplier_key text,
  request_payload jsonb,
  http_status integer,
  response_text text,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  normalized_error_code text,
  created_by text NOT NULL DEFAULT 'system',
  retry_of_attempt_id uuid REFERENCES public.order_dispatch_attempts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_dispatch_attempts_order_id ON public.order_dispatch_attempts(order_id);
CREATE INDEX idx_dispatch_attempts_order_success ON public.order_dispatch_attempts(order_id, success);

-- Lock table for safe retries
CREATE TABLE public.order_dispatch_locks (
  order_id text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by text NOT NULL
);

-- Retry audit log
CREATE TABLE public.order_retry_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  admin_id text NOT NULL,
  previous_attempt_id uuid,
  new_attempt_id uuid,
  result text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_retry_audit_order ON public.order_retry_audit_logs(order_id);

-- RLS
ALTER TABLE public.order_dispatch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_dispatch_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_retry_audit_logs ENABLE ROW LEVEL SECURITY;

-- Admin/staff can read dispatch attempts
CREATE POLICY "admin_staff_select_dispatch_attempts" ON public.order_dispatch_attempts
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff());

-- Admin/staff can insert (for edge functions via service role, this is bypassed anyway)
CREATE POLICY "admin_staff_insert_dispatch_attempts" ON public.order_dispatch_attempts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff());

-- Locks: admin only
CREATE POLICY "admin_manage_dispatch_locks" ON public.order_dispatch_locks
  FOR ALL TO authenticated
  USING (public.is_admin());

-- Retry audit: admin/staff read
CREATE POLICY "admin_staff_select_retry_audit" ON public.order_retry_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff());

CREATE POLICY "admin_insert_retry_audit" ON public.order_retry_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
