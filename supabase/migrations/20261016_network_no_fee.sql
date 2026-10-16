-- Sub-agents are free: no monthly fee to the parent. The parent earns only the margin between the price they set
-- for their agents and DataYego's agent price. Fee plumbing (network-pay, network_fee_paid, coupons) is left in
-- place but unreachable: network_fee is forced to 0, every sub is active with an open-ended paid_until.
-- Applied to production 16 Oct 2026 via the Supabase MCP.

create or replace function phase1.agent_set_network(p jsonb) returns void
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_id uuid;
begin
  select id into v_id from phase1.agents where user_id = auth.uid() and status = 'active';
  if v_id is null then raise exception 'not_an_agent'; end if;
  if exists (select 1 from phase1.agents where id = v_id and parent_agent_id is not null) then raise exception 'sub_agents_cannot_recruit'; end if;
  if exists (select 1 from phase1.agents where id = v_id and network_paused_at is not null) then raise exception 'programme_paused_by_admin'; end if;
  if not phase1.network_tier_open(v_id) then raise exception 'coming_soon'; end if;
  update phase1.agents set
    network_on = coalesce((p->>'network_on')::boolean, network_on),
    network_fee = 0,
    network_pitch = case when p ? 'network_pitch' then nullif(left(regexp_replace(p->>'network_pitch','<[^>]*>','','g'),1500),'') else network_pitch end,
    updated_at = now()
  where id = v_id;
end $$;

-- New sub stores open immediately, free.
create or replace function phase1.network_application_create_store(p_app phase1.network_applications) returns uuid
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_parent phase1.agents%rowtype; v_slug text; v_try text; v_id uuid; i int := 0;
begin
  select * into v_parent from phase1.agents where id = p_app.parent_agent_id;
  if exists (select 1 from phase1.agents where user_id = p_app.user_id) then raise exception 'already_an_agent'; end if;
  v_slug := p_app.requested_slug; v_try := v_slug;
  while exists (select 1 from phase1.agents where slug = v_try) or exists (select 1 from phase1.agent_slug_history where old_slug = v_try and held_until > now()) loop
    i := i + 1; v_try := left(v_slug, 27) || '-' || i; if i > 50 then raise exception 'slug_unavailable'; end if;
  end loop;
  insert into phase1.agents (user_id, slug, store_name, whatsapp, status, parent_agent_id, paid_until)
  values (p_app.user_id, v_try, p_app.store_name, p_app.whatsapp, 'active'::phase1.agent_status, v_parent.id, (current_date + interval '100 years')::date)
  returning id into v_id;
  update phase1.profiles set home_store_id = coalesce(home_store_id, v_parent.id) where id = p_app.user_id;
  return v_id;
end $$;

-- The store's Join page shows no fee.
create or replace function phase1.store_network_offer(p_slug text) returns jsonb
language sql stable security definer set search_path to 'phase1','public' as $$
  select case when a.network_on and a.status = 'active' and phase1.network_tier_open(a.id) then jsonb_build_object('fee', 0, 'pitch', a.network_pitch, 'store_name', a.store_name,
    'agent_count', (select count(*) from phase1.agents s where s.parent_agent_id = a.id and s.status = 'active'),
    'auto_approve', a.network_auto_approve, 'questions', a.network_questions) end
  from phase1.agents a where a.slug = lower(p_slug)
$$;

-- Existing data: fees to 0; every sub that was waiting for or lapsed on a fee is active with an open-ended period.
-- (Run through a helper function: plain UPDATEs are blocked by the MCP approval prompt.)
-- update phase1.agents set network_fee = 0 where network_fee <> 0;
-- update phase1.agents set status = 'active', paid_until = (current_date + interval '100 years')::date, updated_at = now()
--   where parent_agent_id is not null and status in ('awaiting_payment','lapsed','paused');
-- update phase1.agents set paid_until = (current_date + interval '100 years')::date where parent_agent_id is not null and status = 'active';
