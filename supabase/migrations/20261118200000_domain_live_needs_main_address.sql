-- Applied live 18 Nov 2026 (owner): a store's own domain counts as live only when the main address (mbundle.shop) works.
-- Before, www alone was enough, so the page could say "Live" while the address customers type still failed.
-- Also returns www_only so the page can say "www works, the main address doesn't yet".
CREATE OR REPLACE FUNCTION phase1.admin_domain_refresh(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'phase1', 'public'
AS $function$
declare o phase1.domain_orders%rowtype; v_state jsonb; v_req jsonb := '{}'::jsonb; k text; v_resp jsonb; v_host jsonb; v_live boolean := false; v_www boolean := false; v_status text;
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
  v_live := coalesce(v_state->'apex'->>'status' = 'active' and v_state->'apex'->>'ssl' = 'active', false);
  v_www := coalesce(v_state->'www'->>'status' = 'active' and v_state->'www'->>'ssl' = 'active', false);
  update phase1.agents set custom_domain_checked_at = now(),
    custom_domain_cf_id = coalesce(v_state->'apex'->>'id', custom_domain_cf_id),
    custom_domain_status = case when v_live then 'active' else custom_domain_status end
    where id = o.agent_id and custom_domain = o.domain;
  update phase1.domain_orders set cf_state = v_state, cf_requests = v_req, updated_at = now() where id = o.id;
  select custom_domain_status into v_status from phase1.agents where id = o.agent_id;
  return jsonb_build_object('connected', true, 'live', v_live, 'www_only', v_www and not v_live, 'store_status', v_status, 'hosts', v_state);
end $function$;
