import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {handlePreview} from '../functions/_middleware.js';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {isArchivedQaRequest,resolveProductLabSelection} from '../src/server/product-lab-page.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import * as oldBrand from '../src/server/r3-ui/brand-history.gen.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev';
const verifier=deriveVerifier(randomBytes(24).toString('base64url'));
async function until(predicate,label){
 const deadline=performance.now()+10_000;
 while(!predicate()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(predicate(),label);
}
function binding(sqlite){
 const prepare=(query,args=[])=>({query,args,bind:(...values)=>prepare(query,values),first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const values=statements.map(({query,args})=>{const compiled=sqlite.prepare(query);return compiled.columns().length?{results:compiled.all(...args),meta:{changes:0}}:{results:[],meta:{changes:Number(compiled.run(...args).changes)}};});sqlite.exec('COMMIT');return values;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function workspace(t){
 const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:'),doms=[];
 t.after(()=>{for(const dom of doms){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}review.close();lab.close();});
 const migrations=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(migrations).filter(file=>file.endsWith('.sql')).sort())review.exec(readFileSync(new URL(file,migrations),'utf8'));
 lab.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
 const env={ORDER_QA_DB:binding(review),ORDER_LAB_DB:binding(lab),IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'route-owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await verifier,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'qa-routing-test'};
 const session=await issueSession(env),cookie=session.cookie.split(';')[0];
 const transport=(input,init={})=>{
  const url=new URL(String(input),origin);assert.equal(url.origin,origin);
  const headers=new Headers(init.headers);headers.set('Cookie',cookie);if(init.body)headers.set('Origin',origin);
  return handleIaRequest(new Request(url,{method:init.method||'GET',headers,...(init.body?{body:init.body}:{})}),env);
 };
 const api=async(path,body)=>{const response=await transport(path,body?{method:'POST',headers:{'Content-Type':'application/json','X-IA-CSRF':session.csrf},body:JSON.stringify(body)}:{});assert.equal(response.status,200,await response.clone().text());return response.json();};
 const {run}=await api('/api/ia/lab/runs',{label:'현재 화면과 보관 화면 분리',requestKey:crypto.randomUUID()});
 const page=input=>iaPage({request:new Request(new URL(String(input),origin),{headers:{Cookie:cookie}}),env});
 async function mount(input){
  const url=new URL(String(input),origin),response=await page(url);assert.equal(response.status,200,await response.clone().text());
  const html=await response.text(),errors=[],calls=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{url:url.href,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});doms.push(dom);const w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});w.HTMLElement.prototype.scrollTo=function(){};
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.fetch=(input,init={})=>{const path=new URL(String(input),url);calls.push({path:path.pathname,method:init.method||'GET'});return transport(path.href,init);};
  for(const script of w.document.querySelectorAll('script[nonce]'))w.eval(script.textContent);
  return {dom,w,doc:w.document,errors,calls};
 }
 const scoped=(persona,path,body)=>api(`/api/ia/lab/runs/${run.id}/as/${persona}/product${path}`,body);
 return {api,page,mount,run,review,scoped};
}
const query=values=>new URLSearchParams(values);

test('only explicit archive, recorded version or exact-hash bookmarks enter the historical QA shell',async t=>{
 const f=await workspace(t),screen='account-settings/normal/email';
 for(const extra of [{},{version:'current'},{archive:'0'},{artifactHash:'invalid'}]){
  const response=await f.page('/ia?'+query({view:'qa-lab',screen,...extra})),html=await response.text();
  assert.equal(response.status,200);assert.match(html,/id="product-lab"/);assert.match(html,/id="product-frame"/);assert.doesNotMatch(html,/id="frame"/);
 }
 for(const extra of [{archive:'1'},{version:'previous'},{version:'prior-r3'},{version:'recorded'},{artifactHash:oldBrand.archivedRows['profile/menu/email'].hashes[390]}]){
  const values=query({view:'qa-lab',screen,...extra});assert.equal(isArchivedQaRequest(values),true);
  const response=await f.page('/ia?'+values),html=await response.text();
  assert.equal(response.status,200);assert.match(html,/id="frame"/);assert.doesNotMatch(html,/id="product-lab"/);
 }
 const retained=await f.page('/ia?'+query({view:'qa-lab',screen,archive:'1',labRun:'f'.repeat(32),persona:'buyer'}));
 assert.equal(retained.status,200);assert.match(await retained.text(),/id="frame"/,'historical replay does not require a still-active product run');
 assert.equal(f.review.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,0,'route selection never changes review history');
});

test('a current account bookmark opens the actual run and account API, retaining persona across screen changes',async t=>{
 const f=await workspace(t),before=await f.scoped('buyer','/account');
 await f.scoped('buyer','/account',{action:'update',expectedRevision:before.revision,requestKey:crypto.randomUUID(),profile:{name:'실제 실행에 저장한 담당자',phone:'010-1234-5678'}});
 const host=await f.mount('/ia?'+query({view:'qa-lab',screen:'account-settings/normal/email',run:f.run.id,persona:'buyer',width:'390'}));
 const frame=host.doc.getElementById('product-frame');await until(()=>frame.src.includes('qaDocument='),'the bookmark selects a canonical product document');
 const target=new URL(frame.src);assert.equal(target.searchParams.get('view'),'product-r3');assert.equal(target.searchParams.get('screen'),'account-settings');assert.equal(target.searchParams.get('state'),'normal');assert.equal(target.searchParams.get('labRun'),f.run.id);assert.equal(target.searchParams.get('persona'),'buyer');
 const account=await f.mount(frame.src);await until(()=>account.doc.querySelector('[data-account-menu-host] [name=name]')?.value==='실제 실행에 저장한 담당자','the canonical account panel reads persisted data');
 assert.ok(account.calls.some(call=>call.path===`/api/ia/lab/runs/${f.run.id}/as/buyer/product/account`));assert.equal(account.calls.some(call=>call.method==='POST'),false);
 assert.equal(account.doc.querySelector('[data-withdraw-form]'),null);assert.equal(new URL(host.w.location.href).searchParams.get('page'),'account-settings');
 const actual=new URL(frame.src);actual.searchParams.set('screen','profile');actual.searchParams.set('state','menu');
 host.w.dispatchEvent(new host.w.MessageEvent('message',{origin,source:frame.contentWindow,data:{scope:'ORDER_PRODUCT_INSPECTION',type:'ready',runId:f.run.id,persona:'buyer',documentId:target.searchParams.get('qaDocument'),payload:{path:actual.pathname+actual.search}}}));
 host.doc.getElementById('live-width').value='1440';host.doc.getElementById('live-width').dispatchEvent(new host.w.Event('change'));
 const reopened=new URL(frame.src);assert.equal(reopened.searchParams.get('screen'),'profile');assert.equal(reopened.searchParams.get('state'),'menu');assert.equal(reopened.searchParams.get('labRun'),f.run.id);assert.equal(reopened.searchParams.get('persona'),'buyer');
 assert.equal((await f.scoped('buyer','/account')).profile.name,'실제 실행에 저장한 담당자');assert.deepEqual(host.errors,[]);assert.deepEqual(account.errors,[]);
});

test('unconnected state bookmarks keep their exact historical link and a missing explicit run never falls into a different run',async t=>{
 const f=await workspace(t),historical='signature/done/email';
 const host=await f.mount('/ia?'+query({view:'qa-lab',screen:historical,run:f.run.id,persona:'operator'}));
 await until(()=>host.doc.getElementById('live-source').textContent.includes('제품 연결 대기'),'the unconnected surface is visibly a reference');
 assert.equal(host.doc.getElementById('product-frame').hasAttribute('src'),false);assert.equal(host.doc.getElementById('live-bound').hidden,true);
 const archive=new URL(host.doc.querySelector('#live-empty a').href);assert.equal(archive.searchParams.get('archive'),'1');assert.equal(archive.searchParams.get('screen'),historical);
 assert.equal(host.calls.some(call=>call.path.includes('/as/')),false,'a reference does not issue a simulated product request');
 const missing=await f.mount('/ia?'+query({view:'qa-lab',screen:'account-settings/normal/email',run:'f'.repeat(32),persona:'buyer'}));
 await until(()=>missing.doc.getElementById('live-status').textContent.includes('요청한 테스트 실행을 찾을 수 없습니다'),'a missing explicit run is reported');
 assert.equal(missing.doc.getElementById('product-frame').hasAttribute('src'),false);assert.equal(missing.doc.getElementById('live-open').hasAttribute('href'),false);assert.equal(missing.doc.getElementById('live-run').value,'');
 assert.deepEqual(host.errors,[]);assert.deepEqual(missing.errors,[]);
});

test('current aliases preserve applicable product states while historical outcomes cannot manufacture server completion',()=>{
 const selected=screen=>resolveProductLabSelection(query({screen}));
 assert.equal(selected('profile/menu/email').id,'account-settings');assert.equal(selected('profile/menu/email').screen,'profile');assert.equal(selected('profile/menu/email').state,'menu');
 assert.equal(selected('onboarding/member-3/email').state,'member-3');assert.equal(selected('onboarding/guest-2/email').defaultPersona,'guest');
 assert.equal(selected('account-settings/closed/email').state,'normal');assert.equal(selected('login/success/email').state,'empty');assert.equal(selected('admin-analytics/normal/email').state,'business-sales');assert.equal(selected('admin-shipments/delivered/email').state,'default');
 assert.equal(selected('account-settings/sessions/email').kind,'reference');assert.equal(selected('account-settings/sessions/email').screen,'account-settings/sessions/email');
 assert.equal(selected('quote-result/saving/email').view,'simple-r3');assert.ok(selected('quote-result/saving/email').routeNotice);
 assert.equal(selected('admin-orders/detail/email').id,'customer-orders');assert.equal(selected('admin-orders/detail/email').state,'select');
 const orderBookmark=resolveProductLabSelection(query({page:'customer-orders',screen:'store-purchase',state:'select'}));assert.equal(orderBookmark.id,'customer-orders','refresh retains the selected order alias and its independent feedback identity');
});

async function loginDestination(t,search){
 const dom=new JSDOM('<form id="owner-login"><input name="email" value="route@example.invalid"><input name="password" value="Transport-only-password-42!"><button id="submit"></button></form><p id="result"></p>');t.after(()=>dom.window.close());let destination=null;
 // Only the navigation contract is under test. Password authentication and
 // cryptography continue to be covered by the real owner-session tests.
 const scope={document:dom.window.document,location:{search,assign:value=>{destination=value;}},TextEncoder,Uint8Array,atob,btoa,URLSearchParams,
  crypto:{subtle:{importKey:async()=>({}),deriveBits:async()=>new Uint8Array(32).buffer,sign:async()=>new Uint8Array(32).buffer}},
  fetch:async path=>path==='/api/ia/auth/challenge'?Response.json({algorithm:'PBKDF2-SHA256',iterations:310000,salt:'dHJhbnNwb3J0',nonce:'n'.repeat(32)}):path==='/api/ia/auth/login'?Response.json({ok:true}):Promise.reject(Error('Unexpected login transport'))};
 vm.runInNewContext(readFileSync(new URL('../public/login.js',import.meta.url),'utf8'),scope);
 dom.window.document.getElementById('owner-login').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>destination!==null,'the login response restores the bounded route');return new URL(destination,origin);
}

