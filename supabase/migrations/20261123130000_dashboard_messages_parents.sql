-- A dashboard message can be for parent agents only (23 Nov 2026: telling agents who have agents under them about
-- the new Agents' sales page). announcements.only_parents: shown only to a main agent with at least one sub-agent.
alter table phase1.announcements add column if not exists only_parents boolean not null default false;

create or replace function phase1.my_dashboard_messages()
 returns jsonb language sql stable security definer set search_path to 'phase1', 'public' as $function$
  with me as (
    select a.id as agent_id, a.custom_domain from phase1.agents a
    where a.user_id = auth.uid() and a.parent_agent_id is null and a.paid_until is not null limit 1)
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'kind', n.kind,
      'link_url', n.link_url, 'link_label', n.link_label, 'starts_at', n.starts_at) order by n.is_pinned desc, n.starts_at desc), '[]'::jsonb)
  from phase1.announcements n, me
  where n.is_active and n.starts_at <= now() and (n.ends_at is null or n.ends_at > now())
    and n.placement in ('dashboard', 'both') and n.audience in ('agents', 'everyone')
    and not exists (select 1 from phase1.announcement_dismissals d where d.announcement_id = n.id and d.user_id = auth.uid())
    and (not n.only_without_domain or (me.custom_domain is null
      and not exists (select 1 from phase1.domain_orders o where o.agent_id = me.agent_id and o.status in ('paid', 'registered', 'live'))))
    and (not n.only_parents or exists (select 1 from phase1.agents s where s.parent_agent_id = me.agent_id))
$function$;
