-- Applied live 20 Oct 2026. Admin → SMS: settings, editable templates, per-type switches, admin RPCs.
begin;

create table if not exists phase1.sms_settings (
  id boolean primary key default true check (id),
  sender_id text not null default 'DTYEGO' check (sender_id ~ '^[A-Za-z0-9]{3,11}$'),
  purchase_enabled boolean not null default true,
  delivered_enabled boolean not null default true,
  verified_enabled boolean not null default true,
  store_orders_enabled boolean not null default true,
  on_way_max_hours integer not null default 48 check (on_way_max_hours between 1 and 720),
  test_numbers text[] not null default '{+233557375894,+233536529090,+233533533414}',
  credits_remaining integer, credits_updated_at timestamptz,
  updated_at timestamptz not null default now(), updated_by uuid
);
grant all on phase1.sms_settings to service_role;
revoke all on phase1.sms_settings from anon, authenticated;
alter table phase1.sms_settings enable row level security;
insert into phase1.sms_settings (id) values (true) on conflict do nothing;

create table if not exists phase1.sms_templates (
  kind text primary key check (kind in ('purchase','delivered','verified_delivered','verified_on_way')),
  body text not null check (length(body) between 1 and 306 and body !~ '[^\x20-\x7e]'),
  updated_at timestamptz not null default now(), updated_by uuid
);
grant all on phase1.sms_templates to service_role;
revoke all on phase1.sms_templates from anon, authenticated;
alter table phase1.sms_templates enable row level security;
insert into phase1.sms_templates (kind, body) values
 ('purchase', 'Thank you for your order on {brand}. Order ID: {ref}, {datetime}. Your {size} is being processed and will reach you shortly. {link}'),
 ('delivered', 'Your {size} order on {brand} is delivered. Order ID: {ref}, placed {datetime}. Thank you for choosing us. {link}'),
 ('verified_delivered', 'Congratulations, your number is verified on {brand}. Every order you purchase from now on goes through instantly. Your {size} from {date} is already delivered. We''re looking forward to see more orders from you. {link}'),
 ('verified_on_way', 'Congratulations, your number is verified on {brand}. Every order you purchase from now on goes through instantly. Your {size} from {date} is on its way. We''re looking forward to see more orders from you. {link}')
on conflict (kind) do nothing;

-- The text as sent, kept on the row so admins can read it back.
alter table phase1.order_sms_outbox add column if not exists message text;
create index if not exists order_sms_outbox_sent_idx on phase1.order_sms_outbox (created_at desc);

-- Per-type and store switches, honoured where texts are queued.
create or replace function phase1.enqueue_order_sms() returns trigger language plpgsql security definer set search_path='' as $$
declare s phase1.sms_settings%rowtype;
begin
 if not exists(select 1 from phase1.order_sms_control where enabled) then return new; end if;
 select * into s from phase1.sms_settings where id;
 if new.agent_id is not null and not coalesce(s.store_orders_enabled, true) then return new; end if;
 if new.payment_status::text='succeeded' then
  if coalesce(s.purchase_enabled, true) and (tg_op='INSERT' or old.payment_status::text is distinct from 'succeeded') then
   insert into phase1.order_sms_outbox(order_id,kind) values(new.id,'purchase') on conflict do nothing;
  end if;
  if coalesce(s.delivered_enabled, true) and new.status::text='delivered' and (tg_op='INSERT' or old.status::text is distinct from 'delivered') then
   insert into phase1.order_sms_outbox(order_id,kind) values(new.id,'delivered') on conflict do nothing;
  end if;
 end if;
 return new;
end $$;

create or replace function phase1.seed_verified_order_sms() returns integer language plpgsql security definer set search_path='' as $$
declare inserted integer; s phase1.sms_settings%rowtype;
begin
 if not exists(select 1 from phase1.order_sms_control where enabled) then return 0; end if;
 select * into s from phase1.sms_settings where id;
 if not coalesce(s.verified_enabled, true) then return 0; end if;
 insert into phase1.order_sms_outbox(order_id,kind)
 select distinct o.id,'verified' from phase1.orders o join phase1.networks n on n.id=o.network_id
 where lower(n.code)='mtn' and o.payment_status::text='succeeded'
 and (o.agent_id is null or coalesce(s.store_orders_enabled, true))
 and (o.status::text='delivered' or (o.status::text='processing' and o.admin_resolution_status is distinct from 'awaiting_verification' and (o.supplier_order_reference is not null or o.supplier_purchase_id is not null)))
 and exists(select 1 from phase1.order_events e where e.order_id=o.id and e.event_type in ('notification.verified_email_sent','supplier.number_approved','supplier.verification_cleared'))
 and not exists(select 1 from phase1.order_events e where e.order_id=o.id and e.event_type='notification.verified_sms_sent')
 on conflict do nothing;
 get diagnostics inserted=row_count; return inserted;
