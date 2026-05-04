-- Allow new 'Reprocessing' status on orders and agent_orders.
-- Existing rows untouched. Admin manual updates remain unrestricted.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'Pending'::text, 'Pending Payment'::text, 'Pending Approval'::text,
    'Paid'::text, 'Processing'::text, 'Reprocessing'::text,
    'Delivered'::text, 'Failed'::text, 'Cancelled'::text, 'Voided'::text
  ]));

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.agent_orders'::regclass
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%status%';

  IF v_def IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.agent_orders DROP CONSTRAINT IF EXISTS agent_orders_status_check';
    EXECUTE $sql$ALTER TABLE public.agent_orders ADD CONSTRAINT agent_orders_status_check
      CHECK (status = ANY (ARRAY[
        'Pending'::text, 'Pending Payment'::text, 'Pending Approval'::text,
        'Paid'::text, 'Processing'::text, 'Reprocessing'::text,
        'Delivered'::text, 'Failed'::text, 'Cancelled'::text, 'Voided'::text
      ]))$sql$;
  END IF;
END $$;