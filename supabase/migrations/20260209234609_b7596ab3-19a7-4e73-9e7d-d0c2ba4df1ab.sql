
-- Add processing_fee and total_paid columns to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS processing_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT NULL;

-- Add processing_fee and total_paid columns to agent_orders table
ALTER TABLE public.agent_orders
ADD COLUMN IF NOT EXISTS processing_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT NULL;

-- Add processing_fee and total_paid columns to paystack_payments table
ALTER TABLE public.paystack_payments
ADD COLUMN IF NOT EXISTS processing_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT NULL;

-- Add processing_fee column to wallet_transactions table
ALTER TABLE public.wallet_transactions
ADD COLUMN IF NOT EXISTS processing_fee numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_paid numeric DEFAULT NULL;
