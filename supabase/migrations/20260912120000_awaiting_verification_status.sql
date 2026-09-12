-- "Awaiting verification": an MTN/YELLO order that DataBundlesHub silently
-- refunded (no errorCode) is not a failure — MTN is verifying a first-time
-- number, which takes a few days, after which the bundle can be resubmitted.
-- Holding these in their own customer-visible state keeps them out of the
-- plain refund queue and stops customers being told they were refunded.
--
-- The check constraint change was already applied by hand on 2026-09-12
-- (first case: YG-C62E960906); it is repeated here so the repo matches.

alter table phase1.orders
  drop constraint if exists orders_admin_resolution_status_check;

alter table phase1.orders
  add constraint orders_admin_resolution_status_check
  check (
    admin_resolution_status is null
    or admin_resolution_status in (
      'processing',
      'pending_supplier',
      'awaiting_verification',
      'delivered',
      'failed',
      'cancelled',
      'refunded'
    )
  );

-- Let admins set/clear the state from the order modal too.
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
    'awaiting_verification',
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
    order_id, event_type, from_status, to_status, message, metadata, created_by
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
    actor_user_id, action, target_type, target_id, before_value, after_value, reason
  ) values (
    p_actor_user_id,
    case when v_next_status is null then 'order.display_status.cleared' else 'order.display_status.updated' end,
    'order',
    v_order.id,
    jsonb_build_object('system_status', v_order.status, 'display_status', v_order.admin_resolution_status),
    jsonb_build_object('system_status', v_order.status, 'display_status', v_next_status),
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