end $$;

-- ───────────── Admin RPCs (phase1.caller_is_admin) ─────────────

create or replace function phase1.admin_sms_settings() returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then (
    select jsonb_build_object(
      'enabled', (select enabled from phase1.order_sms_control where id),
      'activated_at', (select activated_at from phase1.order_sms_control where id),
      'test_passed_at', (select test_passed_at from phase1.order_sms_control where id),
      'sender_id', s.sender_id, 'purchase_enabled', s.purchase_enabled, 'delivered_enabled', s.delivered_enabled,
      'verified_enabled', s.verified_enabled, 'store_orders_enabled', s.store_orders_enabled, 'on_way_max_hours', s.on_way_max_hours,
      'test_numbers', to_jsonb(s.test_numbers), 'credits_remaining', s.credits_remaining, 'credits_updated_at', s.credits_updated_at,
      'updated_at', s.updated_at, 'updated_by', (select email from phase1.profiles where id = s.updated_by))
    from phase1.sms_settings s where s.id)
  else null end;
$$;

create or replace function phase1.admin_sms_save_settings(p jsonb) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare nums text[];
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  select array_agg(n) into nums from (select distinct regexp_replace(x, '[^0-9+]', '', 'g') n from jsonb_array_elements_text(coalesce(p->'test_numbers','[]'::jsonb)) x) t where n ~ '^\+233[0-9]{9}$';
  update phase1.sms_settings set
    sender_id = coalesce(nullif(trim(p->>'sender_id'),''), sender_id),
    purchase_enabled = coalesce((p->>'purchase_enabled')::boolean, purchase_enabled),
    delivered_enabled = coalesce((p->>'delivered_enabled')::boolean, delivered_enabled),
    verified_enabled = coalesce((p->>'verified_enabled')::boolean, verified_enabled),
    store_orders_enabled = coalesce((p->>'store_orders_enabled')::boolean, store_orders_enabled),
    on_way_max_hours = coalesce((p->>'on_way_max_hours')::integer, on_way_max_hours),
    test_numbers = coalesce(nums, test_numbers),
    updated_at = now(), updated_by = auth.uid()
  where id;
  return phase1.admin_sms_settings();
end $$;

-- Master switch. Turning on needs a passed test (same rule as activation).
create or replace function phase1.admin_sms_toggle(p_on boolean) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  if p_on then
    update phase1.order_sms_control set enabled=true, activated_at=coalesce(activated_at, now()) where id and test_passed_at is not null;
    if not found then raise exception 'test_required'; end if;
  else
    update phase1.order_sms_control set enabled=false where id;
  end if;
  return phase1.admin_sms_settings();
end $$;

create or replace function phase1.admin_sms_templates() returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then coalesce((
    select jsonb_agg(jsonb_build_object('kind', t.kind, 'body', t.body, 'updated_at', t.updated_at, 'updated_by', (select email from phase1.profiles where id = t.updated_by)) order by array_position(array['purchase','delivered','verified_delivered','verified_on_way'], t.kind))
    from phase1.sms_templates t), '[]'::jsonb) else null end;
$$;

create or replace function phase1.admin_sms_save_template(p_kind text, p_body text) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare b text := regexp_replace(coalesce(p_body,''), '\s+', ' ', 'g'); ph text;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  b := trim(b);
  if b = '' then raise exception 'empty'; end if;
  if b ~ '[^\x20-\x7e]' then raise exception 'plain_text_only'; end if;
  if length(b) > 306 then raise exception 'too_long'; end if;
  for ph in select m[1] from regexp_matches(b, '\{([^}]*)\}', 'g') m loop
    if ph not in ('brand','link','size','ref','datetime','date') then raise exception 'unknown_placeholder: %', ph; end if;
  end loop;
  insert into phase1.sms_templates (kind, body, updated_by) values (p_kind, b, auth.uid())
  on conflict (kind) do update set body = excluded.body, updated_at = now(), updated_by = auth.uid();
  return phase1.admin_sms_templates();
end $$;

