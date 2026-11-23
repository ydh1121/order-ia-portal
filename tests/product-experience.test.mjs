import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleProductLab,namespaceDb} from '../src/server/product-lab.mjs';
import {handleProductOperations} from '../src/server/product-operations.mjs';

// The same SQLite/D1 namespace boundary as product-lab tests, without importing
// a test module (which would register and rerun unrelated suites).
function sqliteD1(sqlite){
  const prepare=(query,params=[])=>({query,params,bind:(...args)=>prepare(query,args),first:async()=>sqlite.prepare(query).get(...params)||null,all:async()=>({results:sqlite.prepare(query).all(...params)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...params).changes)}})});
  return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>{const compiled=sqlite.prepare(s.query);return compiled.columns().length?{results:compiled.all(...s.params),meta:{changes:0}}:{results:[],meta:{changes:Number(compiled.run(...s.params).changes)}};});sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function workspace(t){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));t.after(()=>sqlite.close());
  let productionTouches=0;
  const env={ORDER_LAB_DB:sqliteD1(sqlite),ORDER_QA_DB:{prepare(){productionTouches++;throw Error('Production access during isolated experience test');}},CF_PAGES_COMMIT_SHA:'experience-handler-test'};
  const owner={id:'experience-reviewer',role:'OWNER',expiresAt:Date.now()/1000+43200},now='2026-11-21T03:00:00.000Z';
  const command=(action,extra={})=>({action,expectedRevision:0,requestKey:crypto.randomUUID(),...extra});
  async function api(path,body){const request=new Request('https://lab.test/api/ia/lab'+path,body?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://lab.test','X-IA-CSRF':'csrf'},body:JSON.stringify(body)}:{});const response=await handleProductLab({request,env,actor:owner,path,csrf:'csrf',clock:()=>now});return {status:response.status,body:await response.json()};}
  const created=await api('/runs',{label:'관리자 실제 문서·배치 검증',requestKey:crypto.randomUUID()});assert.equal(created.status,200,JSON.stringify(created.body));const run=created.body.run.id,db=namespaceDb(env.ORDER_LAB_DB,run);
  const product=(role,path,body)=>api('/runs/'+run+'/as/'+role+'/product'+path,body);
  const direct=async(actorId,path,body,extra={})=>{const request=new Request('https://product.test/api/ia/product'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const response=await handleProductOperations({request,env:{ORDER_PRODUCT_DB:db,...extra},actor:{id:actorId,role:'BUSINESS'},path,clock:()=>now});return {status:response.status,body:await response.json()};};
  const paid=async(channel='store')=>{const offers=await product('buyer','/purchases'),offer=offers.body.offers[0];const created=await product('buyer','/purchases',command('create',{offerId:offer.id,quantity:10,paymentMethod:'cash',channel}));assert.equal(created.status,200,JSON.stringify(created.body));const confirmed=await product('operator','/purchases',command('confirm-cash',{id:created.body.item.id,expectedRevision:1,reference:'ISOLATED-TEST'}));assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));return confirmed.body.item;};
  const insert=async(kind,id,orgId,siteId,data,state='ACTIVE',creator='lab-operator')=>db.prepare('INSERT INTO order_operation(kind,id,org_id,site_id,created_by,revision,state,data_json,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?)').bind(kind,id,orgId,siteId,creator,state,JSON.stringify(data),now,now).run();
  const business=async(id='verify-case',creator='lab-buyer')=>db.prepare("INSERT INTO r3_case(id,kind,org_id,site_id,state,revision,created_by,updated_at) VALUES(?,'business','lab-store','lab-site','DRAFT',1,?,?)").bind(id,creator,now).run();
  t.after(()=>assert.equal(productionTouches,0));
  return {sqlite,env,db,run,api,product,direct,command,paid,insert,business,now};
}
const defaultLayout=[0,1,2].map(i=>({id:'widget-'+i,wide:false}));

