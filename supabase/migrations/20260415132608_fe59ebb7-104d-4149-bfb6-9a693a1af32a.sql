-- Allow admin/staff to insert into ai_conversation_messages (for takeover messages)
CREATE POLICY "admin_staff_insert_ai_conversation_messages"
ON public.ai_conversation_messages
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin_or_staff());

-- Allow admin/staff to update ai_conversations (for takeover state)
CREATE POLICY "admin_staff_update_ai_conversations"
ON public.ai_conversations
FOR UPDATE
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

-- Allow admin/staff to select ai_conversation_messages
CREATE POLICY "admin_staff_select_ai_conversation_messages"
ON public.ai_conversation_messages
FOR SELECT
TO authenticated
USING (public.is_admin_or_staff());

-- Allow admin/staff to select ai_conversations  
CREATE POLICY "admin_staff_select_ai_conversations"
ON public.ai_conversations
FOR SELECT
TO authenticated
USING (public.is_admin_or_staff());