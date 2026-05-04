-- Allow staff to view agent_withdrawals
CREATE POLICY "Staff can view agent withdrawals"
ON public.agent_withdrawals
FOR SELECT
TO authenticated
USING (is_admin_or_staff());

-- Allow staff to insert agent_subscriptions (for manual activation)
CREATE POLICY "Staff can view agent subscriptions"
ON public.agent_subscriptions
FOR SELECT
TO authenticated
USING (is_admin_or_staff());

-- Allow staff to insert agent subscriptions (for agent activation)
CREATE POLICY "Staff can insert agent subscriptions"
ON public.agent_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (is_admin_or_staff());