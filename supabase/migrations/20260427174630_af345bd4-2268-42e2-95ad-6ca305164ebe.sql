ALTER TABLE public.telegram_points_balances
  ADD COLUMN IF NOT EXISTS tier_notified_max_gb int NOT NULL DEFAULT 0;