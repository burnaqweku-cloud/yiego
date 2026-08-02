-- Disable Telegram bot polling cron (replaced by webhook push delivery).
-- Kept (not deleted) so it can be re-enabled as an emergency fallback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 10) THEN
    PERFORM cron.alter_job(job_id := 10, active := false);
  END IF;
END $$;
