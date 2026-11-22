import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import {catalog} from '../src/server/r3-ui/catalog.gen.mjs';
import {supplementalHistoryRows} from '../src/server/r3-ui/supplemental-history.gen.mjs';
import {frameCode,hostCode,runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {getQaSupplemental} from '../src/server/r3-qa-assets.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {onRequest} from '../functions/ia/[[path]].js';
import {qaFixtureForRow} from '../src/server/r3-qa-review-runtime.mjs';
import {researchBuild,researchScene} from '../src/server/research-app/page.mjs';
import {preservedReviewArtifact} from './helpers/preserved-review-artifact.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev',endpoint=origin+'/api/ia/r3-qa/artifact';
const digest=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
async function read(id,extra={}){
 const query=id?'?'+new URLSearchParams({id,width:'390',version:'current',...extra}):'';
 const response=await serveR3Artifact(new Request(endpoint+query));
 assert.equal(response.status,200,await response.clone().text());
 assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/);
 return response.json();
}
async function until(check,label){
 const deadline=performance.now()+5000;
 while(!check()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(check(),label);
}

test('QA authentication follows the screen semantics without confusing quote expiration with logout',()=>{
 for(const [screen,state,authenticated] of [
  ['login','success',true],['signup','success',false],['password','complete',false],['otp','verified',true],
  ['session-access','expired',false],['admin-access','expired',false],['delivery-request','expired',true],
  ['saved-quote','expired',true],['admin-price-approval','expired',true],['account-settings','closed',false],
  ['onboarding','company',false],['onboarding','guest-1',false],['onboarding','member-1',true],['onboarding','member-4',true]
 ])assert.equal(qaFixtureForRow({screen,state,role:'customer'}).authenticated,authenticated,screen+'/'+state);
});

test('current review identities bind one research build to the selected catalog route and viewport',async()=>{
 const index=await read(),supplemental=await getQaSupplemental();
 for(const id of ['login/empty/email','store-purchase/select/email','onboarding/company/email']){
  const entry=index.items.find(row=>row.id===id),original=supplemental.documents.get(id)||catalog.find(row=>row.id===id);
  assert.ok(entry&&original,id);
  const document=await read(id);
  assert.equal(document.hash,entry.hashes[390]);
  assert.equal(entry.application,true);
  assert.equal(entry.contentHashes[390],original.hashes[390],'the catalog still identifies its retained authored source');
  assert.notEqual(document.hash,entry.contentHashes[390]);
  assert.equal(document.source.kind,'research-application');
  assert.equal(document.application.build,researchBuild.digest);
  assert.equal(document.source.build,document.application.build);
  const url=new URL(document.application.url,origin);
  assert.equal(url.origin,origin);assert.equal(url.pathname,'/ia');assert.equal(url.searchParams.get('view'),'research-r3');
  assert.equal(url.searchParams.get('screen'),entry.screen);assert.equal(url.searchParams.get('state'),entry.state);assert.equal(url.searchParams.get('variant'),entry.variant);
  assert.equal(url.searchParams.get('build'),document.application.build);assert.equal(url.searchParams.has('archive'),false);
  const target={screen:entry.screen,state:entry.state,variant:entry.variant,viewport:390,artifactHash:document.hash};
  assert.equal(await isR3ReviewTarget(target),true);
  assert.equal(await isR3ReviewTarget({...target,viewport:1440}),false);
  const bookmarked=await read(id,{version:'recorded',artifactHash:document.hash});
  assert.equal(bookmarked.hash,document.hash);
  assert.deepEqual(bookmarked.application,document.application);
  assert.equal(bookmarked.html,document.html);
 }
});

test('current purchase exports the standalone app with a pinned build and retains its canonical scene and fixture route',async()=>{
 const id='store-purchase/select/email',document=await read(id),source=(await getQaSupplemental()).documents.get(id);
 const scene=await researchScene('store-purchase','select','email');
 assert.equal(scene.html,source.body,'the research app consumes the canonical purchase scene');
 assert.equal(scene.family,'product');
 assert.equal(Object.hasOwn(document,'mount'),false);assert.equal(Object.hasOwn(document,'qaRuntime'),false);
 assert.equal(document.source.environment,'research-fixture');
 assert.equal(document.source.ownership,'application');assert.equal(document.source.promotion,'same-build');
 for(const file of ['src/server/product-ui/assets.gen.mjs','src/server/product-ui/documents.mjs','src/server/product-app-adapter.mjs','src/server/research-app/application.mjs'])assert.ok(document.source.productSource[file],file);
 const loading=await read('store-purchase/qa-loading/email');
 assert.deepEqual(loading.fixture,{scenario:'loading'});assert.equal(new URL(loading.application.url,origin).searchParams.get('state'),'qa-loading');
 assert.equal(document.exportHash,digest(document.editable));
 const dom=new JSDOM(document.editable);
 try{
  const metadata=JSON.parse(dom.window.document.getElementById('frame-meta').textContent);
  assert.equal(metadata.format,'order-research-route/v1');assert.equal(metadata.hash,document.hash);
  assert.equal(metadata.viewport,390);
  assert.deepEqual(metadata.source,document.source);
  assert.deepEqual(metadata.route,{screen:'store-purchase',state:'select',variant:'email'});
  const config=JSON.parse(dom.window.document.getElementById('order-app-config').textContent);
  assert.equal(config.build,document.application.build);assert.equal(config.inspect,false);
  assert.equal(config.initial.screen,'store-purchase');assert.equal(config.initial.state,'select');
  assert.equal(dom.window.document.querySelectorAll('iframe').length,0);
  assert.match(dom.window.document.querySelector('script[type="module"]').textContent,new RegExp('/ia/research-assets/'+document.application.build+'/research/application\\.mjs'));
  for(const node of dom.window.document.querySelectorAll('script[src],link[href]'))assert.ok((node.getAttribute('src')||node.getAttribute('href')).startsWith('/ia/research-assets/'+document.application.build+'/'));
 }finally{dom.window.close();}
});

// Full-document values captured before the QA wrapper from the ca6ef52c index.
// The source renderer, catalog, supplemental history and runtime bytes were
// independently matched to that index before taking these receipts.
const preserved=[
 {id:'login/empty/email',hash:'98484ba59eb2d08f5199a34b54e4dc730abeca103e55e2bd0c32124e89ba2ffe',version:'current',
  html:'cccf6ac91765ad33a24d39d98b03c4b2be75dcd56a28fe93a1570cf6b2de9470',mount:'bb9175c66aba9474c9c4ba66dcdba1c6623523a898d7e1c9a600b1006e77934c'},
 {id:'store-purchase/select/email',hash:'3eaa12eadbf56ad267c8037f9b445bee649d41ec8af7f8470c58c8fe7b1d2e23',version:'prior-r3',
  html:'101264b881a40684339bf80ef06e11cc7a5e5d4796f08399f63eedbe393ae025',mount:'359e5feab57c1f4072da1dd1b5bc5f3ec569c083c5a6a842b752e2856c1983e3'}
];
test('pinned catalog and supplemental documents preserve exact HTML and mount bytes without the current QA wrapper',async()=>{
 assert.notEqual(catalog.find(row=>row.id===preserved[0].id).hashes[390],preserved[0].hash,'the current shared UI has advanced while the published identity stays readable');
 assert.equal(await isR3ReviewTarget({screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:preserved[0].hash}),true);
 assert.equal(supplementalHistoryRows[preserved[1].id].hashes[390],preserved[1].hash);
 for(const saved of preserved){
  for(const version of ['recorded','current']){
   const document=await read(saved.id,{version,artifactHash:saved.hash});
   assert.equal(document.hash,saved.hash);
   assert.equal(document.version,saved.version);
   assert.equal(digest(document.html),saved.html);
   assert.equal(digest(document.mount),saved.mount);
   for(const key of ['qaRuntime','fixture','source'])assert.equal(Object.hasOwn(document,key),false,key);
  }
 }
 const login=await preservedReviewArtifact(preserved[0].id);
 assert.equal(login.mount,runtimes.integratedLogin,'the explicitly pinned R1 successor retains its canonical login module');
 const current=await read(preserved[0].id);
 assert.ok(current.application);assert.notEqual(current.hash,login.hash,'the default link selects the research app, independently of R1 replay');
});

test('the default route and bookmark retain R1 review controls while the current app uses its authenticated same-origin route',async()=>{
 let labTouches=0;
 const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'qa-shell-test@example.invalid',
  IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(24).toString('base64url')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),
  ORDER_LAB_DB:{prepare(){labTouches++;throw Error('Default QA must not create a database workspace');}}};
 const session=await issueSession(env);
 for(const path of ['/ia?view=qa-lab','/ia?view=qa-lab&screen=store-purchase/card/email']){
  const response=await onRequest({request:new Request(origin+path,{headers:{Cookie:session.cookie.split(';')[0]}}),env});
  assert.equal(response.status,200);
  const html=await response.text(),dom=new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''));
  try{
   const document=dom.window.document;
   assert.ok(document.getElementById('lab'));
   assert.equal(document.getElementById('frame').getAttribute('sandbox'),'allow-scripts');
   assert.deepEqual([...document.querySelectorAll('.lab-topbar [data-mode]')].map(button=>[button.dataset.mode,button.textContent.trim()]),
    [['focus','집중 보기'],['board','상태 한눈에'],['dual','모바일·PC']]);
   assert.equal(document.querySelector('#new[data-lab-action="pin-mode"]').textContent.trim(),'위치 코멘트');
   for(const id of ['catalog','state-buttons','drawer','review-note','export'])assert.ok(document.getElementById(id),id);
   assert.equal(document.querySelectorAll('#product-lab,#product-frame,#live-create').length,0);
  }finally{dom.window.close();}
 }
 const application=await read('store-purchase/card/email');
 const response=await onRequest({request:new Request(origin+application.application.url,{headers:{Cookie:session.cookie.split(';')[0]}}),env});
 assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);
 const app=new JSDOM(await response.text());
 try{
  assert.ok(app.window.document.querySelector('[data-research-application]'));
  const config=JSON.parse(app.window.document.getElementById('order-app-config').textContent);
  assert.equal(config.build,application.application.build);assert.equal(config.initial.state,'card');assert.equal(config.inspect,false);
 }finally{app.window.close();}
 assert.equal(labTouches,0);
 assert.match(hostCode,/INVALID_RESEARCH_APPLICATION_URL/,'the host rejects foreign application URLs');
 assert.match(hostCode,/allow-scripts allow-same-origin allow-forms/,'current app assets execute on the authenticated origin');
 assert.match(hostCode.replaceAll("\\'","'"),/connect-src 'none'/,'historical srcdoc replay retains its network-disabled policy');
});

