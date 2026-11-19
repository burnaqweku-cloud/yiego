-- Sales watch (19 Nov 2026, owner: "if payments are not going through I should get an alert very fast").
-- payment_guard_run only notices payments that FAIL. Two things it cannot see, both alert the admins' phones:
--   1. Silence: nobody has started a card/MoMo payment for silence_minutes (default 45) during from_hour..to_hour
--      Ghana time (default 08:00-21:00). Measured on 3 weeks of data: payments start every 4-6 minutes in those hours;
--      a 45-minute gap happened about twice a week, a 30-minute one more than daily. One alert per quiet spell.
--   2. Stall: a network has delivered nothing for stall_minutes (default 60) while at least stall_min_waiting (3) paid
--      orders sit with a supplier (sent, not held for MTN verification; same rules as delivery_speed_by_network), the
--      oldest for stall_minutes or more. 19 Nov 2026: no MTN delivery 10:35-13:00 with 51 orders at DataBundlesHub; the
--      shop's speed pill told customers and sales stopped, and nobody was told. Reminder every 2 hours while it lasts.
-- Settings: site_settings 'sales_watch'. Never runs during maintenance.
insert into phase1.site_settings (key, value, updated_at)
values ('sales_watch', '{"enabled": true, "silence_minutes": 45, "stall_minutes": 60, "stall_min_waiting": 3, "from_hour": 8, "to_hour": 21}'::jsonb, now())
on conflict (key) do nothing;

create or replace function phase1.sales_watch_run()
returns jsonb language plpgsql security definer set search_path = phase1, public as $$
declare
  s jsonb; v_now_gh timestamp := now() at time zone 'Africa/Accra'; v_open_start timestamp;
  v_from int; v_to int; v_silence int; v_stall int; v_min_wait int;
  v_last timestamptz; v_gap int; v_wallet int; v_out jsonb := '{}'::jsonb; r record;
begin
  select value into s from phase1.site_settings where key = 'sales_watch';
  if s is null or not coalesce((s->>'enabled')::boolean, false) then return jsonb_build_object('skipped', 'off'); end if;
  if coalesce((select (value->'maintenance'->>'enabled')::boolean from phase1.site_settings where key = 'agent_plan'), false) then
    return jsonb_build_object('skipped', 'maintenance'); end if;
  v_from := coalesce((s->>'from_hour')::int, 8); v_to := coalesce((s->>'to_hour')::int, 21);
  v_silence := greatest(coalesce((s->>'silence_minutes')::int, 45), 15);
  v_stall := greatest(coalesce((s->>'stall_minutes')::int, 60), 20);
  v_min_wait := greatest(coalesce((s->>'stall_min_waiting')::int, 3), 1);
  if extract(hour from v_now_gh) < v_from or extract(hour from v_now_gh) >= v_to then return jsonb_build_object('skipped', 'outside_hours'); end if;
  v_open_start := date_trunc('day', v_now_gh) + make_interval(hours => v_from);

  -- 1. Silence. The quiet stretch must lie inside today's hours, so the early-morning lull never counts.
  select max(created_at) into v_last from phase1.payment_intents where created_at > now() - interval '2 days';
  v_gap := floor(extract(epoch from now() - coalesce(v_last, now() - interval '2 days')) / 60);
  v_out := v_out || jsonb_build_object('minutes_since_payment', v_gap);
  if v_gap >= v_silence and v_now_gh - make_interval(mins => v_silence) >= v_open_start then
    select count(*) into v_wallet from phase1.orders where created_at > coalesce(v_last, now() - interval '2 days');
    perform phase1.admin_alert('silence:' || to_char(coalesce(v_last, now()), 'YYYYMMDDHH24MISS'),
      'No payments for ' || v_gap || ' minutes',
      'Nobody has started a payment since ' || coalesce(to_char(v_last at time zone 'Africa/Accra', 'HH24:MI'), 'yesterday') || ' Ghana time. '
        || case when v_wallet > 0 then 'Wallet orders still came in (' || v_wallet || '), so checkout may be stuck.'
                else 'Could be a quiet spell: check that buying works and deliveries are moving.' end,
      '/admin/orders');
    v_out := v_out || jsonb_build_object('silence_alert', true);
  end if;

  -- 2. Stall, per network.
  for r in
    with w as (
      select o.network_id, n.name as network, o.paid_at, s2.name as supplier
      from phase1.orders o join phase1.networks n on n.id = o.network_id left join phase1.suppliers s2 on s2.id = o.supplier_id
      where o.payment_status = 'succeeded' and o.status in ('processing', 'pending_supplier') and o.paid_at > now() - interval '24 hours'
        and (o.supplier_order_reference is not null or o.supplier_purchase_id is not null)
        and lower(coalesce(o.supplier_status, '')) not in ('failed','rejected','cancelled','canceled','refunded','refund','not_approved')
        and coalesce(o.admin_resolution_status, '') not in ('awaiting_verification', 'wrong_network')
        and not exists (select 1 from phase1.order_events v where v.order_id = o.id and (v.message ilike '%verification%' or v.to_status = 'awaiting_verification')))
    select w.network_id, w.network, count(*) as waiting, min(w.paid_at) as oldest, mode() within group (order by w.supplier) as supplier,
      (select max(e.created_at) from phase1.order_events e join phase1.orders o2 on o2.id = e.order_id
        where o2.network_id = w.network_id and e.to_status = 'delivered' and e.created_at > now() - interval '24 hours') as last_delivery
    from w group by w.network_id, w.network
  loop
    v_gap := floor(extract(epoch from now() - greatest(coalesce(r.last_delivery, r.oldest), r.oldest)) / 60);
    v_out := v_out || jsonb_build_object(lower(r.network), jsonb_build_object('waiting', r.waiting, 'minutes_without_delivery', v_gap));
    if r.waiting >= v_min_wait and v_gap >= v_stall then
      perform phase1.admin_alert('stall:' || r.network || ':' || to_char(coalesce(r.last_delivery, r.oldest), 'YYYYMMDDHH24MI') || ':' || (v_gap / 120),
        r.network || ' deliveries have stopped',
        'No ' || r.network || ' order delivered since ' || coalesce(to_char(r.last_delivery at time zone 'Africa/Accra', 'HH24:MI'), 'this morning')
          || ' Ghana time. ' || r.waiting || ' paid orders waiting at ' || coalesce(r.supplier, 'the supplier')
          || ', oldest paid ' || to_char(r.oldest at time zone 'Africa/Accra', 'HH24:MI') || '.',
        '/admin/orders');
      v_out := v_out || jsonb_build_object('stall_alert_' || lower(r.network), true);
    end if;
  end loop;
  return v_out;
end $$;
revoke all on function phase1.sales_watch_run() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'sales-watch') then
    perform cron.schedule('sales-watch', '*/5 * * * *', 'select phase1.sales_watch_run()');
  end if;
end $$;