test('operator dashboard aggregates authorized actual purchases across both operator grants and excludes other scopes',async t=>{
  const w=await workspace(t),a=await w.paid('store'),b=await w.paid('farm');
  await w.insert('purchase','foreign-purchase','foreign-org','foreign-site',{paid:999999999,refunded:0,channel:'store',supplierId:'foreign-supplier'},'PAID');
  const response=await w.product('operator','/dashboard');assert.equal(response.status,200,JSON.stringify(response.body));const data=response.body;
  assert.equal(data.unit,'원');assert.equal(data.periods.find(p=>p.id==='7').total,a.paid+b.paid);assert.equal(data.periods.find(p=>p.id==='7').points.reduce((n,p)=>n+p.value,0),a.paid+b.paid);
  assert.equal(data.segments.find(s=>s.id==='store').amount,a.paid);assert.equal(data.segments.find(s=>s.id==='farm').amount,b.paid);
  assert.doesNotMatch(JSON.stringify(data),/999999999|foreign-org/);
  assert.equal((await w.product('buyer','/dashboard')).status,403);assert.equal((await w.product('supplier','/dashboard')).status,403);assert.equal((await w.product('guest','/dashboard')).status,401);
});

test('dashboard layout defaults, revision/idempotency and actor isolation use real settings storage',async t=>{
  const w=await workspace(t),initial=await w.product('operator','/settings/dashboard-layout');assert.equal(initial.status,200,JSON.stringify(initial.body));assert.deepEqual(initial.body,{revision:0,data:{layout:defaultLayout}});
  const layout=[{id:'widget-2',wide:true},{id:'widget-0',wide:false},{id:'widget-1',wide:true}],body=w.command('save',{data:{layout}});
  const saved=await w.product('operator','/settings/dashboard-layout',body);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.revision,1);assert.deepEqual(saved.body.data.layout,layout);
  assert.deepEqual((await w.product('operator','/settings/dashboard-layout',body)).body,saved.body);
  assert.equal((await w.product('operator','/settings/dashboard-layout',{...body,data:{layout:defaultLayout}})).status,409);
  assert.equal((await w.product('operator','/settings/dashboard-layout',w.command('save',{data:{layout:defaultLayout}}))).status,409);
  await w.db.prepare("INSERT INTO r3_membership VALUES('other-operator','OPERATOR','lab-store','',1)").run();assert.deepEqual((await w.direct('other-operator','/settings/dashboard-layout')).body,{revision:0,data:{layout:defaultLayout}});
  assert.equal((await w.product('buyer','/settings/dashboard-layout')).status,403);
  for(const invalid of [[null,...defaultLayout.slice(1)],[defaultLayout[0],defaultLayout[0],defaultLayout[2]],[{id:'widget-0',wide:false,actor:'other'},...defaultLayout.slice(1)]]){
    const result=await w.product('operator','/settings/dashboard-layout',w.command('save',{expectedRevision:1,data:{layout:invalid}}));assert.equal(result.status,400,JSON.stringify(result.body));
  }
  assert.deepEqual((await w.product('operator','/settings/dashboard-layout')).body,saved.body);
});

test('both receipt models issue immutable server-snapshotted documents with separate permissions',async t=>{
  const w=await workspace(t),purchase=await w.paid(),operator=w.command('issue',{purchaseId:purchase.id,model:'order-to-business',recipient:'supplier'}),supplier=w.command('issue',{purchaseId:purchase.id,model:'supplier-to-site',recipient:'site'});
  assert.equal((await w.product('buyer','/receipts',operator)).status,403);
  assert.equal((await w.product('operator','/receipts',supplier)).status,403);
  assert.equal((await w.product('supplier','/receipts',{...supplier,recipient:'supplier'})).status,400);
  assert.equal((await w.product('operator','/receipts',{...operator,total:1})).body.error,'CLIENT_DOCUMENT_FORBIDDEN');
  const issued=await w.product('operator','/receipts',operator),farm=await w.product('supplier','/receipts',supplier);assert.equal(issued.status,200,JSON.stringify(issued.body));assert.equal(farm.status,200,JSON.stringify(farm.body));
  for(const response of [issued,farm]){assert.equal(response.body.item.status,'ISSUED');assert.equal(response.body.item.total,purchase.total);assert.equal(response.body.item.paid,purchase.paid);assert.equal(response.body.item.sourceRevision,purchase.revision);assert.match(response.body.item.documentDigest,/^[a-f0-9]{64}$/);}
  assert.equal(issued.body.item.issuer.kind,'order');assert.equal(farm.body.item.issuer.kind,'supplier');assert.equal(farm.body.item.recipient.orgId,'lab-store');assert.equal(farm.body.item.recipient.siteId,'lab-site');assert.notEqual(issued.body.item.id,farm.body.item.id);
  assert.deepEqual((await w.product('operator','/receipts',operator)).body,issued.body);
  const changed=await w.product('operator','/receipts/'+issued.body.item.id,w.command('update',{expectedRevision:1,total:1}));assert.equal(changed.status,400);
  assert.deepEqual((await w.product('buyer','/receipts/'+farm.body.item.id)).body.item,farm.body.item);
  const other=await w.api('/runs',{label:'다른 격리 실행',requestKey:crypto.randomUUID()});assert.equal((await w.api('/runs/'+other.body.run.id+'/as/operator/product/receipts/'+farm.body.item.id)).status,404);
});

