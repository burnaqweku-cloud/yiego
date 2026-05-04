ALTER TABLE public.payment_intents
ADD COLUMN IF NOT EXISTS fulfilled_by text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS fulfillment_error text DEFAULT NULL;