-- Drop the existing check constraint and add the new one with "Pending Approval"
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (
  status = ANY (ARRAY[
    'Pending'::text,
    'Pending Payment'::text,
    'Pending Approval'::text,
    'Paid'::text,
    'Processing'::text,
    'Delivered'::text,
    'Failed'::text,
    'Cancelled'::text
  ])
);