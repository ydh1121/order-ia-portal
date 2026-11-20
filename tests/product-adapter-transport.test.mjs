import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {handlePreview} from '../functions/_middleware.js';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev';
const runId='1234567890abcdef1234567890abcdef',documentId='12345678-abcd-4abc-8def-1234567890ab';
const context={mode:'lab',runId,persona:'buyer',documentId,actor:{id:'lab-buyer',authenticated:true},
  endpoints:Object.fromEntries(['product','role','price'].map(kind=>[kind,`/api/ia/lab/runs/${runId}/as/buyer/${kind}`]))};
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate,label){for(let i=0;i<200;i++){if(predicate())return;await tick();}assert.ok(predicate(),label);}

// These are transport-only response stubs, not persisted account/order evidence.
async function browser(t,respond=()=>undefined,markup='',options={}){
  const dom=new JSDOM('<!doctype html><html><body>'+markup+'</body></html>',{
    url:origin+'/ia?'+new URLSearchParams({view:'product-r3',labRun:runId,persona:'buyer',qaDocument:documentId}),
    runScripts:'outside-only'}),w=dom.window,calls=[],messages=[];
  t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
  let sessionCalls=0;
  w.postMessage=(message,destination)=>messages.push({message:clone(message),destination});
  w.fetch=async(input,init={})=>{
    const url=new URL(String(input),origin),call={url:url.href,path:url.pathname,method:init.method||'GET',
      headers:new Headers(init.headers),body:init.body,signal:init.signal,credentials:init.credentials,cache:init.cache,redirect:init.redirect};
    if(call.path.endsWith('/session'))call.session=++sessionCalls;
    calls.push(call);
    const result=await respond(call);if(result!==undefined)return result;
    if(call.session)return Response.json({csrf:'session-'+call.session});
    if(call.method==='GET'&&call.path.endsWith('/account'))return Response.json({profile:{name:'',phone:'',connections:[]},capabilities:{dashboard:false}});
    if(call.method==='GET'&&call.path.endsWith('/notifications'))return Response.json({items:[]});
    throw Error('Unexpected transport request: '+call.method+' '+call.path);
  };
  if(options.previousBrand)w.sessionStorage.setItem('order.brand.auth.v1.'+runId,JSON.stringify(options.previousBrand));
  w.eval('('+installProductAdapter.toString()+')('+JSON.stringify(options.context||context)+');');
  const adapter=w.ORDER_APP_ADAPTER;await adapter.ready;await tick();
  return {w,adapter,calls,messages,get sessionCalls(){return sessionCalls;}};
}

test('only a server-confirmed guest-to-member transition consumes one logo arrival; member reloads stay settled',async t=>{
 const arrived=await browser(t,undefined,'',{previousBrand:{authenticated:false,at:Date.now()}});
 assert.equal(arrived.w.ORDER_BRAND_ACCOUNT_CONTEXT.authenticated,true);
 assert.equal(arrived.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),true);
 assert.equal(arrived.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false,'the result or another header cannot replay a consumed arrival');
 const reloaded=await browser(t,undefined,'',{previousBrand:{authenticated:true,at:Date.now()}});
 assert.equal(reloaded.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false);
 const initial=await browser(t);assert.equal(initial.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false);
});

test('stored presentation history cannot authenticate a guest, a missing actor or an expired transition',async t=>{
 for(const actor of [{id:'lab-guest',authenticated:false},undefined]){
  const f=await browser(t,undefined,'',{context:{...context,actor},previousBrand:{authenticated:true,at:Date.now()}});
  assert.equal(f.w.ORDER_BRAND_ACCOUNT_CONTEXT.authenticated,false);
  assert.equal(f.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false);
 }
 const expired=await browser(t,undefined,'',{previousBrand:{authenticated:false,at:Date.now()-13*60*60*1000}});
 assert.equal(expired.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false);
});

