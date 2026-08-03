create table if not exists phase1.dispute_cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null unique default ('DSP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  order_id uuid not null references phase1.orders(id) on delete restrict,
  order_reference text not null,
  opened_by_user_id uuid null references auth.users(id) on delete set null,
  opened_by_admin_id uuid null references auth.users(id) on delete set null,
  source text not null default 'admin' check (source in ('admin','customer','system')),
  category text not null check (category in ('not_received','duplicate_payment','payment_not_confirmed','wrong_recipient','wrong_network','delivery_delay','delivered_disputed','refund_issue','other')),
  status text not null default 'new' check (status in ('new','investigating','waiting_for_update','action_required','resolved','rejected','cancelled')),
  resolution text null check (resolution is null or resolution in ('no_refund','retry_delivery','completed','refund_approved','refund_rejected','refund_completed','customer_error','supplier_confirmed_delivery','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  customer_message text null,
  internal_reason text not null,
  assigned_admin_id uuid null references auth.users(id) on delete set null,
  original_payer_user_id uuid null references auth.users(id) on delete set null,
  payment_method text null,
  payment_reference text null,
  refund_status text not null default 'not_requested' check (refund_status in ('not_requested','review_required','approved','submitted','processing','needs_attention','completed','failed','rejected','cancelled')),
  refund_amount numeric(12,2) null check (refund_amount is null or refund_amount >= 0),
  refund_destination text null,
  refund_provider_reference text null,
  supplier_resolution text null,
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists phase1.dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references phase1.dispute_cases(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  from_status text null,
  to_status text null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists dispute_cases_one_open_per_order_idx on phase1.dispute_cases(order_id) where status not in ('resolved','rejected','cancelled');
create index if not exists dispute_cases_status_created_idx on phase1.dispute_cases(status, created_at desc);
create index if not exists dispute_cases_refund_status_idx on phase1.dispute_cases(refund_status, created_at desc);
create index if not exists dispute_events_dispute_created_idx on phase1.dispute_events(dispute_id, created_at desc);

alter table phase1.dispute_cases enable row level security;
alter table phase1.dispute_events enable row level security;
grant usage on schema phase1 to authenticated;
grant select, insert, update on phase1.dispute_cases to authenticated;
grant select, insert on phase1.dispute_events to authenticated;

create policy dispute_cases_admin_read on phase1.dispute_cases for select to authenticated using (exists(select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active=true));
create policy dispute_cases_admin_insert on phase1.dispute_cases for insert to authenticated with check (exists(select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active=true));
create policy dispute_cases_admin_update on phase1.dispute_cases for update to authenticated using (exists(select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active=true)) with check (exists(select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active=true));
create policy dispute_events_admin_read on phase1.dispute_events for select to authenticated using (exists(select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active=true));
create policy dispute_events_admin_insert on phase1.dispute_events for insert to authenticated with check (exists(select 1 from phase1.admin_users a where a.user_id=auth.uid() and a.is_active=true));

create or replace function phase1.touch_dispute_updated_at() returns trigger language plpgsql set search_path=phase1,public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists dispute_cases_touch_updated_at on phase1.dispute_cases;
create trigger dispute_cases_touch_updated_at before update on phase1.dispute_cases for each row execute function phase1.touch_dispute_updated_at();

create or replace function phase1.admin_open_dispute(p_order_reference text,p_category text,p_internal_reason text,p_customer_message text default null,p_priority text default 'normal',p_actor_user_id uuid default auth.uid()) returns phase1.dispute_cases language plpgsql security definer set search_path=phase1,public as $$
declare v_order phase1.orders%rowtype; v_case phase1.dispute_cases%rowtype; v_payment_method text;
begin
 if not exists(select 1 from phase1.admin_users where user_id=p_actor_user_id and is_active=true) then raise exception 'admin_access_required'; end if;
 if nullif(trim(p_internal_reason),'') is null then raise exception 'internal_reason_required'; end if;
 select * into v_order from phase1.orders where order_reference=p_order_reference; if not found then raise exception 'order_not_found'; end if;
 v_payment_method:=coalesce(v_order.selected_payment_method,case when v_order.wallet_ledger_entry_id is not null then 'wallet' when v_order.paystack_reference is not null then 'paystack' else null end);
 insert into phase1.dispute_cases(order_id,order_reference,opened_by_admin_id,source,category,priority,customer_message,internal_reason,original_payer_user_id,payment_method,payment_reference,refund_amount,refund_destination)
 values(v_order.id,v_order.order_reference,p_actor_user_id,'admin',p_category,p_priority,nullif(trim(p_customer_message),''),trim(p_internal_reason),coalesce(v_order.paid_by_user_id,v_order.user_id),v_payment_method,v_order.paystack_reference,v_order.amount,case when v_payment_method='wallet' then 'original_payer_wallet' when v_payment_method='paystack' then 'original_paystack_channel' else null end) returning * into v_case;
 insert into phase1.dispute_events(dispute_id,actor_user_id,event_type,to_status,message) values(v_case.id,p_actor_user_id,'dispute.opened','new',trim(p_internal_reason));
 return v_case;
end; $$;

create or replace function phase1.admin_update_dispute(p_dispute_id uuid,p_status text,p_message text,p_resolution text default null,p_refund_status text default null,p_actor_user_id uuid default auth.uid()) returns phase1.dispute_cases language plpgsql security definer set search_path=phase1,public as $$
declare v_old phase1.dispute_cases%rowtype; v_new phase1.dispute_cases%rowtype;
begin
 if not exists(select 1 from phase1.admin_users where user_id=p_actor_user_id and is_active=true) then raise exception 'admin_access_required'; end if;
 if nullif(trim(p_message),'') is null then raise exception 'message_required'; end if;
 select * into v_old from phase1.dispute_cases where id=p_dispute_id for update; if not found then raise exception 'dispute_not_found'; end if;
 update phase1.dispute_cases set status=p_status,resolution=coalesce(p_resolution,resolution),refund_status=coalesce(p_refund_status,refund_status),assigned_admin_id=coalesce(assigned_admin_id,p_actor_user_id),resolved_at=case when p_status in ('resolved','rejected','cancelled') then now() else null end,resolved_by=case when p_status in ('resolved','rejected','cancelled') then p_actor_user_id else null end where id=p_dispute_id returning * into v_new;
 insert into phase1.dispute_events(dispute_id,actor_user_id,event_type,from_status,to_status,message,metadata) values(p_dispute_id,p_actor_user_id,'dispute.updated',v_old.status,v_new.status,trim(p_message),jsonb_build_object('resolution',v_new.resolution,'refund_status',v_new.refund_status));
 return v_new;
end; $$;

revoke all on function phase1.admin_open_dispute(text,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function phase1.admin_update_dispute(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function phase1.admin_open_dispute(text,text,text,text,text,uuid) to service_role;
grant execute on function phase1.admin_update_dispute(uuid,text,text,text,text,uuid) to service_role;
comment on column phase1.dispute_cases.refund_status is 'Tracks refund workflow only. completed must mean money movement was independently confirmed.';
