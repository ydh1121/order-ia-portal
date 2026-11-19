// Pure DOM interaction of the real book/matrix clients. No network or live price writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createPriceBookModel} from '../src/server/r3-price-book-model.mjs';
import {createPriceMatrixModel} from '../src/server/order-engine/calculation/price-matrix.mjs';
import {mountPriceBook,priceBookMarkup} from '../src/server/r3-price-book-ui.mjs';
import {mountPriceMatrix,matrixMarkup} from '../src/server/r3-matrix-editor.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const dom=new JSDOM(priceBookMarkup,{url:'https://example.invalid/ia?view=pricing-r3',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.matchMedia=()=>({matches:false,addEventListener(){}});w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.crypto.randomUUID=()=>crypto.randomUUID();w.confirm=()=>true;
const grid=d.createElement('div');grid.id='matrix';grid.innerHTML=matrixMarkup;d.querySelector('#personalGrid').append(grid);
w.eval('window.matrixModel=('+createPriceMatrixModel.toString()+')();window.bookModel=('+createPriceBookModel.toString()+')(matrixModel);window.grid=('+mountPriceMatrix.toString()+')(document.querySelector("#matrix"),matrixModel);window.book=('+mountPriceBook.toString()+')(document.querySelector("#personalBook"),bookModel,grid,document.querySelector("#matrix"));');
const ref=readFileSync(new URL('./fixtures/egg-price-reference-20261109.tsv',import.meta.url),'utf8').trim().split('\n').slice(1).map(s=>s.split('\t'));
const draft={name:'2026.11.09 원본',shell:null,matrix:{schema:1,grades:[['king','왕란'],['xl','특란'],['large','대란'],['medium','중란']].map(([id,name])=>({id,name})),rows:ref.map(r=>({min:Number(r[0]),max:r[1]===''?null:Number(r[1]),cells:r.slice(2)}))}};
const click=s=>d.querySelector(s).click(),read=()=>JSON.parse(JSON.stringify(w.book.read())),values=()=>Array.from(d.querySelectorAll('#matrix tbody input'),n=>n.value.replaceAll(',',''));
const initial=JSON.stringify(draft.matrix);
try{
 w.book.set(draft);assert.equal(values().length,190);assert.equal(JSON.stringify(read().versions[0].shells.find(s=>s.key==='unspecified').matrix),initial);
 assert.equal(d.querySelector('#matrix table').style.width,'1164px');click('[data-grade=king]');assert.equal(d.querySelector('#matrix table').style.width,'372px');click('[data-grade=xl]');assert.equal(d.querySelector('#matrix table').style.width,'372px');assert.equal(values().length,190);
 const label=d.querySelector('.pb-node[data-kind=shell][data-id="1"] .pb-node-label');label.click();assert.equal(read().activeShell,'1');assert(w.grid.read().rows.every(r=>r.cells.every(c=>c==='')));
 d.querySelector('.pb-node[data-kind=shell][data-id=unspecified] .pb-node-label').click();assert.equal(JSON.stringify(w.grid.read()),initial);
 const handle=d.querySelector('.pb-node[data-kind=grade][data-id=king] .pb-handle'),target=d.querySelector('.pb-node[data-kind=grade][data-id=large]');
 const dragstart=new w.Event('dragstart',{bubbles:true,cancelable:true});Object.defineProperty(dragstart,'dataTransfer',{value:{setData(){},effectAllowed:''}});handle.dispatchEvent(dragstart);target.dispatchEvent(new w.Event('drop',{bubbles:true,cancelable:true}));
 assert.deepEqual(Array.from(w.grid.read().grades,g=>g.id),['xl','king','large','medium']);assert.equal(w.grid.read().rows[0].cells[2],ref[0][2]);
 click('[data-pb-new]');const form=d.querySelector('.pb-dialog form');const date=form.querySelector('input[type=date]'),name=form.querySelector('input[type=text]');date.value='2026-11-20';name.value='11월 20일';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(read().versions.length,2);assert.equal(read().versions[1].date,'2026-11-09');
 const raw=d.querySelector('#matrix input[data-r="0"][data-c="2"]');raw.value='8000';raw.dispatchEvent(new w.Event('input',{bubbles:true}));const b=read();assert.equal(b.versions[0].shells.find(s=>s.key==='unspecified').matrix.rows[0].cells[0],'8000');assert.equal(b.versions[1].shells.find(s=>s.key==='unspecified').matrix.rows[0].cells[0],ref[0][4]);
 click('[data-pb-view=packaging]');Array.from(d.querySelectorAll('.pb-editor button')).find(e=>e.textContent==='포장 추가').click();form.querySelector('input[type=text]').value='30구 한 판';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(read().versions[0].packages.length,1);
 const fee=d.querySelector('.pb-rules .pb-fee');fee.value='210';fee.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(read().versions[0].packages[0].rules[0].fee,'210');
 assert.equal(w.location.href,'https://example.invalid/ia?view=pricing-r3');console.log('PASS: real DOM clients preserve 152 prices, fixed-column grade filters, shell navigation, drag reordering, independent date forks and packaging rules.');
}finally{w.close();}

