import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import {catalog} from '../src/server/r3-ui/catalog.gen.mjs';
import {supplementalHistoryRows} from '../src/server/r3-ui/supplemental-history.gen.mjs';
import {frameCode,hostCode,runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {qaReviewRuntimeDigest,qaReviewRuntimeScript} from '../src/server/r3-ui/qa-review-runtime.gen.mjs';
import {getQaSupplemental} from '../src/server/r3-qa-assets.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {onRequest} from '../functions/ia/[[path]].js';
import {qaFixtureForRow} from '../src/server/r3-qa-review-runtime.mjs';

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

test('current review identities join the catalog and source content while retaining width and fixture boundaries',async()=>{
 const index=await read(),supplemental=await getQaSupplemental();
 for(const id of ['login/empty/email','store-purchase/select/email','onboarding/company/email']){
  const entry=index.items.find(row=>row.id===id),original=supplemental.documents.get(id)||catalog.find(row=>row.id===id);
  assert.ok(entry&&original,id);
  const document=await read(id);
  assert.equal(document.hash,entry.hashes[390]);
  assert.equal(document.source.contentHash,original.hashes[390]);
  assert.equal(document.source.contentHash,entry.contentHashes[390]);
  assert.notEqual(document.hash,document.source.contentHash);
  assert.equal(document.source.runtimeDigest,qaReviewRuntimeDigest);
  if(id==='onboarding/company/email'){
   assert.equal(document.fixture.authenticated,false,'the direct company state renders a guest header with signup');
   assert.match(document.html,/class="ob guest footer-open"/);
  }
  const target={screen:entry.screen,state:entry.state,variant:entry.variant,viewport:390,artifactHash:document.hash};
  assert.equal(await isR3ReviewTarget(target),true);
  assert.equal(await isR3ReviewTarget({...target,viewport:1440}),false);
  const bookmarked=await read(id,{version:'recorded',artifactHash:document.hash});
  assert.equal(bookmarked.hash,document.hash);
  assert.equal(bookmarked.qaRuntime,document.qaRuntime);
 }
});

test('current purchase carries the canonical mount, controlled fixture and source-linked static export',async()=>{
 const id='store-purchase/select/email',document=await read(id),source=(await getQaSupplemental()).documents.get(id);
 assert.equal(document.mount,source.mount,'QA transport must not rewrite the canonical page module');
 assert.equal(document.qaRuntime,qaReviewRuntimeScript);
 assert.ok(document.qaRuntime.length>0);
 assert.equal(document.fixture.authenticated,true);
 assert.equal(document.fixture.persona,'buyer');
 assert.equal(document.fixture.scenario,'normal');
 assert.equal(document.source.mode,'controlled-qa');
 assert.equal(document.source.persistence,'frame-memory');
 assert.ok(document.source.files.includes('src/server/r3-ui/qa-mvp-runtime.mjs'));
 assert.ok(document.source.sharedFiles.includes('src/server/product-app-adapter.mjs'));
 assert.ok(document.source.sharedFiles.includes('src/server/r3-ui/qa-fixture-adapter.mjs'));
 assert.equal(document.exportHash,digest(document.editable));
 const dom=new JSDOM(document.editable);
 try{
  const metadata=JSON.parse(dom.window.document.getElementById('frame-meta').textContent);
  assert.equal(metadata.artifactHash,document.hash);
  assert.equal(metadata.viewport,390);
  assert.deepEqual(metadata.source,document.source);
  assert.deepEqual(metadata.fixture,document.fixture);
  assert.equal(dom.window.document.querySelectorAll('iframe,script:not([type="application/json"])').length,0);
  const policy=dom.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  assert.match(policy,/default-src 'none'/);
  assert.match(policy,/form-action 'none'/);
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
 const login=await read(preserved[0].id);
 assert.equal(login.mount,runtimes.integratedLogin,'current review uses the current canonical login module');
});

test('the default route and a current page bookmark retain R1 review controls and an opaque network-disabled frame',async()=>{
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
 assert.equal(labTouches,0);
 assert.match(hostCode.replaceAll("\\'","'"),/connect-src 'none'/,'the host still injects a network-disabled srcdoc policy');
});

test('the returned purchase frame runs the canonical card action with dummy state and keeps location comments available',async t=>{
 const document=await read('store-purchase/card/email'),messages=[],errors=[],network=[];
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

