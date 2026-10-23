-- Promotion link: main-site pricing, guests + accounts, one use per device, per recipient number, per account.
-- Ineligible shoppers are never blocked; they simply get normal prices. All checks run here, server-side.
alter table phase1.promotion_redemptions
  alter column user_id drop not null,
  alter column order_id drop not null,
  add column if not exists recipient_phone text,
  add column if not exists claim_token text unique,
  add column if not exists reserved_until timestamptz;
update phase1.promotion_redemptions r set recipient_phone=o.recipient_phone_normalized from phase1.orders o where o.id=r.order_id and r.recipient_phone is null;
create unique index if not exists promotion_one_device_claim on phase1.promotion_redemptions(visit_id) where status='reserved' and visit_id is not null;
create unique index if not exists promotion_one_phone_claim on phase1.promotion_redemptions(recipient_phone) where status='reserved' and recipient_phone is not null;
create index if not exists promotion_redemptions_phone_idx on phase1.promotion_redemptions(recipient_phone);
create index if not exists orders_recipient_normalized_idx on phase1.orders(recipient_phone_normalized);

create or replace function phase1.promotion_norm_phone(p text)
returns text language sql immutable set search_path='' as $$
  select case when d ~ '^0[0-9]{9}$' then d when d ~ '^233[0-9]{9}$' then '0'||substr(d,4) end
  from (select regexp_replace(coalesce(p,''),'[^0-9]','','g') d) x
$$;

-- Keep a device's visit when one is supplied; otherwise attribute from the account as before.
create or replace function phase1.attribute_promotion_redemption()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.visit_id is null and new.user_id is not null then
    select id into new.visit_id from phase1.promotion_visits where user_id=new.user_id and created_at>=now()-interval '30 days' and created_at<=new.created_at
      order by (new_account_id=new.user_id) desc nulls last,created_at,id limit 1;
  end if;
  return new;
end;$$;

create or replace function phase1.promotion_release_stale()
returns void language sql security definer set search_path='' as $$
  update phase1.promotion_redemptions set status='released' where status='reserved' and order_id is null and reserved_until<now();
  update phase1.promotion_redemptions r set status='released' from phase1.orders o
    where r.order_id=o.id and r.status='reserved' and not o.is_open and o.payment_status not in ('succeeded','refunded') and o.paid_at is null;
$$;
revoke all on function phase1.promotion_release_stale() from public,anon,authenticated;

-- Valid device = a link visit created on this browser within 30 days (capability token checked).
create or replace function phase1.promotion_visit_ok(p_visit uuid,p_token uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select p_visit is not null and p_token is not null and exists(select 1 from phase1.promotion_visits v
    where v.id=p_visit and v.token_hash=md5(p_token::text) and v.created_at>=now()-interval '30 days')
$$;
revoke all on function phase1.promotion_visit_ok(uuid,uuid) from public,anon,authenticated;

-- Null = eligible. p_phone null = skip the number check (used before a number is typed).
create or replace function phase1.promotion_block_reason(p_user uuid,p_visit uuid,p_phone text,p_exclude uuid default null)
returns text language sql stable security definer set search_path='' as $$
  select case
    when not exists(select 1 from phase1.promotion_settings where id and active) then 'closed'
    when p_visit is null then 'no_link'
    when exists(select 1 from phase1.promotion_visits v where v.id=p_visit and v.user_id is not null and p_user is not null and v.user_id<>p_user) then 'device_used'
    when exists(select 1 from phase1.promotion_redemptions r where r.visit_id=p_visit and r.id is distinct from p_exclude
      and (r.status='paid' or (r.status='reserved' and (r.order_id is not null or r.reserved_until>now())))) then 'device_used'
    when p_user is not null and phase1.promotion_customer_has_purchased(p_user) then 'account_used'
    when p_user is not null and exists(select 1 from phase1.promotion_redemptions r where r.user_id=p_user and r.status='paid') then 'account_used'
    when p_phone is not null and exists(select 1 from phase1.promotion_redemptions r where r.recipient_phone=p_phone and r.id is distinct from p_exclude
      and (r.status='paid' or (r.status='reserved' and (r.order_id is not null or r.reserved_until>now())))) then 'number_used'
    when p_phone is not null and exists(select 1 from phase1.orders o where o.recipient_phone_normalized=p_phone
      and (o.payment_status in ('succeeded','refunded') or o.paid_at is not null)) then 'number_used'
  end
$$;
revoke all on function phase1.promotion_block_reason(uuid,uuid,text,uuid) from public,anon,authenticated;

-- What the main site shows: promo prices only for an eligible device/account that arrived through the link.
create or replace function phase1.promotion_prices(p_visit uuid,p_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); reason text; offers jsonb;
begin
  if not phase1.promotion_visit_ok(p_visit,p_token) then return jsonb_build_object('eligible',false,'offers','[]'::jsonb); end if;
  reason:=phase1.promotion_block_reason(u,p_visit,null);
  if reason is not null then return jsonb_build_object('eligible',false,'offers','[]'::jsonb); end if;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'price',f.price)),'[]'::jsonb) into offers
    from phase1.promotion_offers f join phase1.data_products p on p.id=f.product_id join phase1.networks n on n.id=p.network_id
    where f.enabled and p.is_active and not p.is_paused and n.is_active and not n.is_paused;
  return jsonb_build_object('eligible',jsonb_array_length(offers)>0,'offers',offers);
