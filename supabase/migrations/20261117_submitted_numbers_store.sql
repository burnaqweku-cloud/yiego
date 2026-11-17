-- Which store a submitted MTN number came from (17 Nov 2026). Applied live 17 Nov 2026.
-- check-mtn-number saves the store (from the store page or the agent's dashboard, checked against agents, or from the
-- store's own address) and the site the request came from, so a later "your number is verified" text can carry that
-- store's address instead of ours. Numbers submitted before this day have neither.
alter table phase1.submitted_numbers add column if not exists store_slug text, add column if not exists origin_host text;