test('session rotation is applied to product, role and price transports without changing command identity',async t=>{
  const f=await browser(t,call=>call.method==='POST'?Response.json({revision:2,id:'transport-receipt'}):undefined);
  f.w.document.dispatchEvent(new f.w.CustomEvent('ia-session-updated',{detail:{csrf:'rotated-by-session-client'}}));
  for(const [method,domain] of [['request','product'],['roleRequest','role'],['priceRequest','price']]){
    const body={requestKey:'stable-'+domain,expectedRevision:1,action:'save',data:{value:7}};
    await f.adapter[method]('/transport-only',body);
    const call=f.calls.at(-1);
    assert.equal(call.path,context.endpoints[domain]+'/transport-only');
    assert.equal(call.headers.get('X-IA-CSRF'),'rotated-by-session-client');
    assert.equal(call.body,JSON.stringify(body));assert.equal(call.credentials,'same-origin');
    assert.equal(call.cache,'no-store');assert.equal(call.redirect,'manual');
  }
  assert.equal(f.sessionCalls,1,'a delivered rotation event needs no extra session read');
});

test('one CSRF-denied POST refreshes once and retries the exact first payload and request key, even if the caller changes its draft',async t=>{
  let releaseRefresh,attempts=0;
  const f=await browser(t,call=>{
    if(call.session===2)return new Promise(resolve=>{releaseRefresh=()=>resolve(Response.json({csrf:'refreshed-token'}));});
    if(call.method==='POST')return ++attempts===1?Response.json({error:'CSRF_DENIED'},{status:403}):Response.json({item:{id:'transport-only-order',revision:3}});
  });
  const signal=new f.w.AbortController().signal,body={requestKey:'one-logical-command',expectedRevision:2,action:'save',data:{quantity:31}};
  const original=JSON.stringify(body),pending=f.adapter.request('/purchases',body,signal);
  await until(()=>typeof releaseRefresh==='function','the denied POST starts one session refresh');
  // Editing the original UI object must not turn an automatic retry into a
  // different transaction under either the same or a replacement request key.
  body.requestKey='a-later-user-edit';body.data.quantity=99;
  releaseRefresh();await pending;
  const posts=f.calls.filter(call=>call.method==='POST');
  assert.equal(f.sessionCalls,2);assert.equal(posts.length,2);
  assert.equal(posts[0].body,original);assert.equal(posts[1].body,original);
  assert.equal(posts[0].headers.get('X-IA-CSRF'),'session-1');
  assert.equal(posts[1].headers.get('X-IA-CSRF'),'refreshed-token');
  assert.ok(posts.every(call=>call.signal===signal));
  assert.deepEqual(f.messages,[{destination:origin,message:{scope:'ORDER_PRODUCT_RUNTIME',type:'operation',
    runId,persona:'buyer',documentId,path:'/purchases',method:'POST',revision:3,id:'transport-only-order'}}]);
});

test('a second CSRF rejection terminates the retry and an authorization rejection never refreshes or posts success',async t=>{
  const csrf=await browser(t,call=>call.method==='POST'?Response.json({error:'CSRF_DENIED'},{status:403}):undefined);
  await assert.rejects(csrf.adapter.request('/purchases',{requestKey:'csrf-twice',expectedRevision:0}),error=>error.status===403&&error.message==='CSRF_DENIED');
  assert.equal(csrf.sessionCalls,2);assert.equal(csrf.calls.filter(call=>call.method==='POST').length,2);assert.deepEqual(csrf.messages,[]);
  const denied=await browser(t,call=>call.method==='POST'?Response.json({error:'ACCESS_DENIED'},{status:403}):undefined);
  await assert.rejects(denied.adapter.roleRequest('/members',{requestKey:'permission-denied',expectedRevision:0}),error=>error.status===403&&error.message==='ACCESS_DENIED');
  assert.equal(denied.sessionCalls,1);assert.equal(denied.calls.filter(call=>call.method==='POST').length,1);assert.deepEqual(denied.messages,[]);
});

