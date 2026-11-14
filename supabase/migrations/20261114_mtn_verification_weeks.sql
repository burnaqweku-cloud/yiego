-- MTN verification wording: "a few weeks", not "a few days".
-- Applied to the live database on 14 Nov 2026; this file is the record.
--
-- MTN now takes weeks to verify a number receiving its first bundle. Everything that told a customer or an agent
-- "a few days" (or "days", "hours to days", "a quick one-time check") now says it can take a few weeks. The site's
-- own pages and the server functions' wording were changed in the same commit; this is the wording kept in the
-- database.

-- What the chat helpers know
update phase1.ai_knowledge set content = replace(content, 'MTN will verify it on its first order, which can take days.', 'MTN will verify it on its first order, which can take a few weeks.'), updated_at = now() where id = 'a13e93c4-e2c4-41e8-8f01-80933d17cfcf';
update phase1.ai_knowledge set content = replace(content, 'held while MTN verifies the number, which can take days;', 'held while MTN verifies the number, which can take a few weeks;'), updated_at = now() where id = '0b63a34c-54f5-42ef-90f5-a674e908a628';
update phase1.ai_knowledge set content = replace(content, 'this can take from hours to days and is MTN''s process', 'this can take a few weeks and is MTN''s process'), updated_at = now() where id = '18f1b1c2-1bc6-4893-b06e-a7ce33b72197';
update phase1.ai_knowledge set content = replace(content, 'MTN is verifying it; this can take a few days,', 'MTN is verifying it; this can take a few weeks,'), updated_at = now() where id = 'c3bec06f-0a28-4d11-88b9-bc2e85aee57e';

-- The agents' help article
update phase1.help_articles set body = replace(body, '**How long.** MTN clears these in batches and the wait varies.', '**How long.** MTN clears these in batches, and it can take a few weeks.'), updated_at = now() where slug = 'mtn-verification';

-- The notice on the shop page
update phase1.site_notices set mtn_note = 'MTN: a number ordering MTN data through us for the first time may show “Awaiting Verification” while MTN does a one-time check before it delivers. This can take a few weeks. Future orders to that same number go through normally.'
  where slug = 'shop_important_notice' and mtn_note like '%for a quick one-time check before it delivers%';

-- The delivery answer in every store's FAQ (38 stores carried our default sentence)
update phase1.agents set faq = replace(faq::text, 'verified by MTN first, which can take a few days', 'verified by MTN first, which can take a few weeks')::jsonb
  where faq::text like '%verified by MTN first, which can take a few days%';

-- The note written on an order when it is held for verification (trigger orders_dbh_mtn_approval): same function,
-- one sentence changed.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'phase1' and p.proname = 'orders_dbh_mtn_approval';
  if d is null or position('This usually takes a few days.' in d) = 0 then return; end if;
  execute replace(d, 'This usually takes a few days.', 'This can take a few weeks.');
end $$;
