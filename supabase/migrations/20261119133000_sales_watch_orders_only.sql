-- Sales watch, the owner's way (19 Nov 2026, 13:53 Lagos): one alert only, "no order within 30 minutes during busy
-- hours". The delivery-stall alert is gone (owner: slow delivery is known and general, don't alert on it), and the
-- quiet spell is measured on orders (data orders and checker/AFA orders, any way of paying), not on card/MoMo payments.
-- 08:00-21:00 Ghana time, never during maintenance, one alert per quiet spell. Settings: site_settings 'sales_watch'.
update phase1.site_settings set value = '{"enabled": true, "minutes": 30, "from_hour": 8, "to_hour": 21}'::jsonb, updated_at = now()
where key = 'sales_watch';

create or replace function phase1.sales_watch_run()
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare
  s jsonb; v_now_gh timestamp := now() at time zone 'Africa/Accra'; v_open_start timestamp;
  v_from int; v_to int; v_min int; v_last timestamptz; v_gap int;
begin
  select value into s from phase1.site_settings where key = 'sales_watch';
  if s is null or not coalesce((s->>'enabled')::boolean, false) then return jsonb_build_object('skipped', 'off'); end if;
  if coalesce((select (value->'maintenance'->>'enabled')::boolean from phase1.site_settings where key = 'agent_plan'), false) then
    return jsonb_build_object('skipped', 'maintenance'); end if;
  v_from := coalesce((s->>'from_hour')::int, 8); v_to := coalesce((s->>'to_hour')::int, 21);
  v_min := greatest(coalesce((s->>'minutes')::int, 30), 10);
  if extract(hour from v_now_gh) < v_from or extract(hour from v_now_gh) >= v_to then return jsonb_build_object('skipped', 'outside_hours'); end if;
  v_open_start := date_trunc('day', v_now_gh) + make_interval(hours => v_from);

  select greatest((select max(created_at) from phase1.orders where created_at > now() - interval '2 days'),
                  (select max(created_at) from phase1.service_orders where created_at > now() - interval '2 days')) into v_last;
  v_gap := floor(extract(epoch from now() - coalesce(v_last, now() - interval '2 days')) / 60);
  -- The quiet stretch must lie inside today's hours, so the early-morning lull never counts.
  if v_gap >= v_min and v_now_gh - make_interval(mins => v_min) >= v_open_start then
    perform phase1.admin_alert('silence:' || to_char(coalesce(v_last, now()), 'YYYYMMDDHH24MISS'),
      'No new order for ' || v_gap || ' minutes',
      'Nobody has placed an order since ' || coalesce(to_char(v_last at time zone 'Africa/Accra', 'HH24:MI'), 'yesterday') || ' Ghana time. Check that buying works.',
      '/admin/orders');
    return jsonb_build_object('minutes_since_order', v_gap, 'alert', true);
  end if;
  return jsonb_build_object('minutes_since_order', v_gap);
end $$;
revoke all on function phase1.sales_watch_run() from public, anon, authenticated;
