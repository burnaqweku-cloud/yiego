-- Applied live 18 Nov 2026 (owner): a paid domain shows on Admin -> Domains by itself, is connected to the
-- agent's store from that page (Cloudflare custom hostnames via pg_net), and "Completed" moves the price from
-- "Domains paid, not yet completed" into domain sales (profit). No registrar cost is recorded: cash leaves
-- through Kora/bank and Finance reads those live, so booking a cost would deduct it twice.
alter table phase1.domain_orders
  add column if not exists cf_requests jsonb not null default '{}'::jsonb,
  add column if not exists cf_state jsonb not null default '{}'::jsonb,
  add column if not exists connected_at timestamptz,
  add column if not exists completed_at timestamptz;

create or replace function phase1._cf_headers() returns jsonb language sql stable security definer set search_path to 'phase1','public' as $$
  select jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select value from phase1.internal_secrets where key = 'cloudflare'))
$$;
revoke all on function phase1._cf_headers() from public, anon, authenticated;

create or replace function phase1._cf_base() returns text language sql stable security definer set search_path to 'phase1','public' as $$
  select 'https://api.cloudflare.com/client/v4/zones/' || (select value from phase1.internal_secrets where key = 'cloudflare_zone') || '/custom_hostnames'
$$;
revoke all on function phase1._cf_base() from public, anon, authenticated;

-- What Cloudflare said about one hostname, from a create (object) or a lookup (array) reply.
create or replace function phase1._cf_host_of(p_content jsonb) returns jsonb language sql immutable as $$
  select case
    when p_content is null then null
    when jsonb_typeof(p_content->'result') = 'object' then jsonb_build_object('id', p_content->'result'->>'id', 'status', p_content->'result'->>'status', 'ssl', p_content->'result'->'ssl'->>'status', 'problems', coalesce(p_content->'result'->'verification_errors','[]'::jsonb) || coalesce(p_content->'result'->'ssl'->'validation_errors','[]'::jsonb))
    when jsonb_typeof(p_content->'result') = 'array' and jsonb_array_length(p_content->'result') > 0 then jsonb_build_object('id', p_content->'result'->0->>'id', 'status', p_content->'result'->0->>'status', 'ssl', p_content->'result'->0->'ssl'->>'status', 'problems', coalesce(p_content->'result'->0->'verification_errors','[]'::jsonb) || coalesce(p_content->'result'->0->'ssl'->'validation_errors','[]'::jsonb))
    when jsonb_typeof(p_content->'result') = 'array' then jsonb_build_object('status', 'missing')
    else null end
$$;

create or replace function phase1.admin_domain_connect(p_id uuid) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare o phase1.domain_orders%rowtype; a phase1.agents%rowtype; r1 bigint; r2 bigint;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  select * into o from phase1.domain_orders where id = p_id and status in ('paid','registered','live') for update;
  if o.id is null then raise exception 'not_paid_or_not_found'; end if;
  select * into a from phase1.agents where id = o.agent_id for update;
  if a.custom_domain is not null and a.custom_domain <> o.domain then raise exception 'store_has_other_domain'; end if;
  update phase1.agents set custom_domain = o.domain, custom_domain_status = case when custom_domain_status = 'active' then 'active' else 'pending' end where id = a.id;
  r1 := net.http_post(url := phase1._cf_base(), body := jsonb_build_object('hostname', o.domain, 'ssl', jsonb_build_object('method','http','type','dv')), headers := phase1._cf_headers(), timeout_milliseconds := 15000);
  r2 := net.http_post(url := phase1._cf_base(), body := jsonb_build_object('hostname', 'www.' || o.domain, 'ssl', jsonb_build_object('method','http','type','dv')), headers := phase1._cf_headers(), timeout_milliseconds := 15000);
  update phase1.domain_orders set connected_at = coalesce(connected_at, now()), cf_requests = jsonb_build_object('apex', r1, 'www', r2), updated_at = now() where id = o.id;
  return jsonb_build_object('ok', true);
end $$;

