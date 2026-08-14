-- Support Brain phase 4: the takeover inbox.
--
-- The team gets a live inbox of every AI conversation, so support_conversations
-- grows the fields an inbox needs:
--   admin_last_seen_at   — when the team last opened this transcript; anything
--                          newer than it shows as unread in the inbox.
--   last_message_preview — first 140 chars of the newest message, denormalised
--   last_message_sender    onto the conversation so the inbox list is a single
--                          query with no per-row message lookups. The ai-support
--                          function stamps both on every message insert.

alter table phase1.support_conversations
  add column admin_last_seen_at timestamptz,
  add column last_message_preview text,
  add column last_message_sender text check (last_message_sender in ('customer', 'assistant', 'admin'));

-- Backfill the preview columns from each conversation's newest message.
update phase1.support_conversations c
set last_message_preview = m.body_preview,
    last_message_sender = m.sender
from (
  select distinct on (conversation_id)
    conversation_id,
    left(regexp_replace(body, '\s+', ' ', 'g'), 140) as body_preview,
    sender
  from phase1.support_messages
  order by conversation_id, created_at desc
) m
where m.conversation_id = c.id;

notify pgrst, 'reload schema';
