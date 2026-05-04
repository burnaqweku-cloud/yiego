-- Allow multiple case types per reference (payment_missing vs fulfillment_issue)
ALTER TABLE public.payment_reconciliation_cases DROP CONSTRAINT IF EXISTS payment_reconciliation_cases_paystack_reference_key;
DROP INDEX IF EXISTS idx_prc_reference;

-- Add unique constraint on (paystack_reference, reason) to allow multiple case types per ref
ALTER TABLE public.payment_reconciliation_cases ADD CONSTRAINT payment_reconciliation_cases_ref_reason_key UNIQUE (paystack_reference, reason);

-- Re-add non-unique index on reference for lookups
CREATE INDEX IF NOT EXISTS idx_prc_reference ON public.payment_reconciliation_cases (paystack_reference);