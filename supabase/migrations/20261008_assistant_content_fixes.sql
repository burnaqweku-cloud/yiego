-- 2026-10-08 — assistant content fixes (help_articles + ai_knowledge).
-- Applied: 2 (knowledge insert), 3 (menu line), order-stages update.
-- NOT APPLIED: the customer-says-no-data update below kept being cancelled by the
-- approval prompt. Run it in the Supabase SQL editor. Safe to re-run.

-- 1. No "within 15 minutes" promise for agents.
update phase1.help_articles
set body = replace(replace(body,
  '- **In progress** — it''s on its way. Most deliver within 15 minutes.',
  '- **In progress** — paid and on its way. Delivery is automatic; the Orders page shows the moment it lands.'),
  'If it''s been more than an hour on **In progress**, or you think something is wrong',
  'If an order has stayed on **In progress** far longer than your other orders today, or you think something is wrong')
where slug = 'customer-says-no-data';

update phase1.help_articles
set body = replace(body,
  '**In progress** — paid and on its way. Most orders deliver within a few minutes.',
  '**In progress** — paid and on its way. Delivery is automatic and you''ll see it flip to Delivered on Orders.')
where slug = 'order-stages';

-- 2. Agents cannot refund.
insert into phase1.ai_knowledge (category, title, content)
select 'Agents', 'Agents cannot refund customers',
  'There is no refund button in the agent dashboard and agents never refund customers themselves. Refunds are given only by the DataYego team and only when a bundle cannot be delivered (wrong network that cannot be corrected, or a supplier failure). What an agent does when a customer wants a refund: open Customers → Orders, find the order, check its stage, and if it is stuck or failed send the Order ID and the customer''s number to DataYego on WhatsApp (+233 20 997 5451). A delivered bundle cannot be reversed, even if the customer typed the wrong number. Orders In progress or Being verified by MTN are not refunded; they deliver automatically.'
where not exists (select 1 from phase1.ai_knowledge where title = 'Agents cannot refund customers');

-- 3. Menu line after the rename (Chat assistant under Team & support, Store assistant under More).
update phase1.ai_knowledge
set content = replace(replace(content,
  'Team & support (Store assistant, Support buttons, Staff)',
  'Team & support (Chat assistant, Support buttons, Staff)'),
  'More (Invite & earn, Help Center)',
  'More (Store assistant, Invite & earn, Help Center)')
where title = 'Agent help and where to find things';
