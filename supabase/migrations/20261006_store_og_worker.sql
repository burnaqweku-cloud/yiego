-- Applied 6 Oct 2026: phase1.store_og(host) (public link-preview data) + Cloudflare Worker datayego-stores
-- redeployed via new edge function cf-worker-deploy (cron secret): rewrites <title>/og:*/twitter:*/icons on HTML
-- for every store host so WhatsApp/Facebook/Telegram previews show the store, not DataYego.
-- NOTE: cf-domains "setup" still contains the OLD worker; run cf-worker-deploy after any setup.

-- 6 Oct 2026 (later): cf-worker-deploy v3 deployed and run (Worker updated, ok).
-- Store with NO logo: og:image*/twitter:image* metas and icon links removed; /favicon.ico etc. answer 404
-- on store hosts, so WhatsApp shows no image instead of DataYego's banner/icon. Stores WITH a logo unchanged.
-- Worker also has /s/<slug> handling for datayego.com, but the apex A records are DNS-only (not proxied,
-- they point at Lovable), so the Worker never sees datayego.com requests: /s/ links still preview as DataYego.
