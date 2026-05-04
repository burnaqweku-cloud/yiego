
-- Add description field to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Add payment method and detailed supplier response fields to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'direct';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_order_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_message text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_amount numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_remaining_balance numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS supplier_timestamp timestamp with time zone;
