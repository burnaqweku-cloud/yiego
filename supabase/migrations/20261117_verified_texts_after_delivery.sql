-- Verified-number texts go only to delivered orders (17 Nov 2026). Applied live 17 Nov 2026.
-- The text says "has been delivered". An order still on its way used to be queued too; for an old order the sender then
-- marked it "ineligible_order" and that row blocked the text for good. Now an order is queued only once it is
-- delivered, so each customer gets the text when their own order lands. Switched on the same day for the 183 orders
-- re-sent from MTN verification: order_sms_control on, verified texts on, store orders on (they carry the store's own
-- address); purchase and delivered texts stay off. Sending: 3 per 5-minute run, 30 seconds apart, 8:00-20:00 Ghana.
create or replace function phase1.seed_verified_order_sms() returns integer language plpgsql security definer set search_path = '' as $$
declare inserted integer; s phase1.sms_settings%rowtype;
begin
 if not exists(select 1 from phase1.order_sms_control where enabled) then return 0; end if;
 select * into s from phase1.sms_settings where id;
 if not coalesce(s.verified_enabled, true) then return 0; end if;
 insert into phase1.order_sms_outbox(order_id,kind)
 select distinct o.id,'verified' from phase1.orders o join phase1.networks n on n.id=o.network_id
 where lower(n.code)='mtn' and o.payment_status::text='succeeded'
 and (o.agent_id is null or coalesce(s.store_orders_enabled, true))
 and o.status::text='delivered'
 and exists(select 1 from phase1.order_events e where e.order_id=o.id and e.event_type in ('notification.verified_email_sent','supplier.number_approved','supplier.verification_cleared'))
 and not exists(select 1 from phase1.order_events e where e.order_id=o.id and e.event_type='notification.verified_sms_sent')
 on conflict do nothing;
 get diagnostics inserted=row_count; return inserted;
end $$;
