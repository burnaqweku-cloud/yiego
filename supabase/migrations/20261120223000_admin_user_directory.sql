-- Admin -> Users built its list from the newest 1,000 orders (a read returns at most 1,000 rows, whatever the
-- page asked for) and up to 1,000 accounts: with 10,000+ orders every customer's order count and spend, and the
-- number of guests, were wrong (20 Nov 2026, owner asked for every 1,000-row cap to be found and fixed). The
-- whole directory is now added up here. Same rules as the page had: an account's orders are every order it
-- placed and "spent" is what it paid; a guest is grouped by email, else the phone, else the number bought for.

create or replace function phase1.admin_user_directory()
returns jsonb language plpgsql stable security definer set search_path = phase1, public as $$
declare v jsonb;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  with per_user as (
    select o.user_id, count(*) n, coalesce(sum(o.amount) filter (where o.payment_status::text = 'succeeded'), 0) spent
    from phase1.orders o where o.user_id is not null group by o.user_id
  ), guest_orders as (
    select lower(coalesce(nullif(o.guest_email, ''), nullif(o.guest_phone, ''), nullif(o.recipient_phone, ''), 'unknown')) gkey,
           o.guest_email, coalesce(nullif(o.guest_phone, ''), o.recipient_phone) phone, o.amount, o.payment_status::text ps, o.created_at
    from phase1.orders o where o.user_id is null
  ), guests as (
    select gkey, count(*) n, coalesce(sum(amount) filter (where ps = 'succeeded'), 0) spent, min(created_at) since,
           (array_agg(guest_email order by created_at desc))[1] email, (array_agg(phone order by created_at desc))[1] phone
    from guest_orders group by gkey
  )
  select jsonb_build_object(
    'registered', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'phone', p.phone, 'since', p.created_at,
        'admin', exists (select 1 from phase1.admin_users a where a.user_id = p.id and a.is_active), 'orders', coalesce(u.n, 0), 'spent', coalesce(u.spent, 0)))
      from phase1.profiles p left join per_user u on u.user_id = p.id), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(jsonb_build_object('key', g.gkey, 'email', g.email, 'phone', g.phone, 'since', g.since, 'orders', g.n, 'spent', g.spent)) from guests g), '[]'::jsonb)
  ) into v;
  return v;
end $$;
-- Callable by signed-in admins only: anyone else gets admin_required.