test('receipt reuse records its request key without issuing another document',async t=>{
  const w=await workspace(t),purchase=await w.paid(),first=w.command('issue',{purchaseId:purchase.id,model:'order-to-business',recipient:'site'});const issued=await w.product('operator','/receipts',first);assert.equal(issued.status,200);
  const reuse={...first,requestKey:crypto.randomUUID()},response=await w.product('operator','/receipts',reuse);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.existing,true);assert.deepEqual(response.body.item,issued.body.item);
  assert.deepEqual((await w.product('operator','/receipts',reuse)).body,response.body);
  const event=await w.db.prepare('SELECT kind,request_hash FROM order_operation_event WHERE actor_id=? AND request_key=?').bind('lab-operator',reuse.requestKey).first();assert.equal(event.kind,'receipt-reuse');assert.match(event.request_hash,/^[a-f0-9]{64}$/);
  assert.equal((await w.product('operator','/receipts',{...reuse,recipient:'supplier'})).status,409);
  assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation WHERE kind='receipt'").first()).n,1);
});

test('unpaid purchases cannot issue a receipt and failed requests do not insert document events',async t=>{
  const w=await workspace(t),offer=(await w.product('buyer','/purchases')).body.offers[0],pending=await w.product('buyer','/purchases',w.command('create',{offerId:offer.id,quantity:10,paymentMethod:'cash',channel:'store'}));
  const result=await w.product('operator','/receipts',w.command('issue',{purchaseId:pending.body.item.id,model:'order-to-business',recipient:'site'}));assert.equal(result.status,409);assert.equal(result.body.error,'RECEIPT_PAYMENT_REQUIRED');
  assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation WHERE kind='receipt'").first()).n,0);
  assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation_event WHERE kind IN ('receipt','receipt-reuse')").first()).n,0);
});

test('billing draft, reload, revision conflict and immutable issuance remain distinct from sending or payment',async t=>{
  const w=await workspace(t);await w.paid();const account=(await w.product('operator','/billing/accounts')).body.accounts[0];assert.ok(account);
  const body=w.command('draft',{id:'billing-real-flow',accountId:account.id,issuerOrgId:account.issuerOrgId,amount:43100,subject:'별도 작업 대금',memo:'격리 실행 검사',dueDate:'2026-12-01'});
  const draft=await w.product('operator','/billing',body);assert.equal(draft.status,200,JSON.stringify(draft.body));assert.equal(draft.body.item.status,'DRAFT');assert.equal(draft.body.item.revision,1);assert.equal(draft.body.item.deliveryStatus,'NOT_SENT');assert.equal(draft.body.item.paid,0);
  assert.deepEqual((await w.product('operator','/billing',body)).body,draft.body);
  assert.equal((await w.product('operator','/billing',{...body,requestKey:crypto.randomUUID(),subject:'동시 변경'})).status,409);
  const issue={...body,action:'issue',expectedRevision:1,requestKey:crypto.randomUUID()};const issued=await w.product('operator','/billing',issue);assert.equal(issued.status,200,JSON.stringify(issued.body));assert.equal(issued.body.item.status,'ISSUED');assert.match(issued.body.item.documentDigest,/^[a-f0-9]{64}$/);assert.equal(issued.body.item.deliveryStatus,'NOT_SENT');assert.equal(issued.body.item.paid,0);
  assert.deepEqual((await w.product('operator','/billing',issue)).body,issued.body);
  const edit=await w.product('operator','/billing',{...body,expectedRevision:2,amount:100,requestKey:crypto.randomUUID()});assert.equal(edit.status,409);assert.equal(edit.body.error,'DOCUMENT_IMMUTABLE');
  assert.deepEqual((await w.product('buyer','/billing/'+body.id)).body.item,issued.body.item);
  await w.db.prepare("INSERT INTO r3_membership VALUES('other-operator','OPERATOR','lab-store','',1)").run();assert.equal((await w.direct('other-operator','/billing',{...body,id:'billing-real-flow',expectedRevision:2,requestKey:crypto.randomUUID()})).status,404);
});

