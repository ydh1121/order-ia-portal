import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleR3Price} from '../src/server/r3-price.mjs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';

function setup() {
  const sqlite=new DatabaseSync(':memory:');
  for(const m of ['0003_r3_roles.sql','0002_r3_price.sql','0005_r3_price_practice.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
  const db={async batch(statements){sqlite.exec('BEGIN');try{for(const s of statements)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}},prepare(sql){const stmt=sqlite.prepare(sql);return {bind(...args){return {first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),run:async()=>stmt.run(...args)};}};}};
  sqlite.exec("INSERT INTO r3_membership VALUES('s','SUPPLIER','src','',1),('peer','SUPPLIER','other','',1),('a','OPERATOR','src','',1),('w','OPERATOR','src','',1),('buyer','BUYER','biz','site1',1),('other-buyer','BUYER','other','site1',1); INSERT INTO r3_business_site VALUES('biz','site1','PENDING',1); INSERT INTO r3_price_scope VALUES('src','origin','sku',1); INSERT INTO r3_price_destination VALUES('biz','site1','1100000000','v1','08843')");
  const policy={supplierId:'src',originId:'origin',productId:'sku',groupId:'eggs',unit:'pack',packaging:'wrapped',policyId:'example',currency:'KRW',timeZone:'Asia/Seoul',packSize:12,minimumOrder:1,effectiveFrom:'2026-11-01T00:00:00.000Z',effectiveTo:null,rounding:'HALF_UP',discount:{ruleId:'none',type:'NONE'},tax:{ruleId:'inc',type:'INCLUDED'},performance:{basis:'DELIVERY'},tiers:[{min:1,max:null,price:'25',packMode:'FINAL'}],delivery:{ruleSetId:'terms',regionVersion:'v1',groupBasis:'SHIPMENT',regions:[{id:'local',prefix:'11',label:'QA',priority:1,minimumQty:1,weekdays:[0,1,2,3,4,5,6],status:'FREE',fee:'0'}]}};
  let time='2026-11-19T00:00:00.000Z';
  async function api(actor,path,b){
    const url='https://review.invalid/api/ia/r3-price'+path;
    const request=new Request(url,b?{method:'POST',body:JSON.stringify(b),headers:{'Content-Type':'application/json'}}:{});
    const r=await handleR3Price({request,env:{ORDER_QA_DB:db},actor:{id:actor},path:path.split('?')[0],clock:()=>time});
    assert.match(r.headers.get('cache-control'),/no-store/);
    return {status:r.status,data:await r.json()};
  }
  const edit=(actor,action,revision,extra={})=>api(actor,'/version',{id:'v1',requestKey:crypto.randomUUID(),action,expectedRevision:revision,...extra});
  const quote={orgId:'biz',siteId:'site1',inputRevision:1,requestKey:'saved-quote',lines:[{id:'line-1',productId:'sku',shipmentId:'sh',versionId:'v1',deliveryQty:3,unit:'pack',serviceDate:'2026-11-20'}]};
  return {sqlite,policy,api,edit,quote,setTime:t=>{time=t}};
}
test('supplier/operator drafts, scope grants, atomic CAS, idempotent replay, separate approver, overlap and withdrawal',async()=>{
  const {api,edit,policy,sqlite}=setup();
  const first=await edit('s','create',0,{policy,requestKey:'fixed'});assert.equal(first.status,200);
  assert.deepEqual(await edit('s','create',0,{policy,requestKey:'fixed'}),first);
  assert.equal((await edit('s','create',0,{policy:{...policy,packSize:22},requestKey:'fixed'})).status,409);
  assert.equal((await api('peer','/version?id=v1')).status,403);assert.equal((await edit('peer','edit',1,{policy})).status,403);
  assert.equal((await edit('s','edit',1,{policy:{...policy,productId:'unassigned'}})).status,403);
  const [a,b]=await Promise.all([edit('s','edit',1,{policy}),edit('w','edit',1,{policy})]);assert.deepEqual([a.status,b.status].sort(),[200,409]);
  assert.equal((await edit('s','submit',2)).data.status,'SUBMITTED');
  assert.equal((await edit('s','approve',3)).status,403);
  assert.equal((await edit('a','return',3,{reason:'조건 보완'})).data.status,'RETURNED');
  assert.equal((await edit('w','submit',4)).data.status,'SUBMITTED');
  assert.equal((await edit('w','approve',5)).status,409);
  assert.equal((await edit('a','approve',5)).data.status,'APPROVED');
  assert.equal((await edit('a','edit',6,{policy})).status,409);
  await edit('s','create',0,{id:'v2',policy,predecessor:'v1'});await edit('s','submit',1,{id:'v2'});
  assert.equal((await edit('a','approve',2,{id:'v2'})).status,409);
  assert.equal((await edit('a','withdraw',6,{reason:'검수 변경'})).data.status,'WITHDRAWN');
  assert.equal((await edit('a','approve',2,{id:'v2'})).data.status,'APPROVED');
  assert.equal(sqlite.prepare("SELECT count(*) n FROM r3_price_event WHERE version_id='v1'").get().n,7);
});
test('customer verified membership, trusted destination, server-owned price, immutable quotation and enforced expiry',async()=>{
  const {api,edit,policy,sqlite,quote,setTime}=setup();
  await edit('s','create',0,{policy});await edit('s','submit',1);await edit('a','approve',2);
  const locked=await api('buyer','/quote',{...quote,approved:true,verified:true,region:'1100000000',unitPrice:9});assert.deepEqual(locked,{status:403,data:{error:'ACCESS_REQUIRED'}});
  sqlite.exec("UPDATE r3_business_site SET verification='VERIFIED' WHERE org_id='biz'");
  const q=await api('buyer','/quote',quote);assert.equal(q.status,200);assert.equal(q.data.response.quotes[0].total.decimal,'75');assert.equal(q.data.expiresAt,'2026-11-26T00:00:00.000Z');assert.equal(q.data.response.quotes[0].comparison,null);
  assert.deepEqual(await api('buyer','/quote',quote),q);assert.equal(sqlite.prepare('SELECT count(*) n FROM r3_price_quote').get().n,1);
  assert.deepEqual((await api('other-buyer','/quote?id='+q.data.id)).data,{error:'ACCESS_REQUIRED'});
  assert.equal((await api('s','/quote?id='+q.data.id)).status,403);
  await edit('a','withdraw',3,{reason:'검증 철회'});assert.equal((await api('buyer','/quote',{...quote,requestKey:'new'})).status,422);
  assert.deepEqual(await api('buyer','/quote?id='+q.data.id),q);
  assert.throws(()=>sqlite.prepare('UPDATE r3_price_quote SET result_json=?').run('{}'),/IMMUTABLE_SNAPSHOT/);
  sqlite.exec("UPDATE r3_business_site SET verification='REVOKED'");assert.deepEqual((await api('buyer','/quote?id='+q.data.id)).data,{error:'ACCESS_REQUIRED'});
  sqlite.exec("UPDATE r3_business_site SET verification='VERIFIED'");setTime(q.data.expiresAt);assert.deepEqual((await api('buyer','/quote?id='+q.data.id)).data,{id:q.data.id,status:'EXPIRED',expiresAt:q.data.expiresAt});
});
test('protected desk returns assigned version history, rendered form contains no private source or price',async()=>{
  const {api,edit,policy}=setup();await edit('s','create',0,{policy});
  assert.equal((await api('a','/desk')).data.versions[0].id,'v1');assert.deepEqual((await api('peer','/desk')).data.versions,[]);
  assert.equal((await api('a','/version?id=v1')).data.history.length,1);
  const html=renderR3PricePage('safe_nonce');assert.match(html,/nonce="safe_nonce"/);assert.match(html,/미리 계산/);assert.doesNotMatch(html,/example-co|6,090|5,900|window\.opener|localStorage/);
});

test('private role practice uses separate stored tables scoped to the reviewer, with no real memberships or prices',async()=>{
  const {api,policy,sqlite}=setup();
  await api('ungranted-owner','/practice/supplier/start',{});
  const desk=await api('ungranted-owner','/practice/supplier/desk');
  assert.equal(desk.data.scopes.length,1);
  const target=desk.data.scopes[0];
  const draft={...policy,supplierId:target.supplier_id,originId:target.origin_id,productId:target.product_id};
  const put=(persona,action,expectedRevision,extra={})=>api('ungranted-owner','/practice/'+persona+'/version',{id:'practice-version',requestKey:'practice-'+action,expectedRevision,action,...extra});
  assert.equal((await put('supplier','create',0,{policy:draft})).status,200);
  assert.equal((await put('supplier','submit',1)).status,200);
  assert.equal((await put('supplier','approve',2)).status,403);
  assert.equal((await put('operator','approve',2)).status,200);
  assert.equal((await api('ungranted-owner','/desk')).data.scopes.length,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM r3_price_version').get().n,0);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM r3_practice_price_version').get().n,1);
  assert.equal((await api('second-owner','/practice/operator/version?id=practice-version')).status,403);
  await api('second-owner','/practice/buyer/start',{});
  const theirSite=(await api('second-owner','/practice/buyer/sites')).data.sites[0];
  const options=await api('second-owner','/practice/buyer/offers?org='+theirSite.org_id+'&site='+theirSite.site_id);
  assert.deepEqual(options.data.offers,[]);
  const issue=await api('second-owner','/practice/buyer/quote',{orgId:theirSite.org_id,siteId:theirSite.site_id,requestKey:'private-quote',inputRevision:1,lines:[{id:'l',shipmentId:'sh',productId:target.product_id,versionId:'practice-version'}]});
  assert.equal(issue.status,422);
});
