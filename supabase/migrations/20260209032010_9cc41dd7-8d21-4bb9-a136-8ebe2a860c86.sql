-- Fix: Add 'agent_subscription' to the paystack_payments purpose check constraint
ALTER TABLE public.paystack_payments DROP CONSTRAINT paystack_payments_purpose_check;

ALTER TABLE public.paystack_payments ADD CONSTRAINT paystack_payments_purpose_check 
  CHECK (purpose = ANY (ARRAY['deposit'::text, 'order'::text, 'agent_order'::text, 'agent_activation'::text, 'agent_subscription'::text]));