test('billing rejects forged accounts, invalid calendar dates, fractional amounts and client payment flags',async t=>{
  const w=await workspace(t);await w.paid();const account=(await w.product('operator','/billing/accounts')).body.accounts[0],base={id:'invalid-bill',accountId:account.id,issuerOrgId:account.issuerOrgId,amount:100,subject:'시험',dueDate:'2026-12-01'};
  for(const patch of [{dueDate:'2026-99-99'},{dueDate:'2026-02-30'},{amount:1.5},{paid:100},{amount:0}]){const response=await w.product('operator','/billing',w.command('draft',{...base,...patch}));assert.equal(response.status,400,JSON.stringify(response.body));}
  for(const patch of [{accountId:'foreign:site'},{issuerOrgId:'foreign'}])assert.equal((await w.product('operator','/billing',w.command('issue',{...base,...patch}))).status,403);
  assert.equal((await w.product('buyer','/billing',w.command('issue',base))).status,403);
  assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation WHERE kind='billing'").first()).n,0);
});

test('changing a billing draft recipient changes the stored visibility boundary with it',async t=>{
  const w=await workspace(t),purchase=await w.paid();await w.db.prepare("INSERT INTO r3_membership VALUES('second-buyer','BUYER','lab-store','site-two',1)").run();
  await w.insert('purchase','second-site-purchase','lab-store','site-two',{...purchase,id:undefined,target:'두 번째 사업장'},'PAID');
  const accounts=(await w.product('operator','/billing/accounts')).body.accounts,a=accounts.find(x=>x.siteId==='lab-site'),b=accounts.find(x=>x.siteId==='site-two');assert.ok(a&&b);
  const draft=w.command('draft',{id:'moved-bill',accountId:a.id,issuerOrgId:a.issuerOrgId,amount:5000,subject:'대상 변경',dueDate:'2026-12-02'});assert.equal((await w.product('operator','/billing',draft)).status,200);
  const moved=await w.product('operator','/billing',{...draft,expectedRevision:1,requestKey:crypto.randomUUID(),accountId:b.id,issuerOrgId:b.issuerOrgId});assert.equal(moved.status,200,JSON.stringify(moved.body));assert.equal(moved.body.item.recipient.siteId,'site-two');
  const raw=await w.db.prepare("SELECT org_id,site_id FROM order_operation WHERE kind='billing' AND id='moved-bill'").first();assert.equal(raw.site_id,'site-two');
  assert.equal((await w.product('buyer','/billing/moved-bill')).status,404);assert.equal((await w.direct('second-buyer','/billing/moved-bill')).status,200);
});

