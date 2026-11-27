import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {handleProductOperations} from '../src/server/product-operations.mjs';
import {createQuoteDraftSync} from '../src/server/r3-quote-draft-client.mjs';
import {mountSavedBusinessPicker} from '../src/server/r3-saved-business-client.mjs';
import {r3ProductAsset} from '../src/server/r3-product-page.mjs';
import {extendQuoteSource} from '../src/server/r3-product-extensions.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const empty=()=>({lines:[],locations:[],allocations:[],current:null,open:'q1',allocationRevision:0});
const filled=name=>({...empty(),locations:[{id:'site-1',name}]});
function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0017_product_operations.sql',import.meta.url),'utf8'));
 const prepare=(q,p=[])=>({bind:(...args)=>prepare(q,args),first:async()=>sqlite.prepare(q).get(...p)||null,all:async()=>({results:sqlite.prepare(q).all(...p)}),run:async()=>sqlite.prepare(q).run(...p)});
 const db={prepare},calls=[];
 function forActor(actor){return async(path,body)=>{calls.push({actor,path,body:body&&structuredClone(body)});const response=await handleProductOperations({request:new Request('https://test.invalid'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),env:{ORDER_PRODUCT_DB:db},actor:{id:actor},path});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{status:response.status,data});return data;};}
 return {sqlite,calls,forActor};
}
function draft(request,{mode='simple',value=empty(),readMeta}={}){
 let input=structuredClone(value),restores=0;const states=[];
 const bridge={snapshot:()=>structuredClone(input),project:structuredClone,restore:async(value,{isCurrent})=>{if(!isCurrent())return {ok:false,status:'CANCELLED'};input=structuredClone(value);restores++;return {ok:true};}};
 const sync=createQuoteDraftSync({mode,request,bridge,readMeta,onState:state=>states.push(state)});
 return {sync,bridge,states,set:v=>input=structuredClone(v),get:()=>input,restores:()=>restores};
}
const post=(data,expectedRevision=0,requestKey=crypto.randomUUID())=>({expectedRevision,requestKey,data});

