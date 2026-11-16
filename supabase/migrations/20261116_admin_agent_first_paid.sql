-- Admin → Agents → All agents, "Newest" (16 Nov 2026). Applied live 16 Nov 2026.
-- "Newest" sorted by when the application was approved, so an agent approved a month ago who paid for the first time
-- today sat far down the list. This gives each agent the time they first became a paying agent: their first successful
-- plan payment, or their first free months given by an admin if that came earlier. Renewals do not move anyone.
-- Read-only; admins only.
create or replace function phase1.admin_agent_first_paid() returns jsonb
language plpgsql stable security definer set search_path to 'phase1', 'public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  return coalesce((select jsonb_object_agg(x.agent_id, x.first_at)
    from (select s.agent_id, min(s.t) as first_at
          from (select (pi.metadata->>'agent_id') as agent_id, coalesce(pi.verified_at, pi.created_at) as t
                  from phase1.payment_intents pi
                  where pi.purpose = 'agent_subscription' and pi.status::text = 'succeeded' and pi.metadata ? 'agent_id'
                union all
                select g.agent_id::text, g.created_at from phase1.agent_subscription_grants g) s
          where s.agent_id is not null
          group by s.agent_id) x), '{}'::jsonb);
end $$;
revoke all on function phase1.admin_agent_first_paid() from public, anon;
grant execute on function phase1.admin_agent_first_paid() to authenticated, service_role;
