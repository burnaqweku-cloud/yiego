-- 2026-10-08 — Support inbox: pinned chats. Applied via execute_sql.
-- Pin and read state are shared by the whole admin team (same as admin_last_seen_at).
-- Edge function ai-support gained actions pin_chat / unpin_chat / mark_unread (service role,
-- admin-gated like the other inbox actions) and the lookup_order_by_phone assistant tool, which
-- calls the existing phase1.track_by_phone (same privacy rules as the Track page).
alter table phase1.support_conversations add column if not exists admin_pinned_at timestamptz;
