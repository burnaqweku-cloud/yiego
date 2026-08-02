-- YieGo Phase 1 clean schema
-- This schema intentionally lives under `phase1` so it does not collide with
-- historical prototype tables already present in this project.

create extension if not exists "pgcrypto";

create schema if not exists phase1;

create type phase1.user_status as enum ('active', 'suspended', 'deleted');
create type phase1.wallet_status as enum ('active', 'locked', 'closed');
create type phase1.ledger_direction as enum ('credit', 'debit');
create type phase1.ledger_type as enum ('deposit', 'purchase', 'refund', 'adjustment');
create type phase1.ledger_status as enum ('pending', 'posted', 'failed', 'reversed');
create type phase1.order_status as enum (
  'created',
  'awaiting_payment',
  'paid',
  'processing',
  'pending_supplier',
  'delivered',
  'failed',
  'failed_needs_review',
  'refunded',
  'cancelled'
);
create type phase1.payment_status as enum ('created', 'pending', 'succeeded', 'failed', 'abandoned', 'refunded');
create type phase1.payment_provider as enum ('paystack');
create type phase1.payment_purpose as enum ('guest_data_purchase', 'wallet_deposit');
create type phase1.supplier_status as enum ('active', 'paused', 'disabled');
create type phase1.supplier_call_status as enum ('success', 'error', 'timeout');

create or replace function phase1.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table phase1.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  status phase1.user_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.admin_user_roles (
  user_id uuid not null references phase1.admin_users(user_id) on delete cascade,
  role_id uuid not null references phase1.admin_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create or replace function phase1.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = phase1, public
as $$
  select exists (
    select 1
    from phase1.admin_users au
    where au.user_id = check_user_id
      and au.is_active = true
  );
$$;

create table phase1.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'GHS',
  balance numeric(12, 2) not null default 0 check (balance >= 0),
  status phase1.wallet_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.networks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  supplier_code text,
  is_active boolean not null default true,
  is_paused boolean not null default false,
  pause_reason text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  base_url text,
  status phase1.supplier_status not null default 'active',
  balance numeric(12, 2),
  balance_currency text default 'GHS',
  low_balance_threshold numeric(12, 2) not null default 100,
  last_balance_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.data_products (
  id uuid primary key default gen_random_uuid(),
  app_product_code text unique,
  network_id uuid not null references phase1.networks(id),
  name text not null,
  capacity_gb numeric(10, 2) not null check (capacity_gb > 0),
  capacity_mb integer not null check (capacity_mb > 0),
  validity text,
  customer_price numeric(12, 2) not null check (customer_price >= 0),
  cost_price numeric(12, 2) check (cost_price is null or cost_price >= 0),
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.supplier_product_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references phase1.data_products(id) on delete cascade,
  supplier_id uuid not null references phase1.suppliers(id),
  supplier_network_code text not null,
  supplier_capacity text not null,
  supplier_price numeric(12, 2),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, supplier_id)
);

create table phase1.orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  guest_email text,
  guest_phone text,
  recipient_phone text not null,
  network_id uuid references phase1.networks(id),
  product_id uuid references phase1.data_products(id),
  supplier_id uuid references phase1.suppliers(id),
  quantity integer not null default 1 check (quantity > 0),
  amount numeric(12, 2) not null check (amount >= 0),
  cost_amount numeric(12, 2) check (cost_amount is null or cost_amount >= 0),
  currency text not null default 'GHS',
  status phase1.order_status not null default 'created',
  payment_status phase1.payment_status not null default 'created',
  wallet_ledger_entry_id uuid,
  paystack_reference text,
  supplier_order_reference text,
  supplier_purchase_id text,
  supplier_transaction_reference text,
  supplier_status text,
  supplier_idempotency_key text unique,
  number_verification_result jsonb,
  failure_reason text,
  admin_resolution_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table phase1.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references phase1.wallets(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  direction phase1.ledger_direction not null,
  type phase1.ledger_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  balance_before numeric(12, 2) not null check (balance_before >= 0),
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  status phase1.ledger_status not null default 'posted',
  reference text not null unique,
  order_id uuid references phase1.orders(id) on delete set null,
  payment_intent_id uuid,
  note text,
  created_at timestamptz not null default now()
);

alter table phase1.orders
  add constraint orders_wallet_ledger_entry_id_fkey
  foreign key (wallet_ledger_entry_id) references phase1.wallet_ledger_entries(id) on delete set null;

