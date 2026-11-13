-- 13 Nov 2026: DY Services are on in every active store unless the agent switches one off.
-- A store with no saved choice sells each service at the customer price (the same default data bundles use),
-- so the agent earns customer price minus agent price. A saved row (agent_service_prices) still wins: own price, or off.
-- Applied to the live database (schema phase1) by hand; this file is the record.

create or replace function phase1.service_catalog(p_store text default null)
returns jsonb language sql stable security definer set search_path to 'phase1', 'public' as $$
  select case when p_store is null or p_store = '' then
    (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'price', p.customer_price, 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0,
      'left', phase1.service_stock_left(p.code)) order by p.sort_order), '[]'::jsonb) from phase1.service_products p where p.is_active)
  else
    (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'price', greatest(coalesce(s.price, p.customer_price), p.agent_price), 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0,
      'left', phase1.service_stock_left(p.code)) order by p.sort_order), '[]'::jsonb)
     from phase1.agents a join phase1.service_products p on p.is_active
     left join phase1.agent_service_prices s on s.agent_id = a.id and s.product_code = p.code
     where a.slug = p_store and a.status = 'active' and coalesce(s.enabled, true))
  end $$;

create or replace function phase1.agent_services()
returns jsonb language plpgsql stable security definer set search_path to 'phase1', 'public' as $$
declare a phase1.agents;
begin
  select * into a from phase1.agents where user_id = auth.uid();
  if a.id is null then raise exception 'not_an_agent'; end if;
  return jsonb_build_object(
    'active', a.status = 'active',
    'products', coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'kind', p.kind, 'name', p.name, 'blurb', p.blurb, 'agent_price', p.agent_price, 'customer_price', p.customer_price,
        'price', greatest(coalesce(s.price, p.customer_price), p.agent_price), 'enabled', coalesce(s.enabled, true), 'in_stock', p.kind = 'afa' or phase1.service_stock_left(p.code) > 0) order by p.sort_order)
      from phase1.service_products p left join phase1.agent_service_prices s on s.product_code = p.code and s.agent_id = a.id where p.is_active), '[]'::jsonb),
    'earned', (select coalesce(sum(agent_margin), 0) from phase1.service_orders where agent_id = a.id and not agent_self and status = 'delivered'),
    'sales', coalesce((select jsonb_agg(to_jsonb(x)) from (select o.reference, p.name, o.quantity, o.amount, o.agent_margin as margin, o.agent_self as self, o.status, coalesce(o.paid_at, o.created_at) as at,
        left(o.phone, 3) || '****' || right(o.phone, 3) as phone
        from phase1.service_orders o join phase1.service_products p on p.code = o.product_code where o.agent_id = a.id and o.paid_at is not null order by o.paid_at desc limit 30) x), '[]'::jsonb));
end $$;

create or replace function phase1.service_order_new(p_user uuid, p_product text, p_qty integer, p_phone text, p_email text, p_method text, p_device text, p_details jsonb default null, p_store text default null, p_as_agent boolean default false)
returns phase1.service_orders language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare p phase1.service_products; o phase1.service_orders; v_phone text := phase1.service_norm_phone(p_phone); v_fee numeric; v_details jsonb := '{}'::jsonb;
  v_unit numeric; v_agent uuid; v_margin numeric; v_self boolean := false; v_store_price numeric;
begin
  select * into p from phase1.service_products where code = p_product and is_active;
  if p.code is null then raise exception 'service_unavailable'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then raise exception 'quantity_invalid'; end if;
  v_unit := p.customer_price;
  if p_store is not null and p_store <> '' then
    -- No saved choice = on, at the customer price. A saved row is the agent's own price, or "off".
    select a.id, greatest(coalesce(s.price, p.customer_price), p.agent_price) into v_agent, v_store_price
      from phase1.agents a left join phase1.agent_service_prices s on s.agent_id = a.id and s.product_code = p.code
      where a.slug = p_store and a.status = 'active' and coalesce(s.enabled, true);
    if v_agent is null then raise exception 'service_unavailable'; end if;
    v_unit := v_store_price; v_margin := round((v_unit - p.agent_price) * p_qty, 2);
  elsif coalesce(p_as_agent, false) then
    select id into v_agent from phase1.agents where user_id = p_user and status = 'active';
    if v_agent is null or p_user is null then raise exception 'not_an_agent'; end if;
    v_unit := p.agent_price; v_margin := 0; v_self := true;
  end if;
  if p.kind = 'afa' then
    if p_qty <> 1 then raise exception 'quantity_invalid'; end if;
    v_details := phase1.service_afa_details(coalesce(p_details, '{}'::jsonb));
    if phase1.service_afa_taken(v_details->>'afa_phone') then raise exception 'afa_already_registered'; end if;
    v_phone := coalesce(v_phone, v_details->>'afa_phone');
  end if;
  if v_phone is null then raise exception 'phone_invalid'; end if;
  if p_email is not null and p_email <> '' and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'email_invalid'; end if;
  v_fee := case when p_method = 'paystack' then round(v_unit * p_qty * 0.04, 2) else 0 end;
  update phase1.service_pins set status = 'available', order_id = null, reserved_until = null where status = 'reserved' and order_id in (
    select x.id from phase1.service_orders x where x.paid_at is null and x.status = 'awaiting_payment' and (x.phone = v_phone or (p_device is not null and x.device_id = left(p_device, 80))));
  insert into phase1.service_orders (reference, product_code, quantity, unit_price, amount, fee_amount, user_id, guest_email, phone, device_id, payment_method, details, agent_id, agent_price, agent_margin, agent_self)
  values ('SV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), p.code, p_qty, v_unit, v_unit * p_qty, v_fee,
          p_user, nullif(lower(trim(coalesce(p_email, ''))), ''), v_phone, left(p_device, 80), p_method, v_details, v_agent, case when v_agent is not null then p.agent_price end, v_margin, v_self)
  returning * into o;
  if p.kind = 'checker' then perform phase1.service_hold(o.id, p.code, p_qty, 20); end if;
  return o;
