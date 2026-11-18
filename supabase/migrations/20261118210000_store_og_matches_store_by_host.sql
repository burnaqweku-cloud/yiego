-- Applied live 18 Nov 2026 (owner): link previews, tab icon and home-screen app on a store's own address come from
-- store_og (the datayego-stores Worker, see supabase/functions/cf-worker-deploy). It only knew a custom domain once
-- custom_domain_status was 'active', so a connected domain still getting its padlock (mbundle.shop) showed DataYego's
-- name, banner and icon while the store itself already loaded there. Now it finds the store exactly as store_by_host
-- does: the domain with or without www, whatever its status, the free subdomain, a sub-agent on its parent's domain,
-- and active, lapsed or paused stores.
create or replace function phase1.store_og(p_host text) returns jsonb language sql stable security definer set search_path to 'phase1', 'public' as $$
  with h as (select lower(regexp_replace(coalesce(p_host, ''), '^www\.', '')) as host)
  select jsonb_build_object('name', a.store_name, 'slug', a.slug,
    'description', coalesce(nullif(a.tagline, ''), 'Buy MTN, Telecel and AirtelTigo data bundles from ' || a.store_name || '. Pay with MoMo or card, delivered to any number in minutes.'),
    'image', a.logo_url)
  from phase1.agents a, h
  where a.status in ('active', 'lapsed', 'paused') and (
    h.host = a.slug || '.datayego.com'
    or (a.custom_domain is not null and h.host = lower(a.custom_domain))
    or exists (select 1 from phase1.agents parent where parent.id = a.parent_agent_id and parent.custom_domain is not null and h.host = a.slug || '.' || lower(parent.custom_domain))
    or a.id in (select hh.agent_id from phase1.agent_slug_history hh where hh.held_until > now() and h.host = hh.old_slug || '.datayego.com'))
  limit 1
$$;
