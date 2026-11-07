// Live partner programme check inside one transaction; everything rolls back.
const assert = require('node:assert/strict');
const postgres = require('postgres');
const sql = postgres(process.env.YIEGO_DB_SESSION_URL || process.env.YIEGO_DB_URL, { max: 1, ssl: 'require' });
const ROLLBACK = new Error('rollback');
(async () => {
  try {
    await sql.begin(async tx => {
      const claims = async (uid, aal = 'aal1') => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated', aal })}, true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid || ''}, true)`;
      };
      const [o] = await tx`select o.id, o.order_reference, o.user_id, o.management_token from phase1.orders o join phase1.partner_rates r on r.product_id=o.product_id
        where o.status='processing' and o.agent_id is null and o.management_token is not null and o.created_at > now()-interval '6 hours' and r.product_id='1dcf9a9b-74a6-47f8-9c6b-5c152ec7e262' limit 1`
        .then(r => r.length ? r : tx`select o.id, o.order_reference, o.user_id, o.management_token from phase1.orders o where o.agent_id is null and o.status='delivered' and o.management_token is not null order by created_at desc limit 1`);
      assert.ok(o, 'need an order fixture');
      // Force a fresh 2 GB MTN processing order shape for the test.
      await tx`update phase1.orders set product_id='1dcf9a9b-74a6-47f8-9c6b-5c152ec7e262', quantity=1, status='processing', created_at=now() where id=${o.id}`;
      const [pu] = await tx`select id from auth.users where id is distinct from ${o.user_id} order by created_at limit 1`;
      await tx`insert into phase1.partners (user_id, code, name) values (${pu.id}, 'TESTPARTNER', 'Test')`;
      const before = Number((await tx`select balance from phase1.finance_balances where code='owed_to_partners'`)[0].balance);
      await claims(null);
      assert.equal((await tx`select phase1.partner_attach_order(${o.order_reference}, 'testpartner', 'wrong-token') ok`)[0].ok, false, 'wrong token refused');
      assert.equal((await tx`select phase1.partner_attach_order(${o.order_reference}, 'testpartner', ${o.management_token}) ok`)[0].ok, true, 'owner token attaches');
      assert.equal((await tx`select phase1.partner_attach_order(${o.order_reference}, 'testpartner', ${o.management_token}) ok`)[0].ok, false, 'only once');
      await tx`select set_config('request.jwt.claims', '', true)`;
      await tx`update phase1.orders set status='delivered' where id=${o.id}`;
      const [e] = await tx`select amount, status from phase1.partner_earnings where order_id=${o.id}`;
      assert.equal(Number(e.amount), 0.44, '2 GB starter earns 0.44'); assert.equal(e.status, 'owed');
      let owed = Number((await tx`select balance from phase1.finance_balances where code='owed_to_partners'`)[0].balance);
      assert.equal(Math.round((owed - before) * 100), 44, 'Finance owes partners 0.44 more');
      await tx`update phase1.orders set status='refunded' where id=${o.id}`;
      assert.equal((await tx`select status from phase1.partner_earnings where order_id=${o.id}`)[0].status, 'void', 'refund voids unpaid earning');
      owed = Number((await tx`select balance from phase1.finance_balances where code='owed_to_partners'`)[0].balance);
      assert.equal(Math.round((owed - before) * 100), 0, 'void removes the debt');
      throw ROLLBACK;
    });
  } catch (err) { if (err !== ROLLBACK) { console.error('FAIL', err.message); process.exitCode = 1; } else console.log('partner programme checks passed (rolled back)'); }
  await sql.end();
})();
