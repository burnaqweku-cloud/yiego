-- Disable Telegram bot polling cron (replaced by webhook push delivery).
-- Kept (not deleted) so it can be re-enabled as an emergency fallback.
SELECT cron.alter_job(job_id := 10, active := false);