import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {signedWorkspace} from './r3-business-identities.fixture.mjs';
import {createPriceMatrixModel} from '../src/server/order-engine/calculation/price-matrix.mjs';
import {personalPrice} from '../src/server/r3-personal-price.mjs';

const template=createPriceMatrixModel();
const grades=[['king','왕란'],['xl','특란'],['large','대란'],['medium','중란']].map(([id,name])=>({id,name}));
const ref=readFileSync(new URL('./fixtures/egg-price-reference-20261109.tsv',import.meta.url),'utf8').trimEnd().split('\n').slice(1).map(row=>row.split('\t').slice(2));
const draft={name:'2026-11-09 참고 단가 작성',supplierName:null,originName:null,productName:'계란',shell:null,packSize:null,minimumOrder:10,
  matrix:{schema:1,grades,rows:template.emptyRows(4).map((r,i)=>({...r,cells:ref[i].map(v=>Number(v).toLocaleString('ko-KR')+'원')}))}};
const at='2026-11-19T00:00:00.000Z';
const actor={id:'owner',role:'OWNER',email:'owner-one@example.invalid'};
const jsonError=async(fn,status)=>assert.rejects(fn,error=>error.status===status);
const request=(revision,value=draft)=>({action:'save',requestKey:crypto.randomUUID(),expectedRevision:revision,draft:value});

test('a private first price draft scopes the complete source matrix to the authenticated account and renders no commercial side effects',async()=>{
  const f=signedWorkspace(),db=f.env.ORDER_QA_DB;
  const count=t=>Number(f.db.prepare('SELECT COUNT(*) n FROM '+t).get().n);
  const tables=['r3_membership','r3_price_version','r3_price_event','r3_price_scope','r3_price_catalog','r3_price_quote','r3_price_connection'];
  const before=tables.map(count);
  assert.equal((await personalPrice(db,actor,null,at)).revision,0);
  const body=request(0);
  const first=await personalPrice(db,actor,body,at);
  assert.equal(first.revision,1);assert.deepEqual(first.draft.matrix.rows.map(r=>r.cells),ref);
  assert.equal(first.draft.packSize,null);assert.equal(first.draft.shell,null);assert.equal(first.draft.supplierName,null);
  assert.equal((await personalPrice(db,{...actor,email:' OWNER-ONE@example.invalid '},null,at)).revision,1);
  for(const other of [{...actor,email:'other@example.invalid'},{...actor,role:'BUSINESS'},{...actor,id:'another-subject'}])
    assert.deepEqual(await personalPrice(db,other,null,at),{revision:0,updatedAt:null,draft:null});
  await jsonError(()=>personalPrice(db,{id:'owner',role:'OWNER'},null,at),403);
  await jsonError(()=>personalPrice(db,{...actor,role:'REVIEWER'},null,at),403);
  assert.deepEqual(await personalPrice(db,actor,body,at),first);
  await jsonError(()=>personalPrice(db,actor,{...body,draft:{...draft,name:'다른 요청'}},at),409);
  await jsonError(()=>personalPrice(db,actor,request(0),at),409);
  const revisions=await Promise.allSettled([personalPrice(db,actor,request(1,{...draft,name:'A'}),at),personalPrice(db,actor,request(1,{...draft,name:'B'}),at)]);
  assert.deepEqual(revisions.map(r=>r.status).sort(),['fulfilled','rejected']);
  assert.equal(revisions.find(r=>r.status==='rejected').reason.status,409);
  assert.equal((await personalPrice(db,actor,body,at)).revision,1);
  assert.equal((await personalPrice(db,actor,null,at)).revision,2);
  assert.equal(count('r3_personal_price_edit'),2);assert.deepEqual(tables.map(count),before);
  const keys=f.db.prepare('SELECT DISTINCT principal FROM r3_personal_price_edit').all();assert.equal(keys.length,1);assert.match(keys[0].principal,/^[a-f0-9]{64}$/);
});

test('import explicitly selects a currently writable matching product and only returns a draft, including unknown shell or pack',async()=>{
  const f=signedWorkspace(),db=f.env.ORDER_QA_DB,who={id:'supplier',role:'BUSINESS',email:'supplier@example.invalid'};
  const def={supplierName:'등록 공급처',originName:'출고장',productName:'계란',shells:['4'],packSizes:[12,30],grades:grades.map(g=>({...g,id:'cat-'+g.id}))};
  f.db.prepare("UPDATE r3_price_catalog SET definition=? WHERE supplier_id='farm'").run(JSON.stringify(def));
  await personalPrice(db,who,request(0),at);
  const prepare={action:'prepare-import',expectedRevision:1,supplierId:'farm',originId:'dep',productId:'sku',shell:'4',packSize:30};
  await jsonError(()=>personalPrice(db,who,{...prepare,supplierId:'other'},at),403);
  await jsonError(()=>personalPrice(db,who,{...prepare,shell:'2'},at),422);
  await jsonError(()=>personalPrice(db,who,{...prepare,packSize:15},at),422);
  await jsonError(()=>personalPrice(db,who,{...prepare,expectedRevision:0},at),409);
  const prepared=await personalPrice(db,who,prepare,at);assert.equal(prepared.shell,'4');assert.equal(prepared.packSize,30);
  assert.deepEqual(prepared.matrix.grades,def.grades);assert.deepEqual(prepared.matrix.rows.map(r=>r.cells),ref);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM r3_price_version').get().n,0);
  await personalPrice(db,who,request(1,{...draft,supplierName:'다른 공급처'}),at);
  await jsonError(()=>personalPrice(db,who,{...prepare,expectedRevision:2},at),422);
  f.db.prepare("UPDATE r3_price_scope SET active=0").run();
  await jsonError(()=>personalPrice(db,who,{...prepare,expectedRevision:2},at),403);
});
