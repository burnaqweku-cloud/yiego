-- Support Brain phase 1: persistent support conversations + editable assistant voice.
--
-- Until now the AI chat lived only in the customer's browser tab: nothing was
-- stored, so a refresh erased the thread and the team could never see or join a
-- conversation. These tables become the backbone for the whole support rebuild:
-- every message (customer, assistant, later admin) lands here, and the
-- conversation row carries the status the engine routes on ('ai' answers,
-- 'human' waits for the team, 'closed' is done).
--
-- Access model: no anon/authenticated grants and no RLS policies on purpose.
-- All reads and writes go through the ai-support edge function (service role),
-- which authenticates guests by an unguessable conversation token — the same
-- bearer-token pattern as YG- order references — and signed-in users by JWT.

create table phase1.support_conversations (
  id uuid primary key default gen_random_uuid(),
  -- SC- + 32 hex chars of CSPRNG output: knowing the token is the credential.
  conversation_token text not null unique,
  -- Null for guests. When a guest signs in mid-conversation the engine claims
  -- the row, so the thread follows the account across devices.
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'ai' check (status in ('ai', 'human', 'closed')),
  -- Set when a member of the team takes the conversation over (phase 4).
  assigned_admin uuid references phase1.admin_users(user_id) on delete set null,
  handoff_reason text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_conversations_user_idx
  on phase1.support_conversations (user_id, last_message_at desc);
create index support_conversations_activity_idx
  on phase1.support_conversations (status, last_message_at desc);

create table phase1.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references phase1.support_conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'assistant', 'admin')),
  body text not null,
  -- For assistant messages: model, token usage, later knowledge/tools used.
  meta jsonb not null default '{}'::jsonb,
  -- Customer thumbs on assistant replies (phase 5 surfaces these for review).
  feedback text check (feedback in ('up', 'down')),
  created_at timestamptz not null default now()
);

create index support_messages_conversation_idx
  on phase1.support_messages (conversation_id, created_at);

-- The assistant's editable voice: greeting and tone/behaviour notes the owner
-- maintains in the admin, appended to the persona prompt on every reply. One
-- row only — the boolean primary key locked to true makes a second row
-- impossible.
create table phase1.ai_assistant_settings (
  id boolean primary key default true check (id),
  greeting text not null,
  persona_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into phase1.ai_assistant_settings (id, greeting, persona_notes) values (
  true,
  'Hi! I''m YieGo AI. Ask me anything about buying data, payments, your wallet or an order — I''m here all day, every day.',
  ''
);

alter table phase1.support_conversations enable row level security;
alter table phase1.support_messages enable row level security;
alter table phase1.ai_assistant_settings enable row level security;

grant all privileges on phase1.support_conversations to service_role;
grant all privileges on phase1.support_messages to service_role;
grant all privileges on phase1.ai_assistant_settings to service_role;

create trigger support_conversations_set_updated_at before update on phase1.support_conversations
  for each row execute function phase1.set_updated_at();
create trigger ai_assistant_settings_set_updated_at before update on phase1.ai_assistant_settings
  for each row execute function phase1.set_updated_at();

notify pgrst, 'reload schema';
