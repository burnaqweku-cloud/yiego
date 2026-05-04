# Telegram Bot Admin Panel — Plan Acknowledged

I've read the full brief and confirmed all hard constraints. This plan respects every one of them: zero edits to existing admin pages/layout, zero edits to existing bot edge functions (with one explicitly-flagged exception in Phase 5/8 — see "Bot read-path caveat" below), no schema changes to existing tables, all new tables prefixed `tg_admin_*`, every write RPC re-checks `is_admin()` and writes to `tg_admin_audit_log`. **Phase 1 is the starting point** and I'll stop after each phase for you to test.

## Confirmed context (from exploration)

- Existing admin uses `AdminLayout.tsx` with grouped sidebar (`navGroups`) gated by `useAuth().isAdmin`. The plan adds **one new group** `Telegram Bot` with 15 items — only `AdminLayout.tsx` is modified outside the new section, by appending one entry to the `navGroups` array. (You called this out as zero-touch; please confirm appending a sidebar group is acceptable. The alternative is a separate sidebar, which would feel non-native — not recommended.)
- Existing `AdminTelegramPoints.tsx` (the page at `/admin/telegram-points`) stays untouched and continues to live under the `Admin` group. The new Points page under `Telegram Bot` is a richer 4-tab replacement built fresh.
- Tables present: `telegram_links`, `telegram_sessions`, `telegram_referrals`, `telegram_checkins`, `telegram_points_balances`, `telegram_points_ledger`, `telegram_points_config`, `telegram_payment_intents`, `telegram_link_tokens`, `telegram_link_otps`, `telegram_bot_state`. RPCs present: `is_admin`, `admin_adjust_telegram_points`, `admin_set_telegram_points_ban`, `telegram_points_overview`, `telegram_points_top_earners`, `telegram_points_weekly_leaderboard`, `expire_telegram_inactive_points`, `mark_telegram_referral_rewarded`, `claim_telegram_referral`. These are all reused.
- Existing bot edge functions: `telegram-bot`, `telegram-webhook`, `telegram-points-worker`, `telegram-points-expiry-sweep`, `telegram-notify-admin`, `telegram-notify-customer`, `telegram-set-webhook`, `telegram-create-link-token`. **Zero touched.**
- All new edge functions live under `supabase/functions/tg-admin-*` per spec.

## Sidebar entry (Phase 1 only — only existing-file edit)

Appended to `navGroups` in `src/pages/admin/AdminLayout.tsx`:
```
Telegram Bot
  Dashboard, Users, Orders, Deposits, Points, Referrals, Check-ins,
  Redemptions, Support Tickets, Broadcasts, Promotions, Bot Health,
  Configuration, Audit Log, Reports
```
All 15 marked `adminOnly: true`. Routes registered in `src/App.tsx` under `/admin/tg/*` (so existing `/admin/telegram-points` is untouched). All routes wrapped in `<AdminRoute>`.

## Bot read-path caveat (will pause for your approval before Phase 5 Tab 3)

- Currently, `REFERRER_REWARD=400`, `REFEREE_REWARD=100` are hardcoded in `supabase/functions/telegram-points-worker/index.ts`.
- Daily check-in / streak / purchase-points rate / expiry window / referral-min-order — these live in code (in `_shared/telegram-bot-core.ts` and `telegram-points-expiry-sweep`).
- For Phase 5 Tab 3 ("bot reads settings live") to work, these few read-only lookups need to be added inside those bot files: a one-time helper `getTgAdminSetting(supa, key, default)` that reads from `tg_admin_settings`.
- **I will STOP at the start of Phase 5 Tab 3 and ask for explicit go-ahead** before adding the read path to bot files. Same for Phase 8 Configuration page (welcome/help/maintenance text strings). The admin panel will already store the values; the bot just needs to read them.

## Phased delivery (stop after each)

### Phase 1 — Foundation (placeholders + audit infra)
- New tables (migration):
  - `tg_admin_audit_log(id uuid pk, admin_user_id uuid, action text, target_type text, target_id text, details jsonb, ip_address inet, created_at timestamptz)` — RLS: admin-only SELECT, server-only INSERT
  - `tg_admin_settings(key text pk, value jsonb, updated_by uuid, updated_at timestamptz)` — RLS: admin-only
