-- Allow pricing changes without forcing an explanation.
-- Supplied reasons are still retained in the audit log for support and future AI context.

create or replace function phase1.admin_set_product_price(
  p_product_id uuid,
  p_customer_price numeric,
  p_is_active boolean,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before phase1.data_products%rowtype;
  v_after phase1.data_products%rowtype;
  v_reason text;
begin
  if not exists (
    select 1
    from phase1.admin_users au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    raise exception 'Admin access required';
  end if;

  if p_customer_price is null or p_customer_price < 0 then
    raise exception 'Selling price must be zero or greater';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  select *
  into v_before
  from phase1.data_products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found';
  end if;

  update phase1.data_products
  set customer_price = round(p_customer_price, 2),
      is_active = p_is_active,
      updated_at = now()
  where id = p_product_id
  returning * into v_after;

  insert into phase1.audit_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    before_value,
    after_value,
    reason
  ) values (
    p_actor_user_id,
    'product.pricing.updated',
    'data_product',
    p_product_id,
    jsonb_build_object(
      'customer_price', v_before.customer_price,
      'is_active', v_before.is_active
    ),
    jsonb_build_object(
      'customer_price', v_after.customer_price,
      'is_active', v_after.is_active
    ),
    v_reason
  );

  return jsonb_build_object(
    'id', v_after.id,
    'customer_price', v_after.customer_price,
    'is_active', v_after.is_active,
    'updated_at', v_after.updated_at,
    'reason', v_reason
  );
end;
$$;

revoke all on function phase1.admin_set_product_price(uuid, numeric, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function phase1.admin_set_product_price(uuid, numeric, boolean, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
