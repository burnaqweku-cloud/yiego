-- Store customers whose order was held for MTN verification get the store-named "on its way" email when it is sent
-- (17 Nov 2026). Applied live 17 Nov 2026.
-- The trigger left orders older than 14 days alone. The verification queue holds orders from weeks back, so when the
-- MTN verification page sent them, no store email was queued and the payment code's own email (DataYego's name)
-- went instead. Now an order older than 14 days still gets the store email when it is handed to the supplier and MTN
-- approved its number (order event supplier.number_approved). Everything else is unchanged.
create or replace function phase1.store_order_email_trigger() returns trigger
language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare handed boolean; held boolean; ev text; v_to text; v_id bigint;
begin
  begin
    if new.agent_id is null or new.payment_status::text <> 'succeeded' then return new; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.payment_status is not distinct from new.payment_status
      and old.supplier_purchase_id is not distinct from new.supplier_purchase_id and old.supplier_order_reference is not distinct from new.supplier_order_reference
      and old.admin_resolution_status is not distinct from new.admin_resolution_status then return new; end if;
    handed := (nullif(new.supplier_purchase_id, '') is not null or nullif(new.supplier_order_reference, '') is not null) and new.status::text not in ('failed', 'failed_needs_review', 'cancelled', 'refunded');
    held := not handed and (new.status::text in ('failed', 'failed_needs_review') or coalesce(new.admin_resolution_status, '') in ('wrong_network', 'awaiting_verification'));
    if not handed and not held then return new; end if;
    if new.created_at < now() - interval '14 days'
      and not (handed and exists (select 1 from phase1.order_events e where e.order_id = new.id and e.event_type = 'supplier.number_approved')) then return new; end if;
    ev := case when handed then 'notification.email_sent' else 'notification.verifying_email_sent' end;
    if exists (select 1 from phase1.order_events e where e.order_id = new.id and e.event_type = ev) then return new; end if;
    v_to := coalesce(nullif(btrim(new.guest_email), ''), (select p.email from phase1.profiles p where p.id = new.user_id));
    if v_to is null or position('@' in v_to) = 0 then return new; end if;
    insert into phase1.store_order_email_outbox (order_id, kind, email) values (new.id, case when handed then 'confirmed' else 'verifying' end, v_to)
      on conflict (order_id, kind) do nothing returning id into v_id;
    if v_id is null then return new; end if;
    insert into phase1.order_events (order_id, event_type, message, metadata)
      values (new.id, ev, case when handed then 'Order confirmation email queued (store name only)' else 'Payment received / verifying email queued (store name only)' end,
        jsonb_build_object('to', v_to, 'store', (select a.slug from phase1.agents a where a.id = new.agent_id), 'via', 'store-order-email'));
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/store-order-email', body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 30000);
  exception when others then null;
  end;
  return new;
end $$;
