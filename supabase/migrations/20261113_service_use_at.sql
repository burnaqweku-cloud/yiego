-- DY Services: where a checker is used (the exam body's results website), and texts that carry every PIN.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- The website is shown with the PIN on the order page and in the email. It is never put in a text: the network
-- drops texts that name the exam or carry a website (see supabase/functions/service-pay/texts.ts).

alter table phase1.service_products add column if not exists use_at text;
update phase1.service_products set use_at = 'eresults.waecgh.org' where code = 'checker-bece' and use_at is distinct from 'eresults.waecgh.org';
update phase1.service_products set use_at = 'ghana.waecdirect.org' where code = 'checker-wassce' and use_at is distinct from 'ghana.waecdirect.org';

create or replace function phase1.service_order_json(o phase1.service_orders) returns jsonb language sql stable security definer set search_path = phase1, public as $$
  select jsonb_build_object('reference', o.reference, 'token', o.token, 'product', o.product_code, 'kind', p.kind, 'name', p.name, 'quantity', o.quantity, 'amount', o.amount, 'fee', o.fee_amount,
    'phone', o.phone, 'status', o.status, 'paid', o.paid_at is not null, 'method', o.payment_method, 'created_at', o.created_at, 'delivered_at', o.delivered_at,
    'afa', case when p.kind = 'afa' then jsonb_build_object('name', o.details->>'full_name', 'phone', o.details->>'afa_phone') end,
    'store', case when o.agent_id is not null and not o.agent_self then (select jsonb_build_object('name', a.store_name, 'site', phase1.service_store_site(a.id)) from phase1.agents a where a.id = o.agent_id) end,
    'use_at', p.use_at, 'pins', case when o.status = 'delivered' then coalesce((select jsonb_agg(jsonb_build_object('serial', s.serial, 'pin', s.pin) order by s.created_at, s.id) from phase1.service_pins s where s.order_id = o.id and s.status = 'sold'), '[]'::jsonb) else '[]'::jsonb end)
  from phase1.service_products p where p.code = o.product_code $$;

-- Same day (applied live): the agent-approval text is sent from "Dyverify" (the owner's rule: Dyverify is for
-- MTN verification and agent approval; "Dyagents" was never approved by the SMS provider, so texts from it fail).
update phase1.sms_settings set agents_sender = 'Dyverify' where id = true and agents_sender is distinct from 'Dyverify';
