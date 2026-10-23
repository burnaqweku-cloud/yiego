const postgres = require('postgres');
const assert = require('node:assert/strict');
const sql = postgres(process.env.YIEGO_DB_SESSION_URL || process.env.YIEGO_DB_URL, { max: 1, ssl: 'require' });
(async () => {
  try {
    await sql.begin(async tx => {
      await tx`select set_config('request.jwt.claims','{"role":"service_role"}',true)`;
      const [o] = await tx`insert into phase1.orders(order_reference,recipient_phone,amount,status,payment_status,management_token)
        values('YG-TESTUNPAID','0240000001',1,'awaiting_payment','pending','test-private-capability') returning id`;
      let refused = false;
      try { await tx.savepoint(async sp => { await sp`select phase1.cancel_unpaid_order('YG-TESTUNPAID',null,'wrong',null,false)`; }); }
      catch { refused = true; }
      assert.equal(refused,true,'Unrelated guest must not cancel');
      await tx`select phase1.cancel_unpaid_order('YG-TESTUNPAID',null,'test-private-capability',null,false)`;
      const [closed] = await tx`select status,payment_status,is_open from phase1.orders where id=${o.id}`;
      assert.equal(closed.status,'cancelled'); assert.equal(closed.payment_status,'abandoned'); assert.equal(closed.is_open,false);
      await tx`insert into phase1.orders(order_reference,recipient_phone,amount,status,payment_status)
        values('YG-TESTREOPEN','0240000001',1,'awaiting_payment','pending')`;
      await tx`update phase1.orders set payment_status='succeeded',status='paid' where id=${o.id}`;
      const [late] = await tx`select status,is_open,payment_status from phase1.orders where id=${o.id}`;
      assert.equal(late.status,'cancelled'); assert.equal(late.is_open,false); assert.equal(late.payment_status,'succeeded');
      refused = false;
      try { await tx.savepoint(async sp => { await sp`select phase1.cancel_unpaid_order('YG-TESTUNPAID',null,'test-private-capability',null,false)`; }); }
      catch { refused = true; }
      assert.equal(refused,true,'Paid order cannot be cancelled');
      throw new Error('ROLLBACK_TEST_SUCCESS');
    });
  } catch (error) { if (error.message !== 'ROLLBACK_TEST_SUCCESS') throw error; }
  console.log('Passed: ownership, unpaid cancellation, recipient release, paid-order refusal and late-payment protection. All fixtures rolled back.');
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => sql.end());