test('expired login and preview return preserve archive hashes and live selection without accepting arbitrary redirect fields',async t=>{
 const hash=oldBrand.archivedRows['profile/menu/email'].hashes[390];
 const cases=[{view:'qa-lab',screen:'account-settings/normal/email',run:'1'.repeat(32),persona:'buyer',width:'390'},
  {view:'qa-lab',screen:'profile/menu/email',archive:'1',version:'recorded',artifactHash:hash,width:'390'},
  {view:'qa-lab',page:'component-library',screen:'component-library',state:'asset-select',variant:'email',componentVariant:'select-123456789abc',run:'1'.repeat(32),persona:'operator'}];
 for(const expected of cases){
  const redirect=await iaPage({request:new Request(origin+'/ia?'+query({...expected,ignored:'discard-me',returnTo:'https://other.invalid',redirect:'//other.invalid'})),env:{}});assert.equal(redirect.status,302);
  const login=new URL(redirect.headers.get('Location'),origin),wanted={...expected};delete wanted.view;assert.deepEqual(Object.fromEntries(login.searchParams),{returnView:'qa-lab',...wanted});
  const restored=await loginDestination(t,login.search);assert.equal(restored.origin,origin);assert.equal(restored.pathname,'/ia');assert.deepEqual(Object.fromEntries(restored.searchParams),expected);
  const previewOrigin='https://qa-route.order-ia-portal.pages.dev';const preview=await handlePreview({request:new Request(previewOrigin+'/login'+login.search),env:{IA_PREVIEW_OWNER_ORIGIN:previewOrigin},next(){assert.fail('login restoration must not fall through');}});
  assert.equal(preview.status,303);assert.deepEqual(Object.fromEntries(new URL(preview.headers.get('Location'),previewOrigin).searchParams),expected);
 }
 const rejected=await loginDestination(t,'?returnView=qa-lab&archive=yes&version=https://other.invalid&artifactHash=invalid&state=../../admin&componentVariant=%3Cscript%3E&returnTo=https://other.invalid');assert.deepEqual(Object.fromEntries(rejected.searchParams),{view:'qa-lab'});
 const historical=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+query({id:'profile/menu/email',width:'390',version:'recorded',artifactHash:hash})));
 assert.equal(historical.status,200);const artifact=await historical.json();assert.equal(artifact.hash,hash);assert.equal(artifact.version,'prior-r3','the retained comment hash still resolves to its original authored frame');
});
