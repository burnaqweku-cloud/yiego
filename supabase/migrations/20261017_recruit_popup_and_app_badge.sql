-- 17 Oct 2026 — recruitment pop-up for parent agents + pending-applications badge.
-- Applied to production via the Supabase MCP; running note. Front end: RecruitPopup section on Your agents →
-- Programme & invite link; StorePopup picks from a list; nav badge on Applications.

-- One recruitment pop-up per parent agent, kept apart from their custom pop-ups.
alter table phase1.store_popups add column if not exists purpose text not null default 'custom';
alter table phase1.store_popups add constraint store_popups_purpose_check check (purpose in ('custom','recruit'));
create unique index if not exists store_popups_one_recruit_per_agent on phase1.store_popups (agent_id) where purpose = 'recruit';

-- All eligible pop-ups for a page, newest first; the visitor's device picks the first it hasn't used up (per its
-- frequency), so a live recruitment pop-up and a live custom pop-up take turns instead of one hiding the other.
-- "Join as agent" pop-ups only while the store is taking agents (store_network_offer not null).
create or replace function phase1.store_popups_for(p_slug text, p_page text default 'home') returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
    select p.id, p.title, p.body, p.image_url, p.button_label, p.action, p.action_url, p.frequency, p.delay_seconds, p.purpose, p.created_at
    from phase1.store_popups p join phase1.agents a on a.id = p.agent_id
    where a.slug = lower(p_slug) and a.status = 'active' and p.is_active
      and (p.starts_at is null or p.starts_at <= now()) and (p.ends_at is null or p.ends_at > now())
      and ('all' = any(p.pages) or coalesce(p_page,'home') = any(p.pages))
      and (p.action <> 'join' or phase1.store_network_offer(a.slug) is not null)) x
$function$;
grant execute on function phase1.store_popups_for(text, text) to anon, authenticated;

-- Old single-pop-up RPC (clients published before this change): same rules, first of the list.
create or replace function phase1.store_popup_for(p_slug text, p_page text default 'home') returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $function$
  select phase1.store_popups_for(p_slug, p_page) -> 0
$function$;

-- Pending applications for the signed-in parent agent (badge on Applications / Your agents in the nav).
create or replace function phase1.my_network_pending_count() returns int
language sql stable security definer set search_path to 'phase1','public' as $function$
  select count(*)::int from phase1.network_applications n
  where n.status = 'pending' and n.parent_agent_id = (select id from phase1.agents where user_id = auth.uid() and parent_agent_id is null limit 1)
$function$;
grant execute on function phase1.my_network_pending_count() to authenticated;

-- Save (create or update) the recruitment pop-up. Title ≤60, body ≤240, label ≤30, delay 0–60 s,
-- frequency once|daily|always, pages ⊆ {all,home,bundles,other}. Action is always 'join'.
create or replace function phase1.agent_recruit_popup_save(p jsonb) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $function$
declare v_agent uuid; v_id uuid; v_title text; v_body text; v_label text; v_delay int; v_freq text; v_pages text[]; v_on boolean;
begin
  select id into v_agent from phase1.agents where user_id = auth.uid() and parent_agent_id is null and status = 'active';
  if v_agent is null then raise exception 'not_an_agent'; end if;
  v_title := nullif(left(regexp_replace(coalesce(p->>'title',''), '<[^>]*>', '', 'g'), 60), '');
  v_body := nullif(left(regexp_replace(coalesce(p->>'body',''), '<[^>]*>', '', 'g'), 240), '');
  v_label := coalesce(nullif(left(regexp_replace(coalesce(p->>'button_label',''), '<[^>]*>', '', 'g'), 30), ''), 'Become an agent');
  v_delay := least(60, greatest(0, coalesce((p->>'delay_seconds')::int, 5)));
  v_freq := case when p->>'frequency' in ('once','daily','always') then p->>'frequency' else 'once' end;
  v_pages := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'pages','["all"]'::jsonb)) x where x in ('all','home','bundles','other')), array['all']);
  if v_pages = '{}' then v_pages := array['all']; end if;
  v_on := coalesce((p->>'is_active')::boolean, true);
  if v_title is null then raise exception 'title_required'; end if;
  select id into v_id from phase1.store_popups where agent_id = v_agent and purpose = 'recruit';
  if v_id is null then
    insert into phase1.store_popups (agent_id, purpose, action, title, body, button_label, delay_seconds, frequency, pages, is_active)
    values (v_agent, 'recruit', 'join', v_title, v_body, v_label, v_delay, v_freq, v_pages, v_on) returning id into v_id;
  else
    update phase1.store_popups set action = 'join', title = v_title, body = v_body, button_label = v_label, delay_seconds = v_delay, frequency = v_freq, pages = v_pages, is_active = v_on, updated_at = now() where id = v_id;
  end if;
  return (select to_jsonb(s) from phase1.store_popups s where s.id = v_id);
end $function$;
grant execute on function phase1.agent_recruit_popup_save(jsonb) to authenticated;
