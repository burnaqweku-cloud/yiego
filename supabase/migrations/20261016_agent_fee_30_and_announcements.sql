-- 16 Oct 2026 — agent fee GH₵15 → GH₵30 with 24-hour notice, and sub-agents kept out of DataYego announcements.
-- Applied to production via the Supabase MCP; this file is the running note.

-- 1. Sub-agents never hear from DataYego: the bell RPC returns nothing for an account whose agents row has a parent,
--    and "agents" now means parent agents only. (announce-email v7 does the same for email: audience "agents" =
--    paid parent agents — status active, parent_agent_id null, paid_until >= today; "everyone"/"customers" drop subs.)
create or replace function phase1.my_announcements() returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $function$
with me as (select auth.uid() as uid,
  exists (select 1 from phase1.agents where user_id=auth.uid() and parent_agent_id is null) as is_agent,
  exists (select 1 from phase1.agents where user_id=auth.uid() and parent_agent_id is not null) as is_sub)
select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'kind', a.kind, 'audience', a.audience, 'link_url', a.link_url, 'link_label', a.link_label, 'is_pinned', a.is_pinned, 'is_urgent', a.is_urgent, 'starts_at', a.starts_at,
  'read', exists (select 1 from phase1.announcement_reads r where r.announcement_id=a.id and r.user_id=(select uid from me))) order by a.is_pinned desc, a.starts_at desc), '[]'::jsonb)
from phase1.announcements a, me
where a.is_active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
  and not me.is_sub
  and (a.audience = 'everyone' or (a.audience = 'guests' and me.uid is null) or (a.audience = 'customers' and me.uid is not null and not me.is_agent) or (a.audience = 'agents' and me.is_agent))
$function$;

-- 2. Two announcements for agents (bell + email to the 30 paid agents, sent through admin-email with pg_net in
--    batches of 4 — Resend rejects bursts with 429):
--    86ec822c-518d-446a-b797-2fbcd59ab3d3  "You can now have agents under you"            (update)
--    82d7ecec-fc7c-4f9c-9f61-c6e03a0e8660  "Agent fee goes to GH₵30 on Saturday — extend today at GH₵15"
--                                           (price, urgent, pinned, ends 2026-10-17 12:00 UTC)

-- 3. The price change itself is timed: pg_cron job agent-fee-change-2026-10-17 ('0 12 17 10 *', GMT) calls this
--    once, and the function unschedules the job. site_settings.agent_plan: monthly 30, plans 1/30 · 3/81 · 12/288
--    (same 10% and 20% discounts as before). Existing agents keep their current paid period; the new price applies
--    only to the next renewal/extension. Also rewrites the two ai_knowledge entries that quote the old figures and
--    switches the notice announcement off.
create or replace function phase1.agent_fee_change_apply() returns text
language plpgsql security definer set search_path to 'phase1','public' as $fn$
begin
  execute $q$update phase1.site_settings set value = value || jsonb_build_object('monthly_price', 30, 'plans', jsonb_build_array(jsonb_build_object('months',1,'price',30), jsonb_build_object('months',3,'price',81), jsonb_build_object('months',12,'price',288))) where key = 'agent_plan'$q$;
  execute $q$update phase1.ai_knowledge set content = replace(replace(replace(replace(replace(content, 'GH₵ 15.00 for 1 month, GH₵ 40.50 for 3 months (13.50 a month) or GH₵ 144.00 for 12 months (12.00 a month)', 'GH₵ 30.00 for 1 month, GH₵ 81.00 for 3 months (27.00 a month) or GH₵ 288.00 for 12 months (24.00 a month)'), 'GH₵ 15.00 per month', 'GH₵ 30.00 per month'), 'GH₵ 40.50 for 3 months', 'GH₵ 81.00 for 3 months'), 'GH₵ 144.00 for 12', 'GH₵ 288.00 for 12'), 'GH₵15', 'GH₵30'), updated_at = now() where id in ('fcd7c1a1-c9e2-4b4f-ac7f-57e2b8dbdd3b','b69bc690-180b-449e-8989-41a19602fa26')$q$;
  execute $q$update phase1.announcements set is_active = false, updated_at = now() where id = '82d7ecec-fc7c-4f9c-9f61-c6e03a0e8660'$q$;
  perform cron.unschedule('agent-fee-change-2026-10-17');
  return 'applied';
end $fn$;
-- select cron.schedule('agent-fee-change-2026-10-17', '0 12 17 10 *', $$select phase1.agent_fee_change_apply()$$);
