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
import {mountPriceWorkspace} from '../src/server/r3-price-workspace-client.mjs';
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

test('registered catalog fills all active business and consumer rows without inventing prices or replacing custom products',()=>{
  const d=seed(),original=JSON.stringify(d.costs),custom={id:'owned-price',name:'기존 왕란 가격',shell:'1',grade:'king',package:'pack-30',audience:'store',price:'7777.5',auto:false,enabled:true};d.products=[custom];
  assert.equal(model.syncCatalogProducts(d),319);assert.equal(d.products.filter(p=>p.audience==='store').length,160);assert.equal(d.products.filter(p=>p.audience==='consumer').length,160);assert.equal(model.syncCatalogProducts(d),0);
  assert.deepEqual(d.products.find(p=>p.id==='owned-price'),custom);assert.equal(JSON.stringify(d.costs),original);
  assert.equal(model.productPrice(d,d.products.find(p=>p.audience==='store'&&p.shell==='1'&&p.grade==='king'&&p.package==='pack-6')),null);
  assert(d.products.filter(p=>p.audience==='consumer').every(p=>p.price===''&&!p.enabled));assert.doesNotThrow(()=>model.normalize(d));
  const other=seed();other.packaging['1/king/pack-6']={fee:'',fees:{},carriers:[],enabled:false};model.syncCatalogProducts(other);assert.equal(other.products.length,318);assert(!other.products.some(p=>p.shell==='1'&&p.grade==='king'&&p.package==='pack-6'));
  d.packages.push({id:'pack-12',eggs:12,name:'12구'});assert.equal(model.syncCatalogProducts(d),40);assert.equal(d.products.find(p=>p.id==='owned-price').price,'7777.5');
});
test('consumer percentage and fixed markup preview skips missing bases, preserves zero and never compounds or edits business prices',()=>{
  const d=seed();model.syncCatalogProducts(d);const find=(audience,grade,pack='pack-30')=>d.products.find(p=>p.audience===audience&&p.shell==='1'&&p.grade===grade&&p.package===pack);
  const a=find('consumer','king'),b=find('consumer','xl'),blank=find('consumer','king','pack-6'),zero=find('consumer','large'),zeroBase=find('store','large');zeroBase.auto=false;zeroBase.price='0';
  const before=JSON.stringify(d),preview=model.previewConsumerMarkup(d,[a.id,b.id,blank.id,zero.id],'percent','10');assert.equal(JSON.stringify(d),before);assert.equal(preview.changes.length,3);assert.equal(preview.skipped.length,1);assert.equal(preview.skipped[0].id,blank.id);assert.equal(preview.changes[0].after,6809);assert.equal(preview.changes[2].after,0);
  model.applyConsumerMarkup(d,[a.id,b.id,blank.id,zero.id],'percent','10');assert.equal(model.productPrice(d,a),6809);assert.equal(model.productPrice(d,a,'range-18'),6589);assert.equal(blank.price,'');assert.equal(model.productPrice(d,zero),0);
  model.applyConsumerMarkup(d,[a.id],'percent','10');assert.equal(model.productPrice(d,a),6809);assert.equal(model.productPrice(d,find('store','king')),6190);
  model.applyConsumerMarkup(d,[a.id],'amount','250');assert.equal(model.productPrice(d,a),6440);find('store','king').auto=false;find('store','king').price='7000';assert.equal(model.productPrice(d,a),7250);assert.doesNotThrow(()=>model.normalize(d));
  const unchanged=JSON.stringify(d);assert.throws(()=>model.applyConsumerMarkup(d,[a.id],'percent','-10'),/MARKUP/);assert.equal(JSON.stringify(d),unchanged);
  a.price='7999';delete a.markup;assert.equal(model.productPrice(d,a),7999);
});
const shippingSeed=()=>{const d=seed();d.carriers=[{id:'parcel',name:'택배',type:'parcel',base:'3000',remote:'',regions:''},{id:'freight',name:'화물',type:'freight',base:'',remote:'',regions:''}];d.deliveryRules=[{id:'small-lot',shell:null,grade:null,package:'pack-30',unit:'pack',min:1,max:10,carrier:'parcel',fee:''},{id:'large-lot',shell:null,grade:null,package:'pack-30',unit:'egg',min:360,max:660,carrier:'freight',fee:''}];return d;};
test('delivery rules distinguish packs and eggs, preserve gaps and missing fare, and reject converted overlaps and partial packs',()=>{
  const d=shippingSeed(),query=quantity=>model.deliveryFor(d,{shell:'1',grade:'king',package:'pack-30',quantity});assert.doesNotThrow(()=>model.normalize(d));
  assert.equal(query(1).carrier.id,'parcel');assert.equal(query(10).fee,3000);assert.equal(query(11).status,'unconfigured');assert.equal(query(12).carrier.id,'freight');assert.equal(query(22).fee,null);assert.equal(query(23).status,'unconfigured');
  assert.equal(model.deliveryFor(d,{shell:'1',grade:'king',package:'pack-30',quantity:360,unit:'egg'}).packs,12);assert.throws(()=>model.deliveryFor(d,{shell:'1',grade:'king',package:'pack-30',quantity:359,unit:'egg'}),/WHOLE_PACK/);
  d.deliveryRules[1].fee='0';assert.equal(query(12).fee,0);const overlap=model.clone(d);overlap.deliveryRules[1].min=300;assert.throws(()=>model.normalize(overlap),/DELIVERY_OVERLAP/);
  const empty=model.clone(d);empty.deliveryRules[1].min=601;empty.deliveryRules[1].max=629;assert.throws(()=>model.normalize(empty),/DELIVERY_EMPTY_RANGE/);
  const independent=model.clone(d);independent.deliveryRules[0].grade='king';independent.deliveryRules[1].grade='xl';independent.deliveryRules[1].min=300;assert.doesNotThrow(()=>model.normalize(independent));
  model.remove(d,'carriers','parcel');assert.equal(d.deliveryRules.length,1);assert.equal(query(1).status,'unconfigured');assert.doesNotThrow(()=>model.normalize(d));
});
test('registered prices, consumer markup and delivery rules round trip through authenticated append-only workspace storage',async()=>{
  const f=signedWorkspace(),d=shippingSeed();model.syncCatalogProducts(d);const p=d.products.find(p=>p.audience==='consumer'&&p.shell==='1'&&p.grade==='king'&&p.package==='pack-30');model.applyConsumerMarkup(d,[p.id],'percent','12.5');
  const body={action:'apply',document:d,expectedRevision:0,requestKey:crypto.randomUUID()};const saved=await f.request('supplier','/api/ia/r3-price/workspace',body);assert.equal(saved.status,200);
  const read=await (await f.request('supplier','/api/ia/r3-price/workspace')).json();assert.deepEqual(read.document,model.normalize(d));assert.equal(read.document.products.filter(p=>p.audience==='store').length,160);assert.equal(model.productPrice(read.document,read.document.products.find(x=>x.id===p.id)),6964);assert.equal(read.document.deliveryRules[1].min,360);
  const next=model.clone(d);model.applyConsumerMarkup(next,[p.id],'amount','100');assert.equal((await f.request('supplier','/api/ia/r3-price/workspace',{...body,document:next,expectedRevision:1,requestKey:crypto.randomUUID()})).status,200);
  const historical=await (await f.request('supplier','/api/ia/r3-price/workspace?revision=1')).json();assert.equal(historical.document.products.find(x=>x.id===p.id).markup.kind,'percent');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM r3_price_version').get().n,0);
});

