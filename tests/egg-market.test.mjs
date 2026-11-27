import test from 'node:test';
import assert from 'node:assert/strict';
import {signedWorkspace,origin} from './r3-business-identities.fixture.mjs';
import {createPriceWorkspaceModel} from '../src/server/r3-price-workspace-model.mjs';
import {createPriceWorkspaceQaTransport} from '../src/server/r3-price-workspace-qa.mjs';
import {defaultPriceRows} from '../src/server/r3-price-workspace-defaults.mjs';
import {priceWorkspace} from '../src/server/r3-price-workspace-store.mjs';
import {readEggMarket} from '../src/server/r3-egg-market.mjs';
import {handleIaRequest} from '../src/server/router.mjs';

const model=createPriceWorkspaceModel();
const now='2026-11-27T05:00:00.000Z';
const operator={id:'operator',role:'BUSINESS',email:'operator@example.invalid'};
const supplier={id:'supplier',role:'BUSINESS',email:'supplier@example.invalid'};
const quote=(price)=>{
  const d=model.initial('2026-11-01',defaultPriceRows);
  model.syncCatalogProducts(d);
  const p=d.products.find(p=>p.audience==='store'&&p.shell==='3'&&p.grade==='xl'&&p.package==='pack-30');
  p.auto=false;p.price=price;p.name='PRIVATE SUPPLIER PRODUCT';
  return d;
};
const body=(revision,price,extras={})=>({document:quote(price),action:'apply',expectedRevision:revision,requestKey:crypto.randomUUID(),...extras});
const query=()=>new URLSearchParams({shell:'3',grade:'xl',from:'2026-11-20',to:'2026-11-27'});

test('public chart projects only a deliberate table publication; private revisions, operator data and future reservations stay out',async()=>{
  const fixture=signedWorkspace(),{ORDER_QA_DB:db}=fixture.env;
  const read=()=>readEggMarket(db,query(),now);
  assert.equal((await read()).firstDate,null);
  const s=await priceWorkspace(db,supplier,null,now);
  assert.equal(s.canPublishMarket,false);
  await assert.rejects(priceWorkspace(db,supplier,body(0,'70',{publishMarket:true}),now),/MARKET_PUBLICATION_DENIED/);
  assert.equal((await priceWorkspace(db,operator,null,now)).canPublishMarket,true);
  await priceWorkspace(db,operator,body(0,'2'),now);
  await assert.rejects(priceWorkspace(db,operator,body(1,'1',{publishMarket:true,action:'draft'}),now),/REQUIRES_APPLY/);
  assert.equal((await read()).low,null);
  const published=body(1,'5400',{publishMarket:true});
  await priceWorkspace(db,operator,published,'2026-11-19T16:00:00.000Z');
  await priceWorkspace(db,operator,published,now);
  await assert.rejects(priceWorkspace(db,operator,{...published,publishMarket:false},now),/IDEMPOTENCY_CONFLICT/);
  await priceWorkspace(db,operator,body(2,'7',{action:'schedule',effectiveAt:'2026-11-30T00:00:00.000Z',publishMarket:true}),now);
  const readback=await read();assert.equal(readback.firstDate,'2026-11-20');
  assert.equal(readback.points.length,8);assert.equal(readback.points.every(p=>p.price===5400),true);
  assert.deepEqual(readback.low,{price:5400,periods:[{start:'2026-11-20',end:null}]});
  const response=await handleIaRequest(new Request(origin+'/api/ia/r3-price/workspace/chart?from=2026-11-20&to=2026-11-26&grade=xl&shell=3'),fixture.env);
  assert.equal(response.status,200);
  const safe=await response.text();assert.doesNotMatch(safe,/PRIVATE SUPPLIER PRODUCT|supplier@example|document|packing|principal|publishedBy|raw|requestKey/);
  const privateWorkspace=await handleIaRequest(new Request(origin+'/api/ia/r3-price/workspace'),fixture.env);
  assert.equal(privateWorkspace.status,403);
});

test('KST day close, as-of selection, carry-in, gaps and tied extrema never merge disjoint runs',async()=>{
  const {env:{ORDER_QA_DB:db}}=signedWorkspace();
  const applied=[
    ['2026-11-18T00:00:00.000Z','100'],['2026-11-20T14:59:00.000Z','120'],
    ['2026-11-20T15:00:00.000Z','100'],['2026-11-21T15:00:00.000Z',''],
    ['2026-11-22T15:00:00.000Z','100'],['2026-11-23T15:00:00.000Z','120'],
    ['2026-11-25T15:00:00.000Z','105'],['2026-11-25T15:00:00.000Z','100']
  ];
  for(const [i,[time,price]] of applied.entries())await priceWorkspace(db,operator,body(i,price,{publishMarket:true}),time);
  const result=await readEggMarket(db,query(),now);
  assert.deepEqual(result.points.map(p=>p.price),[120,100,null,100,120,120,100,100]);
  assert.deepEqual(result.low.periods,[{start:'2026-11-21',end:'2026-11-21'},{start:'2026-11-23',end:'2026-11-23'},{start:'2026-11-26',end:null}]);
  assert.deepEqual(result.high.periods,[{start:'2026-11-20',end:'2026-11-20'},{start:'2026-11-24',end:'2026-11-25'}]);
  const past=await readEggMarket(db,new URLSearchParams('from=2026-11-19&to=2026-11-19'),now);
  assert.equal(past.points[0].price,100);assert.equal(past.low.periods[0].end,'2026-11-19');
  await assert.rejects(readEggMarket(db,new URLSearchParams('grade=foo&grade=bar'),now),/MARKET_FILTER_INVALID/);
  await assert.rejects(readEggMarket(db,new URLSearchParams('from=2025-11-01&to=2026-11-27'),now),/MARKET_FILTER_INVALID/);
});