test('real SQLite API keeps only latest draft of each mode, isolates accounts, and empty opening does not write',async()=>{
 const db=database(),request=db.forActor('member-a'),simple=draft(request);
 assert.equal((await simple.sync.start()).ok,true);assert.equal((await simple.sync.flush()).ok,true);assert.equal(db.sqlite.prepare('SELECT count(*) n FROM order_quote_draft').get().n,0);
 simple.set(filled('처음'));await simple.sync.flush();simple.set(filled('최근'));await simple.sync.flush();
 const detailed=draft(request,{mode:'detailed',value:filled('상세')});await detailed.sync.flush();
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM order_quote_draft').get().n,2);
 assert.equal((await request('/drafts/simple')).data.locations[0].name,'최근');assert.equal((await request('/drafts/detailed')).data.locations[0].name,'상세');
 assert.equal((await db.forActor('member-b')('/drafts/simple')).data,null);
 const reload=draft(request);await reload.sync.start();assert.equal(reload.get().locations[0].name,'최근');assert.equal(reload.restores(),1);
});
test('two tabs preserve the losing input after 409 and require an explicit choice to change the server',async()=>{
 const db=database(),request=db.forActor('member-a'),a=draft(request),b=draft(request);await Promise.all([a.sync.start(),b.sync.start()]);
 a.set(filled('A'));b.set(filled('B'));assert.equal((await a.sync.flush()).ok,true);assert.equal((await b.sync.flush()).status,'CONFLICT');assert.equal(b.get().locations[0].name,'B');
 const writes=db.calls.filter(x=>x.body).length;await b.sync.flush();assert.equal(db.calls.filter(x=>x.body).length,writes);assert.equal((await request('/drafts/simple')).data.locations[0].name,'A');
 assert.equal((await b.sync.choose('local')).ok,true);assert.equal((await request('/drafts/simple')).data.locations[0].name,'B');
});
test('lost acknowledgement retries exactly the original key before newer input, with no extra draft rows',async()=>{
 const db=database(),base=db.forActor('member-a');let lose=true;
 const d=draft(async(path,body)=>{const result=await base(path,body);if(body&&lose){lose=false;throw Error('LOST_ACK');}return result;});await d.sync.start();d.set(filled('원본'));
 assert.equal((await d.sync.flush()).status,'UNAVAILABLE');d.set(filled('추가 입력'));assert.equal((await d.sync.retry()).ok,true);
 const posts=db.calls.filter(x=>x.body);assert.deepEqual(posts[0].body,posts[1].body);assert.notEqual(posts[1].body.requestKey,posts[2].body.requestKey);
 assert.equal((await base('/drafts/simple')).data.locations[0].name,'추가 입력');assert.equal(db.sqlite.prepare('SELECT count(*) n FROM order_quote_draft').get().n,1);
});
test('a late server read cannot replace typing, and existing local input is not silently replaced on first sync',async()=>{
 const db=database(),base=db.forActor('member-a');await base('/drafts/simple',post(filled('서버')));let release;
 const d=draft((...args)=>new Promise(resolve=>{release=()=>resolve(base(...args));}));const loading=d.sync.start();d.set(filled('방금 작성'));release();assert.equal((await loading).status,'CONFLICT');assert.equal(d.get().locations[0].name,'방금 작성');assert.equal(d.restores(),0);
 const prior=draft(base,{value:filled('기존 local')});assert.equal((await prior.sync.start()).status,'CONFLICT');assert.equal(prior.get().locations[0].name,'기존 local');assert.equal((await prior.sync.choose('server')).ok,true);assert.equal(prior.get().locations[0].name,'서버');
});
test('cancelled flush does not issue a remote write; mode copy uses both local and server revisions',async()=>{
 const db=database(),request=db.forActor('member-a'),d=draft(request);await d.sync.start();d.set(filled('취소 입력'));
 assert.equal((await d.sync.flush({isCurrent:()=>false})).status,'CANCELLED');assert.equal(db.calls.filter(x=>x.body).length,0);
 let local={ok:true,status:'LOADED',data:empty(),revision:0,versionToken:'local0'};
 const localStore={load:async()=>structuredClone(local),commit:async(value,options)=>{if(options.expectedRevision!==local.revision||options.expectedToken!==local.versionToken)return {ok:false,status:'CONFLICT'};if(!options.canCommit())return {ok:false,status:'CANCELLED'};local={ok:true,status:'COMMITTED',data:structuredClone(value),revision:local.revision+1,versionToken:'local'+(local.revision+1)};return structuredClone(local);}};
 const store=d.sync.destinationStore(localStore),before=await store.inspectCurrent(),target=await store.load();assert.equal(before.versionToken,target.versionToken);
 const copied={...target.data,lines:[{id:'sku',housing:'1',size:'대란',pack:'30',qty:'10',price:'6000'}],current:'sku'};
 assert.equal((await store.commit(copied,{expectedRevision:target.revision,expectedToken:target.versionToken,transactionId:'mode-copy',canCommit:()=>true})).ok,true);
 assert.deepEqual((await request('/drafts/detailed')).data,copied);
 const stale=d.sync.destinationStore(localStore),snapshot=await stale.inspectCurrent();local={...local,revision:2,versionToken:'local2',data:filled('다른 탭')};
 assert.equal((await stale.commit(copied,{expectedRevision:snapshot.revision,expectedToken:snapshot.versionToken,transactionId:'stale-copy',canCommit:()=>true})).status,'CONFLICT');assert.equal(local.data.locations[0].name,'다른 탭');
});
test('different detailed local and server drafts block an opt-in copy instead of discarding either input',async()=>{
 const db=database(),request=db.forActor('member-a');await request('/drafts/detailed',post(filled('서버 상세')));const d=draft(request);
 const store=d.sync.destinationStore({load:async()=>({ok:true,data:filled('기존 상세'),revision:1,versionToken:'existing'}),commit:()=>assert.fail('must not replace local input')});
 assert.equal((await store.load()).status,'CONFLICT');assert.equal((await request('/drafts/detailed')).data.locations[0].name,'서버 상세');
});

