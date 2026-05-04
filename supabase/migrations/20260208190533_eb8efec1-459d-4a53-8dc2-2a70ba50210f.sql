-- Fix paystack_payments purpose check constraint to allow all 4 payment purposes
ALTER TABLE public.paystack_payments DROP CONSTRAINT IF EXISTS paystack_payments_purpose_check;
ALTER TABLE public.paystack_payments ADD CONSTRAINT paystack_payments_purpose_check 
  CHECK (purpose IN ('deposit', 'order', 'agent_order', 'agent_activation'));