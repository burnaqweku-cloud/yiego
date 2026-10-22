// Exercise live ownership/status logic in a transaction; every change rolls back.
const assert = require('node:assert/strict');
const postgres = require('postgres');
const sql = postgres(process.env.YIEGO_DB_SESSION_URL || process.env.YIEGO_DB_URL, { max: 1, ssl: 'require' });
(async () => {
  try {
    await sql.begin(async tx => {
      const [pair] = await tx`select s.id, p.id parent_id, p.user_id parent_user, s.user_id sub_user from phase1.agents s join phase1.agents p on p.id=s.parent_agent_id where p.status='active' and s.status='active' limit 1`;
      assert.ok(pair, 'An active parent/sub-agent fixture is required');
      const [original] = await tx`select to_jsonb(a) record from phase1.agents a where id=${pair.id}`;
      const claims = async uid => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated', aal: 'aal1' })}, true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid || ''}, true)`;
      };
      const denied = async (uid, target, active) => {
        await claims(uid);
        await assert.rejects(tx.savepoint(async sp => { await sp`select phase1.agent_set_sub_active(${target}::uuid,${active}::boolean)`; }));
      };
      await denied(null, pair.id, false);
      await denied(pair.sub_user, pair.id, false);
      await denied('00000000-0000-0000-0000-000000000001', pair.id, false);
      await denied(pair.parent_user, pair.parent_id, false);
      await denied(pair.parent_user, '00000000-0000-0000-0000-000000000001', false);
      await denied(pair.parent_user, pair.id, null);
      await claims(pair.parent_user);
      await tx`select phase1.agent_set_sub_active(${pair.id},false)`;
      let [state] = await tx`select status,parent_deactivated_at from phase1.agents where id=${pair.id}`;
      assert.equal(state.status, 'paused'); assert.ok(state.parent_deactivated_at);
      const [closed] = await tx`select phase1.agent_store(${original.record.slug},false,${pair.parent_user}) store`;
      assert.equal(closed.store.status, 'closed'); assert.deepEqual(closed.store.prices, {});
      const [network] = await tx`select phase1.my_network() result`;
      assert.ok(network.result.agents.find(a => a.id === pair.id).parent_deactivated_at);
      await tx`select phase1.agent_set_sub_active(${pair.id},true)`;
      const [restored] = await tx`select to_jsonb(a) record from phase1.agents a where id=${pair.id}`;
      const stable = r => Object.fromEntries(Object.entries(r).filter(([key]) => !['updated_at', 'parent_deactivated_at'].includes(key)));
      assert.deepEqual(stable(restored.record), stable(original.record), 'Reactivation preserves all store, financial and ownership fields');
      const [open] = await tx`select phase1.agent_store(${original.record.slug},false,${pair.parent_user}) store`;
      assert.equal(open.store.status, 'active');
      await tx`select phase1.agent_set_sub_active(${pair.id},false)`;
      await tx`select set_config('request.jwt.claims','',true)`;
      await tx`select phase1.admin_network_set_sub_status(${pair.id},'paused')`;
      await denied(pair.parent_user, pair.id, true);
      await tx`update phase1.agents set status='suspended' where id=${pair.id}`;
      await denied(pair.parent_user, pair.id, true);
      await tx`update phase1.agents set status='active' where id=${pair.id}`;
      await tx`update phase1.agents set status='paused' where id=${pair.parent_id}`;
      await denied(pair.parent_user, pair.id, false);
      const [acl] = await tx`select has_function_privilege('anon','phase1.agent_set_sub_active(uuid,boolean)','EXECUTE') anon_execute,has_function_privilege('authenticated','phase1.agent_set_sub_active(uuid,boolean)','EXECUTE') authenticated_execute`;
      assert.deepEqual(acl, { anon_execute: false, authenticated_execute: true });
      throw new Error('ROLLBACK_TEST_SUCCESS');
    });
  } catch (error) {
    if (error.message !== 'ROLLBACK_TEST_SUCCESS') throw error;
    console.log('PASS: parent deactivate/reactivate, ownership denials, admin precedence, closed/open store, preserved records, execution grants');
  } finally { await sql.end(); }
})().catch(error => { console.error('Sub-agent tests failed:', error.message); process.exitCode = 1; });