test('workspace controls register catalog, preview selected markup, edit cells, validate delivery rules and persist through the real authenticated handler',async()=>{
  const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
  const f=signedWorkspace(),document=shippingSeed();
  assert.equal((await f.request('supplier','/api/ia/r3-price/workspace',{action:'draft',document,expectedRevision:0,requestKey:crypto.randomUUID()})).status,200);
  const dom=new JSDOM('<main id="workspace"></main>',{url:'https://order-ia-portal.pages.dev/ia?view=pricing-r3',runScripts:'outside-only'}),w=dom.window;
  w.TextEncoder=TextEncoder;
  w.fetch=(path,init={})=>f.request('supplier',path,init.body?JSON.parse(init.body):undefined,init.body?{csrf:init.headers['X-IA-CSRF']}:{});
  w.eval('window.priceModel=('+createPriceWorkspaceModel.toString()+')();window.workspace=('+mountPriceWorkspace.toString()+')(document.getElementById("workspace"),window.priceModel,{},()=>{},()=>{});');
  const app=w.workspace,$=s=>w.document.querySelector(s),until=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}assert.fail('workspace operation timed out: '+($('#pw-notice')?.textContent||''));};
  const click=selector=>{const node=$(selector);assert(node,'missing control '+selector);node.click();};
  const input=(selector,value,event='input')=>{const node=$(selector);assert(node,'missing field '+selector);node.value=value;node.dispatchEvent(new w.Event(event,{bubbles:true}));};
  const submit=()=>{const form=$('.pw-dialog form');assert(form,'missing dialog form');form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
  try{
    await until(()=>app.read()!=null&&!$('#pw-main').inert);
    click('[data-section="products"]');assert.equal(app.read().products.filter(p=>p.audience==='store').length,160);assert.equal($('.pw-product-table tbody').rows.length,160);
    const find=(audience,grade,pack='pack-30')=>app.read().products.find(p=>p.audience===audience&&p.shell==='1'&&p.grade===grade&&p.package===pack);
    const business=find('store','king'),consumer=find('consumer','king'),second=find('consumer','xl'),blank=find('consumer','king','pack-6');
    input('[data-product-price="'+business.id+'"]','7000');
    click('[data-product-audience="consumer"]');
    for(const p of [consumer,second,blank])click('[data-consumer-select="'+p.id+'"]');
    assert.equal($('#pw-consumer-count').textContent,'3개 선택');input('#pw-markup-value','10');
    const before=JSON.stringify(app.read());click('[data-action="consumer-markup"]');assert.match($('.pw-dialog').textContent,/2개 적용 · 1개 제외/);click('.pw-dialog [data-close]');assert.equal(JSON.stringify(app.read()),before);
    click('[data-action="consumer-markup"]');submit();await until(()=>!$('.pw-dialog'));
    assert.equal($('[data-product-price="'+consumer.id+'"]').value,'7700');assert.equal(find('consumer','king','pack-6').price,'');
    click('[data-product-edit="'+consumer.id+'"]');input('.pw-dialog [name="name"]','소비자 왕란 이름 수정');submit();await until(()=>!$('.pw-dialog'));assert.equal(find('consumer','king').markup.kind,'percent');
    input('[data-product-price="'+consumer.id+'"]','7900');assert.equal(find('consumer','king').markup,undefined);assert.equal(find('consumer','king').price,'7900');assert.equal(find('store','king').price,'7000');
    click('[data-product-edit="'+consumer.id+'"]');input('.pw-dialog [name="audience"]','store','change');submit();await until(()=>!$('.pw-dialog'));assert.equal(app.read().products.find(p=>p.id===consumer.id).storeProduct,undefined);assert.doesNotThrow(()=>model.normalize(app.read()));assert.equal($('#pw-consumer-count').textContent,'2개 선택');
    click('[data-section="carriers"]');click('[data-action="add-delivery-rule"]');
    input('.pw-dialog [name="package"]','pack-30','change');input('.pw-dialog [name="unit"]','egg','change');input('.pw-dialog [name="min"]','300');input('.pw-dialog [name="max"]','330');
    submit();await until(()=>$('.pw-dialog-error')?.textContent.includes('겹칩니다'));assert.equal(app.read().deliveryRules.length,2);assert.match($('.pw-delivery-conversion').textContent,/300~330알/);
    input('.pw-dialog [name="min"]','330');submit();await until(()=>!$('.pw-dialog'));assert.equal(app.read().deliveryRules.length,3);assert.equal(model.deliveryFor(app.read(),{shell:'1',grade:'king',package:'pack-30',quantity:11}).status,'matched');
    click('[data-action="draft"]');await until(()=>app.getState().revision===2&&!app.getState().dirty&&!$('#pw-main').inert);
    const saved=JSON.stringify(app.read());await app.reload();assert.equal(JSON.stringify(app.read()),saved);assert.equal(app.getState().revision,2);
    const read=await (await f.request('supplier','/api/ia/r3-price/workspace?revision=2')).json();assert.equal(read.document.products.find(p=>p.id===consumer.id).price,'7900');assert.equal(read.document.deliveryRules.length,3);
  }finally{w.dispatchEvent(new w.Event('pagehide'));w.close();f.db.close();}
});
