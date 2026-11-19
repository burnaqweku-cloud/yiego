-- One answer to "where does this store live?" (19 Nov 2026, Mbundle: customers saw datayego.com after paying, and
-- his sub-agent's links carried datayego.com instead of his domain).
--   its own live domain                                  -> mbundle.shop
--   else, a sub-agent whose parent's domain is live       -> mbundle.shop/s/nissdata (served by the store-host router)
--   else                                                  -> nissdata.datayego.com
-- No https:// in front, so callers can show it or build links from it.
create or replace function phase1.store_address(p_agent uuid)
returns text language sql stable security definer set search_path = phase1, public as $$
  select case
    when a.custom_domain_status = 'active' and nullif(btrim(a.custom_domain), '') is not null then lower(btrim(a.custom_domain))
    when p.custom_domain_status = 'active' and nullif(btrim(p.custom_domain), '') is not null and p.status in ('active', 'lapsed', 'paused')
      then lower(btrim(p.custom_domain)) || '/s/' || a.slug
    else a.slug || '.datayego.com'
  end
  from phase1.agents a left join phase1.agents p on p.id = a.parent_agent_id
  where a.id = p_agent
$$;
revoke all on function phase1.store_address(uuid) from public, anon, authenticated;
grant execute on function phase1.store_address(uuid) to service_role;

-- For the store pages: the store's home on a domain (https://…), or null when it only has its free address.
-- datayego.com/s/<slug> jumps there (StoreShell). Old copies of the site keep using store_canonical_host, unchanged.
create or replace function phase1.store_home(p_slug text)
returns text language sql stable security definer set search_path = phase1, public as $$
  with a as (
    select id from phase1.agents
    where slug = lower(p_slug) or id in (select agent_id from phase1.agent_slug_history where old_slug = lower(p_slug) and held_until > now())
    limit 1)
  select case when v is null or v like '%.datayego.com' then null else 'https://' || v end
  from (select phase1.store_address(a.id) v from a) x
$$;
revoke all on function phase1.store_home(text) from public;
grant execute on function phase1.store_home(text) to anon, authenticated, service_role;

-- Store order emails: a sub-agent's links go to the parent's domain too. email.ts builds https://<domain>/track?…
create or replace function phase1.store_order_email_claim(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path = phase1, public as $function$
declare v jsonb;
begin
  with due as (select x.id from phase1.store_order_email_outbox x where x.status = 'pending' and x.attempts < 3 and (x.claimed_until is null or x.claimed_until < now())
    order by x.id limit greatest(1, least(coalesce(p_limit, 20), 50)) for update skip locked),
  picked as (update phase1.store_order_email_outbox x set attempts = attempts + 1, claimed_until = now() + interval '4 minutes' from due where x.id = due.id returning x.id, x.order_id, x.kind, x.email, x.details)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'email', p.email, 'reference', o.order_reference, 'amount', o.amount, 'currency', coalesce(o.currency, 'GHS'), 'phone', o.recipient_phone,
    'bundle', coalesce(dp.name, 'Data bundle'), 'network', coalesce(n.name, ''), 'store', a.store_name, 'slug', a.slug,
    'domain', (select case when s like '%.datayego.com' then null else s end from phase1.store_address(a.id) s),
    'email_domain', case when a.email_domain is not null and a.email_domain_status = 'verified' then a.email_domain end,
    'details', p.details) order by p.id), '[]'::jsonb) into v
  from picked p join phase1.orders o on o.id = p.order_id join phase1.agents a on a.id = o.agent_id
    left join phase1.data_products dp on dp.id = o.product_id left join phase1.networks n on n.id = o.network_id;
  return v;
end $function$;