create table phase1.payment_intents (
  id uuid primary key default gen_random_uuid(),
  provider phase1.payment_provider not null default 'paystack',
  purpose phase1.payment_purpose not null,
  status phase1.payment_status not null default 'created',
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references phase1.orders(id) on delete set null,
  wallet_id uuid references phase1.wallets(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'GHS',
  provider_reference text not null unique,
  authorization_url text,
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table phase1.wallet_ledger_entries
  add constraint wallet_ledger_entries_payment_intent_id_fkey
  foreign key (payment_intent_id) references phase1.payment_intents(id) on delete set null;

create table phase1.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid references phase1.payment_intents(id) on delete set null,
  provider phase1.payment_provider not null default 'paystack',
  event_type text not null,
  provider_reference text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_type, provider_reference)
);

create table phase1.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references phase1.orders(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table phase1.supplier_api_logs (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references phase1.suppliers(id) on delete set null,
  order_id uuid references phase1.orders(id) on delete set null,
  action text not null,
  endpoint text not null,
  request_payload jsonb,
  response_payload jsonb,
  http_status integer,
  call_status phase1.supplier_call_status not null,
  supplier_reference text,
  idempotency_key text,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table phase1.webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  external_reference text,
  signature text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now(),
  unique (source, event_type, external_reference)
);

create table phase1.number_verifications (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  normalized_phone text,
  supplier_id uuid references phase1.suppliers(id) on delete set null,
  supplier_network text,
  servable boolean,
  recommendation text,
  message text,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table phase1.supplier_health_checks (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references phase1.suppliers(id) on delete cascade,
  check_type text not null,
  status text not null,
  balance numeric(12, 2),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table phase1.admin_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references phase1.orders(id) on delete cascade,
  customer_user_id uuid references auth.users(id) on delete set null,
  author_user_id uuid references auth.users(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

create table phase1.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_value jsonb,
  after_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index profiles_email_idx on phase1.profiles (email);
create index orders_user_id_idx on phase1.orders (user_id);
create index orders_status_idx on phase1.orders (status);
create index orders_recipient_phone_idx on phase1.orders (recipient_phone);
create index orders_supplier_order_reference_idx on phase1.orders (supplier_order_reference);
create index orders_paystack_reference_idx on phase1.orders (paystack_reference);
create index wallet_ledger_entries_wallet_id_idx on phase1.wallet_ledger_entries (wallet_id, created_at desc);
create index payment_intents_order_id_idx on phase1.payment_intents (order_id);
create index supplier_api_logs_order_id_idx on phase1.supplier_api_logs (order_id, created_at desc);
create index order_events_order_id_idx on phase1.order_events (order_id, created_at);
create index webhook_events_source_reference_idx on phase1.webhook_events (source, external_reference);

create trigger profiles_set_updated_at before update on phase1.profiles
  for each row execute function phase1.set_updated_at();
create trigger admin_roles_set_updated_at before update on phase1.admin_roles
  for each row execute function phase1.set_updated_at();
create trigger admin_users_set_updated_at before update on phase1.admin_users
  for each row execute function phase1.set_updated_at();
create trigger wallets_set_updated_at before update on phase1.wallets
  for each row execute function phase1.set_updated_at();
create trigger networks_set_updated_at before update on phase1.networks
  for each row execute function phase1.set_updated_at();
create trigger suppliers_set_updated_at before update on phase1.suppliers
  for each row execute function phase1.set_updated_at();
create trigger data_products_set_updated_at before update on phase1.data_products
  for each row execute function phase1.set_updated_at();
create trigger supplier_product_mappings_set_updated_at before update on phase1.supplier_product_mappings
  for each row execute function phase1.set_updated_at();
create trigger orders_set_updated_at before update on phase1.orders
  for each row execute function phase1.set_updated_at();
create trigger payment_intents_set_updated_at before update on phase1.payment_intents
  for each row execute function phase1.set_updated_at();

create or replace function phase1.credit_wallet_deposit(
  p_payment_intent_id uuid,
  p_provider_reference text
)
returns void
language plpgsql
security definer
set search_path = phase1, public
as $$
declare
  v_payment phase1.payment_intents%rowtype;
  v_wallet phase1.wallets%rowtype;
  v_existing_ledger_id uuid;
begin
  select *
  into v_payment
  from phase1.payment_intents
  where id = p_payment_intent_id
  for update;

  if not found then
    raise exception 'payment_intent_not_found';
  end if;

  if v_payment.purpose <> 'wallet_deposit' then
    raise exception 'payment_intent_is_not_wallet_deposit';
  end if;

  select id
  into v_existing_ledger_id
  from phase1.wallet_ledger_entries
  where payment_intent_id = v_payment.id
    and type = 'deposit'
    and status = 'posted'
  limit 1;

  if v_existing_ledger_id is not null then
    update phase1.payment_intents
    set status = 'succeeded',
        verified_at = coalesce(verified_at, now()),
        updated_at = now()
    where id = v_payment.id;

    return;
  end if;

  select *
  into v_wallet
  from phase1.wallets
  where id = v_payment.wallet_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  insert into phase1.wallet_ledger_entries (
    wallet_id,
    user_id,
    direction,
    type,
    amount,
    balance_before,
    balance_after,
    status,
    reference,
    payment_intent_id,
    note
  )
  values (
    v_wallet.id,
    v_wallet.user_id,
    'credit',
    'deposit',
    v_payment.amount,
    v_wallet.balance,
    v_wallet.balance + v_payment.amount,
    'posted',
    p_provider_reference,
    v_payment.id,
    'Paystack wallet deposit'
  );

  update phase1.wallets
  set balance = balance + v_payment.amount,
      updated_at = now()
  where id = v_wallet.id;

  update phase1.payment_intents
  set status = 'succeeded',
      verified_at = now(),
      updated_at = now()
  where id = v_payment.id;
end;
$$;

create or replace function phase1.create_wallet_data_order(
  p_user_id uuid,
  p_product_code text,
  p_recipient_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = phase1, public
as $$
declare
  v_wallet phase1.wallets%rowtype;
  v_product phase1.data_products%rowtype;
  v_network phase1.networks%rowtype;
  v_mapping phase1.supplier_product_mappings%rowtype;
  v_order_id uuid;
  v_order_reference text;
  v_ledger_reference text;
  v_balance_after numeric(12, 2);
begin
  if p_recipient_phone !~ '^0[0-9]{9}$' then
    raise exception 'invalid_recipient_phone';
  end if;

  select *
  into v_wallet
  from phase1.wallets
  where user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if p_product_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select *
    into v_product
    from phase1.data_products
    where id = p_product_code::uuid
      and is_active = true;
  else
    select *
    into v_product
    from phase1.data_products
    where app_product_code = p_product_code
      and is_active = true;
  end if;

  if not found then
    raise exception 'product_not_found';
  end if;

  select *
  into v_network
  from phase1.networks
  where id = v_product.network_id
    and is_active = true;

  if not found then
    raise exception 'network_not_available';
  end if;

  if v_network.is_paused then
    raise exception 'network_paused';
  end if;

  select *
  into v_mapping
  from phase1.supplier_product_mappings
  where product_id = v_product.id
    and is_active = true
  limit 1;

  if not found then
    raise exception 'supplier_mapping_not_found';
  end if;

  if v_wallet.balance < v_product.customer_price then
    raise exception 'insufficient_wallet_balance';
  end if;

  v_order_id := gen_random_uuid();
  v_order_reference := 'YG-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_ledger_reference := 'YGW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_balance_after := v_wallet.balance - v_product.customer_price;

  insert into phase1.orders (
    id,
    order_reference,
    user_id,
    recipient_phone,
    network_id,
    product_id,
    supplier_id,
    amount,
    cost_amount,
    currency,
    status,
    payment_status,
    supplier_idempotency_key
  )
  values (
    v_order_id,
    v_order_reference,
    p_user_id,
    p_recipient_phone,
    v_product.network_id,
    v_product.id,
    v_mapping.supplier_id,
    v_product.customer_price,
    v_product.cost_price,
    'GHS',
    'paid',
    'succeeded',
    gen_random_uuid()::text
  );

  insert into phase1.wallet_ledger_entries (
    wallet_id,
    user_id,
    direction,
    type,
    amount,
    balance_before,
    balance_after,
    status,
    reference,
    order_id,
    note
  )
  values (
    v_wallet.id,
    p_user_id,
    'debit',
    'purchase',
    v_product.customer_price,
    v_wallet.balance,
    v_balance_after,
    'posted',
    v_ledger_reference,
    v_order_id,
    'Wallet data purchase'
  );

  update phase1.wallets
  set balance = v_balance_after,
      updated_at = now()
  where id = v_wallet.id;

  update phase1.orders
  set wallet_ledger_entry_id = (
    select id
    from phase1.wallet_ledger_entries
    where reference = v_ledger_reference
  )
  where id = v_order_id;

  insert into phase1.order_events (
    order_id,
    event_type,
    from_status,
    to_status,
    message,
    metadata
  )
  values (
    v_order_id,
    'wallet.purchase_debited',
    'created',
    'paid',
    'Wallet debited for data purchase',
    jsonb_build_object(
      'ledgerReference', v_ledger_reference,
      'balanceAfter', v_balance_after
    )
  );

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderReference', v_order_reference,
    'ledgerReference', v_ledger_reference,
    'balanceAfter', v_balance_after
  );
end;
$$;

create or replace function phase1.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = phase1, public
as $$
begin
  insert into phase1.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  insert into phase1.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_phase1 on auth.users;
create trigger on_auth_user_created_phase1
  after insert on auth.users
  for each row execute function phase1.handle_new_auth_user();

alter table phase1.profiles enable row level security;
alter table phase1.admin_roles enable row level security;
alter table phase1.admin_users enable row level security;
alter table phase1.admin_user_roles enable row level security;
alter table phase1.wallets enable row level security;
alter table phase1.networks enable row level security;
alter table phase1.suppliers enable row level security;
alter table phase1.data_products enable row level security;
alter table phase1.supplier_product_mappings enable row level security;
alter table phase1.orders enable row level security;
alter table phase1.wallet_ledger_entries enable row level security;
alter table phase1.payment_intents enable row level security;
alter table phase1.payment_events enable row level security;
alter table phase1.order_events enable row level security;
alter table phase1.supplier_api_logs enable row level security;
alter table phase1.webhook_events enable row level security;
alter table phase1.number_verifications enable row level security;
alter table phase1.supplier_health_checks enable row level security;
alter table phase1.admin_notes enable row level security;
alter table phase1.audit_logs enable row level security;

create policy "profiles_read_own" on phase1.profiles
  for select to authenticated using (id = auth.uid() or phase1.is_admin());
create policy "profiles_update_own" on phase1.profiles
  for update to authenticated using (id = auth.uid() or phase1.is_admin()) with check (id = auth.uid() or phase1.is_admin());

create policy "wallets_read_own" on phase1.wallets
  for select to authenticated using (user_id = auth.uid() or phase1.is_admin());

create policy "ledger_read_own" on phase1.wallet_ledger_entries
  for select to authenticated using (user_id = auth.uid() or phase1.is_admin());

create policy "orders_read_own" on phase1.orders
  for select to authenticated using (user_id = auth.uid() or phase1.is_admin());

create policy "payment_intents_read_own" on phase1.payment_intents
  for select to authenticated using (user_id = auth.uid() or phase1.is_admin());

create policy "order_events_read_own" on phase1.order_events
  for select to authenticated using (
    phase1.is_admin()
    or exists (
      select 1 from phase1.orders o
      where o.id = order_events.order_id
        and o.user_id = auth.uid()
    )
  );

create policy "networks_public_active_read" on phase1.networks
  for select to anon, authenticated using (is_active = true);
create policy "data_products_public_active_read" on phase1.data_products
  for select to anon, authenticated using (is_active = true);

create policy "admin_roles_admin_all" on phase1.admin_roles
  for all to authenticated using (phase1.is_admin()) with check (phase1.is_admin());
create policy "admin_users_admin_read" on phase1.admin_users
  for select to authenticated using (phase1.is_admin());
create policy "admin_user_roles_admin_all" on phase1.admin_user_roles
  for all to authenticated using (phase1.is_admin()) with check (phase1.is_admin());
create policy "suppliers_admin_all" on phase1.suppliers
  for all to authenticated using (phase1.is_admin()) with check (phase1.is_admin());
create policy "supplier_product_mappings_admin_all" on phase1.supplier_product_mappings
  for all to authenticated using (phase1.is_admin()) with check (phase1.is_admin());
create policy "supplier_api_logs_admin_read" on phase1.supplier_api_logs
  for select to authenticated using (phase1.is_admin());
create policy "webhook_events_admin_read" on phase1.webhook_events
  for select to authenticated using (phase1.is_admin());
create policy "number_verifications_admin_read" on phase1.number_verifications
  for select to authenticated using (phase1.is_admin());
create policy "supplier_health_checks_admin_read" on phase1.supplier_health_checks
  for select to authenticated using (phase1.is_admin());
create policy "admin_notes_admin_all" on phase1.admin_notes
  for all to authenticated using (phase1.is_admin()) with check (phase1.is_admin());
create policy "audit_logs_admin_read" on phase1.audit_logs
  for select to authenticated using (phase1.is_admin());

insert into phase1.admin_roles (name, description, permissions)
values (
  'owner',
  'Full access to Phase 1 operations, pricing, suppliers, wallets, refunds, and audit logs.',
  '{"all": true}'::jsonb
)
on conflict (name) do nothing;

insert into phase1.suppliers (code, name, base_url, status, low_balance_threshold, metadata)
values (
  'datamartgh',
  'DataMartGH',
  'https://api.datamartgh.shop/api/developer',
  'active',
  100,
  '{"phase": 1, "notes": "First launch supplier"}'::jsonb
)
on conflict (code) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  updated_at = now();

insert into phase1.networks (code, name, supplier_code, display_order)
values
  ('mtn', 'MTN', 'YELLO', 10),
  ('telecel', 'Telecel', 'TELECEL', 20),
  ('airteltigo', 'AirtelTigo', 'AT_PREMIUM', 30)
on conflict (code) do update set
  name = excluded.name,
  supplier_code = excluded.supplier_code,
  display_order = excluded.display_order,
  updated_at = now();

with product_seed (app_product_code, network_code, name, capacity_gb, capacity_mb, validity, customer_price, cost_price, display_order) as (
  values
    ('mtn-1', 'mtn', 'MTN Data — 1GB', 1, 1024, '30 days', 6.00, 4.00, 10),
    ('mtn-2', 'mtn', 'MTN Data — 2GB', 2, 2048, '30 days', 11.00, 9.00, 20),
    ('mtn-5', 'mtn', 'MTN Data — 5GB', 5, 5120, '30 days', 26.00, 23.00, 30),
    ('mtn-10', 'mtn', 'MTN Data — 10GB', 10, 10240, '30 days', 48.00, null, 40),
    ('mtn-20', 'mtn', 'MTN Data — 20GB', 20, 20480, '30 days', 90.00, null, 50),
    ('mtn-50', 'mtn', 'MTN Data — 50GB', 50, 51200, '90 days', 200.00, null, 60),
    ('tel-1', 'telecel', 'Telecel Data — 1GB', 1, 1024, '30 days', 5.00, null, 10),
    ('tel-3', 'telecel', 'Telecel Data — 3GB', 3, 3072, '30 days', 14.00, null, 20),
    ('tel-6', 'telecel', 'Telecel Data — 6GB', 6, 6144, '30 days', 27.00, null, 30),
    ('tel-12', 'telecel', 'Telecel Data — 12GB', 12, 12288, '30 days', 50.00, null, 40),
    ('tel-25', 'telecel', 'Telecel Data — 25GB', 25, 25600, '60 days', 100.00, null, 50),
    ('at-1', 'airteltigo', 'AirtelTigo Data — 1GB', 1, 1024, '30 days', 5.00, null, 10),
    ('at-2', 'airteltigo', 'AirtelTigo Data — 2GB', 2, 2048, '30 days', 9.00, null, 20),
    ('at-5', 'airteltigo', 'AirtelTigo Data — 5GB', 5, 5120, '30 days', 22.00, null, 30),
    ('at-10', 'airteltigo', 'AirtelTigo Data — 10GB', 10, 10240, '30 days', 42.00, null, 40),
    ('at-30', 'airteltigo', 'AirtelTigo Data — 30GB', 30, 30720, '60 days', 110.00, null, 50)
),
upserted_products as (
  insert into phase1.data_products (
    app_product_code,
    network_id,
    name,
    capacity_gb,
    capacity_mb,
    validity,
    customer_price,
    cost_price,
    display_order
  )
  select
    ps.app_product_code,
    n.id,
    ps.name,
    ps.capacity_gb,
    ps.capacity_mb,
    ps.validity,
    ps.customer_price,
    ps.cost_price,
    ps.display_order
  from product_seed ps
  join phase1.networks n on n.code = ps.network_code
  on conflict (app_product_code) do update set
    network_id = excluded.network_id,
    name = excluded.name,
    capacity_gb = excluded.capacity_gb,
    capacity_mb = excluded.capacity_mb,
    validity = excluded.validity,
    customer_price = excluded.customer_price,
    cost_price = excluded.cost_price,
    display_order = excluded.display_order,
    updated_at = now()
  returning id, app_product_code, capacity_gb
)
insert into phase1.supplier_product_mappings (
  product_id,
  supplier_id,
  supplier_network_code,
  supplier_capacity,
  supplier_price
)
select
  p.id,
  s.id,
  n.supplier_code,
  trim(trailing '.' from trim(trailing '0' from p.capacity_gb::text)),
  p.cost_price
from phase1.data_products p
join phase1.networks n on n.id = p.network_id
join phase1.suppliers s on s.code = 'datamartgh'
where p.app_product_code is not null
on conflict (product_id, supplier_id) do update set
  supplier_network_code = excluded.supplier_network_code,
  supplier_capacity = excluded.supplier_capacity,
  supplier_price = excluded.supplier_price,
  updated_at = now();
