-- Step 1: Drop old constraints
ALTER TABLE public.admin_support_tickets DROP CONSTRAINT IF EXISTS admin_support_tickets_issue_type_check;
ALTER TABLE public.admin_support_tickets DROP CONSTRAINT IF EXISTS admin_support_tickets_reference_type_check;

-- Step 2: Migrate existing data to new values
UPDATE public.admin_support_tickets SET reference_type = 'order' WHERE reference_type = 'order_id';
UPDATE public.admin_support_tickets SET reference_type = 'deposit' WHERE reference_type = 'deposit_id';
UPDATE public.admin_support_tickets SET reference_type = 'none' WHERE reference_type = 'paystack_reference';
-- Remove old issue types no longer used
UPDATE public.admin_support_tickets SET issue_type = 'other' WHERE issue_type IN ('wrong_number', 'refund_request');

-- Step 3: Add new constraints with correct values
ALTER TABLE public.admin_support_tickets ADD CONSTRAINT admin_support_tickets_issue_type_check
  CHECK (issue_type = ANY (ARRAY[
    'deposit_not_reflected'::text,
    'order_not_delivered'::text,
    'order_not_created'::text,
    'wallet_issue'::text,
    'account_issue'::text,
    'other'::text
  ]));

ALTER TABLE public.admin_support_tickets ADD CONSTRAINT admin_support_tickets_reference_type_check
  CHECK (reference_type = ANY (ARRAY[
    'deposit'::text,
    'order'::text,
    'wallet'::text,
    'account'::text,
    'payment_investigation'::text,
    'none'::text
  ]));