- New RPC: `log_tg_admin_action(p_action text, p_target_type text, p_target_id text, p_details jsonb)` — `SECURITY DEFINER`, asserts `is_admin()`, captures IP from `request.header('x-forwarded-for')` if present, returns log id.
- New RPC: `set_tg_admin_setting(p_key text, p_value jsonb)` — admin-gated, upsert, also writes to audit log.
- New files:
  - `src/pages/admin/tg/TgAdminLayout.tsx` — light wrapper over `AdminLayout` adding a sub-tab strip for the 15 pages (mirrors how `AdminAgents` sub-tabs work)
  - `src/pages/admin/tg/TgDashboard.tsx`, `TgUsers.tsx`, `TgOrders.tsx`, `TgDeposits.tsx`, `TgPoints.tsx`, `TgReferrals.tsx`, `TgCheckins.tsx`, `TgRedemptions.tsx`, `TgSupport.tsx`, `TgBroadcasts.tsx`, `TgPromotions.tsx`, `TgBotHealth.tsx`, `TgConfiguration.tsx`, `TgAuditLog.tsx`, `TgReports.tsx` — each renders inside `TgAdminLayout`, shows "Coming soon" card.
- Edits to existing files (Phase 1 only):
  - `src/pages/admin/AdminLayout.tsx` — append the new `Telegram Bot` nav group (additive, no other change)
  - `src/App.tsx` — register the 15 lazy routes under `/admin/tg/*` wrapped in `AdminRoute`
- **Stop. You verify navigation works and existing admin is unbroken.**

### Phase 2 — Dashboard
- New RPC `tg_admin_dashboard_kpis()` — single round-trip returning all stats cards' values.
- New RPC `tg_admin_recent_activity(p_limit int default 20)` — union of recent orders/deposits/redemptions/sign-ups from telegram tables.
- `TgDashboard.tsx` renders cards (existing `Card` component), feed table, and three quick-action buttons that link to Broadcasts/Support/Bot Health.
- Webhook status pulled from `tg-admin-webhook-info` edge function (calls `getWebhookInfo` via the connector, returns redacted info).

### Phase 3 — Users
- `TgUsers.tsx` list — server-paginated via new RPC `tg_admin_users_list(filters jsonb, p_page int, p_size int)` returning rows + total count.
- `TgUserDetail.tsx` at `/admin/tg/users/:chatId` — tabs (Activity / Orders / Deposits / Points / Redemptions / Referrals / Tickets / Session) each backed by a small RPC.
- Admin-actions panel calls existing RPCs:
  - Points adjust → existing `admin_adjust_telegram_points`
  - Ban → existing `admin_set_telegram_points_ban` + new `tg_admin_bans` table for full-bot ban (separate from points-only ban)
  - Force-unlink → new RPC `tg_admin_force_unlink(p_chat_id bigint, p_reason text)` (delete from `telegram_links`, audit-logged)
  - Reset session → new RPC `tg_admin_reset_session(p_chat_id bigint, p_reason text)`
  - Send custom message → new edge function `tg-admin-send-message` (admin-JWT-verified) that calls the shared `sendMessage` helper
- New table: `tg_admin_bans(chat_id bigint pk, banned_by uuid, reason text, banned_at timestamptz)` — RLS admin-only
- CSV export client-side from current page (server returns up to 1000 rows on demand).

### Phase 4 — Orders / Deposits / Redemptions
- Three list+detail pages built on the same generic `TgListView` helper component (new, lives only inside `src/pages/admin/tg/`).
- RPCs: `tg_admin_orders_list`, `tg_admin_order_detail`, plus deposits/redemptions equivalents. All admin-gated, paginated, filterable.
- Manual actions:
  - Retry delivery → new edge function `tg-admin-retry-order` that **calls the existing supplier dispatch helper** (read-only reuse of `_shared/supplier-dispatch.ts` — no edits)
  - Mark delivered → new RPC, audit-logged
  - Refund → new RPC `tg_admin_refund_order(p_order_id, p_destination, p_reason)` with three branches (Paystack refund call, wallet credit, points credit)

