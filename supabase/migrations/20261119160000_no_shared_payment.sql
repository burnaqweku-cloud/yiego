-- 19 Nov 2026 (owner): "Ask another DataYego user to pay" is removed. 8 shared orders ever (29 Sep - 18 Nov), one
-- paid, by its own creator. The site no longer offers it; this stops the server from opening an order to another
-- payer (order-payment-action "share" / pay by a non-owner both rely on payment_arrangement = 'shared'), so an
-- order is only ever paid by whoever placed it. Old rows keep their value for history.
create or replace function phase1.no_new_shared_payment()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.payment_arrangement::text = 'shared' and old.payment_arrangement::text is distinct from 'shared' then
    new.payment_arrangement := old.payment_arrangement;
  end if;
  return new;
end $$;
drop trigger if exists no_new_shared_payment_trg on phase1.orders;
create trigger no_new_shared_payment_trg before update of payment_arrangement on phase1.orders
  for each row execute function phase1.no_new_shared_payment();

-- The chat helpers' knowledge: no more paying for someone else's order; an unpaid order never blocks a new one.
update phase1.ai_knowledge set is_active = false, updated_at = now() where id = 'f68a683f-40ac-4723-9b44-22c1d335f422';
update phase1.ai_knowledge set title = 'Continue or replace an unpaid order',
  content = 'An order that was started but not paid shows as Waiting for payment. Signed in, open Buy data → Pending orders to continue or cancel it. There is no need to cancel first: buying again for the same number closes the unpaid order by itself and the new order goes through. Only an order that is already paid and still on its way holds the number until it is delivered. Each order is paid by the person who placed it, from the wallet or by Mobile Money or card. Unpaid orders expire on their own.',
  updated_at = now() where id = 'f27637c5-f93a-4653-9df7-487ea327448e';
