
-- A) Allow staff to UPDATE agent_applications (approve/decline)
CREATE POLICY "Staff can update applications"
ON public.agent_applications FOR UPDATE
TO authenticated
USING (is_admin_or_staff())
WITH CHECK (is_admin_or_staff());

-- A) Allow staff to INSERT audit_logs
CREATE POLICY "Staff can create audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_staff());

-- B) Add ticket_metadata jsonb column for extra fields
ALTER TABLE public.admin_support_tickets
ADD COLUMN IF NOT EXISTS ticket_metadata jsonb DEFAULT '{}'::jsonb;