test('published policies are readable before sign-in while unpublished and malformed documents stay unavailable',async t=>{
  const w=await workspace(t),policy={title:'격리 환경 문서 시험',version:'policy-test-v1',sections:[{id:'first',title:'첫 문단',paragraphs:['이 텍스트는 자동 검사 전용입니다.']},{id:'second',title:'두 번째 문단',paragraphs:['실제 약관을 게시하거나 승인하지 않습니다.']}]};
  await w.insert('policy','required','','',policy,'PUBLISHED');await w.insert('policy','privacy','','',policy,'DRAFT');
  const response=await w.product('guest','/policies/required');assert.equal(response.status,200,JSON.stringify(response.body));assert.deepEqual(response.body,{id:'required',status:'published',...policy});
  assert.equal((await w.product('guest','/policies/privacy')).status,404);assert.equal((await w.product('guest','/purchases')).status,401);
  await w.insert('policy','optional','','',{...policy,sections:[{id:'empty',title:'본문 없음',paragraphs:[]}]},'PUBLISHED');assert.equal((await w.product('guest','/policies/optional')).status,503);
});

const verification=(w,extra={})=>w.command('verify',{caseId:'verify-case',number:'1234567890',openingDate:'20200102',name:'시험 사업장',owner:'시험 대표',industry:'시험 업태',trade:'시험 종목',...extra});
const ntsResponse=(number='1234567890',valid='01',status='01')=>Response.json({status_code:'OK',request_cnt:1,data:[{b_no:number,valid,status:{b_stt_cd:status}}]});

test('business verification fails closed without a provider and never accepts client supplied verified state',async t=>{
  const w=await workspace(t);await w.business();const input=verification(w);
  const unavailable=await w.product('buyer','/business-verifications',input);assert.equal(unavailable.status,503);assert.equal(unavailable.body.error,'BUSINESS_PROVIDER_UNAVAILABLE');
  const mismatched=await w.direct('lab-buyer','/business-verifications',{...input,verified:true},{NTS_SERVICE_KEY:'test-only-key',NTS_FETCH:async()=>ntsResponse('1234567890','02','03')});assert.equal(mismatched.status,200,JSON.stringify(mismatched.body));assert.equal(mismatched.body.item.verified,false);assert.equal(mismatched.body.item.status,'MISMATCH');
  assert.doesNotMatch(JSON.stringify(mismatched.body),/1234567890|시험 대표|test-only-key/);
});

test('business outages identify the failing boundary and enqueue one private alert for active same-organization operators',async t=>{
  const w=await workspace(t);await w.business();
  for(const [actor,org,active] of [['same-operator','lab-store',1],['foreign-operator','other-store',1],['inactive-operator','lab-store',0]])await w.db.prepare('INSERT INTO r3_membership VALUES(?,?,?,\'\',?)').bind(actor,'OPERATOR',org,active).run();
  const input=verification(w),configuration=await w.direct('lab-buyer','/business-verifications',input);assert.deepEqual(configuration.body.businessVerification,{source:'configuration',alertQueued:true});
  const failed={NTS_SERVICE_KEY:'test-only-key',NTS_FETCH:async()=>{throw Error('private-provider-failure');}};const provider=await w.direct('lab-buyer','/business-verifications',input,failed);assert.equal(provider.body.businessVerification.source,'provider');assert.equal(provider.body.businessVerification.alertQueued,true);
  for(const malformed of [null,[],0,'OK',{bad:'response'},{status_code:'OK',request_cnt:1,data:{0:{b_no:input.number,valid:'01',status:{b_stt_cd:'01'}},length:1}}]){
    const invalid=await w.direct('lab-buyer','/business-verifications',input,{NTS_SERVICE_KEY:'test-only-key',NTS_FETCH:async()=>Response.json(malformed)});assert.equal(invalid.status,502);assert.equal(invalid.body.error,'BUSINESS_PROVIDER_RESPONSE_INVALID');assert.deepEqual(invalid.body.businessVerification,{source:'invalid-response',alertQueued:true});
  }
  const alerts=(await w.db.prepare('SELECT actor_id,data_json FROM order_notification').all()).results.filter(row=>JSON.parse(row.data_json).caseId==='verify-case');assert.deepEqual(alerts.map(row=>row.actor_id).sort(),['lab-operator','same-operator']);assert.ok(alerts.every(row=>JSON.parse(row.data_json).priority==='urgent'));assert.doesNotMatch(JSON.stringify(alerts),/1234567890|시험 대표|시험 사업장|test-only-key|private-provider-failure/);assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation WHERE kind='business-verification'").first()).n,0);
  await w.business('no-recipient');await w.db.prepare("UPDATE r3_membership SET active=0 WHERE role='OPERATOR' AND org_id='lab-store'").run();const absent=await w.direct('lab-buyer','/business-verifications',verification(w,{caseId:'no-recipient'}));assert.equal(absent.body.businessVerification.alertQueued,false);
  await w.db.prepare('DROP TABLE order_notification').run();const storage=await w.direct('lab-buyer','/business-verifications',input);assert.equal(storage.status,503);assert.equal(storage.body.businessVerification.alertQueued,false);
});