-- Reads Cloudflare's last replies, records them, marks the store live when the main address works, and asks again.
create or replace function phase1.admin_domain_refresh(p_id uuid) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare o phase1.domain_orders%rowtype; v_state jsonb; v_req jsonb := '{}'::jsonb; k text; v_resp jsonb; v_host jsonb; v_live boolean := false; v_status text;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  select * into o from phase1.domain_orders where id = p_id for update;
  if o.id is null then raise exception 'not_found'; end if;
  if o.connected_at is null then return jsonb_build_object('connected', false); end if;
  v_state := o.cf_state;
  foreach k in array array['apex','www'] loop
    select content::jsonb into v_resp from net._http_response where id = (o.cf_requests->>k)::bigint;
    if v_resp is not null then
      v_host := phase1._cf_host_of(v_resp);
      if v_host is not null then v_state := jsonb_set(v_state, array[k], v_host || jsonb_build_object('at', now())); end if;
    elsif o.cf_requests ? k and exists (select 1 from net.http_request_queue where id = (o.cf_requests->>k)::bigint) then
      v_req := jsonb_set(v_req, array[k], o.cf_requests->k);  -- still waiting for this reply
    end if;
  end loop;
  -- A hostname Cloudflare does not have (e.g. the create failed) is created again; otherwise look it up.
  foreach k in array array['apex','www'] loop
    if v_req ? k then continue; end if;
    if v_state->k->>'status' = 'missing' then
      v_req := jsonb_set(v_req, array[k], to_jsonb(net.http_post(url := phase1._cf_base(), body := jsonb_build_object('hostname', case when k = 'apex' then o.domain else 'www.' || o.domain end, 'ssl', jsonb_build_object('method','http','type','dv')), headers := phase1._cf_headers(), timeout_milliseconds := 15000)));
    else
      v_req := jsonb_set(v_req, array[k], to_jsonb(net.http_get(url := phase1._cf_base() || '?hostname=' || case when k = 'apex' then o.domain else 'www.' || o.domain end, headers := phase1._cf_headers(), timeout_milliseconds := 15000)));
    end if;
  end loop;
  v_live := (v_state->'apex'->>'status' = 'active' and v_state->'apex'->>'ssl' = 'active') or (v_state->'www'->>'status' = 'active' and v_state->'www'->>'ssl' = 'active');
  update phase1.agents set custom_domain_checked_at = now(),
    custom_domain_cf_id = coalesce(v_state->'apex'->>'id', custom_domain_cf_id),
    custom_domain_status = case when v_live then 'active' else custom_domain_status end
    where id = o.agent_id and custom_domain = o.domain;
  update phase1.domain_orders set cf_state = v_state, cf_requests = v_req, updated_at = now() where id = o.id;
  select custom_domain_status into v_status from phase1.agents where id = o.agent_id;
  return jsonb_build_object('connected', true, 'live', v_live, 'store_status', v_status, 'hosts', v_state);
end $$;

create or replace function phase1.admin_domain_complete(p_id uuid) returns void language plpgsql security definer set search_path to 'phase1','public' as $$
declare o phase1.domain_orders%rowtype;
begin
  if not phase1.caller_is_admin(null, true) then raise exception 'admin_required'; end if;
  select * into o from phase1.domain_orders where id = p_id and status in ('paid','registered') for update;
  if o.id is null then raise exception 'not_paid_or_not_found'; end if;
  update phase1.domain_orders set status = 'live', completed_at = now(), registered_at = coalesce(registered_at, now()),
    expires_at = coalesce(expires_at, (now() + (o.years || ' years')::interval)::date), updated_at = now() where id = o.id;
  -- Same kind + reference as the old "Mark registered", so an order can never be booked twice.
  perform phase1.finance_post('domain_registered', 'domain:' || o.id::text || ':registered', now(), o.price,
    jsonb_build_array(jsonb_build_object('account','domains_pending','amount', o.price), jsonb_build_object('account','domain_income','amount', -o.price)),
    'manual', null, 'Domain ' || o.domain || ' completed', jsonb_build_object('domain_order_id', o.id), auth.uid(), null);
end $$;

revoke all on function phase1.admin_domain_connect(uuid), phase1.admin_domain_refresh(uuid), phase1.admin_domain_complete(uuid) from public, anon;
grant execute on function phase1.admin_domain_connect(uuid), phase1.admin_domain_refresh(uuid), phase1.admin_domain_complete(uuid) to authenticated;

update phase1.finance_accounts set name = 'Domains paid, not yet completed' where code = 'domains_pending';

-- Paid domain: also alert admins' phones. Wrapped so an alert problem can never lose the payment.
CREATE OR REPLACE FUNCTION phase1.payment_events_domain_purchase()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'phase1', 'public'
AS $function$
declare v_intent phase1.payment_intents%rowtype; v_order phase1.domain_orders%rowtype; v_paid numeric; v_store text;
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
  perform phase1.finance_post('domain_paid', 'domain:' || v_order.id::text || ':paid', now(), v_order.price,
    jsonb_build_array(jsonb_build_object('account','paystack_transit','amount', v_intent.amount), jsonb_build_object('account','domains_pending','amount', -v_order.price), jsonb_build_object('account','fees_pending','amount', -(v_intent.amount - v_order.price))),
    'auto', null, 'Domain ' || v_order.domain || ' paid by agent', jsonb_build_object('domain_order_id', v_order.id), null, null);
  begin
    perform net.http_post('https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/agent-notify', jsonb_build_object('kind','domain_paid','domainOrderId', v_order.id), '{}'::jsonb,
      jsonb_build_object('Content-Type','application/json','x-yiego-internal-secret',(select value from phase1.internal_secrets where key='cron')), 15000);
    select store_name into v_store from phase1.agents where id = v_order.agent_id;
    perform phase1.admin_alert('domain_paid:' || v_order.id, 'Domain paid: ' || v_order.domain, coalesce(v_store, 'An agent') || ' paid GH₵ ' || to_char(v_order.price, 'FM999990.00') || '. Connect it in Admin → Domains.', '/admin/domains');
  exception when others then null;
  end;
  return new;
end $function$;
