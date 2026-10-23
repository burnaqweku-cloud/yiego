-- Apply only to the active external phase1 database.
alter table phase1.orders add column if not exists management_token text;

create or replace function phase1.cancel_unpaid_order(p_reference text, p_actor uuid default null, p_token text default null, p_email text default null, p_admin boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o phase1.orders%rowtype; actor uuid;
begin
  actor := auth.uid();
  if p_admin then
    if actor is null or not exists(select 1 from phase1.admin_users where user_id=actor and is_active)
      or coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'admin_access_required'; end if;
  else
    if coalesce(auth.role(),'') <> 'service_role' then raise exception 'not_allowed'; end if;
    actor := p_actor;
  end if;
  select * into o from phase1.orders where order_reference=upper(trim(p_reference)) for update;
  if not found then raise exception 'order_not_found'; end if;
  if not p_admin then
    if o.user_id is not null then
      if actor is null or actor <> o.user_id then raise exception 'not_allowed'; end if;
    elsif not coalesce(((p_token is not null and length(p_token)>0 and p_token=o.management_token)
       or (p_email is not null and length(trim(p_email))>0 and lower(trim(p_email))=lower(o.guest_email))),false) then
      raise exception 'not_allowed';
    end if;
  end if;
  if o.status <> 'awaiting_payment' or o.payment_status not in ('pending','created') or not o.is_open
     or o.paid_at is not null or o.wallet_ledger_entry_id is not null or o.supplier_order_reference is not null or o.supplier_purchase_id is not null
     or exists(select 1 from phase1.payment_intents where order_id=o.id and status='succeeded') then raise exception 'not_unpaid'; end if;
  update phase1.orders set status='cancelled',payment_status='abandoned',is_open=false,closed_at=now(),closed_reason=case when p_admin then 'cancelled_by_admin_unpaid' else 'cancelled_by_customer_unpaid' end,updated_at=now() where id=o.id;
  insert into phase1.order_events(order_id,event_type,from_status,to_status,message,created_by)
    values(o.id,case when p_admin then 'admin.cancel_unpaid' else 'customer.cancel_unpaid' end,o.status,'cancelled','Unpaid order cancelled; recipient released. No money moved.',actor);
  return jsonb_build_object('reference',o.order_reference,'cancelled',true);
end; $$;
revoke all on function phase1.cancel_unpaid_order(text,uuid,text,text,boolean) from public,anon;
grant execute on function phase1.cancel_unpaid_order(text,uuid,text,text,boolean) to authenticated,service_role;

-- A provider link already opened cannot be revoked locally. Preserve a late
-- successful payment for manual reconciliation, but never auto-send the cancelled order.
create or replace function phase1.guard_cancelled_unpaid_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.closed_reason in ('cancelled_by_admin_unpaid','cancelled_by_customer_unpaid') and old.status='cancelled'
     and new.payment_status='succeeded' then
    new.status := 'cancelled'; new.is_open := false;
    new.failure_reason := 'Payment received after unpaid cancellation. Administrator must reconcile; do not automatically send.';
    if old.payment_status is distinct from 'succeeded' then
      insert into phase1.order_events(order_id,event_type,from_status,to_status,message)
        values(old.id,'payment.received_after_cancellation','cancelled','cancelled','Late payment recorded for administrator reconciliation. No automatic delivery.');
    end if;
  end if;
  return new;
end; $$;
create trigger guard_cancelled_unpaid_payment before update on phase1.orders
for each row execute function phase1.guard_cancelled_unpaid_payment();
notify pgrst,'reload schema';