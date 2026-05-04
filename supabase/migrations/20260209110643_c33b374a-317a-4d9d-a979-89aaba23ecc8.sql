-- Add checkout_meta column to paystack_payments for storing order details before payment verification
ALTER TABLE public.paystack_payments ADD COLUMN checkout_meta jsonb;

COMMENT ON COLUMN public.paystack_payments.checkout_meta IS 'Stores order creation details for deferred order creation after payment verification';