test('saved-business picker uses actual common modal lifecycle and copy presentation with cancel-safe loading',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><section id="section-q3" data-open="true"><div class="add-row"><button id="add-site"></button></div></section></body></html>',{url:'https://review.invalid/ia?view=simple-r3',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 try{
  w.matchMedia=()=>({matches:true});w.scrollTo=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const common=await r3ProductAsset('/ia/r3-product/web/common-ui.mjs').text();const start=common.indexOf('window.OrderCopyDialog=');const end=common.indexOf('/* MSG0465:',start);
  w.CODE1_UI={accordion:()=>'<section></section>'};w.eval(common.slice(start,end));
  w.ORDER_APP_CONTEXT={endpoints:{role:'/api/ia/lab/runs/test/as/buyer/role'}};let url,resolve,loaded=0;
  w.fetch=async value=>{url=value;return new Promise(r=>{resolve=()=>r(Response.json({businesses:[{id:'saved',profile:{name:'실제 저장 사업장',road:'소재지'}}]}));});};
  const picker=w.eval('('+browserFunction(mountSavedBusinessPicker)+')')({savedBusinessBridge:{canOpen:()=>true,load:async(records,{isCurrent})=>{assert.equal(isCurrent(),true);loaded++;return {ok:true};}}});
  assert.equal(picker.trigger.hidden,true);resolve();await new Promise(r=>setTimeout(r,0));assert.equal(picker.trigger.hidden,false);
  picker.trigger.click();assert.deepEqual([...w.OrderModalShell.activeIds],['saved-business-picker']);assert.equal(picker.dialog.dataset.modalVariant,'copy');assert.equal(picker.dialog.dataset.modalRole,'selection');assert.equal(picker.dialog.querySelector('[data-copy-apply]').disabled,true);assert.match(url,/\/lab\/runs\/test\/as\/buyer\/role\/businesses$/);
  picker.dialog.querySelector('[data-copy-cancel]').click();resolve();await new Promise(r=>setTimeout(r,0));assert.equal(picker.dialog.open,false);assert.equal(picker.dialog.querySelectorAll('input').length,0);
  picker.trigger.click();resolve();await new Promise(r=>setTimeout(r,0));const checkbox=picker.dialog.querySelector('input');checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change',{bubbles:true}));picker.dialog.querySelector('[data-copy-apply]').click();await new Promise(r=>setTimeout(r,0));assert.equal(loaded,1);assert.equal(picker.dialog.open,false);assert.ok(w.OrderModalShell.inspect().events.some(x=>x.reason==='cancel'));
 }finally{w.close();}
});
test('served mode switch preserves default opt-out, blocks navigation until real server flush, and fails closed on changed source',async()=>{
 assert.throws(()=>extendQuoteSource('web/app.mjs','changed'),/SOURCE_MISMATCH/);assert.throws(()=>extendQuoteSource('web/quote-mode-switch.mjs','changed'),/SOURCE_MISMATCH/);
 const dom=new JSDOM('<html><body><button id="trigger"></button><dialog><h2 data-mode-title></h2><label><input type="checkbox" data-mode-option><span data-mode-option-label></span></label><p data-mode-error hidden></p><button data-mode-cancel>취소</button><button data-mode-confirm>전환</button></dialog></body></html>',{runScripts:'outside-only'}),w=dom.window;
 try{
  w.structuredClone=structuredClone;w.mountOrderMenu=()=>{};const source=(await r3ProductAsset('/ia/r3-product/web/quote-mode-switch.mjs').text()).replace(/^import .*;\n/,'').replaceAll('export function ','function ');w.eval(source+'\nwindow.bindMode=bindQuoteModeSwitch;');
  let finish,navigated=0,copies=0;w.ORDER_QUOTE_DRAFT_SYNC={flush:()=>new Promise(resolve=>{finish=resolve;}),destinationStore:local=>{copies++;return local;}};
  const dialog=w.document.querySelector('dialog'),trigger=w.document.getElementById('trigger');w.bindMode({simple:true,dialog,trigger,shell:{bind(){},open:d=>d.open=true,close:d=>d.open=false},source:()=>({lines:[{id:'sku',housing:'1',size:'대란',pack:'30'}]}),guard:()=>true,saveCurrent:async()=>({ok:true}),detailedStore:()=>({inspectCurrent:async()=>({ok:true,revision:0,versionToken:'empty'})}),navigate:()=>navigated++,preference:{get:()=>false,set(){}}});
  trigger.click();assert.equal(dialog.querySelector('[data-mode-option]').checked,false);dialog.querySelector('[data-mode-confirm]').click();await new Promise(r=>setTimeout(r,0));assert.equal(navigated,0);finish({ok:false,status:'CONFLICT'});await new Promise(r=>setTimeout(r,0));assert.equal(navigated,0);assert.match(dialog.querySelector('[data-mode-error]').textContent,/다른 탭/);
  dialog.querySelector('[data-mode-confirm]').click();await new Promise(r=>setTimeout(r,0));finish({ok:true});await new Promise(r=>setTimeout(r,0));assert.equal(navigated,1);assert.equal(copies,1);
 }finally{w.close();}
});

