-- Announcement emails to customers, sent by the server in small batches; and the notices of 13 Nov 2026.
-- Applied to the live database on 13 Nov 2026; this file is the record.
--
-- Until now an announcement could only be emailed to customers from the admin panel. The edge function announce-send
-- does it with the internal secret: the database lists who gets it once (never sub-agents, never an address that has
-- unsubscribed, and with p_skip_agents never paid agents), the function sends 60 and the database calls it again
-- until none are left. One row per announcement + address, so nothing is sent twice.

create table if not exists phase1.announcement_email_outbox (
  id bigserial primary key,
  announcement_id uuid not null references phase1.announcements(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts int not null default 0,
  last_error text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (announcement_id, email)
);
alter table phase1.announcement_email_outbox enable row level security;
revoke all on phase1.announcement_email_outbox from public, anon, authenticated;
grant select, insert, update on phase1.announcement_email_outbox to service_role;
grant usage, select on sequence phase1.announcement_email_outbox_id_seq to service_role;

create or replace function phase1.announcement_email_queue(p_id uuid, p_skip_agents boolean default false) returns int language plpgsql security definer set search_path = phase1, public as $$
declare n int;
begin
  if not exists (select 1 from phase1.announcement_email_outbox where announcement_id = p_id) then
    insert into phase1.announcement_email_outbox (announcement_id, email)
    select p_id, x.e from (
      select distinct lower(trim(p.email)) as e from phase1.profiles p
      where p.email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and p.email !~* '@guest\.datayego\.com$'
        and not exists (select 1 from phase1.agents a where a.user_id = p.id and a.parent_agent_id is not null)
        and not (coalesce(p_skip_agents, false) and exists (select 1 from phase1.agents a where a.user_id = p.id and a.parent_agent_id is null and a.paid_until is not null))
    ) x
    where not exists (select 1 from phase1.follow_up_optouts o where lower(trim(o.email)) = x.e)
    on conflict do nothing;
  end if;
  select count(*) into n from phase1.announcement_email_outbox where announcement_id = p_id and status = 'pending';
  return n;
end $$;

create or replace function phase1.announcement_email_claim(p_id uuid, p_limit int) returns table (id bigint, email text) language sql security definer set search_path = phase1, public as $$
  update phase1.announcement_email_outbox o set status = 'sending', claimed_at = now(), attempts = o.attempts + 1
  where o.id in (select x.id from phase1.announcement_email_outbox x where x.announcement_id = p_id and (x.status = 'pending' or (x.status = 'sending' and x.claimed_at < now() - interval '5 minutes'))
    order by x.id limit greatest(1, least(coalesce(p_limit, 60), 100)) for update skip locked)
  returning o.id, o.email $$;

create or replace function phase1.announcement_email_done(p_row bigint, p_ok boolean, p_error text) returns void language sql security definer set search_path = phase1, public as $$
  update phase1.announcement_email_outbox set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
    sent_at = case when p_ok then now() else sent_at end, last_error = case when p_ok then null else left(p_error, 200) end
  where id = p_row $$;

-- Called by the function after each batch: more to send -> call the function again; none -> mark the announcement emailed.
-- Only rows that can be picked up now are counted, so a batch that died cannot make this call itself in a tight loop.
create or replace function phase1.announcement_email_continue(p_id uuid, p_skip_agents boolean default false) returns int language plpgsql security definer set search_path = phase1, public as $$
declare n int;
begin
  select count(*) into n from phase1.announcement_email_outbox where announcement_id = p_id and (status = 'pending' or (status = 'sending' and claimed_at < now() - interval '5 minutes'));
  if n > 0 then
    perform net.http_post(url := 'https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/announce-send', body := jsonb_build_object('announcementId', p_id, 'skipAgents', coalesce(p_skip_agents, false)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-yiego-internal-secret', (select value from phase1.internal_secrets where key = 'cron')), timeout_milliseconds := 150000);
  else
    update phase1.announcements set emailed_at = now() where id = p_id and emailed_at is null;
  end if;
  return n;
end $$;

revoke all on function phase1.announcement_email_queue(uuid, boolean), phase1.announcement_email_claim(uuid, int), phase1.announcement_email_done(bigint, boolean, text), phase1.announcement_email_continue(uuid, boolean) from public, anon, authenticated;
grant execute on function phase1.announcement_email_queue(uuid, boolean), phase1.announcement_email_claim(uuid, int), phase1.announcement_email_done(bigint, boolean, text), phase1.announcement_email_continue(uuid, boolean) to service_role;

-- Tapping an announcement's phone notification opens the page the announcement links to, when that is a page of ours.
do $$
declare d text; a text; b text;
begin
  d := pg_get_functiondef('phase1.announcements_push_trigger()'::regprocedure);
  a := $a$case when new.audience = 'agents' then '/agent' else '/' end$a$;
  b := $a$case when new.link_url ~ '^/[A-Za-z0-9/_-]*$' then new.link_url when new.audience = 'agents' then '/agent' else '/' end$a$;
  if position(b in d) = 0 then
    if position(a in d) = 0 then raise exception 'announcements_push_trigger is not as expected'; end if;
    execute replace(d, a, b);
  end if;
end $$;

-- Sent the same day, on the owner's word (data, noted here so the record is complete; not repeated by this file):
--   * agents notice "Result checkers and AFA are now on sale in your store" (in-app, phone, email to 40 paid agents),
--     then given the agent prices in its in-app text;
--   * a notice in the bell of each of the 44 active stores, in the store's own voice (no DataYego name, no prices);
--   * the notice for everyone "New: result checkers and MTN AFA registration" (in-app, phone, email to customers).
