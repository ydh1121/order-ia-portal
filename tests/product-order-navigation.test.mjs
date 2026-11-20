import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {productLabPages,bootProductLab,renderProductLab} from '../src/server/product-lab-page.mjs';
import {productBuild} from '../src/server/product-build.gen.mjs';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import * as history from '../src/server/r3-ui/brand-history.gen.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev',nonce='2'.repeat(32);
const verifier=deriveVerifier(randomBytes(24).toString('base64url'));
const entry=id=>productLabPages.find(page=>page.id===id);
const clone=value=>JSON.parse(JSON.stringify(value));
async function until(predicate,label){
  const deadline=performance.now()+10_000;
  while(!predicate()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(predicate(),label);
}
function binding(sqlite){
  const prepare=(query,args=[])=>({query,args,bind:(...values)=>prepare(query,values),
    first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),
    run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
  return {prepare,async batch(statements){sqlite.exec('BEGIN');try{
    const results=statements.map(({query,args})=>{const compiled=sqlite.prepare(query);return compiled.columns().length?
      {results:compiled.all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(compiled.run(...args).changes)}};});
    sqlite.exec('COMMIT');return results;
  }catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function workspace(t){
  const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:'),doms=[];
  t.after(()=>{for(const dom of doms){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}review.close();lab.close();});
  const migrations=new URL('../migrations/',import.meta.url);
  for(const file of readdirSync(migrations).filter(file=>file.endsWith('.sql')).sort())review.exec(readFileSync(new URL(file,migrations),'utf8'));
  lab.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
  const env={ORDER_QA_DB:binding(review),ORDER_LAB_DB:binding(lab),IA_OWNER_LOGIN_ENABLED:'true',
    IA_OWNER_EMAIL:'order-menu@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await verifier,
    IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'order-navigation-boundary'};
  const session=await issueSession(env),cookie=session.cookie.split(';')[0];
  const transport=(url,init={})=>{
    const dest=new URL(String(url),origin);assert.equal(dest.origin,origin);
    const headers=new Headers(init.headers);headers.set('Cookie',cookie);if(init.body)headers.set('Origin',origin);
    return handleIaRequest(new Request(dest,{method:init.method||'GET',headers,...(init.body?{body:init.body}:{})}),env);
  };
  const api=async(path,body)=>{
    const response=await transport(path,body?{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':session.csrf},body:JSON.stringify(body)}:{});
    assert.equal(response.status,200,await response.clone().text());return response.json();
  };
  const {run}=await api('/api/ia/lab/runs',{label:'주문 메뉴 원장 경계',requestKey:crypto.randomUUID()});
  const scoped=(kind,path,body,persona='buyer')=>api(`/api/ia/lab/runs/${run.id}/as/${persona}/${kind}${path}`,body);
  function domFor(html,url){
    const errors=[],messages=[],calls=[],console=new VirtualConsole();
    console.on('jsdomError',error=>errors.push(error));
    // Canonical markup and scripts are exercised; this boundary suite does not
    // evaluate CSS or claim a visual/animation acceptance result.
    const dom=new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{
      url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;doms.push(dom);
    w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
    w.HTMLElement.prototype.scrollTo=function(){};w.ResizeObserver=class{observe(){}disconnect(){}};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
    Object.defineProperty(w,'parent',{value:{postMessage(message,destination){messages.push({message:clone(message),destination});}},configurable:true});
    w.fetch=(input,init={})=>{const path=new URL(String(input),url);calls.push({path:path.pathname,method:init.method||'GET'});return transport(path.href,init);};
    return {dom,w,errors,messages,calls};
  }
  function urlFor(id){
    const page=entry(id),url=new URL('/ia',origin);
    for(const [key,value] of Object.entries({view:page.view,labRun:run.id,persona:'buyer',qaDocument:crypto.randomUUID()}))url.searchParams.set(key,value);
    for(const key of ['screen','state','mode','menu'])if(page[key])url.searchParams.set(key,page[key]);
    return url.href;
  }
  async function mount(url,{inspectionOnly=false}={}){
    const response=await iaPage({request:new Request(url,{headers:{Cookie:cookie}}),env});
    assert.equal(response.status,200,await response.clone().text());const f=domFor(await response.text(),url);
    const scripts=[...f.w.document.querySelectorAll('script[nonce]')];
    if(inspectionOnly){
      // Price clients include ES modules tested in Chrome. Here execute the
      // exact inspection script emitted by Pages, with its real run context.
      const inspection=scripts.filter(script=>script.textContent.includes('ORDER_PRODUCT_INSPECTION'));
      assert.equal(inspection.length,1);f.w.eval(inspection[0].textContent);
    }else for(const script of scripts)f.w.eval(script.textContent);
    // The existing role workspace initializes on the browser pageshow event.
    if(new URL(url).searchParams.get('view')==='roles-r3')f.w.dispatchEvent(new f.w.Event('pageshow'));
    return f;
  }
  async function host(id){
    const f=domFor(renderProductLab(nonce),origin+'/ia?'+new URLSearchParams({view:'qa-lab',run:run.id,page:id,persona:'buyer'}));
    const targets=[];f.w.__pages=clone(productLabPages);f.w.__feedback=async options=>targets.push(clone(options.target));
    f.w.eval('('+bootProductLab.toString()+')(window.__pages,'+JSON.stringify(productBuild.digest)+',window.__feedback);');
    const frame=f.w.document.getElementById('product-frame');
    await until(()=>frame.src.includes('qaDocument='),'the selected menu opens its canonical route');
    return {...f,targets,frame};
  }
  return {scoped,mount,urlFor,host,run};
}

test('order and application menus expose distinct real routes while the original application archive remains intact',async()=>{
  assert.equal(productLabPages.length,101);assert.equal(new Set(productLabPages.map(page=>page.id)).size,101);
  assert.equal(productLabPages.filter(page=>page.kind==='product').length,16);
  assert.equal(productLabPages.filter(page=>page.kind==='component').length,2);
  assert.equal(productLabPages.filter(page=>page.kind==='reference').length,83);
  assert.deepEqual(entry('customer-orders'),{id:'customer-orders',label:'주문·납품·거래 문서',view:'product-r3',screen:'store-purchase',state:'select',kind:'product'});
  assert.deepEqual(entry('application-status'),{id:'application-status',label:'납품 신청·증빙 심사',view:'roles-r3',menu:'delivery',kind:'product'});
  const id='application-status/submitted/email',saved=history.archivedRows[id];assert.ok(saved);
  const response=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version:'prior-r3',artifactHash:saved.hashes[390]})));
  assert.equal(response.status,200);const archived=await response.json();
  assert.equal(archived.hash,saved.hashes[390]);assert.equal(archived.version,'prior-r3');
  assert.ok(archived.html.includes(gunzipSync(Buffer.from(history.archivedBodies[saved.body],'base64')).toString()));
  assert.equal(archived.mount,saved.script?gunzipSync(Buffer.from(history.archivedScripts[saved.script],'base64')).toString():null);
});

test('both purchase and order entry points reload the same persisted order, while application review remains a separate case ledger',async t=>{
  const f=await workspace(t),offers=await f.scoped('product','/purchases');assert.deepEqual(offers.items,[]);
  const quote=await f.scoped('product','/purchase-quote',{offerId:offers.offers[0].id,quantity:31,expectedRevision:0,requestKey:crypto.randomUUID()});
  const {item:order}=await f.scoped('product','/purchases',{action:'create',expectedRevision:0,requestKey:crypto.randomUUID(),offerId:offers.offers[0].id,
    quantity:31,paymentMethod:'cash',channel:'store',acceptedQuoteId:quote.quoteId,serviceDate:quote.serviceDate});
  for(const id of ['store-purchase','customer-orders']){
    const view=await f.mount(f.urlFor(id)),doc=view.w.document;
    await until(()=>doc.querySelector('[data-order-select]')?.value===order.id,id+' reads the saved product order');
    assert.equal(doc.documentElement.dataset.productScreen,'store-purchase');
    assert.equal(doc.querySelector('[data-purchase-operations]').hidden,false);
    assert.equal(doc.querySelector('[data-order-product]').textContent,order.product);
    assert.equal(doc.querySelector('[data-order-amount]').textContent,order.total.toLocaleString('ko-KR')+'원');
    assert.ok(view.calls.some(call=>call.path.endsWith('/product/purchases')));
    assert.equal(view.calls.some(call=>call.method==='POST'),false,'opening either menu only reads the existing order');
    assert.deepEqual(view.errors,[]);
  }
  const beforeCases=await f.scoped('role','/?context=1');assert.deepEqual(beforeCases.cases,[],'a product purchase is not a fabricated workflow submission');
  const buyer=beforeCases.grants.find(grant=>grant.role==='BUYER'),caseId=crypto.randomUUID();
  await f.scoped('role','/',{action:'create',kind:'delivery',caseId,orgId:buyer.org_id,siteId:buyer.site_id,quoteId:quote.quoteId,
    expectedRevision:0,requestKey:crypto.randomUUID(),context:{businessName:'납품 신청 분리 검증'}});
  const application=await f.mount(f.urlFor('application-status'));
  await until(()=>application.w.document.getElementById('section-title')?.textContent==='납품 관리','the distinct entry opens the existing authorized case workspace');
  assert.equal(new URL(application.w.location.href).searchParams.get('menu'),'delivery');
  assert.equal(application.w.document.querySelector('[data-order-select]'),null);
  const afterCases=await f.scoped('role','/?context=1');assert.equal(afterCases.cases.length,1);assert.equal(afterCases.cases[0].id,caseId);
  assert.notEqual(caseId,order.id);assert.equal(afterCases.cases[0].quote_id,order.quoteId);
  const reloaded=await f.scoped('product','/purchases');assert.equal(reloaded.items.length,1);
  assert.equal(reloaded.items[0].id,order.id);assert.equal(reloaded.items[0].revision,order.revision);
  assert.equal(reloaded.items[0].status,'AWAITING_CASH');assert.equal(reloaded.items[0].paid,0);
  assert.deepEqual(application.errors,[]);
});

test('ready messages keep the selected order alias and feedback identity, but change menus for a genuinely different application route',async t=>{
  const f=await workspace(t),host=await f.host('customer-orders'),w=host.w;
  const send=(message)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:host.frame.contentWindow,data:message}));
  for(const id of ['customer-orders','store-purchase']){
    if(id==='store-purchase'){
      const button=[...w.document.querySelectorAll('#live-navigation .lab-nav')].find(button=>button.textContent===entry(id).label);assert.ok(button);button.click();
    }
    const view=await f.mount(host.frame.src);
    await until(()=>view.messages.some(item=>item.message.scope==='ORDER_PRODUCT_INSPECTION'&&item.message.type==='ready'),'the actual document emits its inspected path');
    for(const {message,destination} of view.messages){assert.equal(destination,origin);send(message);}
    assert.equal(w.document.getElementById('live-title').textContent,entry(id).label);
    assert.equal(new URL(w.location.href).searchParams.get('page'),id);
    w.document.getElementById('live-feedback').click();
    await until(()=>host.targets.length===(id==='customer-orders'?1:2),'feedback received the selected entry identity');
    assert.equal(host.targets.at(-1).screen,'live-'+id);assert.equal(host.targets.at(-1).state,'running');
  }
  const documentId=new URL(host.frame.src).searchParams.get('qaDocument');
  const applicationUrl=new URL(host.frame.src);applicationUrl.searchParams.set('view','roles-r3');applicationUrl.searchParams.set('menu','delivery');applicationUrl.searchParams.delete('screen');applicationUrl.searchParams.delete('state');
  send({scope:'ORDER_PRODUCT_INSPECTION',type:'ready',runId:f.run.id,persona:'buyer',documentId,
    payload:{path:applicationUrl.pathname+applicationUrl.search,buildDigest:productBuild.digest}});
  assert.equal(w.document.getElementById('live-title').textContent,'납품 신청·증빙 심사');
  assert.equal(new URL(w.location.href).searchParams.get('page'),'application-status');
  w.document.getElementById('live-feedback').click();await until(()=>host.targets.length===3,'the separate workflow has a separate feedback target');
  assert.equal(host.targets.at(-1).screen,'live-application-status');
  assert.equal(host.targets.at(-1).variant,'buyer');assert.deepEqual(host.errors,[]);
});

