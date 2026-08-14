-- Support Brain phase 2: the trainable knowledge base.
--
-- Until now everything the assistant "knew" was hardcoded in the ai-support
-- function's prompt — changing a fact meant a code deploy. This table makes
-- knowledge data: the team adds, corrects and disables entries in the admin
-- Knowledge manager, and the assistant reads the active set into its system
-- prompt (behind a prompt-cache breakpoint) on every reply. Seeded from the
-- customer FAQ so the assistant starts already knowing how YieGo works.
--
-- Access model: same as the conversation tables — no anon/authenticated
-- grants, no RLS policies. All reads and writes go through the ai-support
-- edge function, which enforces admin auth for management actions.

create table phase1.ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  content text not null,
  is_active boolean not null default true,
  -- Presentation order inside a category, both in the admin and in the prompt.
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_knowledge_active_idx
  on phase1.ai_knowledge (is_active, category, sort_order, created_at);

alter table phase1.ai_knowledge enable row level security;
grant all privileges on phase1.ai_knowledge to service_role;

create trigger ai_knowledge_set_updated_at before update on phase1.ai_knowledge
  for each row execute function phase1.set_updated_at();

-- Seed: the live customer FAQ (src/data/faq.ts), one entry per question.
insert into phase1.ai_knowledge (category, title, content, sort_order) values
  ('Buying data', 'Which networks can I buy data for?', 'MTN, Telecel and AirtelTigo. You choose the network first, then the bundle, then the number receiving the data.', 10),
  ('Buying data', 'How long does delivery take?', 'Most orders are delivered within minutes of payment clearing. The order is sent to the network automatically — nobody has to process it by hand. If a network is slow, the order stays visible with its status until it completes.', 20),
  ('Buying data', 'Can I buy data for someone else?', 'Yes. Enter their number as the recipient. You can buy for family, friends or customers — the data goes to the number you enter, not to your own line.', 30),
  ('Buying data', 'Do I need an account to buy?', 'No. You can check out as a guest and pay by Mobile Money or card. You will get a YieGo reference to track the order. Creating an account adds the wallet, saved details and full order history.', 40),
  ('Buying data', 'Can someone else pay for my order?', 'Yes. Create the order, then share the YieGo reference with another YieGo user and they can pay it for you. The recipient number and bundle are locked when the order is created, so payment cannot change what was ordered.', 50),
  ('Payments and wallet', 'How can I pay?', 'From your YieGo wallet balance, or directly by Mobile Money or card through Paystack. Guests pay by Mobile Money or card.', 60),
  ('Payments and wallet', 'What is the YieGo wallet?', 'A balance you top up once and spend across many orders. It makes buying faster — no re-entering payment details every time — and every credit and debit appears in your wallet statement.', 70),
  ('Payments and wallet', 'Is my payment secure?', 'Payments are processed by Paystack, and YieGo confirms every payment directly with Paystack''s servers before an order moves. Your wallet balance can only be changed by our server, never from the browser or app. YieGo never sees or stores your card details or Mobile Money PIN.', 80),
  ('Orders and problems', 'How do I track my order?', 'Every order gets a YieGo reference beginning with YG-. Enter it on the Track Order page to see payment and delivery status. If you have an account, all your orders are listed under Orders.', 90),
  ('Orders and problems', 'What if my data does not arrive?', 'Open the order and check its status first — some networks confirm a little later than others. If it still has not arrived, contact support with your YieGo reference and the team will trace it with the network.', 100),
  ('Orders and problems', 'Can I get a refund?', 'If an order fails and the data is never delivered, contact support with your reference and the team will resolve it. Our full refund terms are on the Refunds page.', 110),
  ('Orders and problems', 'I entered the wrong number — what now?', 'Contact support immediately with your YieGo reference. Once a bundle has been delivered to a number by the network it cannot be reversed, so reach out as fast as possible.', 120),
  ('Account and support', 'How do I create an account?', 'Choose Create account, enter your email and a password, and confirm your email address. You can then add your name and phone number in your account settings.', 130),
  ('Account and support', 'How do I get help?', 'The 24/7 AI assistant answers most questions instantly. For anything account-specific — a stuck order, a payment question, a dispute — contact the team on WhatsApp or by email with your YieGo reference.', 140),
  ('Account and support', 'How do I keep my account safe?', 'Never share your password, one-time code, card details or Mobile Money PIN with anyone — including anyone claiming to be from YieGo. Our team and the AI assistant will never ask you for them.', 150);

notify pgrst, 'reload schema';
