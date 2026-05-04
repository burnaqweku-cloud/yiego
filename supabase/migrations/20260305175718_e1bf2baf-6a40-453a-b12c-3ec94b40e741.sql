-- Allow staff to view and update agents table
CREATE POLICY "Staff can view all agents"
ON public.agents
FOR SELECT
TO authenticated
USING (is_admin_or_staff());

CREATE POLICY "Staff can update agents"
ON public.agents
FOR UPDATE
TO authenticated
USING (is_admin_or_staff())
WITH CHECK (is_admin_or_staff());

-- Allow staff to insert agent_activity_logs (for audit trail)
CREATE POLICY "Staff can insert agent activity logs"
ON public.agent_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_staff());

-- Allow staff to view agent_wallets (view-only)
CREATE POLICY "Staff can view agent wallets"
ON public.agent_wallets
FOR SELECT
TO authenticated
USING (is_admin_or_staff());

-- Allow staff to view agent_withdrawals (view-only)
CREATE POLICY "Staff can view agent withdrawals"
ON public.agent_wallets
FOR SELECT
TO authenticated
USING (is_admin_or_staff());