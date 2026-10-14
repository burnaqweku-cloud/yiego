-- Applied 14 Oct 2026 via Supabase MCP. Admin → Referrals showed 0 because phase1.referrals only had the
-- "own rows" read policy (referrer_id = auth.uid()); admins now read every row.
create policy referrals_admin_read on phase1.referrals for select to authenticated using (phase1.caller_is_admin());