test('pricing workspace and contract entry points follow actual Pages branches and keep separate inspection feedback targets',async t=>{
  const f=await workspace(t),host=await f.host('price-policy'),w=host.w,base=new URL(host.frame.src);
  const cases=[
    [{},'price-policy'],[{mode:'contract'},'admin-price-approval'],[{},'price-policy'],
    [{priceVersion:'route-only-version'},'admin-price-approval'],[{},'price-policy'],
    [{quote:'route-only-quote'},'admin-price-approval'],[{},'price-policy'],
    [{practice:'1'},'admin-price-approval'],[{mode:'other'},'price-policy']
  ];
  for(const [query,id] of cases){
    const url=new URL(base);for(const [key,value] of Object.entries(query))url.searchParams.set(key,value);
    const view=await f.mount(url.href,{inspectionOnly:true}),doc=view.w.document;
    assert.equal(Boolean(doc.getElementById('price-workspace-app')),id==='price-policy','the asserted branch is the document Pages actually serves');
    assert.equal(Boolean(doc.getElementById('price-content')),id==='admin-price-approval');
    const ready=view.messages.find(item=>item.message.scope==='ORDER_PRODUCT_INSPECTION'&&item.message.type==='ready');
    assert.ok(ready);assert.equal(ready.destination,origin);assert.equal(ready.message.payload.path,url.pathname+url.search);
    w.dispatchEvent(new w.MessageEvent('message',{origin,source:host.frame.contentWindow,data:ready.message}));
    assert.equal(w.document.getElementById('live-title').textContent,entry(id).label);
    assert.equal(new URL(w.location.href).searchParams.get('page'),id);
    assert.equal(w.document.getElementById('live-open').href,url.href);
    const count=host.targets.length;w.document.getElementById('live-feedback').click();
    await until(()=>host.targets.length===count+1,'inspection selects the exact price comment target');
    assert.equal(host.targets.at(-1).screen,'live-'+id);assert.equal(host.targets.at(-1).variant,'buyer');
    assert.deepEqual(view.calls,[],'this route/inspection test does not fabricate or execute a price operation');
    assert.deepEqual(view.errors,[]);
  }
  assert.deepEqual(host.errors,[]);
});
