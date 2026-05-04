-- Fix Issue 1: force_unlink should DELETE the telegram_links row, not UPDATE
-- (user_id and linked_at are NOT NULL, so the previous UPDATE always failed).
-- Audit log entry preserved (action='user.force_unlink', target_id=chat_id, details=reason+previous snapshot).

CREATE OR REPLACE FUNCTION public.tg_admin_force_unlink(p_chat_id bigint, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev jsonb;
  v_deleted int;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Snapshot for audit log
  SELECT to_jsonb(tl) INTO v_prev FROM telegram_links tl WHERE chat_id = p_chat_id;

  IF v_prev IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked');
  END IF;

  -- Sever the connection by deleting the row
  DELETE FROM telegram_links WHERE chat_id = p_chat_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Also clear any in-flight session for this chat so the user starts clean
  DELETE FROM telegram_sessions WHERE chat_id = p_chat_id;

  INSERT INTO tg_admin_audit_log (admin_user_id, action, target_type, target_id, details)
  VALUES (
    v_uid,
    'user.force_unlink',
    'telegram_links',
    p_chat_id::text,
    jsonb_build_object('reason', p_reason, 'previous', v_prev)
  );

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tg_admin_force_unlink(bigint, text) TO authenticated;