// Full rendered page -> authenticated handler -> real SQLite fixture -> reload.
{
 const {renderR3PricePage}=await import('../src/server/r3-price-page.mjs');
 const {handleIaRequest}=await import('../src/server/router.mjs');
 const {signedWorkspace,origin}=await import('./r3-business-identities.fixture.mjs');
 const {personalPrice}=await import('../src/server/r3-personal-price.mjs');
 const fixture=signedWorkspace({emptyPriceCatalog:true}),actor={id:'supplier',role:'BUSINESS',email:'supplier@example.invalid'};
 const seed={...draft,supplierName:null,originName:null,productName:null,minimumOrder:10,packSize:30};
 await personalPrice(fixture.env.ORDER_QA_DB,actor,{action:'save',expectedRevision:0,requestKey:crypto.randomUUID(),draft:seed},new Date().toISOString());
 const page=new JSDOM(renderR3PricePage('book-dom'),{url:origin+'/ia?view=pricing-r3',runScripts:'outside-only',pretendToBeVisual:true}),win=page.window,doc=win.document;
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});win.HTMLElement.prototype.scrollIntoView=()=>{};win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};win.crypto.randomUUID=()=>crypto.randomUUID();win.confirm=()=>true;win.TextDecoder=TextDecoder;win.TextEncoder=TextEncoder;
 win.fetch=async(url,options={})=>{const headers=new Headers(options.headers);headers.set('Cf-Access-Jwt-Assertion',fixture.assertion('supplier'));if(options.method==='POST')headers.set('Origin',origin);return handleIaRequest(new Request(new URL(url,origin),{...options,signal:undefined,headers}),fixture.env,{fetcher:fixture.certs});};
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error(label+': '+doc.querySelector('#notice').textContent);};
 try{
  for(const script of doc.scripts)win.eval(script.textContent);
  await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r1')&&!doc.querySelector('#savePersonalDraft').disabled,'first personal book');
  assert.equal(doc.querySelector('#personalPack').value,'30');assert.equal(doc.querySelector('.mx-unit').textContent,'원 / 30구 1판');
  const raw=doc.querySelector('#matrix input[data-r="0"][data-c="2"]');raw.value='7777';raw.dispatchEvent(new win.Event('input',{bubbles:true}));doc.querySelector('#savePersonalDraft').click();
  await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r2')&&!doc.querySelector('#savePersonalDraft').disabled,'book saved');
  let saved=await personalPrice(fixture.env.ORDER_QA_DB,actor,null,new Date().toISOString());assert.equal(saved.draft.matrix.rows[0].cells[0],'7777');assert.equal(saved.draft.priceBook.versions[0].shells.find(s=>s.key==='unspecified').matrix.rows[0].cells[0],'7777');
  doc.querySelector('[data-pb-view=packaging]').click();Array.from(doc.querySelectorAll('.pb-editor button')).find(b=>b.textContent==='포장 추가').click();const modal=doc.querySelector('.pb-dialog');modal.querySelector('input[type=text]').value='10구';modal.querySelector('input[type=number]').value='10';modal.querySelector('form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  Array.from(doc.querySelectorAll('.pb-editor button')).find(b=>b.textContent==='가격표 열기').click();assert.equal(doc.querySelector('#personalPack').value,'30');assert(doc.querySelector('#personalPack').readOnly);assert(Array.from(doc.querySelectorAll('#matrix td[data-grade-col] input')).every(x=>x.value===''));
  Array.from(doc.querySelectorAll('.pb-pack-chips button')).find(b=>b.textContent==='기존 원란·포장').click();assert.equal(doc.querySelector('#personalPack').value,'30');assert(!doc.querySelector('#personalPack').readOnly);assert.equal(doc.querySelector('#matrix input[data-r="0"][data-c="2"]').value,'7,777');
  doc.querySelector('#savePersonalDraft').click();await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r3'),'package book saved');saved=await personalPrice(fixture.env.ORDER_QA_DB,actor,null,new Date().toISOString());assert.equal(saved.draft.packSize,30);assert.equal(saved.draft.matrix.rows.length,19);assert.equal(saved.draft.matrix.rows.flatMap(r=>r.cells).length,152);assert.equal(saved.draft.priceBook.versions[0].packages.length,1);
  doc.querySelector('[data-pb-view=versions]').click();Array.from(doc.querySelectorAll('.pb-editor button')).find(b=>b.textContent==='이름·날짜 수정').click();modal.querySelector('input[type=text]').value='수정한 단가표';modal.querySelector('form').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(doc.querySelector('#personalName').value,'수정한 단가표');doc.querySelector('#savePersonalDraft').click();await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r4')&&!doc.querySelector('#savePersonalDraft').disabled,'renamed date saved');
  saved=await personalPrice(fixture.env.ORDER_QA_DB,actor,null,new Date().toISOString());assert.equal(saved.draft.priceBook.versions[0].name,'수정한 단가표');
  doc.querySelector('#personalPack').value='10';doc.querySelector('#personalPack').dispatchEvent(new win.Event('input',{bubbles:true}));doc.querySelector('#personalName').value='설정에서 바꾼 이름';doc.querySelector('#personalName').dispatchEvent(new win.Event('input',{bubbles:true}));
  doc.querySelector('.pb-node[data-kind=shell][data-id="2"] .pb-node-label').click();doc.querySelector('.pb-node[data-kind=shell][data-id=unspecified] .pb-node-label').click();
  assert.equal(doc.querySelector('#personalPack').value,'10');assert.equal(doc.querySelector('#personalName').value,'설정에서 바꾼 이름');doc.querySelector('#savePersonalDraft').click();await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r5')&&!doc.querySelector('#savePersonalDraft').disabled,'metadata survives tree selection');
  saved=await personalPrice(fixture.env.ORDER_QA_DB,actor,null,new Date().toISOString());assert.equal(saved.draft.packSize,10);assert.equal(saved.draft.priceBook.versions[0].name,'설정에서 바꾼 이름');assert.equal(saved.draft.matrix.rows.flatMap(r=>r.cells).length,152);
  console.log('PASS: full rendered personal price page saves through authenticated SQLite at r2–r5; packaging restores the original unit and metadata edits survive tree selection and reload with all 152 prices.');
 }finally{win.dispatchEvent(new win.Event('pagehide'));win.close();}
}