test('the explicitly pinned R1 purchase frame retains its card action, dummy state and location comments',async t=>{
 const document=await preservedReviewArtifact('store-purchase/card/email'),messages=[],errors=[],network=[];
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
 // JSDOM does not measure CSS animation. Use the returned frame DOM and scripts;
 // the hosted Chrome gate covers layout and animation rendering.
 const dom=new JSDOM(document.html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{url:origin+'/qa-frame',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const w=dom.window,parent={postMessage(message){messages.push(message);}};
 t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
 Object.defineProperty(w,'parent',{value:parent});
 Object.defineProperty(w,'crypto',{value:webcrypto});
 w.TextEncoder=TextEncoder;
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
 w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
 w.fetch=async(...args)=>{network.push(args);throw Error('A controlled QA frame must not use network fetch');};
 const session=w.JSON.parse(JSON.stringify({channel:randomUUID(),artifact:document.hash,screen:'store-purchase',state:'card',variant:'email',version:'current',fixture:document.fixture}));
 w.eval(document.mount);
 w.eval(document.qaRuntime);
 w.ORDER_QA_REVIEW_RUNTIME(session);
 w.__testSession=session;
 w.eval('('+frameCode+')(__testSession)');
 const root=w.document.getElementById('order-single'),button=root.querySelector('[data-purchase-card]');
 await until(()=>button&&!button.disabled,'the real purchase module reads the configured card order');
 assert.ok(w.document.getElementById('r3-veil'),'the actual review frame creates its location-comment veil');
 assert.equal(messages.filter(message=>message.type==='ready').at(-1).artifact,document.hash);
 const before=clone(w.ORDER_APP_ADAPTER.fixture.inspect());
 const selected=before.selectedPurchaseId;
 assert.equal(before.data.purchases.find(item=>item.id===selected).status,'AWAITING_CARD');
 button.click();
 await until(()=>root.querySelector('[data-purchase-status]').textContent.includes('카드 결제가 아직 연결되지 않았어요.'),'the canonical action exposes the unavailable provider without inventing payment');
 const after=clone(w.ORDER_APP_ADAPTER.fixture.inspect());
 assert.equal(after.data.purchases.find(item=>item.id===selected).status,'AWAITING_CARD');
 assert.ok(after.calls.some(call=>call.path==='/purchases'&&call.method==='POST'&&call.status===503));
 assert.equal(after.source.persistent,false);
 assert.equal(after.source.storage,'frame-memory');
 assert.equal(after.source.commercial,false);
 assert.deepEqual(network,[]);
 w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{scope:'ORDER_R3_HOST',channel:session.channel,artifact:document.hash,type:'mode',payload:true}}));
 assert.equal(w.document.getElementById('r3-veil').hidden,false);
 assert.deepEqual(errors,[]);
});

