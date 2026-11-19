import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createPriceWorkspaceModel} from '../src/server/r3-price-workspace-model.mjs';
import {createPriceWorkbookReader} from '../src/server/r3-price-workspace-xlsx.mjs';
import {importPriceWorkbook} from '../src/server/r3-price-workspace-import.mjs';
import {defaultPriceRows} from '../src/server/r3-price-workspace-defaults.mjs';
import {priceWorkspace} from '../src/server/r3-price-workspace-store.mjs';
import {personalPrice} from '../src/server/r3-personal-price.mjs';
import {signedWorkspace} from './r3-business-identities.fixture.mjs';
const model=createPriceWorkspaceModel(),today='2026-11-19',now=today+'T00:00:00.000Z';
const actor={id:'supplier',role:'BUSINESS',email:'supplier@example.invalid'};
const seed=()=>model.initial(today,defaultPriceRows);
const legacy=()=>({name:'기존 입력',supplierName:null,originName:null,productName:null,shell:null,packSize:30,minimumOrder:10,matrix:{schema:1,grades:model.standard.slice(0,4).map(({id,name})=>({id,name})),rows:defaultPriceRows}});

test('existing 19 ranges and all 152 raw/packed prices survive additive-fee conversion',()=>{
  const d=model.normalize(model.initial(today,defaultPriceRows,legacy()));
  const restored=d.costs.unspecified.flatMap(r=>d.grades.slice(0,4).flatMap(g=>{const c=model.calculated(d,'unspecified',r.id,g.id);return [String(c.raw),String(c.packed)];}));
  assert.deepEqual(restored,defaultPriceRows.flatMap(r=>r.cells));assert.equal(restored.length,152);
  const changed=legacy();changed.matrix=model.clone(changed.matrix);changed.matrix.rows[0].cells[0]='7777';changed.matrix.rows[0].cells[1]='7987';
  assert.equal(model.initial(today,defaultPriceRows,changed).costs.unspecified[0].prices.king.raw,'7777');
});
test('legacy final prices, blank raw values, decimals and commercial conditions stay exact through normalization and PG round trip',()=>{
  const old=legacy();old.matrix=model.clone(old.matrix);old.matrix.rows[0].cells=['7777','7000','','7000','협의','미판매','12.1234','12.1234'];
  const d=model.normalize(model.initial(today,defaultPriceRows,old));
  assert.deepEqual(model.calculated(d,'unspecified','range-0','king'),{raw:7777,packed:7000});
  assert.deepEqual(model.calculated(d,'unspecified','range-0','xl'),{raw:null,packed:7000});
  assert.deepEqual(model.calculated(d,'unspecified','range-0','large'),{raw:'협의',packed:'미판매'});
  assert.deepEqual(model.calculated(d,'unspecified','range-0','medium'),{raw:12.1234,packed:12.1234});
  const before=JSON.stringify(d.costs);d.pg.rate='3.3';model.pg(d,true);model.pg(d,false);assert.equal(JSON.stringify(d.costs),before);assert.doesNotThrow(()=>model.normalize(d));
});
test('PG apply is idempotent and removal restores exact amounts without drift; negative bulk is atomic',()=>{
  const d=seed(),before=JSON.stringify(d.costs);d.pg.rate='3.3';model.pg(d,true);const first=JSON.stringify(d.costs);model.pg(d,true);assert.equal(JSON.stringify(d.costs),first);model.pg(d,false);assert.deepEqual(Object.values(d.costs).flat().flatMap(r=>Object.values(r.prices).map(p=>[p.raw,p.packing])),Object.values(JSON.parse(before)).flat().flatMap(r=>Object.values(r.prices).map(p=>[p.raw,p.packing])));
  const unchanged=JSON.stringify(d);assert.throws(()=>model.bulk(d,'1','packing',-99999),/NEGATIVE/);assert.equal(JSON.stringify(d),unchanged);
});
test('quantity boundary auto completion, grade sorting and selection rectangles preserve stable data keys',()=>{
  const rs=[{id:'a',min:1,max:99},{id:'b',min:null,max:null},{id:'c',min:201,max:null}];model.bound(rs,1,'min',100);assert.deepEqual([rs[1].min,rs[1].max],[100,200]);rs[1].min=null;model.bound(rs,1,'max',150);assert.deepEqual([rs[1].min,rs[1].max],[100,150]);
  const d=seed();d.grades.push({id:'new',name:'추가 규격',weight:56});model.order(d);assert.deepEqual(d.grades.map(g=>g.weight),[68,60,56,52,44,0]);
  assert.deepEqual(model.rectangle(['king','xl','large'],['6','10','30'],{grade:'king',pack:'10'},{grade:'xl',pack:'30'}),['king/10','king/30','xl/10','xl/30']);
});
test('automatic products use per-range packing fees, keep zero overrides and need explicit new-pack fees',()=>{
  const d=seed(),p={id:'test',name:'매장 상품',shell:'1',grade:'king',package:'pack-30',audience:'store',price:'',auto:true,enabled:true};
  assert.equal(model.productPrice(d,p),6190);d.costs['1'][0].discount='10';assert.equal(model.productPrice(d,p),5592);
  p.package='pack-10';assert.equal(model.productPrice(d,p),null);d.packaging['1/king/pack-10']={fee:'100',fees:{'range-0':'0'},carriers:[]};assert.equal(model.productPrice(d,p),1794);
  p.auto=false;p.price='0';assert.equal(model.productPrice(d,p),0);d.products=[p];assert.doesNotThrow(()=>model.normalize(d));
});
test('classification tree moves preserve source values, block overwrite, map quantity bands and leave base prices unchanged',()=>{
  const d=seed();d.carriers=[{id:'farm',name:'농장',type:'farm',base:'',remote:'',regions:''}];
  d.packaging['1/king/pack-30']={fee:'210',fees:{'range-0':'190'},carriers:['farm']};d.packaging['1/xl/pack-30']={fee:'400',fees:{'range-0':'350'},carriers:[]};
  const costs=JSON.stringify(d.costs),before=JSON.stringify(d.packaging);
  assert.throws(()=>model.movePackaging(d,{shell:'1',grade:'king',pack:'pack-30'},{shell:'1',grade:'xl'}),/TRANSFER_CONFLICT/);assert.equal(JSON.stringify(d.packaging),before);
  model.movePackaging(d,{shell:'1',grade:'king',pack:'pack-30'},{shell:'1',grade:'xl'},'swap');assert.equal(d.packaging['1/king/pack-30'].fee,'400');assert.equal(d.packaging['1/xl/pack-30'].fee,'210');assert.equal(JSON.stringify(d.costs),costs);
  d.costs['2']=d.costs['2'].map(r=>({...r,id:'other-'+r.id}));model.movePackaging(d,{shell:'1',grade:'xl',pack:'pack-30'},{shell:'2',grade:'medium'});
  assert.equal(d.packaging['1/xl/pack-30'].enabled,false);assert.equal(d.packaging['1/xl/pack-30'].fees['range-0'],'190');assert.equal(d.packaging['2/medium/pack-30'].fees['other-range-0'],'190');assert.deepEqual(d.packaging['2/medium/pack-30'].carriers,['farm']);assert.doesNotThrow(()=>model.normalize(d));
  assert.equal(model.productPrice(d,{shell:'1',grade:'xl',package:'pack-30',auto:false,price:'5000'}),'미판매');
  const invalid=model.clone(d);invalid.costs['3'][0].max=9;assert.throws(()=>model.movePackaging(invalid,{shell:'2',grade:'medium',pack:'pack-30'},{shell:'3',grade:'king'}),/TRANSFER_RANGE/);
});
test('server scheduled versions become effective exactly at their timestamp without browser activity',async()=>{
  const f=signedWorkspace(),db=f.env.ORDER_QA_DB,d=seed();
  await priceWorkspace(db,actor,{action:'apply',document:d,expectedRevision:0,requestKey:crypto.randomUUID()},now);
  d.costs['1'][0].prices.king.raw='7000';const effectiveAt='2026-11-20T04:30:00.000Z';
  await priceWorkspace(db,actor,{action:'schedule',document:d,expectedRevision:1,requestKey:crypto.randomUUID(),effectiveAt},now);
  const draft=model.clone(d);draft.costs['1'][0].prices.king.raw='8000';await priceWorkspace(db,actor,{action:'draft',document:draft,expectedRevision:2,requestKey:crypto.randomUUID()},now);
  assert.equal((await priceWorkspace(db,actor,null,'2026-11-20T04:29:59.999Z')).effective.document.costs['1'][0].prices.king.raw,'5980');
  const active=await priceWorkspace(db,actor,null,effectiveAt);assert.equal(active.effective.revision,2);assert.equal(active.effective.document.costs['1'][0].prices.king.raw,'7000');assert.equal(active.document.costs['1'][0].prices.king.raw,'8000');
  assert.equal((await priceWorkspace(db,actor,null,effectiveAt,'1')).document.costs['1'][0].prices.king.raw,'5980');
  assert.throws(()=>f.db.exec("UPDATE r3_price_workspace_event SET action='draft'"),/IMMUTABLE/);
});
test('lost schedule responses can replay after the scheduled timestamp and metadata does not leak document values',async()=>{
  const f=signedWorkspace(),body={action:'schedule',document:seed(),expectedRevision:0,requestKey:crypto.randomUUID(),effectiveAt:'2026-11-19T00:01:00.000Z'};
  const first=await priceWorkspace(f.env.ORDER_QA_DB,actor,body,now),retry=await priceWorkspace(f.env.ORDER_QA_DB,actor,body,'2026-11-19T00:01:01.000Z');assert.deepEqual(retry.saved,first.saved);
  const metadata=await priceWorkspace(f.env.ORDER_QA_DB,actor,null,'2026-11-19T00:01:01.000Z',null,{metadata:true});assert.equal(metadata.effective.revision,1);assert(!('document' in metadata));assert(!('document' in metadata.effective));
});
test('conflicts retain revisions, retries are idempotent, principals stay separate and legacy source is untouched',async()=>{
  const f=signedWorkspace(),db=f.env.ORDER_QA_DB;
  await personalPrice(db,actor,{action:'save',draft:legacy(),expectedRevision:0,requestKey:crypto.randomUUID()},now);
  const initial=await priceWorkspace(db,actor,null,now);assert.equal(initial.document.costs.unspecified.length,19);
  const body={action:'draft',document:initial.document,expectedRevision:0,requestKey:crypto.randomUUID()};await priceWorkspace(db,actor,body,now);await priceWorkspace(db,actor,body,now);
  await assert.rejects(()=>priceWorkspace(db,actor,{...body,requestKey:crypto.randomUUID()},now),/REVISION_CONFLICT/);
  const changed=model.clone(body);changed.document.date='2026-11-21';await assert.rejects(()=>priceWorkspace(db,actor,changed,now),/IDEMPOTENCY_CONFLICT/);
  const other={...actor,id:'supplier2',email:'supplier2@example.invalid'};assert.equal((await priceWorkspace(db,other,null,now)).revision,0);await assert.rejects(()=>priceWorkspace(db,other,null,now,'1'),/NOT_FOUND/);
  assert.deepEqual((await personalPrice(db,actor,null,now)).draft.matrix.rows,defaultPriceRows);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM r3_price_version').get().n,0);
});
test('authenticated endpoint requires CSRF for writes and is not accessible through practice endpoints',async()=>{
  const f=signedWorkspace(),body={action:'draft',document:seed(),expectedRevision:0,requestKey:crypto.randomUUID()};
  assert.equal((await f.request('supplier','/api/ia/r3-price/workspace',body,{csrf:'bad'})).status,403);
  assert.equal((await f.request('supplier','/api/ia/r3-price/workspace',body)).status,200);
  assert.equal((await f.request('supplier','/api/ia/r3-price/workspace?revision=1')).status,200);
  assert.notEqual((await f.request('supplier','/api/ia/r3-price/practice/supplier/workspace')).status,200);
});
test('public xlsx is a blank workbook without private prices; populated imports preserve unrelated data and reject duplicate/invalid ranges',async()=>{
  const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom'),dom=new JSDOM('');
  const old=globalThis.DOMParser;globalThis.DOMParser=dom.window.DOMParser;
  try{
    const bytes=await readFile(new URL('../public/price-template.xlsx',import.meta.url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),book=await createPriceWorkbookReader().read(buffer,'price-template.xlsx');
    assert.deepEqual(book.sheets.map(s=>s.name),['개별 비용','상품 분류','배송수단','판매 상품']);
    const text=JSON.stringify(book);for(const value of ['권희','5980','6190','5690','5900','example.invalid'])assert(!text.includes(value),'public template contains no original price or identity: '+value);
    for(const row of book.sheets[0].rows.slice(5)){assert.equal(row[5]??'','');assert.equal(row[6]??'','');}
    const populated=model.clone(book);populated.sheets[0].rows=populated.sheets[0].rows.slice(0,6);populated.sheets[0].rows[5]=['',1,'왕란',1,10,7000,300,0];
    const imported=importPriceWorkbook(model,seed(),populated,'costs');assert.equal(imported.count,1);assert.equal(imported.document.costs['1'].length,19);assert.equal(imported.document.costs['1'][0].prices.king.raw,'7000');assert.equal(imported.document.costs['1'][0].prices.king.packing,'300');assert.deepEqual(imported.document.costs['1'].slice(1),seed().costs['1'].slice(1));
    const duplicate=model.clone(populated);duplicate.sheets[0].rows.push(duplicate.sheets[0].rows[5]);assert.throws(()=>importPriceWorkbook(model,seed(),duplicate,'costs'),/중복/);
    const invalid=model.clone(populated);invalid.sheets[0].rows[5][5]=-10;assert.throws(()=>importPriceWorkbook(model,seed(),invalid,'costs'),/숫자/);
    await assert.rejects(()=>createPriceWorkbookReader().read(new Uint8Array(20).buffer,'broken.xlsx'),/올바른/);
  }finally{globalThis.DOMParser=old;dom.window.close();}
});
test('classification partial import preserves range packing fees and omitted carrier assignments',()=>{
  const d=seed();d.carriers=[{id:'farm',name:'농장',type:'farm',base:'',remote:'',regions:''}];d.packaging['1/king/pack-30']={fee:'300',fees:{'range-0':'200'},carriers:['farm']};
  const result=importPriceWorkbook(model,d,{sheets:[{name:'상품 분류',rows:[['난각번호','규격','포장구수','포장비'],[1,'왕란',30,350]]}]},'classification').document;
  assert.deepEqual(result.packaging['1/king/pack-30'],{fee:'350',fees:{'range-0':'200'},carriers:['farm']});
  d.packaging['1/king/pack-30'].enabled=false;
  const inactive=importPriceWorkbook(model,d,{sheets:[{name:'상품 분류',rows:[['난각번호','규격','포장구수','포장비'],[1,'왕란',30,200]]}]},'classification').document;
  assert.equal(inactive.packaging['1/king/pack-30'].enabled,false);assert.equal(model.productPrice(inactive,{shell:'1',grade:'king',package:'pack-30',auto:true,price:''}),'미판매');
  const book={sheets:[{name:'개별 비용',rows:[['난각번호','규격','최소판수','최대판수','원란','포장비'],[1,'왕란',1,10,6000,210]]}]};
  assert.equal(importPriceWorkbook(model,d,book,'costs').document.costs['1'].length,19);assert.equal(importPriceWorkbook(model,d,book,'costs',{replaceRanges:true}).document.costs['1'].length,1);
  d.costs['1'][0].discount='3.3';assert.equal(importPriceWorkbook(model,d,book,'costs').document.costs['1'][0].discount,'3.3');
  const percent=model.clone(book);percent.sheets[0].rows[0].push('할인율');percent.sheets[0].rows[1].push('4.5%');assert.equal(importPriceWorkbook(model,d,percent,'costs').document.costs['1'][0].discount,'4.5');
});
