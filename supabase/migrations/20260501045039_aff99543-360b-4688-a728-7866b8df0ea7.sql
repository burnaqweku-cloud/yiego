ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.agent_orders DROP CONSTRAINT IF EXISTS agent_orders_status_check;

UPDATE public.orders SET status = 'Reprocessed' WHERE status = 'Reprocessing';
UPDATE public.agent_orders SET status = 'Reprocessed' WHERE status = 'Reprocessing';

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'Pending'::text, 'Pending Payment'::text, 'Pending Approval'::text,
    'Paid'::text, 'Processing'::text, 'Reprocessed'::text,
    'Delivered'::text, 'Failed'::text, 'Cancelled'::text, 'Voided'::text
  ]));

ALTER TABLE public.agent_orders ADD CONSTRAINT agent_orders_status_check
  CHECK (status = ANY (ARRAY[
    'Pending'::text, 'Pending Payment'::text, 'Pending Approval'::text,
    'Paid'::text, 'Processing'::text, 'Reprocessed'::text,
    'Delivered'::text, 'Failed'::text, 'Cancelled'::text, 'Voided'::text
  ]));