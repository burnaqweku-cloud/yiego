-- Additive external phase1 migration. No payment, fulfillment or existing price changes.
create table if not exists phase1.promotion_settings (
  id boolean primary key default true check (id),
  title text not null default 'DataYego first purchase offers',
  blurb text not null default 'Special bundle prices for your first purchase.',
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant select on phase1.promotion_settings to authenticated;
grant all on phase1.promotion_settings to service_role;
alter table phase1.promotion_settings enable row level security;
create policy promotion_settings_admin_read on phase1.promotion_settings for select to authenticated using (phase1.admin_role(auth.uid()) in ('admin','master_admin'));

create table if not exists phase1.promotion_offers (
  product_id uuid primary key references phase1.data_products(id),
  price numeric(12,2) not null check (price > 0 and price <= 10000),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select on phase1.promotion_offers to authenticated;
grant all on phase1.promotion_offers to service_role;
alter table phase1.promotion_offers enable row level security;
create policy promotion_offers_admin_read on phase1.promotion_offers for select to authenticated using (phase1.admin_role(auth.uid()) in ('admin','master_admin'));

create table if not exists phase1.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  order_id uuid not null unique references phase1.orders(id),
  product_id uuid not null references phase1.data_products(id),
  price numeric(12,2) not null,
  normal_price numeric(12,2) not null,
  status text not null default 'reserved' check (status in ('reserved','paid','released')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
grant select on phase1.promotion_redemptions to authenticated;
grant all on phase1.promotion_redemptions to service_role;
alter table phase1.promotion_redemptions enable row level security;
create policy promotion_redemptions_admin_read on phase1.promotion_redemptions for select to authenticated using (phase1.admin_role(auth.uid()) in ('admin','master_admin'));
create unique index promotion_one_customer_claim on phase1.promotion_redemptions(user_id) where status in ('reserved','paid');

create function phase1.promotion_customer_has_purchased(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from phase1.orders o where
    (o.payment_status in ('succeeded','refunded') or o.paid_at is not null)
    and (o.user_id=p_user or o.paid_by_user_id=p_user or exists (
      select 1 from phase1.profiles p where p.id=p_user and o.user_id is null
      and ((p.email is not null and lower(o.guest_email)=lower(p.email))
        or (p.phone is not null and right(regexp_replace(coalesce(o.guest_phone,''),'[^0-9]','','g'),9)=right(regexp_replace(p.phone,'[^0-9]','','g'),9)))
    ))) or exists(select 1 from phase1.promotion_redemptions r where r.user_id=p_user and r.status='paid');
$$;
revoke all on function phase1.promotion_customer_has_purchased(uuid) from public,anon,authenticated;
grant execute on function phase1.promotion_customer_has_purchased(uuid) to service_role;

create function phase1.promotion_public()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s phase1.promotion_settings%rowtype; u uuid:=auth.uid(); pending text; purchased boolean; offers jsonb;
begin
  select * into s from phase1.promotion_settings where id=true;
  purchased:=case when u is null then false else phase1.promotion_customer_has_purchased(u) end;
  select o.order_reference into pending from phase1.orders o where o.user_id=u and o.is_open
    and o.payment_status in ('created','pending') and (o.payment_expires_at is null or o.payment_expires_at>now()) order by o.created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'product_code',p.app_product_code,'name',p.name,'network',n.code,'validity',p.validity,'normal_price',p.customer_price,'price',f.price,'enabled',f.enabled,'available',not p.is_paused and not n.is_paused and n.is_active) order by p.display_order), '[]'::jsonb)
  into offers from phase1.promotion_offers f join phase1.data_products p on p.id=f.product_id join phase1.networks n on n.id=p.network_id where f.enabled and p.is_active;
  return jsonb_build_object('title',coalesce(s.title,'DataYego first purchase offers'),'blurb',coalesce(s.blurb,''),'active',coalesce(s.active,false),'eligible',u is not null and not purchased and pending is null,
    'reason',case when u is null then 'sign_in' when purchased then 'already_purchased' when pending is not null then 'pending' else 'eligible' end,
    'pending_reference',case when not purchased then pending end,'offers',offers);