end;$$;
revoke all on function phase1.promotion_prices(uuid,uuid) from public;
grant execute on function phase1.promotion_prices(uuid,uuid) to anon,authenticated,service_role;

-- Guest: reserve a short-lived claim token that the existing guest checkout prices through campaign_price_for.
create or replace function phase1.promotion_guest_claim(p_visit uuid,p_token uuid,p_product uuid,p_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare phone text:=phase1.promotion_norm_phone(p_phone); f phase1.promotion_offers%rowtype; p phase1.data_products%rowtype; reason text; claim text; r phase1.promotion_redemptions%rowtype;
begin
  if auth.uid() is not null then raise exception 'use_account_checkout'; end if;
  if phone is null then raise exception 'invalid_phone'; end if;
  if not phase1.promotion_visit_ok(p_visit,p_token) then return jsonb_build_object('eligible',false,'reason','no_link'); end if;
  perform pg_advisory_xact_lock(hashtextextended('promotion-device:'||p_visit::text,0));
  perform pg_advisory_xact_lock(hashtextextended('promotion-phone:'||phone,0));
  perform phase1.promotion_release_stale();
  select * into f from phase1.promotion_offers where product_id=p_product and enabled;
  select * into p from phase1.data_products where id=p_product and is_active and not is_paused;
  if f.product_id is null or p.id is null then return jsonb_build_object('eligible',false,'reason','closed'); end if;
  -- An unused claim from this device for the same bundle and number is simply resumed; any other unused one is dropped.
  select * into r from phase1.promotion_redemptions where visit_id=p_visit and status='reserved' and order_id is null;
  if found then
    if r.product_id=p_product and r.recipient_phone=phone then
      update phase1.promotion_redemptions set reserved_until=now()+interval '30 minutes' where id=r.id;
      return jsonb_build_object('eligible',true,'token',r.claim_token,'price',r.price);
    end if;
    update phase1.promotion_redemptions set status='released' where id=r.id;
  end if;
  reason:=phase1.promotion_block_reason(null,p_visit,phone);
  if reason is not null then return jsonb_build_object('eligible',false,'reason',reason); end if;
  claim:=replace(gen_random_uuid()::text,'-','');
  insert into phase1.promotion_redemptions(user_id,order_id,product_id,price,normal_price,visit_id,recipient_phone,claim_token,reserved_until)
    values(null,null,p.id,f.price,p.customer_price,p_visit,phone,claim,now()+interval '30 minutes');
  return jsonb_build_object('eligible',true,'token',claim,'price',f.price);
end;$$;
revoke all on function phase1.promotion_guest_claim(uuid,uuid,uuid,text) from public;
grant execute on function phase1.promotion_guest_claim(uuid,uuid,uuid,text) to anon,authenticated,service_role;

-- Existing guest checkout hooks: giveaway claims first, then promotion claims.
create or replace function phase1.campaign_price_for(p_token text,p_phone text,p_product uuid)
returns numeric language sql stable security definer set search_path to 'phase1','public' as $$
  select coalesce(
    (select c.price from phase1.campaign_redemptions r join phase1.campaigns c on c.id=r.campaign_id
      where r.token=p_token and r.status='reserved' and r.reserved_until>now() and c.is_active and c.product_id=p_product
        and r.recipient_phone=(case when regexp_replace(p_phone,'\D','','g') ~ '^233\d{9}$' then '0'||substr(regexp_replace(p_phone,'\D','','g'),4) else regexp_replace(p_phone,'\D','','g') end)),
    (select r.price from phase1.promotion_redemptions r join phase1.promotion_offers f on f.product_id=r.product_id and f.enabled
      where r.claim_token=p_token and r.status='reserved' and r.order_id is null and r.reserved_until>now()
        and r.product_id=p_product and r.recipient_phone=phase1.promotion_norm_phone(p_phone)
        and exists(select 1 from phase1.promotion_settings s where s.id and s.active)))
$$;

create or replace function phase1.campaign_attach_order(p_token text,p_order uuid)
returns void language plpgsql security definer set search_path to 'phase1','public' as $$
declare o phase1.orders%rowtype;
begin
  update phase1.campaign_redemptions set status='ordered',order_id=p_order,updated_at=now() where token=p_token and status='reserved';
  select * into o from phase1.orders where id=p_order;
  update phase1.promotion_redemptions r set order_id=p_order,user_id=coalesce(r.user_id,o.user_id),reserved_until=null
    where r.claim_token=p_token and r.status='reserved' and r.order_id is null
      and o.product_id=r.product_id and o.recipient_phone_normalized=r.recipient_phone and o.amount=r.price;
  if found then
    insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata)
      values(p_order,'promotion.prepared','awaiting_payment','awaiting_payment','Promotion link price applied (guest)',jsonb_build_object('price',o.amount));
  end if;