test('issued quote read and result actions retain the server-selected lab scope and guest gates',async()=>{
 const source=await r3ProductAsset('/ia/r3-product/web/app.mjs').text();
 const guard=source.match(/const privateProduct=([^;]+);/)[1];
 const product=(authenticated)=>new Function('document','window','return '+guard)({documentElement:{dataset:{r3QuoteMode:'simple'}}},{ORDER_APP_CONTEXT:{actor:{authenticated}}});
 assert.equal(product(false),false);assert.equal(product(true),true);
 const read=source.slice(source.indexOf('async function readIssuedResult(id){'),source.indexOf('\nasync function loadIssuedResult(id){'));
 let fetched='';const scope={mode:'lab',runId:'isolated-run',persona:'buyer',endpoints:{price:'/api/ia/lab/runs/isolated-run/as/buyer/price'}};
 const readQuote=new Function('window','fetch','issuedRequest','projectIssuedQuoteResult',read+';return readIssuedResult;')({ORDER_APP_CONTEXT:scope},async url=>{fetched=url;return Response.json({id:'issued-1'});},null,x=>x);
 assert.equal((await readQuote('issued-1')).id,'issued-1');assert.equal(fetched,'/api/ia/lab/runs/isolated-run/as/buyer/price/quote?id=issued-1');
 const helper=source.slice(source.indexOf('function scopedQuoteURL(path){'),source.indexOf('\nconst quoteDraftBridge='));
 const action=source.slice(source.indexOf(' onAction(action){')+1,source.indexOf('\n});\nasync function readIssuedResult'));
 const destinations=[],location={origin:'https://qa.invalid',assign:url=>destinations.push(url)};
 const act=new Function('window','location','privateProduct','issuedId','URL',helper+';return ({'+action+'}).onAction;')({ORDER_APP_CONTEXT:scope},location,true,()=> 'issued-1',URL);
 act('delivery');act('same');
 for(const destination of destinations){const u=new URL(destination);assert.equal(u.searchParams.get('labRun'),'isolated-run');assert.equal(u.searchParams.get('persona'),'buyer');assert.equal(u.searchParams.get('quote'),'issued-1');}
 assert.equal(new URL(destinations[0]).searchParams.get('menu'),'delivery');assert.equal(new URL(destinations[1]).searchParams.get('view'),'pricing-r3');
});
