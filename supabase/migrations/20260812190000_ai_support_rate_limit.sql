-- Rate-limit the public AI support chat.
--
-- ai-support's public_support action runs on the anon key with no user session,
-- so anyone holding the publishable key (it ships in the frontend bundle) could
-- call it in a loop, each request spending real Claude tokens. This adds a
-- per-IP + global limiter the edge function checks before calling the model.
create table if not exists phase1.ai_support_hits (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_support_hits_created_idx on phase1.ai_support_hits (created_at);
create index if not exists ai_support_hits_ip_idx on phase1.ai_support_hits (ip_hash, created_at);
alter table phase1.ai_support_hits enable row level security;

create or replace function phase1.ai_support_rate_check(p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_ip_window interval := interval '10 minutes';
  v_ip_limit int := 10;
  v_global_window interval := interval '1 hour';
  v_global_limit int := 200;
  v_ip_count int; v_global_count int;
begin
  delete from phase1.ai_support_hits where created_at < now() - v_global_window;
  select count(*) into v_ip_count from phase1.ai_support_hits where ip_hash = p_ip_hash and created_at >= now() - v_ip_window;
  select count(*) into v_global_count from phase1.ai_support_hits where created_at >= now() - v_global_window;
  if v_ip_count >= v_ip_limit then return jsonb_build_object('allowed', false, 'scope', 'ip', 'retry_after', 600); end if;
  if v_global_count >= v_global_limit then return jsonb_build_object('allowed', false, 'scope', 'global', 'retry_after', 300); end if;
  insert into phase1.ai_support_hits (ip_hash) values (p_ip_hash);
  return jsonb_build_object('allowed', true, 'ip_count', v_ip_count + 1, 'global_count', v_global_count + 1);
end;$$;

revoke all on function phase1.ai_support_rate_check(text) from public, anon, authenticated;
grant execute on function phase1.ai_support_rate_check(text) to service_role;
notify pgrst, 'reload schema';
