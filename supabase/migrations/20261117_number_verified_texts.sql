-- "Your number is now verified" texts for numbers MTN approved that never had a paid order (17 Nov 2026).
-- Applied live 17 Nov 2026. The owner asked for them after DBH approved every number submitted before 9 Nov.
--   * phase1.number_verified_texts holds one row per number with its finished text. A number that tried to buy in an
--     agent's store gets that store's own address; one that tried on our site gets datayego.com; one that only checked
--     its number (we don't know whether that was in a store) gets no address at all, so our name never reaches a store's
--     customer.
--   * phase1.number_verified_drip() runs every 2 minutes (cron number-verified-drip), 8:00-20:00 Ghana time, and puts ONE
--     text in sms_queue only when the previous one has gone, so they never leave in a burst and an agent's approval text
--     never waits behind the whole list (its slot is 5 minutes after the last waiting text). service-pay sends them
--     (sender Dyverify) and records delivery like every queued text. A number that has bought since is skipped.
create table if not exists phase1.number_verified_texts (
  p9 text primary key, phone text not null, message text not null, origin text not null,
  created_at timestamptz not null default now(), queued_at timestamptz, skipped text);
alter table phase1.number_verified_texts enable row level security;
revoke all on table phase1.number_verified_texts from public, anon, authenticated;

create or replace function phase1.number_verified_drip() returns text
language plpgsql security definer set search_path to 'phase1', 'public' as $$
declare r record; h int := extract(hour from now() at time zone 'Africa/Accra');
begin
  if h < 8 or h >= 20 then return 'night'; end if;
  if exists (select 1 from phase1.sms_queue where kind = 'number_verified' and status = 'pending') then return 'waiting'; end if;
  for r in select * from phase1.number_verified_texts where queued_at is null and skipped is null order by created_at, p9 limit 1 for update skip locked loop
    if exists (select 1 from phase1.orders o where right(regexp_replace(coalesce(o.recipient_phone, ''), '\D', '', 'g'), 9) = r.p9 and o.payment_status::text = 'succeeded') then
      update phase1.number_verified_texts set skipped = 'bought_since' where p9 = r.p9; return 'skipped';
    end if;
    insert into phase1.sms_queue (kind, phone, message, sender, dedupe_key) values ('number_verified', r.phone, r.message, 'Dyverify', 'number_verified:' || r.p9)
      on conflict (dedupe_key) do nothing;
    update phase1.number_verified_texts set queued_at = now() where p9 = r.p9;
    return 'queued';
  end loop;
  return 'done';
end $$;
revoke all on function phase1.number_verified_drip() from public, anon, authenticated;

insert into phase1.number_verified_texts (p9, phone, message, origin)
select sn.p9, phase1.service_norm_phone(sn.msisdn),
  'Your number is now verified. Every order to this number now goes through instantly. Thank you!' ||
    case when st.slug is not null then ' ' || coalesce(st.domain, st.slug || '.datayego.com') when mainx then ' datayego.com' else '' end,
  case when st.slug is not null then 'store:' || st.slug when mainx then 'main' else 'checked_only' end
from (select distinct on (right(regexp_replace(msisdn, '\D', '', 'g'), 9)) right(regexp_replace(msisdn, '\D', '', 'g'), 9) p9, msisdn
      from phase1.submitted_numbers where status = 'approved' order by right(regexp_replace(msisdn, '\D', '', 'g'), 9), approved_at desc) sn
cross join lateral (select exists (select 1 from phase1.orders o where right(regexp_replace(coalesce(o.recipient_phone, ''), '\D', '', 'g'), 9) = sn.p9 and o.agent_id is null) as mainx) m
left join lateral (select a.slug, case when a.custom_domain_status = 'active' then a.custom_domain end as domain
      from phase1.orders o join phase1.agents a on a.id = o.agent_id
      where right(regexp_replace(coalesce(o.recipient_phone, ''), '\D', '', 'g'), 9) = sn.p9 order by o.created_at desc limit 1) st on true
where phase1.service_norm_phone(sn.msisdn) is not null
  and not exists (select 1 from phase1.orders o where right(regexp_replace(coalesce(o.recipient_phone, ''), '\D', '', 'g'), 9) = sn.p9 and o.payment_status::text = 'succeeded')
on conflict (p9) do nothing;

select cron.schedule('number-verified-drip', '*/2 * * * *', $job$select phase1.number_verified_drip()$job$);
