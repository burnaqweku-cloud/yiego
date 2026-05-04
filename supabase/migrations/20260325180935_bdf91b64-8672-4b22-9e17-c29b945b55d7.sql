
-- Deduplicate wallet_transactions first, keeping the oldest entry per (reference, type)
DELETE FROM public.wallet_transactions a
USING public.wallet_transactions b
WHERE a.reference IS NOT NULL
  AND a.reference = b.reference
  AND a.type = b.type
  AND a.created_at > b.created_at;

-- Now create the unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_txn_unique_ref_type 
  ON public.wallet_transactions(reference, type) 
  WHERE reference IS NOT NULL;
