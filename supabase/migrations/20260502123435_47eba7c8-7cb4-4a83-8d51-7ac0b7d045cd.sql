-- ─── SECURITY HARDENING ─────────────────────────────────────────────
-- Revoke EXECUTE from anon + authenticated on sensitive SECURITY DEFINER
-- functions that are intended ONLY for service-role callers (the Telegram
-- bot edge functions). The previous default GRANT TO PUBLIC made them
-- callable directly via the anon key, which would allow a client to mint
-- arbitrary points or wipe balances.

REVOKE EXECUTE ON FUNCTION public.grant_telegram_points_v2(bigint, integer, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_telegram_referral_v2(uuid, text, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_telegram_referral(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_telegram_inactive_points(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_telegram_referral_rewarded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_telegram_expiry_warning_sent(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_telegram_on_delivered() FROM PUBLIC, anon, authenticated;

-- Ensure service_role + postgres still have it (defensive, idempotent).
GRANT EXECUTE ON FUNCTION public.grant_telegram_points_v2(bigint, integer, text, text, uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.claim_telegram_referral_v2(uuid, text, uuid, bigint) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.claim_telegram_referral(uuid, text, uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.expire_telegram_inactive_points(integer, integer) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.mark_telegram_referral_rewarded(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.mark_telegram_expiry_warning_sent(uuid) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.notify_telegram_on_delivered() TO service_role, postgres;