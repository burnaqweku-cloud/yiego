const postgres=require('postgres');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const sql=postgres(process.env.YIEGO_DB_SESSION_URL||process.env.YIEGO_DB_URL,{ssl:'require',max:1});
const marker='ROLLBACK_ANALYTICS_TEST';
(async()=>{
 try {
  await sql.begin(async tx=>{
   if(process.argv.includes('--with-schema')) await tx.unsafe(fs.readFileSync('docs/sql/promotion-analytics.sql','utf8'));
   const visit=randomUUID(),token=randomUUID(),user=randomUUID();
   await tx`select set_config('request.jwt.claims','{"role":"anon"}',true)`;
   await tx`select phase1.promotion_track(${visit},${token},'visit','tiktok','paid_social','test-cohort')`;
   await tx`select phase1.promotion_track(${visit},${token},'visit','facebook','organic','changed')`;
   await tx`select phase1.promotion_track(${visit},${token},'signup_started','tiktok','paid_social','test-cohort')`;
   const [v]=await tx`select source,sessions,signup_started_at from phase1.promotion_visits where id=${visit}`;
   assert.equal(v.source,'tiktok','First source is not overwritten');assert.equal(v.sessions,1,'Refreshes do not duplicate sessions');assert.ok(v.signup_started_at);
   const [wrong]=await tx`select phase1.promotion_track(${visit},${randomUUID()},'checkout_clicked') result`;
   assert.equal(wrong.result,false,'A visitor cannot mutate another visit without its capability');
   let forbidden=false;
   try {await tx.savepoint(sp=>sp`select phase1.admin_promotion_report(current_date,current_date)`)}catch{forbidden=true}
   assert.equal(forbidden,true,'Anonymous reporting is refused');
   await tx`insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values(${user},${'analytics-'+user+'@example.invalid'},${JSON.stringify({full_name:'Analytics rollback fixture',promo_visit_id:visit,promo_visit_token:token})}::jsonb,now(),now())`;
   const [account]=await tx`select new_account_id from phase1.promotion_visits where id=${visit}`;
   assert.equal(account.new_account_id,user,'Actual auth insert attributes the new account');
   await tx`select set_config('request.jwt.claims',${JSON.stringify({role:'authenticated',sub:user,aal:'aal1'})},true)`;
   await tx`select phase1.promotion_track(${visit},${token},'visit','tiktok','paid_social','test-cohort')`;
   const [count]=await tx`select count(*)::integer n from phase1.promotion_visits where new_account_id=${user}`;
   assert.equal(count.n,1,'Returning sign-in does not create another signup');
   const [admin]=await tx`select user_id from phase1.admin_users where is_active and role in ('admin','master') limit 1`;
   await tx`select set_config('request.jwt.claims',${JSON.stringify({role:'authenticated',sub:admin.user_id,aal:'aal2'})},true)`;
   const [result]=await tx`select phase1.admin_promotion_report(current_date,current_date) result`;
   const row=result.result.sources.find(s=>s.campaign==='test-cohort');
   assert.equal(row.visitors,1);assert.equal(row.accounts,1);assert.equal(row.signup_starts,1);assert.equal(row.buyers,0,'No purchase may be inferred from signup');
   throw Error(marker);
  });
 }catch(e){if(e.message!==marker)throw e}
 console.log('Passed: visit/session deduplication, immutable attribution, capability protection, admin access, actual signup, existing sign-in exclusion, zero invented buyers. All fixtures rolled back.');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>sql.end());