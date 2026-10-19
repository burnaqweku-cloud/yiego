// Isolated trigger tests: all changes roll back; no order is modified and no SMS is sent.
const assert = require('node:assert/strict');
const postgres = require('postgres');
const sql = postgres(process.env.YIEGO_DB_SESSION_URL || process.env.YIEGO_DB_URL, { max: 1, ssl: 'require' });
(async () => {
  try {
    await sql.begin(async tx => {
      const [order] = await tx`select id from phase1.orders limit 1`;
      assert.ok(order, 'An order fixture must exist');
      const [control] = await tx`select enabled from phase1.order_sms_control where id=true`;
      assert.equal(control.enabled, false, 'Customer SMS must remain disabled until test succeeds');
      const claims = await tx`select * from phase1.claim_order_sms(20)`;
      assert.equal(claims.length, 0, 'Disabled worker cannot claim messages');
      const [activation] = await tx`select phase1.activate_order_sms() activated`;
      assert.equal(activation.activated, false, 'Activation requires a successful test');
      await tx`update phase1.order_sms_control set enabled=true where id=true`;
      await tx`create temporary table sms_trigger_fixture(id uuid, payment_status text, status text)`;
      await tx`create trigger test_sms after insert or update on sms_trigger_fixture for each row execute function phase1.enqueue_order_sms()`;
      await tx`insert into sms_trigger_fixture values(${order.id},'pending','awaiting_payment')`;
      let rows = await tx`select kind from phase1.order_sms_outbox where order_id=${order.id}`;
      assert.equal(rows.length, 0, 'Unpaid orders have no SMS');
      await tx`update sms_trigger_fixture set payment_status='succeeded',status='processing'`;
      rows = await tx`select kind from phase1.order_sms_outbox where order_id=${order.id}`;
      assert.deepEqual(rows.map(r => r.kind), ['purchase'], 'Payment confirmation queues one purchase text');
      await tx`update sms_trigger_fixture set status='delivered'`;
      await tx`update sms_trigger_fixture set status='delivered'`;
      rows = await tx`select kind from phase1.order_sms_outbox where order_id=${order.id} order by kind`;
      assert.deepEqual(rows.map(r => r.kind), ['delivered','purchase'], 'Repeated delivery update does not duplicate');
      const first = await tx`select * from phase1.claim_order_sms(20)`;
      const second = await tx`select * from phase1.claim_order_sms(20)`;
      assert.equal(first.length, 2, 'Atomic claim selects both queued notifications');
      assert.equal(second.length, 0, 'Another worker cannot claim the same notifications');
      const [acl] = await tx`select has_table_privilege('anon','phase1.order_sms_outbox','SELECT') anon_read,has_table_privilege('authenticated','phase1.order_sms_control','UPDATE') customer_enable,has_function_privilege('authenticated','phase1.claim_order_sms(integer)','EXECUTE') customer_claim`;
      assert.deepEqual(acl, { anon_read: false, customer_enable: false, customer_claim: false });
      throw new Error('ROLLBACK_TEST_SUCCESS');
    });
  } catch (e) {
    if (e.message !== 'ROLLBACK_TEST_SUCCESS') throw e;
    console.log('PASS: disabled gate, payment and delivery triggers, duplicate protection, atomic claims, private permissions');
  } finally { await sql.end(); }
})().catch(() => { console.error('SMS database tests failed'); process.exitCode = 1; });