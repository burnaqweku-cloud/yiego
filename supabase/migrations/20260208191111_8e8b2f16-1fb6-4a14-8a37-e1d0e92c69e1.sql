-- Fix orders status check constraint to include all statuses used in the payment pipeline
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('Pending', 'Pending Payment', 'Paid', 'Processing', 'Delivered', 'Failed', 'Cancelled'));