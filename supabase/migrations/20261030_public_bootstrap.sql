-- One page-start request instead of five or six (prices, networks, the two public agent settings, the public
-- contact block, the delivery-speed pills). SECURITY INVOKER: the caller's own row rules apply, so it returns exactly
-- what the separate reads returned before. Used by src/lib/bootstrap.ts to fill the browser request cache.
-- Applied live on 30 Oct 2026.
CREATE OR REPLACE FUNCTION phase1.public_bootstrap()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'phase1', 'public'
AS $function$
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'app_product_code', p.app_product_code, 'name', p.name, 'validity', p.validity,
        'capacity_gb', p.capacity_gb, 'customer_price', p.customer_price, 'network_id', p.network_id, 'is_paused', p.is_paused, 'pause_reason', p.pause_reason,
        'agent_price', p.agent_price, 'store_default_price', p.store_default_price) order by p.display_order)
      from phase1.data_products p where p.is_active = true), '[]'::jsonb),
    'networks', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'code', n.code, 'name', n.name, 'is_paused', n.is_paused, 'pause_reason', n.pause_reason))
      from phase1.networks n), '[]'::jsonb),
    'settings', coalesce((select jsonb_object_agg(s.key, s.value) from phase1.site_settings s where s.key in ('agents_launched','agent_plan')), '{}'::jsonb),
    'contact', (select to_jsonb(c) from (select business_name, whatsapp_number, whatsapp_message, support_email, business_hours, is_whatsapp_enabled from phase1.public_contact_settings limit 1) c),
    'speed', phase1.delivery_speed_by_network()
  );
$function$;
grant execute on function phase1.public_bootstrap() to anon, authenticated;
