-- A customer's conversations with one store, newest first (signed in: by account; guest: by visitor key).
create or replace function phase1.store_my_conversations(p_slug text, p_visitor text) returns jsonb language sql stable security definer set search_path to 'phase1','public' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_message_at desc), '[]'::jsonb) from (
    select c.id, c.status, c.mode, c.created_at, c.last_message_at,
      (select m.body from phase1.store_messages m where m.conversation_id = c.id and m.sender = 'customer' order by m.created_at limit 1) as preview,
      (select m.body from phase1.store_messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_body
    from phase1.store_conversations c join phase1.agents a on a.id = c.agent_id
    where a.slug = lower(p_slug)
      and ((auth.uid() is not null and c.user_id = auth.uid()) or (c.visitor_key is not null and c.visitor_key = p_visitor))
    order by c.last_message_at desc limit 30) x
$$;
revoke execute on function phase1.store_my_conversations(text, text) from public;
grant execute on function phase1.store_my_conversations(text, text) to anon, authenticated, service_role;