create or replace function phase1.admin_sms_overview() returns jsonb language sql security definer set search_path to 'phase1','public' as $$
  select case when phase1.caller_is_admin() then jsonb_build_object(
    'settings', phase1.admin_sms_settings(),
    'today', (select jsonb_build_object('queued', count(*) filter (where status in ('pending','sending')), 'sent', count(*) filter (where status='sent'),
       'delivered', count(*) filter (where delivery_status='delivered'), 'not_delivered', count(*) filter (where delivery_status in ('not_delivered','failed')),
       'failed', count(*) filter (where status in ('failed','uncertain')), 'skipped', count(*) filter (where status='skipped'))
       from phase1.order_sms_outbox where created_at >= date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'),
    'week', (select jsonb_build_object('sent', count(*) filter (where status='sent'), 'delivered', count(*) filter (where delivery_status='delivered'),
       'not_delivered', count(*) filter (where delivery_status in ('not_delivered','failed')), 'failed', count(*) filter (where status in ('failed','uncertain')))
       from phase1.order_sms_outbox where created_at >= now() - interval '7 days'),
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from phase1.order_sms_outbox where status='sent' and created_at >= now() - interval '7 days' group by kind) k),
    'attention', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'status', x.status, 'delivery_status', x.delivery_status, 'reason', coalesce(x.delivery_reason, x.reason),
        'phone', o.recipient_phone, 'order_reference', o.order_reference, 'at', coalesce(x.sent_at, x.claimed_at, x.created_at)) order by coalesce(x.sent_at, x.claimed_at, x.created_at) desc), '[]'::jsonb)
       from (select * from phase1.order_sms_outbox where status in ('failed','uncertain') or delivery_status in ('not_delivered','failed') order by coalesce(sent_at, claimed_at, created_at) desc limit 20) x
       join phase1.orders o on o.id = x.order_id)
  ) else null end;
$$;

create or replace function phase1.admin_sms_messages(p_kind text default null, p_status text default null, p_delivery text default null, p_phone text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare rows_ jsonb; total_ bigint; ph text := nullif(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), '');
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  if ph is not null and ph like '233%' then ph := '0' || substr(ph, 4); end if;
  with f as (
    select x.*, o.recipient_phone, o.order_reference, a.store_name
    from phase1.order_sms_outbox x join phase1.orders o on o.id = x.order_id left join phase1.agents a on a.id = o.agent_id
    where (p_kind is null or x.kind = p_kind)
      and (p_status is null or x.status = p_status)
      and (p_delivery is null or (p_delivery = 'none' and x.delivery_status is null) or x.delivery_status = p_delivery)
      and (ph is null or o.recipient_phone like '%' || ph || '%')
      and (p_from is null or x.created_at >= p_from) and (p_to is null or x.created_at < p_to)
  )
  select c.c, r.rows into total_, rows_
  from (select count(*) c from f) c
  left join lateral (
    select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'status', f.status, 'reason', f.reason, 'delivery_status', f.delivery_status, 'delivery_reason', f.delivery_reason,
      'delivery_checked_at', f.delivery_checked_at, 'phone', f.recipient_phone, 'order_reference', f.order_reference, 'store_name', f.store_name, 'message', f.message,
      'created_at', f.created_at, 'sent_at', f.sent_at, 'attempts', f.attempts, 'provider_job_id', f.provider_job_id, 'requeueable', (f.status in ('failed','uncertain') and f.provider_job_id is null))
      order by f.created_at desc), '[]'::jsonb) as rows
    from (select * from f order by created_at desc limit greatest(1, least(coalesce(p_limit,50), 200)) offset greatest(0, coalesce(p_offset,0))) f
  ) r on true;
  return jsonb_build_object('rows', coalesce(rows_, '[]'::jsonb), 'total', coalesce(total_, 0));
end $$;

-- Re-queue one text. Only a text Vynfy never accepted (no task id) may go again; anything else could double-send.
create or replace function phase1.admin_sms_requeue(p_id uuid) returns jsonb language plpgsql security definer set search_path to 'phase1','public' as $$
declare x phase1.order_sms_outbox%rowtype;
begin
  if not phase1.caller_is_admin() then raise exception 'admin_required'; end if;
  select * into x from phase1.order_sms_outbox where id = p_id for update;
  if x.id is null then raise exception 'not_found'; end if;
  if x.status not in ('failed','uncertain') or x.provider_job_id is not null then raise exception 'not_requeueable'; end if;
  update phase1.order_sms_outbox set status='pending', reason=null, claim_token=null, claimed_at=null where id = p_id;
  insert into phase1.order_events (order_id, event_type, message, metadata) values (x.order_id, 'notification.sms_requeued', 'Admin re-queued the ' || x.kind || ' text', jsonb_build_object('notification_id', x.id, 'by', auth.uid()));
  return jsonb_build_object('ok', true);
end $$;

revoke all on function phase1.admin_sms_settings(), phase1.admin_sms_save_settings(jsonb), phase1.admin_sms_toggle(boolean), phase1.admin_sms_templates(), phase1.admin_sms_save_template(text,text), phase1.admin_sms_overview(), phase1.admin_sms_messages(text,text,text,text,timestamptz,timestamptz,integer,integer), phase1.admin_sms_requeue(uuid) from public, anon;
grant execute on function phase1.admin_sms_settings(), phase1.admin_sms_save_settings(jsonb), phase1.admin_sms_toggle(boolean), phase1.admin_sms_templates(), phase1.admin_sms_save_template(text,text), phase1.admin_sms_overview(), phase1.admin_sms_messages(text,text,text,text,timestamptz,timestamptz,integer,integer), phase1.admin_sms_requeue(uuid) to authenticated, service_role;

commit;
