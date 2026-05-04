DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'tg-admin-broadcast-runner';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'tg-admin-broadcast-runner',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://nrsfvhztpzwkadwciizp.supabase.co/functions/v1/tg-admin-broadcast-runner',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5yc2Z2aHp0cHp3a2Fkd2NpaXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTU5NzQsImV4cCI6MjA4NTg5MTk3NH0.DMke3rS3C27G-TdSdm24aVMfUIp0y4B1RlcWSV_S0cw"}'::jsonb,
      body := '{}'::jsonb
    );
    $job$
  );
END $$;