end;$$;
revoke all on function phase1.promotion_public() from public;
grant execute on function phase1.promotion_public() to anon,authenticated,service_role;

create function phase1.admin_promotion_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; offers jsonb;
begin
  if coalesce(phase1.admin_role(auth.uid()),'') not in ('admin','master_admin') then raise exception 'admin_required'; end if;
  result:=phase1.promotion_public();
  select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'product_code',p.app_product_code,'name',p.name,'network',n.code,'validity',p.validity,'normal_price',p.customer_price,'price',coalesce(f.price,p.customer_price),'enabled',coalesce(f.enabled,false),'available',not p.is_paused and not n.is_paused and n.is_active) order by p.display_order),'[]'::jsonb)
  into offers from phase1.data_products p join phase1.networks n on n.id=p.network_id left join phase1.promotion_offers f on f.product_id=p.id where p.is_active;
  return result||jsonb_build_object('offers',offers,'paid_orders',(select count(*) from phase1.promotion_redemptions where status='paid'),
    'pending_orders',(select count(*) from phase1.promotion_redemptions r join phase1.orders o on o.id=r.order_id where r.status='reserved' and o.is_open and o.payment_expires_at>now()),
    'sales',(select coalesce(sum(price),0) from phase1.promotion_redemptions where status='paid'),
    'discount',(select coalesce(sum(greatest(0,normal_price-price)),0) from phase1.promotion_redemptions where status='paid'));
end;$$;
revoke all on function phase1.admin_promotion_overview() from public,anon;
grant execute on function phase1.admin_promotion_overview() to authenticated,service_role;