test('NTS request/response bindings, exact replay and data minimization are enforced',async t=>{
  const w=await workspace(t);await w.business();let calls=0;const input=verification(w),env={NTS_SERVICE_KEY:'test-only-key',NTS_FETCH:async(url,init)=>{calls++;assert.equal(url.origin,'https://api.odcloud.kr');assert.equal(url.pathname,'/api/nts-businessman/v1/validate');assert.equal(init.redirect,'error');assert.ok(init.signal);const data=JSON.parse(init.body);assert.deepEqual(data.businesses,[{b_no:input.number,start_dt:input.openingDate,p_nm:input.owner,b_nm:input.name,b_sector:input.industry,b_type:input.trade}]);return ntsResponse();}};
  const result=await w.direct('lab-buyer','/business-verifications',input,env);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.item.verified,true);assert.equal(result.body.item.status,'VERIFIED');assert.match(result.body.item.inputDigest,/^[a-f0-9]{64}$/);assert.equal(calls,1);
  assert.deepEqual((await w.direct('lab-buyer','/business-verifications',input,env)).body,result.body);assert.equal(calls,1);
  assert.equal((await w.direct('lab-buyer','/business-verifications',{...input,name:'바뀐 정보'},env)).status,409);assert.equal(calls,1);
  const raw=await w.db.prepare("SELECT data_json FROM order_operation WHERE kind='business-verification'").first();assert.doesNotMatch(raw.data_json,/1234567890|시험 대표|시험 업태|test-only-key/);
  const invalid=await w.direct('lab-buyer','/business-verifications',verification(w),{...env,NTS_FETCH:async()=>ntsResponse('9999999999')});assert.equal(invalid.status,502);assert.equal(invalid.body.error,'BUSINESS_PROVIDER_RESPONSE_INVALID');
});

test('NTS completion cannot commit after the buyer site grant is removed or the case changes',async t=>{
  for(const change of ['site-grant','case-revision','case-owner']){
    const w=await workspace(t);await w.business();let calls=0;
    const env={NTS_SERVICE_KEY:'test-only-key',NTS_FETCH:async()=>{calls++;if(change==='site-grant'){await w.db.prepare("UPDATE r3_membership SET active=0 WHERE actor_id='lab-buyer' AND site_id='lab-site'").run();await w.db.prepare("INSERT INTO r3_membership VALUES('lab-buyer','BUYER','lab-store','other-site',1)").run();}else if(change==='case-revision')await w.db.prepare("UPDATE r3_case SET revision=2 WHERE id='verify-case'").run();else await w.db.prepare("UPDATE r3_case SET created_by='another-buyer' WHERE id='verify-case'").run();return ntsResponse();}};
    const result=await w.direct('lab-buyer','/business-verifications',verification(w),env);assert.equal(calls,1);assert.ok([403,409].includes(result.status),change+': '+JSON.stringify(result));
    assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation WHERE kind='business-verification'").first()).n,0,change);
    assert.equal((await w.db.prepare("SELECT count(*) n FROM order_operation_event WHERE kind='business-verification'").first()).n,0,change);
  }
});

test('a business verification request is bound to the requesting buyer and case before any provider call',async t=>{
  const w=await workspace(t);await w.business('verify-case','another-buyer');let calls=0;
  const result=await w.direct('lab-buyer','/business-verifications',verification(w),{NTS_SERVICE_KEY:'test-only-key',NTS_FETCH:async()=>{calls++;return ntsResponse();}});assert.ok([403,404].includes(result.status),JSON.stringify(result));assert.equal(calls,0);
});
