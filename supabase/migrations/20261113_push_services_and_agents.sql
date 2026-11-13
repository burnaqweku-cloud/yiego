-- Phone notifications (the Android app) for DY Services orders and for an agent being approved.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- Before this the app only notified for data orders and announcements. Now:
--   service_delivered  a checker order is delivered ("Your checker is ready") or an AFA registration is done
--   service_refunded   a service order is refunded
--   agent_approved     an agent application is approved
-- They go to the phones signed in to the buyer's (or applicant's) account, and to the phone that placed the order.
-- A PIN is never put in a notification: it shows on lock screens. Tapping opens the order page, which has it.
-- Switches (Admin -> Announcements -> Phone notifications): "services" covers both service kinds; "agent_approved" its own.

alter table phase1.push_outbox drop constraint if exists push_outbox_kind_check;
alter table phase1.push_outbox add constraint push_outbox_kind_check
  check (kind = any (array['order_paid','order_delivered','order_refunded','announcement','test','campaign','alert','service_delivered','service_refunded','agent_approved']));

-- Three small edits to existing functions, made in place so nothing else in them can drift:
--   push_recipients: the new kinds go to j.user_id's phones or j.device_id (the rule 'test', 'campaign' and 'alert' already use)
--   push_enqueue:    both service kinds read the one "services" switch
--   admin_push_save: keeps the two new switches (missing = on)
do $$
declare d text; a text; b text;
begin
  d := pg_get_functiondef('phase1.push_recipients(bigint)'::regprocedure);
  a := $a$elsif j.kind in ('test','campaign','alert') then$a$;
  b := $a$elsif j.kind in ('test','campaign','alert','service_delivered','service_refunded','agent_approved') then$a$;
  if position(b in d) = 0 then
    if position(a in d) = 0 then raise exception 'push_recipients is not as expected'; end if;
    execute replace(d, a, b);
  end if;

  d := pg_get_functiondef('phase1.push_enqueue(text,text,text,text,text,uuid,uuid,uuid,text,timestamptz)'::regprocedure);
  a := $a$v_switch := case when p_kind = 'announcement' then 'announcements' else p_kind end;$a$;
  b := $a$v_switch := case when p_kind = 'announcement' then 'announcements' when p_kind in ('service_delivered','service_refunded') then 'services' else p_kind end;$a$;
  if position(b in d) = 0 then
    if position(a in d) = 0 then raise exception 'push_enqueue is not as expected'; end if;
    execute replace(d, a, b);
  end if;

  d := pg_get_functiondef('phase1.admin_push_save(jsonb)'::regprocedure);
  a := $a$'announcements', coalesce((p_settings->>'announcements')::boolean, true));$a$;
  b := $a$'announcements', coalesce((p_settings->>'announcements')::boolean, true), 'services', coalesce((p_settings->>'services')::boolean, true), 'agent_approved', coalesce((p_settings->>'agent_approved')::boolean, true));$a$;
  if position(b in d) = 0 then
    if position(a in d) = 0 then raise exception 'admin_push_save is not as expected'; end if;
    execute replace(d, a, b);
  end if;
end $$;

create or replace function phase1.service_orders_push_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
declare v_id bigint; v_kind text; v_title text; v_body text; v_afa boolean;
begin
  begin
    if new.status is distinct from old.status and new.status in ('delivered','refunded') then
      select kind = 'afa' into v_afa from phase1.service_products where code = new.product_code;
      if new.status = 'delivered' then
        v_kind := 'service_delivered';
        if coalesce(v_afa, false) then
          v_title := 'AFA registration done';
          v_body := coalesce(nullif(new.details->>'afa_phone', ''), new.phone) || ' is now registered on AFA. Order ' || new.reference || '.';
        else
          v_title := case when new.quantity > 1 then 'Your checkers are ready' else 'Your checker is ready' end;
          v_body := 'Tap to see the Serial and PIN. Order ' || new.reference || '.';
        end if;
      else
        v_kind := 'service_refunded';
        v_title := 'Order refunded';
        v_body := 'Your payment for order ' || new.reference || ' has been refunded.';
      end if;
      v_id := phase1.push_enqueue(v_kind, v_kind || ':' || new.id, v_title, v_body, '/services/order/' || new.token, null, null, new.user_id);
      -- Also the phone that placed the order (a guest in the app has no account to find it by).
      if v_id is not null and new.device_id is not null then update phase1.push_outbox set device_id = new.device_id where id = v_id; end if;
    end if;
  exception when others then null; -- a notification problem must never block an order
  end;
  return new;
end $$;
drop trigger if exists zz_service_orders_push_trg on phase1.service_orders;
create trigger zz_service_orders_push_trg after update of status on phase1.service_orders for each row execute function phase1.service_orders_push_trigger();

create or replace function phase1.agent_approved_push_trigger() returns trigger language plpgsql security definer set search_path = phase1, public as $$
begin
  begin
    if new.status::text = 'approved' and old.status::text is distinct from 'approved' and new.user_id is not null then
      perform phase1.push_enqueue('agent_approved', 'agent_approved:' || new.id, 'You are approved as an agent',
        'Sign in to your dashboard to activate your store and start selling.', '/agent', null, null, new.user_id);
    end if;
  exception when others then null; -- a notification problem must never block an approval
  end;
  return new;
end $$;
drop trigger if exists zz_agent_approved_push_trg on phase1.agent_applications;
create trigger zz_agent_approved_push_trg after update of status on phase1.agent_applications for each row execute function phase1.agent_approved_push_trigger();

revoke all on function phase1.service_orders_push_trigger(), phase1.agent_approved_push_trigger() from public, anon, authenticated;