test('lab URLs are scoped before copying/opening and remain scoped through dynamic insertion, right click and middle click',async t=>{
  const f=await browser(t,undefined,'<a id="existing" target="_blank" href="/ia?view=businesses-r3"><span>사업장</span></a>'),doc=f.w.document;
  function scoped(link){const url=new URL(link.href);assert.equal(url.origin,origin);assert.equal(url.searchParams.get('labRun'),runId);assert.equal(url.searchParams.get('persona'),'buyer');assert.equal(url.searchParams.get('qaDocument'),documentId);return url;}
  const existing=doc.getElementById('existing');scoped(existing);
  assert.equal(existing.target,'_blank');
  const group=doc.createElement('section');group.innerHTML='<div><a href="/ia?view=pricing-r3&mode=contract#quote"><span>가격</span></a></div>';
  doc.body.append(group);await tick();const inserted=group.querySelector('a'),initial=scoped(inserted);
  assert.equal(initial.searchParams.get('mode'),'contract');assert.equal(initial.hash,'#quote');
  for(const [type,button] of [['pointerdown',2],['contextmenu',2],['auxclick',1],['click',0]]){
    // Dispatch in the same task as the edit, before MutationObserver delivery.
    // The event path must itself scope an href for browser context-menu actions.
    inserted.setAttribute('href','/login?returnView=roles-r3&menu=consult&labRun='+'f'.repeat(32)+'&persona=operator&qaDocument=wrong');
    const event=new f.w.MouseEvent(type,{bubbles:true,cancelable:true,button});
    const cancel=e=>e.preventDefault();inserted.addEventListener(type,cancel,{once:true});
    inserted.querySelector('span').dispatchEvent(event);
    const url=scoped(inserted);assert.equal(url.pathname,'/login');assert.equal(url.searchParams.get('returnView'),'roles-r3');assert.equal(url.searchParams.get('menu'),'consult');
  }
  inserted.href='/ia?view=detailed-r3&step=q3';await tick();assert.equal(scoped(inserted).searchParams.get('step'),'q3');
  const external=doc.createElement('a');external.href='https://unrelated.invalid/ia?view=product-r3';doc.body.append(external);await tick();
  assert.equal(external.href,'https://unrelated.invalid/ia?view=product-r3','external links cannot inherit the private run context');
  assert.deepEqual(f.messages,[],'normalizing a link is not a saved operation');
});

// Execute the real login script with a controlled login transport and a
// navigation sink. This verifies URL restoration, not password authentication.
async function loginDestination(t,search){
  const dom=new JSDOM('<form id="owner-login"><input name="email" value="transport@example.invalid"><input name="password" value="Transport-only-password-42!"><button id="submit"></button></form><p id="result"></p>');
  t.after(()=>dom.window.close());let destination=null;
  const cryptoStub={subtle:{importKey:async()=>({}),deriveBits:async()=>new Uint8Array(32).buffer,sign:async()=>new Uint8Array(32).buffer}};
  const scope={document:dom.window.document,location:{search,assign:value=>{destination=value;}},TextEncoder,Uint8Array,atob,btoa,URLSearchParams,crypto:cryptoStub,
    fetch:async path=>path==='/api/ia/auth/challenge'?Response.json({algorithm:'PBKDF2-SHA256',iterations:310000,salt:'dHJhbnNwb3J0',nonce:'n'.repeat(32)}):path==='/api/ia/auth/login'?Response.json({ok:true}):Promise.reject(Error('Unexpected login transport'))};
  vm.runInNewContext(readFileSync(new URL('../public/login.js',import.meta.url),'utf8'),scope);
  dom.window.document.getElementById('owner-login').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>destination!==null,'the login response restores the original review context');
  return new URL(destination,origin);
}

test('expired-session, login client and preview return paths retain the same lab run, role, document and QA selection',async t=>{
  const cases=[
    {view:'product-r3',labRun:runId,persona:'buyer',qaDocument:documentId,screen:'store-purchase',state:'default'},
    {view:'qa-lab',run:runId,page:'admin-shipments',persona:'supplier',width:'390'}
  ];
  for(const expected of cases){
    const request=new Request(origin+'/ia?'+new URLSearchParams({...expected,ignored:'discard-me'}));
    const redirect=await iaPage({request,env:{}});assert.equal(redirect.status,302);
    const login=new URL(redirect.headers.get('Location'),origin),wanted={...expected};delete wanted.view;
    assert.deepEqual(Object.fromEntries(login.searchParams),{returnView:expected.view,...wanted});
    const restored=await loginDestination(t,login.search);assert.equal(restored.pathname,'/ia');assert.deepEqual(Object.fromEntries(restored.searchParams),expected);
    const previewOrigin='https://qa-transport.order-ia-portal.pages.dev';
    const preview=await handlePreview({request:new Request(previewOrigin+'/login'+login.search),env:{IA_PREVIEW_OWNER_ORIGIN:previewOrigin},next(){throw Error('login return must not fall through');}});
    assert.equal(preview.status,303);const target=new URL(preview.headers.get('Location'),previewOrigin);
    assert.equal(target.pathname,'/ia/');assert.deepEqual(Object.fromEntries(target.searchParams),expected);
  }
});
