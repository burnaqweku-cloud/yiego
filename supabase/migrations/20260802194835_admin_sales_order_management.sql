-- Phase 1 admin sales and customer-visible order management.
-- Privileged writes stay behind service-role-only RPCs called by admin Edge Functions.

alter table phase1.orders
  add column if not exists admin_resolution_reason text,
  add column if not exists admin_resolution_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists admin_resolution_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_admin_resolution_status_check'
      and conrelid = 'phase1.orders'::regclass
  ) then
    alter table phase1.orders
      add constraint orders_admin_resolution_status_check
      check (
        admin_resolution_status is null
        or admin_resolution_status in (
          'processing',
          'pending_supplier',
          'delivered',
          'failed',
          'cancelled',
          'refunded'
        )
      );
  end if;
end $$;

create index if not exists orders_status_created_at_idx
  on phase1.orders (status, created_at desc);

create index if not exists orders_admin_resolution_status_created_at_idx
  on phase1.orders (admin_resolution_status, created_at desc)
  where admin_resolution_status is not null;

create index if not exists data_products_network_active_display_idx
  on phase1.data_products (network_id, is_active, display_order);

create policy "data_products_admin_read_all"
  on phase1.data_products
  for select
  to authenticated
  using ((select private.is_phase1_admin()));

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

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required';
  end if;

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
    btrim(p_reason)
  );

  return jsonb_build_object(
    'id', v_after.id,
    'customer_price', v_after.customer_price,
    'is_active', v_after.is_active,
    'updated_at', v_after.updated_at
  );
end;
$$;

create or replace function phase1.admin_set_order_display_status(
  p_order_reference text,
  p_display_status text,
  p_reason text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order phase1.orders%rowtype;
  v_next_status text;
begin
  if not exists (
    select 1
    from phase1.admin_users au
    where au.user_id = p_actor_user_id
      and au.is_active
  ) then
    raise exception 'Admin access required';
  end if;

  v_next_status := nullif(btrim(p_display_status), '');

  if v_next_status is not null and v_next_status not in (
    'processing',
    'pending_supplier',
    'delivered',
    'failed',
    'cancelled',
    'refunded'
  ) then
    raise exception 'Unsupported customer-visible status';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A reason is required';
  end if;

  select *
  into v_order
  from phase1.orders
  where order_reference = p_order_reference
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  update phase1.orders
  set admin_resolution_status = v_next_status,
      admin_resolution_reason = btrim(p_reason),
      admin_resolution_updated_by = p_actor_user_id,
      admin_resolution_updated_at = now(),
      updated_at = now()
  where id = v_order.id;

  insert into phase1.order_events (
    order_id,
    event_type,
    from_status,
    to_status,
    message,
    metadata,
    created_by
  ) values (
    v_order.id,
    case when v_next_status is null then 'admin.display_status.cleared' else 'admin.display_status.set' end,
    coalesce(v_order.admin_resolution_status, v_order.status::text),
    coalesce(v_next_status, v_order.status::text),
    btrim(p_reason),
    jsonb_build_object(
      'system_status', v_order.status,
      'previous_override', v_order.admin_resolution_status,
      'new_override', v_next_status
    ),
    p_actor_user_id
  );

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
    case when v_next_status is null then 'order.display_status.cleared' else 'order.display_status.updated' end,
    'order',
    v_order.id,
    jsonb_build_object(
      'system_status', v_order.status,
      'display_status', v_order.admin_resolution_status
    ),
    jsonb_build_object(
      'system_status', v_order.status,
      'display_status', v_next_status
    ),
    btrim(p_reason)
  );

  return jsonb_build_object(
    'order_reference', v_order.order_reference,
    'system_status', v_order.status,
    'display_status', v_next_status,
    'reason', btrim(p_reason)
  );
end;
$$;

revoke all on function phase1.admin_set_product_price(uuid, numeric, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function phase1.admin_set_product_price(uuid, numeric, boolean, uuid, text)
  to service_role;

revoke all on function phase1.admin_set_order_display_status(text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function phase1.admin_set_order_display_status(text, text, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
