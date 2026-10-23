-- Additive reporting only; does not change payment, price or fulfillment.
create table phase1.promotion_visits (
  id uuid primary key,
  token_hash text not null,
  source text not null check(length(source) between 1 and 80),
  medium text not null check(length(medium) between 1 and 80),
  campaign text not null check(length(campaign) between 1 and 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sessions integer not null default 1,
  signup_started_at timestamptz,
  checkout_clicked_at timestamptz,
  user_id uuid,
  new_account_id uuid unique,
  account_created_at timestamptz
);
grant select on phase1.promotion_visits to authenticated;
grant all on phase1.promotion_visits to service_role;
alter table phase1.promotion_visits enable row level security;
create policy promotion_visits_admin_read on phase1.promotion_visits for select to authenticated using(phase1.admin_role(auth.uid()) in ('admin','master'));
create index promotion_visits_created on phase1.promotion_visits(created_at);
create index promotion_visits_user on phase1.promotion_visits(user_id,last_seen_at);
alter table phase1.promotion_redemptions add column visit_id uuid references phase1.promotion_visits(id);

create function phase1.promotion_track(p_visit uuid,p_token uuid,p_kind text,p_source text default 'direct',p_medium text default 'organic',p_campaign text default 'unlabelled')
returns boolean language plpgsql security definer set search_path='' as $$
declare v phase1.promotion_visits%rowtype;
begin
  if p_visit is null or p_token is null or p_kind is null or p_kind not in ('visit','signup_started','checkout_clicked')
    or p_source is null or length(p_source) not between 1 and 80 or p_medium is null or length(p_medium) not between 1 and 80
    or p_campaign is null or length(p_campaign) not between 1 and 120 then raise exception 'invalid_tracking_event'; end if;
  if p_kind='visit' then
    insert into phase1.promotion_visits(id,token_hash,source,medium,campaign,user_id)
      values(p_visit,md5(p_token::text),lower(p_source),lower(p_medium),p_campaign,auth.uid()) on conflict(id) do nothing;
  end if;
  select * into v from phase1.promotion_visits where id=p_visit and token_hash=md5(p_token::text) for update;
  if not found or v.created_at<now()-interval '30 days' then return false; end if;
  update phase1.promotion_visits set
    sessions=sessions+case when p_kind='visit' and last_seen_at<now()-interval '30 minutes' then 1 else 0 end,
    last_seen_at=case when p_kind='visit' then now() else last_seen_at end,
    signup_started_at=case when p_kind='signup_started' then coalesce(signup_started_at,now()) else signup_started_at end,
    checkout_clicked_at=case when p_kind='checkout_clicked' then coalesce(checkout_clicked_at,now()) else checkout_clicked_at end,
    user_id=coalesce(user_id,auth.uid())
    where id=p_visit and (user_id is null or auth.uid() is null or user_id=auth.uid());
  return true;
end;$$;
revoke all on function phase1.promotion_track(uuid,uuid,text,text,text,text) from public;
grant execute on function phase1.promotion_track(uuid,uuid,text,text,text,text) to anon,authenticated,service_role;

-- This fires only for an actual new auth row, never an existing user's sign-in
-- or a duplicate-email signup response. Invalid attribution cannot block signup.
create function phase1.attribute_promotion_signup()
returns trigger language plpgsql security definer set search_path='' as $$
declare visit uuid; token uuid;
begin
  begin
    visit:=(new.raw_user_meta_data->>'promo_visit_id')::uuid;
    token:=(new.raw_user_meta_data->>'promo_visit_token')::uuid;
    update phase1.promotion_visits set user_id=new.id,new_account_id=new.id,account_created_at=new.created_at
      where id=visit and token_hash=md5(token::text) and created_at>=now()-interval '30 days'
      and new_account_id is null and user_id is null;
  exception when invalid_text_representation then null;
  end;
  return new;
end;$$;
revoke all on function phase1.attribute_promotion_signup() from public,anon,authenticated;
create trigger yiego_promotion_signup after insert on auth.users for each row execute function phase1.attribute_promotion_signup();

create function phase1.attribute_promotion_redemption()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  select id into new.visit_id from phase1.promotion_visits where user_id=new.user_id and created_at>=now()-interval '30 days' order by last_seen_at desc,id limit 1;
  return new;
end;$$;
revoke all on function phase1.attribute_promotion_redemption() from public,anon,authenticated;
create trigger attribute_promotion_redemption before insert on phase1.promotion_redemptions for each row execute function phase1.attribute_promotion_redemption();

create function phase1.admin_promotion_report(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb; starts timestamptz; ends timestamptz;
begin
  if coalesce(phase1.admin_role(auth.uid()),'') not in ('admin','master') then raise exception 'admin_required'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>730 then raise exception 'invalid_date_range'; end if;
  starts:=p_from::timestamp at time zone 'Africa/Accra'; ends:=(p_to+1)::timestamp at time zone 'Africa/Accra';
  with stats as (
    select v.id,v.source,v.campaign,(v.created_at at time zone 'Africa/Accra')::date as day,v.sessions,
      case when v.signup_started_at<ends then 1 else 0 end as signup_starts,
      case when v.account_created_at<ends then 1 else 0 end as accounts,
      case when v.account_created_at<ends and a.email_confirmed_at<ends then 1 else 0 end as confirmed_accounts,
      case when d.paid_orders>0 then v.user_id end as buyer,
      d.*
    from phase1.promotion_visits v left join auth.users a on a.id=v.new_account_id
    cross join lateral (
      select count(*) as checkouts,
        count(*) filter(where o.payment_status in ('succeeded','refunded') and coalesce(r.paid_at,o.paid_at,o.created_at)<ends) as paid_orders,
        count(*) filter(where o.status::text='delivered') as delivered,
        count(*) filter(where r.status='reserved' and o.is_open and o.payment_status in ('created','pending') and o.payment_expires_at>now()) as pending,
        count(*) filter(where o.status::text='cancelled' and o.payment_status not in ('succeeded','refunded')) as cancelled,
        count(*) filter(where o.payment_status='refunded') as refunded,
        coalesce(sum(r.price) filter(where o.payment_status='succeeded' and coalesce(r.paid_at,o.paid_at,o.created_at)<ends),0) as sales,
        coalesce(sum(greatest(0,r.normal_price-r.price)) filter(where o.payment_status='succeeded' and coalesce(r.paid_at,o.paid_at,o.created_at)<ends),0) as discount
      from phase1.promotion_redemptions r join phase1.orders o on o.id=r.order_id where r.visit_id=v.id and r.created_at<ends
    ) d where v.created_at>=starts and v.created_at<ends
  ), grouped as (
    select grouping(day) as gd,grouping(source) as gs,day,source,campaign,
      count(*) as visitors,coalesce(sum(sessions),0) as visits,coalesce(sum(signup_starts),0) as signup_starts,
      coalesce(sum(accounts),0) as accounts,coalesce(sum(confirmed_accounts),0) as confirmed_accounts,
      count(distinct buyer) as buyers,coalesce(sum(checkouts),0) as checkouts,coalesce(sum(paid_orders),0) as paid_orders,
      coalesce(sum(delivered),0) as delivered,coalesce(sum(pending),0) as pending,coalesce(sum(cancelled),0) as cancelled,
      coalesce(sum(refunded),0) as refunded,coalesce(sum(sales),0) as sales,coalesce(sum(discount),0) as discount
      from stats group by grouping sets((),(day),(source,campaign))
  ) select jsonb_build_object(
    'from',p_from,'to',p_to,'started_at',(select min(created_at) from phase1.promotion_visits),
    'totals',(select to_jsonb(g)-'gd'-'gs'-'day'-'source'-'campaign' from grouped g where gd=1 and gs=1),
    'daily',coalesce((select jsonb_agg((to_jsonb(g)-'gd'-'gs')||jsonb_build_object('label',day) order by day desc) from grouped g where gd=0),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg((to_jsonb(g)-'gd'-'gs')||jsonb_build_object('label',source||' / '||campaign) order by buyers desc,visitors desc) from grouped g where gs=0),'[]'::jsonb),
    'bundles',coalesce((select jsonb_agg(to_jsonb(b)) from (
      select p.name as label,count(*) as checkouts,count(*) filter(where o.payment_status in ('succeeded','refunded')) as paid_orders,
        coalesce(sum(r.price) filter(where o.payment_status='succeeded'),0) as sales
      from phase1.promotion_redemptions r join phase1.data_products p on p.id=r.product_id join phase1.orders o on o.id=r.order_id
      join phase1.promotion_visits v on v.id=r.visit_id where v.created_at>=starts and v.created_at<ends and r.created_at<ends group by p.id,p.name order by count(*) desc
    ) b),'[]'::jsonb)
  ) into report;
  return report;
end;$$;
revoke all on function phase1.admin_promotion_report(date,date) from public,anon;
grant execute on function phase1.admin_promotion_report(date,date) to authenticated,service_role;
notify pgrst,'reload schema';