-- Applied live 18 Nov 2026: the domain payment step posted finance source 'paystack', which finance_entries rejects, so every domain payment signal failed.
CREATE OR REPLACE FUNCTION phase1.payment_events_domain_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
declare v_intent phase1.payment_intents%rowtype; v_order phase1.domain_orders%rowtype; v_paid numeric;
begin
  if new.event_type <> 'charge.success' then return new; end if;
  select * into v_intent from phase1.payment_intents where provider_reference = new.provider_reference and purpose = 'domain_purchase' and status = 'pending';
  if v_intent.id is null then return new; end if;
  v_paid := coalesce((new.payload->'data'->>'amount')::numeric / 100, 0);
  if v_paid < v_intent.amount then return new; end if;
  select * into v_order from phase1.domain_orders where intent_id = v_intent.id and status = 'pending_payment';
  if v_order.id is null then return new; end if;
  update phase1.payment_intents set status = 'succeeded', verified_at = now() where id = v_intent.id;
  update phase1.domain_orders set status = 'paid', paid_at = now() where id = v_order.id;
  -- Finance: customer paid price + 4% fee; price sits as "domains owed" until registered.
  perform phase1.finance_post('domain_paid', 'domain:' || v_order.id::text || ':paid', now(), v_order.price,
    jsonb_build_array(jsonb_build_object('account','paystack_transit','amount', v_intent.amount), jsonb_build_object('account','domains_pending','amount', -v_order.price), jsonb_build_object('account','fees_pending','amount', -(v_intent.amount - v_order.price))),
    'auto', null, 'Domain ' || v_order.domain || ' paid by agent', jsonb_build_object('domain_order_id', v_order.id), null, null);
  perform net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/agent-notify', jsonb_build_object('kind','domain_paid','domainOrderId', v_order.id), '{}'::jsonb,
    jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')), 15000);
  return new;
end $function$

;
