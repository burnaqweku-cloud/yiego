// Rolled-back checks for promotion link rules: one use per device, per recipient number, per account; guests allowed.
// Run: node scripts/test-promotion-device-phone-db.cjs [--with-schema]
const postgres = require('postgres');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = postgres(process.env.YIEGO_DB_SESSION_URL || process.env.YIEGO_DB_URL, { max: 1, ssl: 'require' });
const ROLLBACK = 'PROMO_DEVICE_TEST_ROLLBACK';
(async () => {
  try {
    await sql.begin(async tx => {
      if (process.argv.includes('--with-schema')) await tx.unsafe(fs.readFileSync('docs/sql/promotion-device-phone.sql', 'utf8'));
      await tx`select set_config('request.jwt.claims','{"role":"service_role"}',true)`;
      const [product] = await tx`select id, customer_price from phase1.data_products where app_product_code='mtn-1' and is_active`;
      await tx`insert into phase1.promotion_settings(id,active) values(true,true) on conflict(id) do update set active=true`;
      await tx`insert into phase1.promotion_offers(product_id,price,enabled) values(${product.id},3.95,true) on conflict(product_id) do update set price=3.95,enabled=true`;
      const visit = async () => { const id = crypto.randomUUID(), token = crypto.randomUUID();
        await tx`insert into phase1.promotion_visits(id,token_hash,source,medium,campaign) values(${id},md5(${token}),'tiktok','paid_social','test')`; return { id, token }; };
      // A recipient number that has never had a paid order.
      let n = 0, phone;
      do { phone = '05' + String(Math.floor(10000000 + Math.random() * 89999999)); n++; }
      while ((await tx`select 1 from phase1.orders where recipient_phone_normalized=${phone}`).length && n < 20);
      const d1 = await visit(), d2 = await visit();
      await tx`select set_config('request.jwt.claims','{"role":"anon"}',true)`;

      const [noLink] = await tx`select phase1.promotion_prices(null,null) r`;
      assert.equal(noLink.r.eligible, false, 'Without the link a shopper sees normal prices');
      const [prices] = await tx`select phase1.promotion_prices(${d1.id},${d1.token}) r`;
      assert.equal(prices.r.eligible, true);
      assert.equal(Number(prices.r.offers.find(o => o.product_id === product.id).price), 3.95, 'MTN 1GB shows GHS 3.95 via the link');
      const [bad] = await tx`select phase1.promotion_prices(${d1.id},${crypto.randomUUID()}) r`;
      assert.equal(bad.r.eligible, false, 'A forged device token gets normal prices');

      const [c1] = await tx`select phase1.promotion_guest_claim(${d1.id},${d1.token},${product.id},${phone}) r`;
      assert.equal(c1.r.eligible, true, 'Guest can claim the promo');
      const [price] = await tx`select phase1.campaign_price_for(${c1.r.token},${phone},${product.id}) p`;
      assert.equal(Number(price.p), 3.95, 'Guest checkout is charged the promo price from the server');
      const [wrongPhone] = await tx`select phase1.campaign_price_for(${c1.r.token},'0240000001',${product.id}) p`;
      assert.equal(wrongPhone.p, null, 'Claim cannot be moved to another number');

      const [sameNumberOtherDevice] = await tx`select phase1.promotion_guest_claim(${d2.id},${d2.token},${product.id},${phone}) r`;
      assert.equal(sameNumberOtherDevice.r.eligible, false, 'Same number on another device gets normal price');
      assert.equal(sameNumberOtherDevice.r.reason, 'number_used');

      // Simulate the claim being paid.
      await tx`select set_config('request.jwt.claims','{"role":"service_role"}',true)`;
      await tx`update phase1.promotion_redemptions set status='paid',paid_at=now() where claim_token=${c1.r.token}`;
      await tx`select set_config('request.jwt.claims','{"role":"anon"}',true)`;
      const [afterPaid] = await tx`select phase1.promotion_prices(${d1.id},${d1.token}) r`;
      assert.equal(afterPaid.r.eligible, false, 'A device that already used the promo sees normal prices');
      const [otherNumberSameDevice] = await tx`select phase1.promotion_guest_claim(${d1.id},${d1.token},${product.id},'0240000002') r`;
      assert.equal(otherNumberSameDevice.r.reason, 'device_used', 'Same device, new number gets normal price');
      const [paidNumberNewDevice] = await tx`select phase1.promotion_guest_claim(${d2.id},${d2.token},${product.id},${phone}) r`;
      assert.equal(paidNumberNewDevice.r.reason, 'number_used', 'A number that used the promo gets normal price on any device');

      // Account rule: an account that has bought before is not eligible even on a fresh device.
      const [buyer] = await tx`select distinct user_id id from phase1.orders where user_id is not null and payment_status='succeeded' limit 1`;
      const d3 = await visit();
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ role: 'authenticated', sub: buyer.id })},true)`;
      const [acct] = await tx`select phase1.promotion_prices(${d3.id},${d3.token}) r`;
      assert.equal(acct.r.eligible, false, 'An account that already purchased sees normal prices');
      let reason = '';
      try { await tx.savepoint(sp => sp`select phase1.promotion_prepare_order(${product.id},'0240000003',false,${d3.id},${d3.token})`); } catch (e) { reason = e.message; }
      assert.match(reason, /not_eligible:account_used/, 'Account checkout refuses the promo price for a repeat buyer');
      console.log('All promotion device/number/account checks passed');
      throw new Error(ROLLBACK);
    });
  } catch (e) {
    if (e.message !== ROLLBACK) { console.error(e); process.exitCode = 1; }
  } finally { await sql.end(); }
})();
