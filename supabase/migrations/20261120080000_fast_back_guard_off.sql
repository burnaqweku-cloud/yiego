-- 20 Nov 2026 08:00 (owner): "Don't do any speed check that can actually cause them to stop ... just let the SMS keep
-- sending." The fast_back texts were moved to start at 07:57 Ghana (owner: start now), one a minute until ~17:48, and
-- the pause-if-slow catch was switched off (applied directly with cron.unschedule('fast-back-guard')). The function
-- phase1.fast_back_guard() is left in place but nothing calls it.
select 1;