test('in-memory chart and price-workspace versions consume the same applied table document',async()=>{
  const qa=createPriceWorkspaceQaTransport(model,defaultPriceRows,{seedMarketHistory:true,now});
  const chart=()=>qa.request('/workspace/chart');
  const table=await qa.request('/workspace');
  assert.equal(table.canPublishMarket,true);assert.equal(table.versions.length,9);
  const start=await chart();
  assert.equal(start.points.at(-1).price,model.marketSnapshot(table.effective.document).values['3/xl']);
  assert.equal(start.low.periods.at(-1).end,null);assert.ok(start.high.price>start.low.price);
  const next=body(table.revision,'4888',{publishMarket:true});await qa.request('/workspace',next);
  assert.equal((await chart()).points.at(-1).price,4888);
  await qa.request('/workspace',body(table.revision+1,'700'));
  assert.equal((await chart()).points.at(-1).price,4888);
  qa.setScenario('guest');assert.equal((await chart()).points.at(-1).price,4888);
  await assert.rejects(qa.request('/workspace'),/ACCESS_REQUIRED/);
  qa.destroy();
});

test('a current plateau extends past the view start and equal re-publications do not reset it',async()=>{
  const {env:{ORDER_QA_DB:db}}=signedWorkspace();
  const rows=[['2026-11-01','5000'],['2026-11-05','5100'],['2026-11-08','5000'],['2026-11-12','4990'],['2026-11-12','5000'],['2026-11-26','5000']];
  for(const [i,[day,price]] of rows.entries())await priceWorkspace(db,operator,body(i,price,{publishMarket:true}),day+'T0'+(i%3)+':00:00.000Z');
  const view=await readEggMarket(db,new URLSearchParams('from=2026-11-25&to=2026-11-27'),now);
  assert.deepEqual(view.low.periods,[{start:'2026-11-08',end:null}]);assert.deepEqual(view.high,view.low);
  const qa=createPriceWorkspaceQaTransport(model,defaultPriceRows,{seedMarketHistory:true,now});
  const current=await qa.request('/workspace/chart?from=2026-11-27&to=2026-11-27');
  assert.deepEqual(current.low.periods,[{start:'2026-11-24',end:null}]);
});

test('unavailable rates, duplicate offers and unpublished cost details cannot become chart prices',()=>{
  const d=quote('0'),store=d.products.find(p=>p.audience==='store'&&p.shell==='3'&&p.grade==='xl'&&p.package==='pack-30');
  assert.equal(model.marketSnapshot(d).values['3/xl'],0);
  store.enabled=false;assert.equal(model.marketSnapshot(d).values['3/xl'],undefined);
  store.enabled=true;d.products.push({...store,id:'another'});
  assert.equal(model.marketSnapshot(d).values['3/xl'],undefined);
  d.products.pop();store.auto=true;
  d.costs['3'][0].prices.xl.packedOverride='협의';
  assert.equal(model.marketSnapshot(d).values['3/xl'],undefined);
  d.costs['3'][0].prices.xl.packedOverride='미판매';
  assert.equal(model.marketSnapshot(d).values['3/xl'],undefined);
});

test('signed operator POST publishes to the guest GET while a signed supplier and a wrong CSRF cannot change it',async()=>{
  const f=signedWorkspace(),path='/api/ia/r3-price/workspace';
  const inspect=async()=>{const res=await handleIaRequest(new Request(origin+path+'/chart?shell=3&grade=xl'),f.env);assert.equal(res.status,200);return res.json();};
  const visible=async(price,rev,who,override)=>f.request(who,path,body(rev,price,{publishMarket:true}),override);
  assert.equal((await visible('4790',0,'operator',{csrf:'wrong'})).status,403);
  assert.equal((await visible('4790',0,'supplier')).status,403);
  assert.equal((await inspect()).low,null);
  const accepted=await visible('4790',0,'operator');
  assert.equal(accepted.status,200);
  assert.equal((await inspect()).points.at(-1).price,4790);
  assert.equal((await f.request('operator',path,body(1,'9999'))).status,200);
  const view=await inspect();
  assert.equal(view.points.at(-1).price,4790);
  const getPrivate=await f.request('operator',path);
  assert.equal((await getPrivate.json()).document.products.find(p=>p.name==='PRIVATE SUPPLIER PRODUCT').price,'9999');
});
