-- Agent-editable knowledge for their store assistant. Platform facts stay with DataYego; this is the agent's own.
create table if not exists phase1.store_ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references phase1.agents(id) on delete cascade,
  title text not null,
  content text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  source text,                       -- 'typed' | file name
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists store_ai_knowledge_agent_idx on phase1.store_ai_knowledge(agent_id, is_active, sort_order);
alter table phase1.store_ai_knowledge enable row level security;
drop policy if exists sak_owner_read on phase1.store_ai_knowledge;
create policy sak_owner_read on phase1.store_ai_knowledge for select to authenticated
  using (agent_id in (select id from phase1.agents where user_id = auth.uid()) or private.is_phase1_admin());
grant select on phase1.store_ai_knowledge to authenticated;

create or replace function phase1.store_ai_knowledge_save(p_id uuid, p_title text, p_content text, p_is_active boolean, p_source text) returns jsonb
language plpgsql security definer set search_path to 'phase1','public' as $$
declare v_agent uuid; v_title text; v_content text; v_row phase1.store_ai_knowledge%rowtype; v_count int;
begin
  select id into v_agent from phase1.agents where user_id = auth.uid();
  if v_agent is null then raise exception 'not_an_agent'; end if;
  v_title := left(trim(regexp_replace(coalesce(p_title,''),'<[^>]*>','','g')), 120);
  v_content := left(trim(regexp_replace(coalesce(p_content,''), E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]', '', 'g')), 4000);
  if v_title = '' then raise exception 'title_required'; end if;
  if length(v_content) < 10 then raise exception 'content_too_short'; end if;
  if p_id is null then
    select count(*) into v_count from phase1.store_ai_knowledge where agent_id = v_agent;
    if v_count >= 20 then raise exception 'max_20_entries'; end if;
    insert into phase1.store_ai_knowledge (agent_id, title, content, is_active, source, sort_order)
    values (v_agent, v_title, v_content, coalesce(p_is_active, true), left(p_source, 120), v_count) returning * into v_row;
  else
    update phase1.store_ai_knowledge set title = v_title, content = v_content, is_active = coalesce(p_is_active, is_active), source = coalesce(left(p_source,120), source), updated_at = now()
    where id = p_id and agent_id = v_agent returning * into v_row;
    if v_row.id is null then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function phase1.store_ai_knowledge_delete(p_id uuid) returns void language sql security definer set search_path to 'phase1','public' as $$
  delete from phase1.store_ai_knowledge where id = p_id and agent_id in (select id from phase1.agents where user_id = auth.uid())
$$;

revoke execute on function phase1.store_ai_knowledge_save(uuid,text,text,boolean,text), phase1.store_ai_knowledge_delete(uuid) from public, anon;
grant execute on function phase1.store_ai_knowledge_save(uuid,text,text,boolean,text), phase1.store_ai_knowledge_delete(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