end;$$;

-- Account checkout: device + number + account rules. Ineligible -> 'not_eligible:<reason>' so the app falls back to normal price.
drop function if exists phase1.promotion_prepare_order(uuid,text,boolean);
create or replace function phase1.promotion_prepare_order(p_product uuid,p_phone text,p_prefix_confirmed boolean default false,p_visit uuid default null,p_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); phone text:=phase1.promotion_norm_phone(p_phone); f phase1.promotion_offers%rowtype; p phase1.data_products%rowtype; result jsonb; o phase1.orders%rowtype; reason text;
begin
  if u is null then raise exception 'sign_in_required'; end if;
  if not exists(select 1 from phase1.profiles where id=u and status='active') then raise exception 'account_not_active'; end if;
  if phone is null then raise exception 'invalid_phone'; end if;
  if not phase1.promotion_visit_ok(p_visit,p_token) then raise exception 'not_eligible:no_link'; end if;
  perform pg_advisory_xact_lock(hashtextextended('promotion:'||u::text,0));
  perform pg_advisory_xact_lock(hashtextextended('promotion-device:'||p_visit::text,0));
  perform pg_advisory_xact_lock(hashtextextended('promotion-phone:'||phone,0));
  perform phase1.close_expired_unpaid_orders();
  perform phase1.promotion_release_stale();
  select ord.* into o from phase1.promotion_redemptions r join phase1.orders ord on ord.id=r.order_id where r.user_id=u and r.status='reserved' and ord.is_open;
  if found then
    if o.product_id<>p_product or o.recipient_phone_normalized<>phone then raise exception 'unpaid_order_open'; end if;
    return jsonb_build_object('existing',true,'orderId',o.id,'orderReference',o.order_reference,'amount',o.amount,'recipientPhone',o.recipient_phone,'expiresAt',o.payment_expires_at);
  end if;
  -- Unused guest claims left on this device are dropped before checking.
  update phase1.promotion_redemptions set status='released' where visit_id=p_visit and status='reserved' and order_id is null;
  reason:=phase1.promotion_block_reason(u,p_visit,phone);
  if reason is not null then raise exception 'not_eligible:%',reason; end if;
  if exists(select 1 from phase1.orders where user_id=u and is_open and payment_status in ('created','pending')) then raise exception 'unpaid_order_open'; end if;
  select * into f from phase1.promotion_offers where product_id=p_product and enabled for share;
  if not found then raise exception 'not_eligible:closed'; end if;
  select * into p from phase1.data_products where id=p_product and is_active;
  if not found or p.is_paused then raise exception 'product_unavailable'; end if;
  result:=phase1.prepare_data_order(u,p.id::text,phone,null,false);
  if (result->>'existing')::boolean then raise exception 'recipient_order_open'; end if;
  select * into o from phase1.orders where id=(result->>'orderId')::uuid for update;
  if not found or o.user_id is distinct from u or o.product_id is distinct from p_product or o.recipient_phone_normalized is distinct from phone or o.payment_status not in ('created','pending') then raise exception 'promotion_order_mismatch'; end if;
  update phase1.orders set amount=f.price,payment_arrangement='self',prefix_mismatch_confirmed=coalesce(p_prefix_confirmed,false),prefix_mismatch_confirmed_at=case when p_prefix_confirmed then now() end where id=o.id;
  insert into phase1.promotion_redemptions(user_id,order_id,product_id,price,normal_price,visit_id,recipient_phone) values(u,o.id,p.id,f.price,p.customer_price,p_visit,phone);
  update phase1.promotion_visits set user_id=coalesce(user_id,u) where id=p_visit;
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata,created_by)
    values(o.id,'promotion.prepared','awaiting_payment','awaiting_payment','Promotion link price applied',jsonb_build_object('price',f.price,'normalPrice',p.customer_price),u);
  return result||jsonb_build_object('amount',f.price);