create function phase1.admin_promotion_save(p_title text,p_blurb text,p_active boolean,p_offers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare offer jsonb; price numeric; product uuid;
begin
  if coalesce(phase1.admin_role(auth.uid()),'') not in ('admin','master_admin') or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'admin_mfa_required'; end if;
  if length(trim(p_title)) not between 1 and 100 or length(coalesce(p_blurb,''))>240 or jsonb_typeof(p_offers)<>'array' or jsonb_array_length(p_offers)>300 then raise exception 'invalid_promotion'; end if;
  if p_active and not exists(select 1 from jsonb_array_elements(p_offers) v where (v->>'enabled')::boolean) then raise exception 'enable_a_bundle'; end if;
  insert into phase1.promotion_settings(id,title,blurb,active,updated_by) values(true,trim(p_title),coalesce(p_blurb,''),p_active,auth.uid())
    on conflict(id) do update set title=excluded.title,blurb=excluded.blurb,active=excluded.active,updated_at=now(),updated_by=excluded.updated_by;
  update phase1.promotion_offers set enabled=false,updated_at=now();
  for offer in select * from jsonb_array_elements(p_offers) loop
    product:=(offer->>'product_id')::uuid; price:=(offer->>'price')::numeric;
    if price is null or price<=0 or price>10000 or price<>round(price,2) or not exists(select 1 from phase1.data_products where id=product and is_active) then raise exception 'invalid_offer_price'; end if;
    insert into phase1.promotion_offers(product_id,price,enabled) values(product,price,coalesce((offer->>'enabled')::boolean,false))
      on conflict(product_id) do update set price=excluded.price,enabled=excluded.enabled,updated_at=now();
  end loop;
  return jsonb_build_object('saved',true);
end;$$;
revoke all on function phase1.admin_promotion_save(text,text,boolean,jsonb) from public,anon;
grant execute on function phase1.admin_promotion_save(text,text,boolean,jsonb) to authenticated,service_role;

create function phase1.promotion_prepare_order(p_product uuid,p_phone text,p_prefix_confirmed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); phone text; f phase1.promotion_offers%rowtype; p phase1.data_products%rowtype; result jsonb; o phase1.orders%rowtype;
begin
  if u is null then raise exception 'sign_in_required'; end if;
  if not exists(select 1 from phase1.profiles where id=u and status='active') then raise exception 'account_not_active'; end if;
  perform pg_advisory_xact_lock(hashtextextended('promotion:'||u::text,0));
  perform phase1.close_expired_unpaid_orders();
  update phase1.promotion_redemptions r set status='released' from phase1.orders o where r.order_id=o.id and r.user_id=u and r.status='reserved' and not o.is_open and o.payment_status not in ('succeeded','refunded');
  if phase1.promotion_customer_has_purchased(u) then raise exception 'already_purchased'; end if;
  phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if phone ~ '^233[0-9]{9}$' then phone:='0'||substr(phone,4); end if;
  if phone !~ '^0[0-9]{9}$' then raise exception 'invalid_phone'; end if;
  select ord.* into o from phase1.promotion_redemptions r join phase1.orders ord on ord.id=r.order_id where r.user_id=u and r.status='reserved' and ord.is_open;
  if found then
    if o.product_id<>p_product or o.recipient_phone_normalized<>phone then raise exception 'unpaid_order_open'; end if;
    return jsonb_build_object('existing',true,'orderId',o.id,'orderReference',o.order_reference,'amount',o.amount,'recipientPhone',o.recipient_phone,'expiresAt',o.payment_expires_at);
  end if;
  if exists(select 1 from phase1.orders where user_id=u and is_open and payment_status in ('created','pending')) then raise exception 'unpaid_order_open'; end if;
  if not exists(select 1 from phase1.promotion_settings where id and active) then raise exception 'promotion_closed'; end if;
  select * into f from phase1.promotion_offers where product_id=p_product and enabled for share;
  if not found then raise exception 'promotion_closed'; end if;
  select * into p from phase1.data_products where id=p_product and is_active;
  if not found or p.is_paused then raise exception 'product_unavailable'; end if;
  result:=phase1.prepare_data_order(u,p.id::text,phone,null,false);
  if (result->>'existing')::boolean then raise exception 'recipient_order_open'; end if;
  select * into o from phase1.orders where id=(result->>'orderId')::uuid for update;
  update phase1.orders set amount=f.price,payment_arrangement='self',prefix_mismatch_confirmed=coalesce(p_prefix_confirmed,false),prefix_mismatch_confirmed_at=case when p_prefix_confirmed then now() end where id=o.id;
  insert into phase1.promotion_redemptions(user_id,order_id,product_id,price,normal_price) values(u,o.id,p.id,f.price,p.customer_price);
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,metadata,created_by)
    values(o.id,'promotion.prepared','awaiting_payment','awaiting_payment','First-purchase promotion price applied',jsonb_build_object('price',f.price,'normalPrice',p.customer_price),u);
  return result||jsonb_build_object('amount',f.price);
end;$$;
revoke all on function phase1.promotion_prepare_order(uuid,text,boolean) from public,anon;
grant execute on function phase1.promotion_prepare_order(uuid,text,boolean) to authenticated,service_role;

-- Lock customer order creation against parallel promotional/ordinary checkouts.
create function phase1.guard_promotion_customer_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('promotion:'||new.user_id::text,0));
    if exists(select 1 from phase1.promotion_redemptions r join phase1.orders o on o.id=r.order_id
      where r.user_id=new.user_id and r.status='reserved' and o.is_open and o.payment_expires_at>now()) then raise exception 'unpaid_order_open'; end if;
  end if;
  return new;
end;$$;
revoke all on function phase1.guard_promotion_customer_order() from public,anon,authenticated;
create trigger guard_promotion_customer_insert before insert on phase1.orders for each row execute function phase1.guard_promotion_customer_order();

create function phase1.settle_promotion_redemption()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.payment_status in ('succeeded','refunded') or new.paid_at is not null then
    update phase1.promotion_redemptions set status='paid',paid_at=coalesce(paid_at,now()) where order_id=new.id and status<>'paid';
  elsif not new.is_open then
    update phase1.promotion_redemptions set status='released' where order_id=new.id and status='reserved';
  end if;
  return new;
end;$$;
revoke all on function phase1.settle_promotion_redemption() from public,anon,authenticated;
create trigger settle_promotion_order after update of payment_status,status,is_open on phase1.orders for each row execute function phase1.settle_promotion_redemption();
notify pgrst,'reload schema';