### Phase 5 — Points (4 tabs)
- Tab 1 Overview: reuses existing `telegram_points_overview` + new `tg_admin_points_suspicious()` heuristic RPC.
- Tab 2 Ledger: reads `telegram_points_ledger` directly (admin-gated SELECT policy already in place; verify and add if missing). Server-paginated via new RPC.
- Tab 3 Configuration:
  - Writes go to `tg_admin_settings` (keys: `referrer_reward`, `referee_reward`, `daily_checkin`, `streak_bonus`, `streak_interval_days`, `points_per_ghs`, `expiry_months`, `min_order_for_referral`, `redemption_table` jsonb).
  - Kill-switch toggles `telegram_points_config.points_system_enabled` via new RPC `tg_admin_set_kill_switch`.
  - **PAUSE BEFORE PATCHING BOT.** I report what bot files need the read-path helper added and wait for go-ahead.
- Tab 4 Manual Adjustment: form calls existing `admin_adjust_telegram_points` + audit-logs.

### Phase 6 — Referrals / Check-ins / Support Tickets
- Referrals: list view from `telegram_referrals` + new `tg_admin_referral_tree(p_chat_id)` recursive CTE. Manual actions wired to new RPCs `tg_admin_invalidate_referral`, `tg_admin_force_qualify_referral`, `tg_admin_reverse_referral`.
- Check-ins: heatmap from `telegram_checkins` aggregated via new RPC.
- Support Tickets: lists tickets where `ticket_metadata->>'channel' = 'telegram'` (read-only against existing `support_tickets_v2`). Reply via new edge function `tg-admin-ticket-reply` that posts to user's Telegram chat (no edits to existing AI ticket code).

### Phase 7 — Broadcasts & Promotions
- New tables:
  - `tg_admin_broadcasts(id, segment jsonb, message text, button_label text, button_url text, status text, scheduled_for timestamptz, sent_count int, failed_count int, started_at, completed_at, created_by, created_at)`
  - `tg_admin_broadcast_recipients(broadcast_id, chat_id, status, error, sent_at)` — for resumable sends
  - `tg_admin_message_templates(id, name, body, button_label, button_url, created_by, created_at)`
  - `tg_admin_promo_codes(id, code unique, type, value, usage_limit, used_count, expires_at, created_by, created_at)`
  - `tg_admin_promo_redemptions(id, promo_id, chat_id, redeemed_at)`
- Edge function `tg-admin-broadcast-runner` (verify_jwt false; called by pg_cron every minute). Picks one job in `queued`/`running`, sends in batches of 25/sec via the shared `sendMessage` helper, updates row counts. Idempotent via the recipients table.
- Compose UI with segment builder, preview, schedule.

### Phase 8 — Bot Health / Configuration / Audit Log / Reports
- Bot Health:
  - `tg-admin-webhook-info` edge function (getWebhookInfo via connector)
  - Manual controls call new edge functions `tg-admin-switch-to-polling`, `tg-admin-switch-to-webhook`, `tg-admin-clear-pending-updates`. Each performs the action AND inserts into `tg_admin_audit_log`. Polling toggle uses `cron.alter_job` via a `SECURITY DEFINER` RPC since direct cron access is restricted.
  - Errors panel uses `supabase--analytics_query` equivalent: a new edge function `tg-admin-edge-logs` proxies to the analytics endpoint with an admin check.
- Configuration: same shape as Phase 5 Tab 3 — settings write to `tg_admin_settings`. **Same pause-before-bot-patch caveat.**
- Audit Log: read-only from `tg_admin_audit_log` with filters + CSV export.
- Reports: pre-built RPCs returning aggregates, rendered with the existing chart lib already used by `AdminAnalytics.tsx` (recharts).

## Acceptance gates (per phase)
After every phase I'll: (a) confirm no non-Telegram-Bot files were edited (other than the Phase 1 sidebar/route additions, which are additive), (b) sanity-check the bot still receives `/start`, (c) report a file list. After Phase 8 I'll run the final final report.

## Ready
Awaiting your **go for Phase 1**. I'll also need an explicit **OK on the sidebar group append** to `AdminLayout.tsx` (the only existing-file edit; pure addition of a new `navGroups` entry — no behavioral change to anything else).