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
    elsif not ((p_token is not null and length(p_token)>0 and p_token=o.management_token)
       or (p_email is not null and length(trim(p_email))>0 and lower(trim(p_email))=lower(o.guest_email))) then
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
notify pgrst,'reload schema';