end $$;

-- The AFA form now asks for "Town or area" (not a full address), and some towns are two letters long (Wa, Ho),
-- so the shortest accepted value drops from 5 characters to 2. Nothing else in the check changes.
create or replace function phase1.service_afa_details(p jsonb)
returns jsonb language plpgsql stable as $function$
declare v_name text := regexp_replace(trim(coalesce(p->>'full_name', '')), '\s+', ' ', 'g');
  v_phone text := phase1.service_norm_phone(p->>'afa_phone');
  v_card text := upper(regexp_replace(coalesce(p->>'ghana_card', ''), '[^A-Za-z0-9]', '', 'g'));
  v_dob date; v_job text := regexp_replace(trim(coalesce(p->>'occupation', '')), '\s+', ' ', 'g');
  v_region text := trim(coalesce(p->>'region', '')); v_address text := regexp_replace(trim(coalesce(p->>'address', '')), '\s+', ' ', 'g');
begin
  if length(v_name) < 5 or length(v_name) > 80 or v_name !~ '^[A-Za-z][A-Za-z .''-]+ [A-Za-z .''-]+$' then raise exception 'afa_name_invalid'; end if;
  if v_phone is null or v_phone !~ '^0(24|25|53|54|55|59)' then raise exception 'afa_phone_invalid'; end if;
  if v_card !~ '^GHA[0-9]{10}$' then raise exception 'afa_card_invalid'; end if;
  v_card := 'GHA-' || substr(v_card, 4, 9) || '-' || substr(v_card, 13, 1);
  begin v_dob := (p->>'dob')::date; exception when others then raise exception 'afa_dob_invalid'; end;
  if v_dob is null or v_dob < date '1900-01-01' or v_dob > (current_date - interval '16 years') then raise exception 'afa_dob_invalid'; end if;
  if length(v_job) < 2 or length(v_job) > 60 then raise exception 'afa_job_invalid'; end if;
  if v_region not in ('Ahafo','Ashanti','Bono','Bono East','Central','Eastern','Greater Accra','North East','Northern','Oti','Savannah','Upper East','Upper West','Volta','Western','Western North') then raise exception 'afa_region_invalid'; end if;
  if length(v_address) < 2 or length(v_address) > 200 then raise exception 'afa_address_invalid'; end if;
  return jsonb_build_object('full_name', v_name, 'afa_phone', v_phone, 'ghana_card', v_card, 'dob', to_char(v_dob, 'YYYY-MM-DD'), 'occupation', v_job, 'region', v_region, 'address', v_address);
end $function$;

-- 13 Nov 2026: Add stock also reads a supplier message written as "(SN: 123 , PIN: ABC) (SN: 124 , PIN: ABD) ...".
-- Applied live by replacing only the pattern inside phase1.admin_service_add_stock:
--   old: serial\s*(?:number|no\.?)?\s*[:#=-]*\s*([A-Za-z0-9]{4,})\s+pin
--   new: (?:serial\s*(?:number|no\.?)?|\ms/?n\M)\s*[:#=-]*\s*([A-Za-z0-9]{4,})[\s,;|]+pin

-- 13 Nov 2026: a voucher can be in stock under one product only. Add stock used to check for repeats inside the same
-- product, so yesterday's WASSCE vouchers were accepted a second time under BECE (caught before any sale).
-- Applied live by replacing only this check inside phase1.admin_service_add_stock:
--   old: exists (select 1 from phase1.service_pins where product_code = p_product and serial = v_parts[1])
--   new: exists (select 1 from phase1.service_pins where serial = v_parts[1] and (product_code = p_product or status <> 'void'))
