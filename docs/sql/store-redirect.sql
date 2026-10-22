-- Admin switch: send every visitor of an agent's store to the main DataYego site.
-- Independent of the agent's plan status, so it works on lapsed stores too.
alter table phase1.agents add column if not exists redirect_to_main boolean not null default false;
alter table phase1.agents add column if not exists redirect_to_main_at timestamptz;

create or replace function phase1.admin_set_store_redirect(p_agent uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare r phase1.agents;
begin
  if not private.is_phase1_admin() then raise exception 'admin_required'; end if;
  update phase1.agents set redirect_to_main = p_on, redirect_to_main_at = case when p_on then now() else null end
   where id = p_agent returning * into r;
  if not found then raise exception 'agent_not_found'; end if;
  return jsonb_build_object('id', r.id, 'redirect_to_main', r.redirect_to_main, 'redirect_to_main_at', r.redirect_to_main_at);
end $$;

-- Public, read-only: does this store link (current or recent old slug) redirect?
create or replace function phase1.store_redirects_to_main(p_slug text)
returns boolean language sql stable security definer set search_path to 'phase1', 'public' as $$
  select coalesce((select redirect_to_main from phase1.agents
    where slug = lower(p_slug) or id in (select agent_id from phase1.agent_slug_history where old_slug = lower(p_slug) and held_until > now())
    limit 1), false)
$$;

revoke all on function phase1.admin_set_store_redirect(uuid, boolean) from public, anon;
grant execute on function phase1.admin_set_store_redirect(uuid, boolean) to authenticated;
grant execute on function phase1.store_redirects_to_main(text) to anon, authenticated;
