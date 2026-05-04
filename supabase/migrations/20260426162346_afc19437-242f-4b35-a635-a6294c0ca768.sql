-- Singleton state row for getUpdates offset
create table if not exists public.telegram_bot_state (
  id int primary key check (id = 1),
  update_offset bigint not null default 0,
  last_polled_at timestamptz not null default now()
);
insert into public.telegram_bot_state (id, update_offset)
  values (1, 0)
  on conflict (id) do nothing;

alter table public.telegram_bot_state enable row level security;
create policy "Admins can read telegram bot state"
  on public.telegram_bot_state for select
  to authenticated
  using (public.is_admin());

-- Telegram chat ↔ user linking
create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text,
  username text,
  first_name text,
  linked_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_telegram_links_user on public.telegram_links(user_id);

alter table public.telegram_links enable row level security;
create policy "Users can view own telegram link"
  on public.telegram_links for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- OTP table for /start verification
create table if not exists public.telegram_link_otps (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  phone text not null,
  otp_code text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_telegram_otps_chat on public.telegram_link_otps(chat_id, expires_at desc);

alter table public.telegram_link_otps enable row level security;
create policy "Admins can view telegram OTPs"
  on public.telegram_link_otps for select
  to authenticated
  using (public.is_admin());

-- Per-chat conversation state (for multi-step flows like /buy)
create table if not exists public.telegram_sessions (
  chat_id bigint primary key,
  state text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.telegram_sessions enable row level security;
create policy "Admins can view telegram sessions"
  on public.telegram_sessions for select
  to authenticated
  using (public.is_admin());

-- Paystack payment intents originating from Telegram
create table if not exists public.telegram_payment_intents (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  user_id uuid references auth.users(id) on delete set null,
  paystack_reference text not null unique,
  purpose text not null check (purpose in ('order','deposit')),
  product_id uuid,
  recipient_phone text,
  network text,
  bundle_size_gb numeric,
  base_amount numeric,
  total_payable numeric,
  status text not null default 'pending' check (status in ('pending','success','failed','notified')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_telegram_intents_ref on public.telegram_payment_intents(paystack_reference);
create index if not exists idx_telegram_intents_chat on public.telegram_payment_intents(chat_id);

alter table public.telegram_payment_intents enable row level security;
create policy "Admins can view telegram intents"
  on public.telegram_payment_intents for select
  to authenticated
  using (public.is_admin());