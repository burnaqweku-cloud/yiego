const postgres = require('postgres');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = postgres(process.env.YIEGO_DB_SESSION_URL || process.env.YIEGO_DB_URL, { max: 1, ssl: 'require' });
const rollback = 'PROMOTION_TEST_ROLLBACK';
(async () => {
  try {
    await sql.begin(async tx => {
      if (process.argv.includes('--with-schema')) await tx.unsafe(fs.readFileSync('docs/sql/first-purchase-promotions.sql', 'utf8'));
      await tx`select set_config('request.jwt.claims','{"role":"service_role"}',true)`;
      const [user] = await tx`select p.id from phase1.profiles p where p.status='active' and not exists(select 1 from phase1.orders o where o.user_id=p.id) and not phase1.promotion_customer_has_purchased(p.id) limit 1`;
      assert.ok(user, 'A transaction-only eligible account is needed');
      const [product] = await tx`select id from phase1.data_products where app_product_code='mtn-1' and is_active`;
      assert.ok(product);
      await tx`insert into phase1.promotion_settings(id,active) values(true,true) on conflict(id) do update set active=true`;
      await tx`insert into phase1.promotion_offers(product_id,price,enabled) values(${product.id},3.95,true) on conflict(product_id) do update set price=3.95,enabled=true`;
      async function refused(run, message) {
        let rejected=false;
        try { await tx.savepoint(run); } catch { rejected=true; }
        assert.equal(rejected,true,message);
      }
      await tx`select set_config('request.jwt.claims','{"role":"anon"}',true)`;
      await refused(sp => sp`select phase1.promotion_prepare_order(${product.id},'0240000018',false)`, 'Guest checkout must be refused');
      await tx`select set_config('request.jwt.claims',${JSON.stringify({role:'authenticated',sub:user.id,aal:'aal1'})},true)`;
      await refused(sp => sp`select phase1.admin_promotion_save('Unauthorized','',true,'[]'::jsonb)`, 'Non-administrator cannot set prices');
      const [prepared] = await tx`select phase1.promotion_prepare_order(${product.id},'0240000018',false) as result`;
      assert.equal(Number(prepared.result.amount),3.95,'MTN 1GB offer must cost GHS 3.95');
      const [repeat] = await tx`select phase1.promotion_prepare_order(${product.id},'0240000018',false) as result`;
      assert.equal(repeat.result.orderId,prepared.result.orderId,'Repeated checkout must resume one order');
      await refused(sp => sp`select phase1.promotion_prepare_order(${product.id},'0240000019',false)`, 'Account cannot reserve another offer');
      await refused(sp => sp`update phase1.orders set amount=0.01 where id=${prepared.result.orderId}`, 'Promotion price snapshot cannot be edited');
      await tx`update phase1.promotion_offers set price=4.50 where product_id=${product.id}`;
      const [fixed] = await tx`select amount from phase1.orders where id=${prepared.result.orderId}`;
      assert.equal(Number(fixed.amount),3.95,'Admin price changes cannot reprice existing checkout');
      await tx`update phase1.orders set status='cancelled',payment_status='abandoned',is_open=false where id=${prepared.result.orderId}`;
      const [cancelled] = await tx`select status from phase1.promotion_redemptions where order_id=${prepared.result.orderId}`;
      assert.equal(cancelled.status,'released','Unpaid cancellation releases eligibility');
      const [newOrder] = await tx`select phase1.promotion_prepare_order(${product.id},'0240000019',false) as result`;
      assert.equal(Number(newOrder.result.amount),4.5,'New checkout uses updated price');
      await tx`update phase1.orders set payment_status='succeeded',status='paid',paid_at=now() where id=${newOrder.result.orderId}`;
      const [paid] = await tx`select status from phase1.promotion_redemptions where order_id=${newOrder.result.orderId}`;
      assert.equal(paid.status,'paid','Successful purchase consumes the offer');
      await refused(sp => sp`select phase1.promotion_prepare_order(${product.id},'0240000020',false)`, 'Paid buyer cannot use the first-purchase offer again');
      await tx`update phase1.orders set payment_status='refunded',status='refunded' where id=${newOrder.result.orderId}`;
      const [eligible] = await tx`select phase1.promotion_customer_has_purchased(${user.id}) as used`;
      assert.equal(eligible.used,true,'Refund does not turn an existing customer into a first-time buyer');
      await tx`update phase1.orders set payment_status='succeeded',status='paid' where id=${prepared.result.orderId}`;
      const [late] = await tx`select status,is_open from phase1.orders where id=${prepared.result.orderId}`;
      assert.equal(late.status,'cancelled','Late second promotion payment cannot start delivery');
      assert.equal(late.is_open,false,'Late repeat payment stays closed for reconciliation');
      throw new Error(rollback);
    });
  } catch (e) { if (e.message!==rollback) throw e; }
  console.log('Passed: account-only purchase, admin access, GHS 3.95, one reservation, immutable prices, cancellation, edited prices, paid/refunded repeat protection. Every fixture rolled back.');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>sql.end());