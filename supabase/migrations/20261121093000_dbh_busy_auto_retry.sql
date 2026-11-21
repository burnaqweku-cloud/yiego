-- DataBundlesHub takes one purchase at a time per account. When two of our orders reach it in the same second it
-- refuses one with 409 ACCOUNT_BUSY_RETRY "Another purchase is already processing for this account. Please retry
-- shortly." and charges nothing (checked against its balance on 20 Nov 2026: YG-E36FC8DFAD and YG-3EE4C791C9 each sat
-- 13 hours in Needs review). That is a "try again in a moment", not a failure (owner, 21 Nov 2026: "Yes" to retrying
-- by itself). Like the MTN-approval trigger, this turns the failure back into processing with a retry time a few
-- seconds away; sync-dbh-order-status (every minute) re-sends it through fulfillOrder, which takes a fresh
-- idempotency key after a clear refusal and claims the order first, so it can never be bought twice.
-- At most MAX_TRIES automatic re-sends per order (counted by event); after that it stays in Needs review.

create or replace function phase1.orders_supplier_busy_retry()
returns trigger language plpgsql as $$
declare v_tries int; v_at timestamptz; v_supplier text;
begin
  if new.status = 'failed_needs_review' and new.payment_status = 'succeeded'
     and new.failure_reason ~* 'another purchase is already processing'
     and new.supplier_purchase_id is null and new.supplier_order_reference is null
     and (old.status is distinct from new.status or old.failure_reason is distinct from new.failure_reason) then
    select count(*) into v_tries from phase1.order_events e where e.order_id = new.id and e.event_type = 'supplier.busy_retry';
    if v_tries < 10 then
      select s.name into v_supplier from phase1.suppliers s where s.id = new.supplier_id;
      v_at := now() + interval '20 seconds';
      new.status := 'processing';
      new.failure_reason := null;
      new.supplier_retry_after := v_at;
      insert into phase1.order_events (order_id, event_type, from_status, to_status, message, metadata)
      values (new.id, 'supplier.busy_retry', old.status, 'processing',
              coalesce(v_supplier, 'The supplier') || ' was busy with another of our orders and charged nothing. Sending again automatically within a minute (attempt ' || (v_tries + 1) || ' of 10).',
              jsonb_build_object('supplier', new.supplier_id, 'retry_at', v_at, 'attempt', v_tries + 1));
    end if;
  end if;
  return new;
end $$;

create trigger zz_orders_busy_retry_trg before update on phase1.orders for each row execute function phase1.orders_supplier_busy_retry();
