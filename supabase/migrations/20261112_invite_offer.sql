-- Invite offer (12 Nov 2026): an invited friend's first order gets ONE named bundle at a set price
-- (MTN 1GB for GH₵3.50) instead of agent price on every bundle. Everything else is normal price.
-- The offer lives in site_settings 'invite_offer'. Because it is below cost, it is refused to an account
-- whose phone (device) has been used by another account.
-- Rewards: when the payer cannot be identified (wallet payment, or Kora, which does not report the payer),
-- the reward is no longer held; the device and recipient checks still apply.

insert into phase1.site_settings (key, value) values ('invite_offer', '{"product_code":"mtn-1","price":3.5}'::jsonb) on conflict (key) do nothing;

create or replace function phase1.invite_offer_eligible(p_user uuid) returns boolean language sql stable security definer set search_path = phase1, public as $$
  select p_user is not null
    and exists (select 1 from phase1.profiles pr where pr.id = p_user and pr.referred_by is not null)
    and not exists (select 1 from phase1.orders o where o.user_id = p_user and o.payment_status = 'succeeded')
    and not exists (select 1 from phase1.agents a where a.user_id = p_user and a.status = 'active')
    and not exists (select 1 from phase1.user_devices a join phase1.user_devices b on b.device_hash = a.device_hash where a.user_id = p_user and b.user_id <> p_user) $$;
revoke all on function phase1.invite_offer_eligible(uuid) from public, anon, authenticated;

-- The old "agent price on everything" rule is retired; anything still asking gets normal prices.
create or replace function phase1.friend_price_eligible(p_user uuid) returns boolean language sql stable security definer set search_path = phase1, public as $$ select false $$;

create or replace function phase1.price_for_user(p_user uuid, p_product uuid) returns numeric language sql stable security definer set search_path = phase1, public as $$
  select case when d.app_product_code = (s.value->>'product_code') and (s.value->>'price')::numeric > 0 and (s.value->>'price')::numeric < d.customer_price and phase1.invite_offer_eligible(p_user)
              then (s.value->>'price')::numeric else d.customer_price end
  from phase1.data_products d left join phase1.site_settings s on s.key = 'invite_offer' where d.id = p_product $$;

-- What the offer is (public: shown on the invite page and in the share message).
create or replace function phase1.invite_offer() returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object('product_id', d.id, 'name', n.name || ' ' || regexp_replace(d.name, '^.*—\s*', ''), 'price', (s.value->>'price')::numeric, 'normal', d.customer_price)
  from phase1.site_settings s join phase1.data_products d on d.app_product_code = (s.value->>'product_code') join phase1.networks n on n.id = d.network_id
  where s.key = 'invite_offer' and d.is_active and (s.value->>'price')::numeric < d.customer_price $$;
grant execute on function phase1.invite_offer() to anon, authenticated;

-- For the signed-in buyer: which bundles are at the invite price for them right now.
create or replace function phase1.my_friend_price() returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select case when phase1.invite_offer_eligible(auth.uid()) and o is not null
    then jsonb_build_object('eligible', true, 'prices', jsonb_build_object(o->>'product_id', o->'price'))
    else jsonb_build_object('eligible', false, 'prices', '{}'::jsonb) end
  from (select phase1.invite_offer() as o) x $$;

-- Rewards: an unidentified payer no longer holds the reward (both the data reward and the agent reward).
do $$
declare d text; f text; needle text := $n$'{"payer":"unknown"}'; v_ok := false;$n$;
begin
  foreach f in array array['orders_referral_trigger', 'payment_intents_referral_trigger'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'phase1' and p.proname = f;
    if position(needle in d) = 0 then raise exception 'pattern not found in %', f; end if;
    execute replace(d, needle, $r$'{"payer":"unknown"}';$r$);
  end loop;
end $$;
