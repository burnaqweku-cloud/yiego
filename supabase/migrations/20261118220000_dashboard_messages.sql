-- Applied live 18 Nov 2026 (owner): messages that sit on the agent dashboard as a card under the balance, not a pop-up
-- and not a notification. Written in Admin -> Announcements with "Where it shows":
--   bell       the bell (and the phone notification on create), as before
--   dashboard  only the card on main agents' dashboards: never the bell, never a phone notification
--   both       the bell and the card
-- only_without_domain: the card goes only to agents with no domain of their own yet (none connected, none paid for).
-- An agent's "Got it" is kept per account (announcement_dismissals), so it stays gone on every phone.
alter table phase1.announcements
  add column if not exists placement text not null default 'bell',
  add column if not exists only_without_domain boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_placement_chk') then
    alter table phase1.announcements add constraint announcements_placement_chk check (placement in ('bell', 'dashboard', 'both'));
  end if;
end $$;

create table if not exists phase1.announcement_dismissals (
  announcement_id uuid not null references phase1.announcements(id) on delete cascade,
  user_id uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table phase1.announcement_dismissals enable row level security;
revoke all on phase1.announcement_dismissals from public, anon, authenticated;

-- The bell: everything except dashboard-only messages.
CREATE OR REPLACE FUNCTION phase1.my_announcements()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
with me as (select auth.uid() as uid,
  exists (select 1 from phase1.agents where user_id=auth.uid() and parent_agent_id is null and paid_until is not null) as is_agent,
  exists (select 1 from phase1.agents where user_id=auth.uid() and parent_agent_id is not null) as is_sub)
select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'kind', a.kind, 'audience', a.audience, 'link_url', a.link_url, 'link_label', a.link_label, 'is_pinned', a.is_pinned, 'is_urgent', a.is_urgent, 'starts_at', a.starts_at,
  'read', exists (select 1 from phase1.announcement_reads r where r.announcement_id=a.id and r.user_id=(select uid from me))) order by a.is_pinned desc, a.starts_at desc), '[]'::jsonb)
from phase1.announcements a, me
where a.is_active and a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
  and a.placement <> 'dashboard'
  and not me.is_sub
  and (a.audience = 'everyone' or (a.audience = 'guests' and me.uid is null) or (a.audience = 'customers' and me.uid is not null and not me.is_agent) or (a.audience = 'agents' and me.is_agent))
$function$;

-- Phone notification on create: never for a dashboard-only message.
CREATE OR REPLACE FUNCTION phase1.announcements_push_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
begin
  begin
    if new.is_active and new.placement <> 'dashboard' and new.audience in ('everyone','customers','agents') then
      perform phase1.push_enqueue('announcement', 'announcement:' || new.id, new.title, regexp_replace(left(new.body, 200), '\s+', ' ', 'g'),
        case when new.link_url ~ '^/[A-Za-z0-9/_-]*$' then new.link_url when new.audience = 'agents' then '/agent' else '/' end, null, new.id, null, new.audience, greatest(coalesce(new.starts_at, now()), now()));
    end if;
  exception when others then null;
  end;
  return new;
end $function$;

-- The cards for the signed-in main agent (paid plan, same rule as agent announcements in the bell; never sub-agents).
create or replace function phase1.my_dashboard_messages() returns jsonb language sql stable security definer set search_path to 'phase1', 'public' as $$
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
$$;
revoke all on function phase1.my_dashboard_messages() from public, anon;
grant execute on function phase1.my_dashboard_messages() to authenticated;

create or replace function phase1.dismiss_dashboard_message(p_id uuid) returns void language plpgsql security definer set search_path to 'phase1', 'public' as $$
begin
  if auth.uid() is null then raise exception 'sign_in_required'; end if;
  insert into phase1.announcement_dismissals (announcement_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;
revoke all on function phase1.dismiss_dashboard_message(uuid) from public, anon;
grant execute on function phase1.dismiss_dashboard_message(uuid) to authenticated;

-- Saving: the 13-argument version is replaced by one that also takes placement and the no-domain choice (both
-- optional, so a page that doesn't send them still works). The old 12-argument version is left as it was.
drop function if exists phase1.admin_save_announcement(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean, boolean);
create or replace function phase1.admin_save_announcement(p_actor uuid, p_id uuid, p_title text, p_body text, p_audience text, p_kind text,
  p_link_url text, p_link_label text, p_starts_at timestamptz, p_ends_at timestamptz, p_pinned boolean, p_active boolean,
  p_urgent boolean default false, p_placement text default 'bell', p_only_without_domain boolean default false)
returns uuid language plpgsql security definer set search_path to 'phase1', 'public' as $function$
declare v_id uuid; v_place text := coalesce(nullif(p_placement, ''), 'bell'); v_nodomain boolean;
begin
  perform phase1.finance_assert_admin(p_actor);
  if v_place not in ('bell', 'dashboard', 'both') then raise exception 'placement_unknown'; end if;
  if v_place <> 'bell' and p_audience not in ('agents', 'everyone') then raise exception 'dashboard_is_for_agents'; end if;
  v_nodomain := v_place <> 'bell' and coalesce(p_only_without_domain, false);
  if p_id is null then
    insert into phase1.announcements (title, body, audience, kind, link_url, link_label, starts_at, ends_at, is_pinned, is_active, is_urgent, placement, only_without_domain, created_by)
    values (trim(p_title), trim(p_body), p_audience, p_kind, nullif(trim(p_link_url),''), nullif(trim(p_link_label),''), coalesce(p_starts_at, now()), p_ends_at,
      coalesce(p_pinned,false), coalesce(p_active,true), coalesce(p_urgent,false) and v_place <> 'dashboard', v_place, v_nodomain, p_actor) returning id into v_id;
  else
    update phase1.announcements set title=trim(p_title), body=trim(p_body), audience=p_audience, kind=p_kind, link_url=nullif(trim(p_link_url),''), link_label=nullif(trim(p_link_label),''),
      starts_at=coalesce(p_starts_at, starts_at), ends_at=p_ends_at, is_pinned=coalesce(p_pinned,false), is_active=coalesce(p_active,true),
      is_urgent=coalesce(p_urgent,false) and v_place <> 'dashboard', placement=v_place, only_without_domain=v_nodomain, updated_at=now() where id=p_id;
    v_id := p_id;
  end if;
  return v_id;
end $function$;
revoke all on function phase1.admin_save_announcement(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean, boolean, text, boolean) from public, anon;
grant execute on function phase1.admin_save_announcement(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean, boolean, text, boolean) to authenticated;

-- The 12-argument version would clash with the new one (whose last three settings are optional) for a 12-setting call.
drop function if exists phase1.admin_save_announcement(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean);