// The viewed date must be saved before an operational import can use its prices.
{
 const {renderR3PricePage}=await import('../src/server/r3-price-page.mjs');
 const {handleIaRequest}=await import('../src/server/router.mjs');
 const {signedWorkspace,origin}=await import('./r3-business-identities.fixture.mjs');
 const {personalPrice}=await import('../src/server/r3-personal-price.mjs');
 const fixture=signedWorkspace(),actor={id:'supplier',role:'BUSINESS',email:'supplier@example.invalid'};
 const model=createPriceBookModel(createPriceMatrixModel());
 const seed={...draft,supplierName:null,originName:null,productName:null,shell:'4',minimumOrder:10,packSize:30};
 const book=model.fromDraft(seed,'2026-11-19');model.cloneVersion(book,'next-date','2026-11-20','11월 20일');model.selected(book).matrix.rows[0].cells[0]='7000';
 fixture.db.prepare("UPDATE r3_price_catalog SET definition=? WHERE supplier_id='farm'").run(JSON.stringify({supplierName:'공급처',originName:'출고장',productName:'계란',shells:['4'],packSizes:[30],grades:seed.matrix.grades}));
 await personalPrice(fixture.env.ORDER_QA_DB,actor,{action:'save',requestKey:crypto.randomUUID(),expectedRevision:0,draft:{...seed,name:'11월 20일',matrix:model.selected(book).matrix,priceBook:book}},new Date().toISOString());
 const page=new JSDOM(renderR3PricePage('book-import'),{url:origin+'/ia?view=pricing-r3',runScripts:'outside-only',pretendToBeVisual:true}),win=page.window,doc=win.document,imports=[];
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});win.HTMLElement.prototype.scrollIntoView=()=>{};win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;};win.crypto.randomUUID=()=>crypto.randomUUID();win.confirm=()=>true;win.TextDecoder=TextDecoder;win.TextEncoder=TextEncoder;
 win.fetch=async(url,options={})=>{const headers=new Headers(options.headers);headers.set('Cf-Access-Jwt-Assertion',fixture.assertion('supplier'));if(options.method==='POST')headers.set('Origin',origin);const response=await handleIaRequest(new Request(new URL(url,origin),{...options,signal:undefined,headers}),fixture.env,{fetcher:fixture.certs});if(options.body?.includes('prepare-import'))imports.push(await response.clone().json());return response;};
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,10));}throw Error(label+': '+doc.querySelector('#notice').textContent);};
 const chooseProduct=()=>{doc.querySelector('#personalDest').value='0';doc.querySelector('#personalDest').dispatchEvent(new win.Event('change',{bubbles:true}));};
 try{
  for(const script of doc.scripts)win.eval(script.textContent);
  await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r1')&&!doc.querySelector('#savePersonalDraft').disabled,'load date book');
  assert.equal(doc.querySelector('#matrix input[data-r="0"][data-c="2"]').value,'7,000');
  doc.querySelector('.pb-node[data-kind=version][data-id=initial] .pb-node-label').click();
  assert.equal(doc.querySelector('#matrix input[data-r="0"][data-c="2"]').value.replaceAll(',',''),seed.matrix.rows[0].cells[0]);
  chooseProduct();doc.querySelector('#importPersonalDraft').click();
  await wait(()=>doc.querySelector('#notice').textContent.includes('먼저 본인 초안을 저장'),'unsaved date blocks import');assert.equal(imports.length,0);
  doc.querySelector('#savePersonalDraft').click();await wait(()=>doc.querySelector('#personalStatus').textContent.includes('r2')&&!doc.querySelector('#savePersonalDraft').disabled,'save selected date');
  const saved=await personalPrice(fixture.env.ORDER_QA_DB,actor,null,new Date().toISOString());assert.equal(saved.draft.priceBook.activeVersion,'initial');
  chooseProduct();doc.querySelector('#importPersonalDraft').click();
  await wait(()=>doc.querySelector('#notice').textContent.includes('단가를 가져왔습니다'),'import saved date');assert.equal(imports.length,1);
  assert.deepEqual(imports[0].matrix.rows,seed.matrix.rows);assert.equal(fixture.db.prepare('SELECT COUNT(*) n FROM r3_price_version').get().n,0);
  console.log('PASS: changing the visible price date blocks import until saved, then imports that exact date without writing a commercial policy.');
 }finally{win.dispatchEvent(new win.Event('pagehide'));win.close();}
}
