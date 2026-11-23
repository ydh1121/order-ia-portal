import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleProductLab,namespaceDb,namespaceSql} from '../src/server/product-lab.mjs';
import {labSchema} from '../src/server/product-lab-schema.gen.mjs';

export function sqliteD1(sqlite){
 const prepare=(query,params=[])=>({query,params,bind:(...args)=>prepare(query,args),first:async()=>sqlite.prepare(query).get(...params)||null,all:async()=>({results:sqlite.prepare(query).all(...params)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...params).changes)}})});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements){const statement=sqlite.prepare(s.query);if(statement.columns().length)result.push({results:statement.all(...s.params),meta:{changes:0}});else result.push({results:[],meta:{changes:Number(statement.run(...s.params).changes)}});}sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');console.error('SQL batch:',error.message);throw error;}}};
}
export function labWorkspace(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
 let productionTouches=0;const production={prepare(){productionTouches++;throw Error('production accessed');}};
 const env={ORDER_LAB_DB:sqliteD1(sqlite),ORDER_QA_DB:production,CF_PAGES_COMMIT_SHA:'test-source'};
 const owner={id:'review-owner',role:'OWNER',expiresAt:Date.now()/1000+43200};
 async function api(path,b,identity=owner){const response=await handleProductLab({request:new Request('https://lab.test/api/ia/lab'+path,b?{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://lab.test','X-IA-CSRF':'csrf'},body:JSON.stringify(b)}:{}),env,actor:identity,path,csrf:'csrf',clock:()=> '2026-11-20T00:00:00.000Z'});return {status:response.status,body:await response.json()};}
 const create=async(label='검증 실행')=>{const r=await api('/runs',{label,requestKey:crypto.randomUUID()});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.run.state,'ACTIVE');return r.body.run.id;};
 const product=(run,role,path,b)=>api(`/runs/${run}/as/${role}/product${path}`,b);
 const command=(action,extra={})=>({action,expectedRevision:0,requestKey:crypto.randomUUID(),...extra});
 return {sqlite,env,owner,api,create,product,command,productionTouches:()=>productionTouches};
}
test('fresh lab applies canonical schema, actual price approval and 152 defaults without touching production',async()=>{
 const w=labWorkspace(),run=await w.create();const p=await w.product(run,'buyer','/purchases');assert.equal(p.status,200,JSON.stringify(p.body));assert.equal(p.body.offers.length,8);
 const db=namespaceDb(w.env.ORDER_LAB_DB,run),policy=JSON.parse((await db.prepare('SELECT policy_json FROM r3_price_version').first()).policy_json);
 assert.equal(policy.matrix.rows.length,19);assert.equal(policy.matrix.rows.flatMap(r=>r.cells).length,152);
 assert.equal((await db.prepare('SELECT count(*) n FROM r3_price_event').first()).n,3);
 assert.equal(w.productionTouches(),0);assert.equal(labSchema.tables.length,28);
 assert.equal(namespaceSql("SELECT 'r3_membership',x FROM r3_membership -- r3_membership",run),`SELECT 'r3_membership',x FROM lab_${run}_r3_membership -- r3_membership`);
});
test('canonical persisted purchase: server quote, separate manual confirmer, real dispatch, receipt, reload and atomic revision',async()=>{
 const w=labWorkspace(),run=await w.create(),offers=(await w.product(run,'buyer','/purchases')).body.offers;
 const request=w.command('create',{offerId:offers[0].id,quantity:31,paymentMethod:'cash',channel:'farm'});
 const created=await w.product(run,'buyer','/purchases',request);assert.equal(created.status,200,JSON.stringify(created.body));let item=created.body.item;
 assert.equal(item.total,5970*31);assert.equal(item.status,'AWAITING_CASH');assert.deepEqual((await w.product(run,'buyer','/purchases',request)).body,created.body);
 assert.equal((await w.product(run,'buyer','/purchases',w.command('confirm-cash',{id:item.id,expectedRevision:1,reference:'BANK-TEST'}))).status,403);
 const paid=await w.product(run,'operator','/purchases',w.command('confirm-cash',{id:item.id,expectedRevision:1,reference:'BANK-TEST'}));assert.equal(paid.status,200,JSON.stringify(paid.body));item=paid.body.item;assert.equal(item.paid,item.total);assert.ok(item.receiptId);
 const dispatch=await w.product(run,'supplier','/purchases',w.command('dispatch',{id:item.id,expectedRevision:2,carrier:'farm',tracking:''}));assert.equal(dispatch.body.item.status,'DISPATCHED');
 const stale=await w.product(run,'supplier','/purchases',w.command('dispatch',{id:item.id,expectedRevision:2,carrier:'farm'}));assert.equal(stale.status,409);
 assert.equal((await w.product(run,'buyer','/purchases',w.command('receive',{id:item.id,expectedRevision:3}))).body.item.status,'RECEIVED');
 const documents=await w.product(run,'buyer','/documents/'+item.id);assert.equal(documents.body.receipt.paid,item.total);
 assert.equal((await w.product(run,'buyer','/purchases')).body.items[0].status,'RECEIVED');
 assert.equal((await w.product(run,'operator','/sales')).body.items[0].paid,item.total);
 assert.ok((await w.product(run,'buyer','/notifications')).body.items.length>=4);assert.equal(w.productionTouches(),0);
});
test('guest never receives confidential quotes; role and separate-run isolation cannot be selected through request data',async()=>{
 const w=labWorkspace(),a=await w.create('A'),b=await w.create('B'),offer=(await w.product(a,'buyer','/purchases')).body.offers[0];
 const created=await w.product(a,'buyer','/purchases',w.command('create',{offerId:offer.id,quantity:10,paymentMethod:'cash',channel:'store'}));assert.equal(created.status,200);
 assert.equal((await w.product(b,'buyer','/purchases')).body.items.length,0);
 assert.equal((await w.product(b,'operator','/documents/'+created.body.item.id)).status,404);
 const guest=await w.product(a,'guest','/purchases');assert.equal(guest.status,401);assert.doesNotMatch(JSON.stringify(guest.body),/5980|total|price/i);
 assert.equal((await w.api('/runs/'+a,undefined,{id:'someone',role:'OWNER'})).status,404);
 assert.equal((await w.api('/runs',undefined,{id:'lab-buyer',role:'BUSINESS'})).status,403);
 assert.equal((await w.product(a,'buyer','/purchases',w.command('create',{offerId:offer.id,quantity:10,paymentMethod:'cash',channel:'store',unitPrice:1}))).status,400);
});
test('snapshot reads all tables atomically, restores a fresh run, and does not overwrite the original or corrupt data',async()=>{
 const w=labWorkspace(),a=await w.create('원본'),offer=(await w.product(a,'buyer','/purchases')).body.offers[0];
 const created=(await w.product(a,'buyer','/purchases',w.command('create',{offerId:offer.id,quantity:10,paymentMethod:'cash',channel:'farm'}))).body.item;
 const backup=await w.api('/runs/'+a+'/snapshots',{label:'저장 후 백업'});assert.equal(backup.status,200,JSON.stringify(backup.body));
 const snapshot=backup.body.snapshot;assert.match(snapshot.digest,/^[a-f0-9]{64}$/);
 await w.product(a,'buyer','/purchases',w.command('cancel',{id:created.id,expectedRevision:1}));
 const restored=await w.api('/snapshots/'+snapshot.id+'/restore',{label:'복원 검증',requestKey:crypto.randomUUID()});assert.equal(restored.status,200,JSON.stringify(restored.body));const b=restored.body.run.id;
 assert.notEqual(a,b);assert.equal((await w.product(b,'buyer','/purchases')).body.items[0].status,'AWAITING_CASH');assert.equal((await w.product(a,'buyer','/purchases')).body.items[0].status,'CANCELLED');
 const after=await w.api('/runs/'+b+'/snapshots',{label:'복원 후 비교'}),readA=await w.api('/snapshots/'+snapshot.id),readB=await w.api('/snapshots/'+after.body.snapshot.id);assert.deepEqual(readA.body.tables,readB.body.tables);
 w.sqlite.prepare('UPDATE product_lab_snapshot SET content=? WHERE id=?').run('{}',snapshot.id);
 assert.equal((await w.api('/snapshots/'+snapshot.id+'/restore',{label:'오염본 복원',requestKey:crypto.randomUUID()})).status,409);
 assert.equal((await w.product(a,'buyer','/purchases')).body.items[0].status,'CANCELLED');assert.equal(w.productionTouches(),0);
});
test('drafts retain only newest simple/detailed value, concurrency errors preserve input, and card never reports false payment',async()=>{
 const w=labWorkspace(),run=await w.create();
 let b=w.command('save',{data:{business:'A'}});assert.equal((await w.product(run,'buyer','/drafts/simple',b)).body.revision,1);
 assert.equal((await w.product(run,'buyer','/drafts/simple',b)).body.revision,1);
 assert.equal((await w.product(run,'buyer','/drafts/simple',w.command('save',{data:{business:'stale'}}))).status,409);
 assert.equal((await w.product(run,'buyer','/drafts/detailed',w.command('save',{data:{business:'B'}}))).body.revision,1);
 await w.product(run,'buyer','/drafts/simple',w.command('save',{expectedRevision:1,data:{business:'new'}}));
 const db=namespaceDb(w.env.ORDER_LAB_DB,run);assert.equal((await db.prepare('SELECT count(*) n FROM order_quote_draft').first()).n,2);
 const offer=(await w.product(run,'buyer','/purchases')).body.offers[0],order=(await w.product(run,'buyer','/purchases',w.command('create',{offerId:offer.id,quantity:10,paymentMethod:'card',channel:'store'}))).body.item;
 const pay=await w.product(run,'buyer','/purchases',w.command('card',{id:order.id,expectedRevision:1}));assert.equal(pay.status,503);assert.equal(pay.body.error,'PAYMENT_PROVIDER_UNAVAILABLE');
 assert.equal((await w.product(run,'buyer','/purchases')).body.items[0].paid,0);
});
test('misbinding owner/review DB fails closed before namespace creation',async()=>{
 const w=labWorkspace();w.sqlite.exec('CREATE TABLE qa_review_events(id TEXT)');
 const result=await w.api('/runs',{label:'불가',requestKey:crypto.randomUUID()});assert.equal(result.status,503);assert.equal(result.body.error,'LAB_DATABASE_ISOLATION_FAILED');
 assert.equal(w.sqlite.prepare('SELECT count(*) n FROM product_lab_run').get().n,0);
});