end;$$;
revoke all on function phase1.promotion_prepare_order(uuid,text,boolean,uuid,uuid) from public,anon;
grant execute on function phase1.promotion_prepare_order(uuid,text,boolean,uuid,uuid) to authenticated,service_role;

-- A late second promo payment (same account, device or number) is held for manual reconciliation, never dispatched.
create or replace function phase1.guard_promotion_order_snapshot()
returns trigger language plpgsql security definer set search_path='' as $$
declare r phase1.promotion_redemptions%rowtype;
begin
  select * into r from phase1.promotion_redemptions where order_id=old.id limit 1;
  if r.id is not null
    and (new.amount is distinct from old.amount or new.product_id is distinct from old.product_id or new.recipient_phone is distinct from old.recipient_phone
      or (old.user_id is not null and new.user_id is distinct from old.user_id)) then
    raise exception 'promotion_order_details_are_fixed';
  end if;
  if r.id is not null and new.payment_status='succeeded' and old.payment_status is distinct from 'succeeded' then
    if exists(select 1 from phase1.promotion_redemptions x where x.order_id<>old.id and x.status='paid'
      and ((r.user_id is not null and x.user_id=r.user_id) or (r.visit_id is not null and x.visit_id=r.visit_id) or (r.recipient_phone is not null and x.recipient_phone=r.recipient_phone))) then
      new.status:='cancelled'; new.is_open:=false; new.closed_reason:='promotion_repeat_payment_review';
      new.failure_reason:='Another promotion payment was already received for this account, device or number. Manual reconciliation required; do not dispatch.';
    end if;
  end if;
  return new;
end;$$;
notify pgrst,'reload schema';
