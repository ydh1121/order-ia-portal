import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleR3Price} from '../src/server/r3-price.mjs';
import {renderR3PricePage} from '../src/server/r3-price-page.mjs';

function setup() {
  const sqlite=new DatabaseSync(':memory:');
  for(const m of ['0003_r3_roles.sql','0002_r3_price.sql','0005_r3_price_practice.sql','0006_r3_price_catalog.sql'])sqlite.exec(readFileSync(new URL('../migrations/'+m,import.meta.url),'utf8'));
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

test('PG01–09 granted catalogue, matrix variants, KST activation, CAS and immutable zero/packed/absent/consult offers',async()=>{
  const {api,edit,policy,sqlite,quote}=setup();
  const grades=['왕란','특란','대란','중란'].map((name,i)=>({id:'g'+i,name}));
  const definition={supplierName:'검수 공급처',originName:'검수 거점',productName:'계란',shells:['2'],packSizes:[30],grades};
  const update={supplierId:'src',originId:'origin',productId:'sku',expectedRevision:0,definition};
  assert.equal((await api('s','/catalog',update)).status,403);
  assert.equal((await api('a','/catalog',update)).data.revision,1);
  const table={schema:1,shell:'2',grades,rows:Array.from({length:19},(_,i)=>({min:i*10+1,max:i===18?null:(i+1)*10,cells:['100','+5','0','판매 안 함','협의','',String(i+1),'110']}))};
  const draft={...policy,unit:'tray',packSize:30,packaging:'s2.p30',matrix:table};delete draft.tiers;
  assert.equal((await edit('s','create',0,{policy:draft,requestKey:'matrix-create'})).status,200);
  assert.equal((await edit('s','create',0,{policy:draft,requestKey:'matrix-create'})).data.revision,1);
  assert.equal((await edit('s','edit',0,{policy:draft})).status,409);
  const stored=await api('s','/version?id=v1');
  assert.deepEqual(stored.data.version.policy.matrix,table);
  assert.equal((await edit('s','edit',1,{policy:{...draft,packSize:20}})).data.error,'CATALOG_CHANGED');
  assert.equal((await edit('s','submit',1)).status,200);
  assert.equal((await edit('a','approve',2)).status,200);
  const q=(qty,grade,packing)=>({...quote,requestKey:crypto.randomUUID(),lines:[{...quote.lines[0],unit:'tray',deliveryQty:qty,grade,packing}]});
  assert.equal((await api('buyer','/quote',q(10,'g0','raw'))).status,403);
  sqlite.exec("UPDATE r3_business_site SET verification='VERIFIED' WHERE org_id='biz'");
  for(const [grade,packing,expected] of [['g0','raw','1000'],['g0','packed','1050'],['g1','raw','0'],['g3','raw','10']]){
    const res=await api('buyer','/quote',q(10,grade,packing));assert.equal(res.status,200,JSON.stringify(res.data));assert.equal(res.data.response.quotes[0].total.decimal,expected);
  }
  for(const [grade,packing,error] of [['g1','packed','PRICE_NOT_OFFERED'],['g2','raw','PRICE_CONSULT'],['g2','packed','PRICE_NOT_SET'],['xx','raw','PRICE_VARIANT_REQUIRED']]){
    assert.equal((await api('buyer','/quote',q(10,grade,packing))).data.error,error);
  }
  const designated=await api('buyer','/quote',q(11,'g3','raw'));assert.equal(designated.data.response.quotes[0].total.decimal,'22');
  const successor={id:'v2',policy:draft,predecessor:'v1'};
  assert.equal((await edit('s','create',0,successor)).status,200);
  assert.equal((await edit('s','submit',1,{id:'v2'})).status,200);
  const replace={id:'v2',replacePredecessorRevision:3,reason:'새 기준 적용',requestKey:'replace-active'};
  assert.equal((await edit('a','approve',2,{...replace,replacePredecessorRevision:1})).status,409);
  assert.equal((await edit('s','approve',2,replace)).status,403);
  assert.equal((await api('s','/version?id=v1')).data.version.status,'APPROVED');
  const switched=await edit('a','approve',2,replace);
  assert.equal(switched.status,200,JSON.stringify(switched.data));
  assert.deepEqual(await edit('a','approve',2,replace),switched);
  assert.equal((await api('s','/version?id=v1')).data.version.status,'WITHDRAWN');
  assert.equal((await api('s','/version?id=v2')).data.version.status,'APPROVED');
  assert.deepEqual((await api('buyer','/quote?id='+designated.data.id)).data,designated.data);
  const prev={...draft,performance:{basis:'PREVIOUS_MONTH',scope:'SITE',event:'DELIVERED',fallback:'CONSULT'}};
  assert.equal((await edit('s','create',0,{id:'pending',policy:prev})).status,200);
  assert.equal((await edit('s','submit',1,{id:'pending'})).data.error,'PERFORMANCE_POLICY_REQUIRED');
});

test('published freight references are read-only; contract edits, independent approval and issued freight evidence remain version-bound',async()=>{
  const {api,edit,policy,sqlite,quote}=setup();
  const publicPack=(await api('s','/desk')).data.freightPack;
  assert.deepEqual([publicPack.presets.length,publicPack.rates.length,publicPack.surcharges.length],[4,137,12]);
  assert.equal(publicPack.rates.filter(r=>r.presetId==='SEMA_DISTANCE_VEHICLE_PUBLIC').length,112);
  assert.ok(publicPack.rates.every(r=>!r.enabled&&!r.customerQuoteEligible));
  assert.equal((await api('buyer','/desk')).data.freightPack,null);
  const ref=publicPack.rates.find(r=>r.presetId==='EPOST_PICKUP_PUBLIC'&&r.zone==='MAINLAND_NEXT_DAY');
  const wrapper={schema:1,selection:'CHEAPEST',splitAllowed:false,packing:{confirmed:true,unitsPerBox:2,kgPerBox:2,m3PerBox:0.01,sumCm:70,longestCm:35},contracts:[
    {id:'contract-t',name:'운송 표본',mode:'PARCEL',status:'FEE',enabled:true,priority:1,measure:'TRAYS',prefixes:['11'],days:[0,1,2,3,4,5,6],
     start:'2026-11-01',eggsConfirmed:true,termsConfirmed:true,vat:'INCLUDED',zone:ref.zone,source:{sourceId:ref.sourceId,presetId:ref.presetId,packId:publicPack.packId},
     rates:[{id:ref.id,zone:ref.zone,maxKg:ref.weightUpperKg,maxCm:ref.sumDimensionsUpperCm,amount:'137'}],extras:[]}
  ]};
  policy.delivery.carrierPolicy=wrapper;
  assert.equal((await edit('s','create',0,{policy})).status,200);
  assert.equal((await api('peer','/version?id=v1')).status,403);
  assert.equal((await edit('peer','edit',1,{policy})).status,403);
  assert.equal((await edit('s','submit',1)).status,200);
  assert.equal((await edit('s','approve',2)).status,403);
  assert.equal((await edit('a','approve',2)).status,200);
  sqlite.exec("UPDATE r3_business_site SET verification='VERIFIED'");
  const issued=await api('buyer','/quote',quote);assert.equal(issued.status,200);
  assert.equal(issued.data.response.quotes[0].total.decimal,'349');
  const snapshot=sqlite.prepare('SELECT sources_json,source_digest FROM r3_price_quote WHERE id=?').get(issued.data.id);
  const fee=JSON.parse(snapshot.sources_json).issuer.freight[0];
  assert.equal(fee.load.BOXES,2);assert.equal(fee.chosen.total,'274');assert.equal(fee.chosen.source.sourceId,ref.sourceId);
  assert.ok(!JSON.stringify(issued.data).includes('contract-t'));
  await edit('a','withdraw',3,{reason:'독립 검수'});
  wrapper.contracts[0].rates[0].amount='999';
  assert.equal((await api('s','/version',{id:'v2',expectedRevision:0,requestKey:'copy-next',action:'create',predecessor:'v1',policy})).status,200);
  const after=await api('buyer','/quote?id='+issued.data.id);
  assert.deepEqual(after,issued);
  const compare=await api('s','/version?id=v1');assert.equal(compare.data.version.policy.delivery.carrierPolicy.contracts[0].rates[0].amount,'137');
  assert.deepEqual((await api('s','/desk')).data.freightPack.rates.find(r=>r.id===ref.id),ref);
});

test('Pages freight modules preserve exact adjacent original JSON bytes',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {createHash}=await import('node:crypto');
  for(const name of ['r3-freight-public','r3-freight-regions']){
    const source=await readFile(new URL('../src/server/'+name+'.json',import.meta.url));
    const wrapper=await readFile(new URL('../src/server/'+name+'.gen.mjs',import.meta.url));
    const prefix=Buffer.from('// Lossless ESM wrapper for the adjacent source JSON and the Pages bundler.\nexport default ');
    assert.deepEqual(wrapper,Buffer.concat([prefix,source,Buffer.from(';\n')]));
    const compiled=(await import('../src/server/'+name+'.gen.mjs')).default;
    assert.deepEqual(compiled,JSON.parse(source));
    if(name==='r3-freight-public')assert.equal(createHash('sha256').update(source).digest('hex'),'5fcd88e069e084cfea9004658349527da5f4aa693d0c0c6465434e1ecbe078c0');
  }
});
