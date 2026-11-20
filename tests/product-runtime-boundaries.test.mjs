import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {onRequest} from '../functions/ia/[[path]].js';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {catalog} from '../src/server/r3-ui/catalog.gen.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev';
const verifier=deriveVerifier(randomBytes(32).toString('base64url'));
async function until(predicate,label){
  const deadline=performance.now()+10_000;
  while(!predicate()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(predicate(),label);
}
function d1(sqlite){
  const prepare=(query,args=[])=>({query,args,bind:(...parameters)=>prepare(query,parameters),first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
  return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(statement=>{const compiled=sqlite.prepare(statement.query);return compiled.columns().length?{results:compiled.all(...statement.args),meta:{changes:0}}:{results:[],meta:{changes:Number(compiled.run(...statement.args).changes)}};});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}

// The browser transport reaches the same Pages/router/domain functions as the
// deployed app. No successful product response, order, account or sale is mocked.
async function workspace(t){
  const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:'),doms=[];
  t.after(()=>{for(const dom of doms){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}review.close();lab.close();});
  const migrations=new URL('../migrations/',import.meta.url);
  for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort())review.exec(readFileSync(new URL(name,migrations),'utf8'));
  lab.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
  const env={ORDER_QA_DB:d1(review),ORDER_LAB_DB:d1(lab),IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'boundary-owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await verifier,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'runtime-boundary-test'};
  const session=await issueSession(env),cookie=session.cookie.split(';')[0];
  const api=async(path,body)=>handleIaRequest(new Request(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{Origin:origin,'Content-Type':'application/json','X-IA-CSRF':session.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  const created=await api('/api/ia/lab/runs',{label:'정규 화면 진입 경계',requestKey:crypto.randomUUID()});assert.equal(created.status,200,await created.clone().text());const {run}=await created.json();
  const product=(role,path,body)=>api(`/api/ia/lab/runs/${run.id}/as/${role}/product${path}`,body);
  function url(screen,state,{persona='buyer',normal=false}={}){return origin+'/ia?'+new URLSearchParams({view:'product-r3',screen,state,...(normal?{}:{labRun:run.id,persona})});}
  const page=(screen,state,options)=>onRequest({request:new Request(url(screen,state,options),{headers:{Cookie:cookie}}),env});
  async function mount(screen,state,options={}){
    const response=await page(screen,state,options);assert.equal(response.status,200,`${screen}/${state}`);const html=await response.text(),errors=[],calls=[],navigationAttempts=[];
    const console=new VirtualConsole();console.on('jsdomError',error=>{if(error.type==='not implemented'&&/^Not implemented: navigation/.test(error.message))navigationAttempts.push(error);else if(error.type!=='css parsing')errors.push(error);});
    const dom=new JSDOM(html,{url:url(screen,state,options),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;doms.push(dom);
    w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
    w.HTMLElement.prototype.scrollTo=function(){};
    w.ResizeObserver=class{observe(){}disconnect(){}};
    w.fetch=async(input,init={})=>{
      const destination=new URL(String(input),w.location.href);assert.equal(destination.origin,origin,'the product runtime must stay on this host');
      const headers=new Headers(init.headers);headers.set('Cookie',cookie);if(init.body)headers.set('Origin',origin);
      const request=new Request(destination,{method:init.method||'GET',headers,...(init.body?{body:init.body}:{})});
      calls.push({path:destination.pathname,method:request.method,body:init.body?JSON.parse(init.body):undefined});
      return handleIaRequest(request,env);
    };
    for(const script of w.document.querySelectorAll('script'))if(!script.src)w.eval(script.textContent);
    return {dom,w,root:w.document.querySelector('#order-single'),calls,errors,navigationAttempts};
  }
  return {page,mount,product,api,run};
}
const text=root=>{const clone=root.cloneNode(true);for(const node of clone.querySelectorAll('style,script'))node.remove();return clone.textContent;};

test('direct product URLs cannot promote historical completion, order or sales examples to real state',async t=>{
  const f=await workspace(t);
  const historical=[['account-settings','closed'],['signature','done'],['admin-shipments','delivered'],['supplier-shipments','delivered'],['admin-orders','detail'],['admin-analytics','normal']];
  for(const [screen,state] of historical)assert.ok(catalog.some(row=>row.screen===screen&&row.state===state),`the guarded state really exists in the preserved catalog: ${screen}/${state}`);
  for(const [screen,state] of [...historical,['admin-analytics','business']])for(const normal of [false,true]){
    const response=await f.page(screen,state,{persona:'operator',normal});
    assert.equal(response.status,404,`${normal?'product':'lab'} ${screen}/${state}`);
    assert.match(response.headers.get('Content-Type'),/^text\/plain/);
    assert.doesNotMatch(await response.text(),/data-product-runtime|data-sales-total|<form|처리가 완료|서명이 완료|탈퇴가 완료|QA-B-1101|64,000/);
  }
  const purchases=await(await f.product('buyer','/purchases')).json(),account=await(await f.product('buyer','/account')).json();
  assert.deepEqual(purchases.items,[]);assert.equal(account.state,'ACTIVE','opening a completion URL must never mutate the account');
});

test('the actual product purchase page waits for a server quote and persists only after confirmation',async t=>{
  const f=await workspace(t),view=await f.mount('store-purchase','default');
  await until(()=>view.root.querySelector('[data-purchase-offer]')?.value&&!view.root.querySelector('[data-purchase-confirm]').disabled,'approved offers are loaded from the product API');
  const quantity=view.root.querySelector('[name=quantity]'),unit=view.root.querySelector('[name=unit-price]'),confirm=view.root.querySelector('[data-purchase-confirm]');
  assert.equal(unit.readOnly,true);assert.ok(view.calls.some(call=>call.path.endsWith('/product/purchases')));
  quantity.value='31';quantity.dispatchEvent(new view.w.Event('input',{bubbles:true}));confirm.click();
  await until(()=>/주문 확정/.test(confirm.textContent),'the first action must display the issued quote');
  assert.equal(unit.value,'5970','31 trays use the server quantity tier');
  assert.deepEqual((await(await f.product('buyer','/purchases')).json()).items,[]);
  const prices=[...view.root.querySelectorAll('[data-same-price]')].map(node=>node.textContent);assert.equal(prices.length,2);assert.equal(prices[0],prices[1]);
  confirm.click();await until(()=>view.calls.some(call=>call.method==='POST'&&call.body?.action==='create'),'the second action sends an order');
  await until(()=>view.w.ORDER_APP_ADAPTER.selectedPurchaseId,'the product response selects the persisted order');
  const saved=(await(await f.product('buyer','/purchases')).json()).items[0];assert.equal(saved.id,view.w.ORDER_APP_ADAPTER.selectedPurchaseId);assert.equal(saved.total,5970*31);assert.equal(saved.status,'AWAITING_CASH');assert.equal(saved.paid,0);
  // JSDOM cannot perform a document navigation; Chrome tests cover that hop.
  // This assertion stops at the acknowledged persisted response and selection.
  assert.equal(view.navigationAttempts.length,1);
  const create=view.calls.find(call=>call.body?.action==='create');assert.ok(create.body.acceptedQuoteId);assert.equal(Object.hasOwn(create.body,'unitPrice'),false);assert.equal(Object.hasOwn(create.body,'total'),false);assert.deepEqual(view.errors,[]);
});

test('normal account and plain profile pages load and save the actual account instead of opening withdrawal',async t=>{
  const f=await workspace(t),before=await(await f.product('buyer','/account')).json();
  const seeded=await f.product('buyer','/account',{action:'update',expectedRevision:before.revision,requestKey:crypto.randomUUID(),profile:{name:'저장된 매장 담당자',phone:'010-1234-5678'}});assert.equal(seeded.status,200);
  const normal=await f.mount('account-settings','normal');
  await until(()=>normal.root.querySelector('[data-account-menu-host] [name=name]'),'normal account opens the real account panel');
  assert.equal(normal.w.document.documentElement.dataset.productScreen,'profile');assert.equal(normal.root.querySelector('[data-withdraw-form]'),null);
  const host=normal.root.querySelector('[data-account-menu-host]'),name=host.querySelector('[name=name]');assert.equal(name.value,'저장된 매장 담당자');assert.equal(host.querySelector('[name=phone]').value,'010-1234-5678');
  assert.ok(name.closest('.field'),'the account uses the shared field root');
  name.value='변경한 매장 담당자';host.querySelector('button').click();
  await until(()=>/저장했어요/.test(host.textContent),'the real account save is acknowledged');
  assert.ok(normal.calls.some(call=>call.method==='POST'&&call.path.endsWith('/product/account')&&call.body.action==='update'));
  assert.equal((await(await f.product('buyer','/account')).json()).profile.name,'변경한 매장 담당자');
  const reopened=await f.mount('profile','default');await until(()=>reopened.root.querySelector('[data-account-menu-host] [name=name]')?.value==='변경한 매장 담당자','plain profile reads the saved account');
  assert.equal(reopened.root.querySelector('[data-withdraw-form]'),null);assert.equal(reopened.root.querySelector('[data-order-select]'),null);assert.deepEqual(normal.errors,[]);assert.deepEqual(reopened.errors,[]);
});

test('actual analytics starts from the isolated persisted order set, without embedding review revenue',async t=>{
  const f=await workspace(t),view=await f.mount('admin-analytics','default',{persona:'operator'});
  await until(()=>view.root.querySelector('[data-sales-total=orders]')?.textContent==='0건','an empty execution has zero sales orders');
  assert.ok(view.calls.some(call=>call.path.endsWith('/product/sales')));
  for(const output of view.root.querySelectorAll('[data-sales-total]'))assert.equal(Number(output.textContent.replace(/[^\d.-]/g,'')),0,output.dataset.salesTotal);
  assert.doesNotMatch(text(view.root),/QA-B-1101|QA-C-1101|첫 번째 매장|11월 동네장터|186,000|580,000/);
  assert.deepEqual((await(await f.product('operator','/sales')).json()).items,[]);assert.deepEqual(view.errors,[]);
});

test('a guest direct product route becomes login and every confidential price route still denies access',async t=>{
  const f=await workspace(t),view=await f.mount('store-purchase','default',{persona:'guest'});
  assert.equal(view.w.document.documentElement.dataset.productScreen,'login');assert.equal(view.root.querySelector('[data-purchase-form]'),null);assert.equal(view.root.querySelector('[name=unit-price]'),null);
  assert.doesNotMatch(text(view.root),/5,980|5,970|64,000|견적 합계|주문 확정/);
  for(const path of ['/product/purchases','/product/sales','/price/versions','/price/workspace']){
    const response=await f.api(`/api/ia/lab/runs/${f.run.id}/as/guest${path}`);assert.equal(response.status,401,path);
    const body=await response.json();assert.equal(body.error,'AUTHENTICATION_REQUIRED');assert.doesNotMatch(JSON.stringify(body),/5980|5970|unitPrice|offers|matrix|total/);
  }
  const quote=await f.product('guest','/purchase-quote',{offerId:'lab-default-price',quantity:31,expectedRevision:0,requestKey:crypto.randomUUID()});assert.equal(quote.status,401);assert.deepEqual(view.errors,[]);
});
