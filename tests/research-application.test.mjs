import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {renderResearchApplication,researchScene,serveResearchAsset,researchAssetBase,researchArtifact,listResearchRows,isResearchRow} from '../src/server/research-app/page.mjs';
import {catalog} from '../src/server/product-ui/catalog.gen.mjs';
import {mvpScreens} from '../src/server/r3-qa-navigation.mjs';
import {researchRoute} from '../src/server/research-app/routes.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {installResearchInspector} from '../src/server/research-app/review-inspector.mjs';
import {installPinProjection} from '../src/server/r3-ui/pin-projection.mjs';
import {getResearchInspectorPanelsModule} from '../src/server/research-app/inspector-panels-source.mjs';
import {getProductAuthSheetBootstrap} from '../src/server/product-auth-sheet.mjs';
import {researchAuthSheetSource} from '../src/server/research-app/auth-sheet-source.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {build}=require('esbuild'),{JSDOM,VirtualConsole}=require('jsdom');
const paths=['bridge/contact-ui.mjs','bridge/business-directory.mjs','web/region-reference.mjs','web/address-contract.mjs','web/address-service.mjs','web/address-ui.mjs','src/engine/validation/email.mjs','src/engine/validation/phone.mjs','research/price-integrations.mjs'];
const contents=`export {mountResearchApplication} from '${researchAssetBase}research/application.mjs';\n`+paths.map((path,i)=>`import * as service${i} from '${researchAssetBase+path}';`).join('\n')+'\nexport const serviceModules={'+paths.map((path,i)=>JSON.stringify(path)+':service'+i).join(',')+'};';
const compiled=await build({stdin:{contents,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',globalName:'ResearchTest',target:'es2022',logLevel:'silent',plugins:[{
 name:'served-research-application',setup(builder){
  builder.onResolve({filter:/^\/ia\/research-assets\//},args=>({path:args.path.startsWith(researchAssetBase)?args.path.slice(researchAssetBase.length):args.path.slice('/ia/research-assets/'.length),namespace:'research'}));
  builder.onResolve({filter:/^\./,namespace:'research'},args=>({path:posix.normalize(posix.join(posix.dirname(args.importer),args.path)),namespace:'research'}));
  builder.onLoad({filter:/.*/,namespace:'research'},async args=>{const r=await serveResearchAsset(researchAssetBase+args.path);assert.equal(r.status,200,args.path);return {contents:await r.text(),loader:'js'};});
 }
}]});
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
const waitFor=async predicate=>{const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)assert.fail('Application state did not settle');await new Promise(resolve=>setTimeout(resolve,15));}};
async function setup(initial={screen:'onboarding',state:'guest-2'}){
 const html=await renderResearchApplication('a'.repeat(36),new URLSearchParams(initial)),failures=[];
 const vc=new VirtualConsole();vc.on('jsdomError',error=>{if(!/Could not parse CSS|Not implemented: navigation/.test(error.message))failures.push(error.message);});
 const dom=new JSDOM(html.replace(/<style>[\s\S]*?<\/style>/g,''),{url:'https://research.example/ia?view=research-r3',pretendToBeVisual:true,runScripts:'outside-only',virtualConsole:vc});
 const win=dom.window,doc=win.document;
 Object.defineProperty(win,'crypto',{value:webcrypto});win.TextEncoder=TextEncoder;win.TextDecoder=TextDecoder;win.Request=Request;win.Response=Response;win.Headers=Headers;
 win.structuredClone=value=>win.JSON.parse(win.JSON.stringify(value));win.CSS={escape:value=>String(value).replace(/["\\]/g,'\\$&')};
 win.matchMedia=()=>Object.assign(new win.EventTarget(),{matches:true,media:'(prefers-reduced-motion: reduce)'});
 win.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};win.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
 win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};win.HTMLElement.prototype.scrollTo=()=>{};win.Element.prototype.getAnimations=()=>[];
 win.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){},finish(){},currentTime:0,startTime:0});
 win.HTMLCanvasElement.prototype.getContext=()=>({font:'16px sans-serif',measureText:value=>({width:String(value).length*8,actualBoundingBoxLeft:0,actualBoundingBoxRight:String(value).length*8})});
 win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new win.Event('close'));};
 win.navigator.locks={request:async(name,_opts,callback)=>callback({name,mode:'exclusive'})};
 win.fetch=async input=>{const path=new URL(String(input),win.location.href).pathname;return path.startsWith('/ia/research-assets/')?serveResearchAsset(path.startsWith(researchAssetBase)?path:path.replace('/ia/research-assets/',researchAssetBase)):new Response('{}',{status:503});};
 for(const script of doc.querySelectorAll('script[nonce]:not([type])'))win.eval(script.src?await (await serveResearchAsset(new URL(script.src).pathname)).text():script.textContent);
 win.eval(compiled.outputFiles[0].text);
 const config=JSON.parse(doc.getElementById('order-app-config').textContent),environment=win.ORDER_CREATE_RESEARCH_ENV(config);
 environment.regular={loadModule:path=>Promise.resolve(win.ResearchTest.serviceModules[path]),crypto:webcrypto};
 environment.loadBusinessModule=path=>Promise.resolve(win.ResearchTest.serviceModules[path]);
 environment.priceWorkspace={loadModule:path=>Promise.resolve(win.ResearchTest.serviceModules[path.startsWith(researchAssetBase)?path.slice(researchAssetBase.length):path])};
 environment.loadScene=async route=>{const source=await researchScene(route.screen,route.state,route.variant);assert.ok(source,route.screen);const previous=win.ORDER_DESIGN_MODULES;win.ORDER_DESIGN_MODULES=[];try{win.eval(source.mount);return {modules:win.ORDER_DESIGN_MODULES.slice(),scene:{screen:source.row.screen,state:source.row.state,html:source.html,styles:[]}};}finally{win.ORDER_DESIGN_MODULES=previous;}};
 const app=await win.ResearchTest.mountResearchApplication(config,environment);await settle();
 return {win,doc,app,environment,failures,async close(){app.dispose();await settle();dom.window.close();}};
}

async function attachTestReview(f,{version='current',standalone=false}={}){
 const w=f.win,messages=[],parent={postMessage(message,targetOrigin){messages.push({message,targetOrigin});}};
 if(!standalone)Object.defineProperty(w,'parent',{value:parent,configurable:true});
 w.eval('var installPinProjection='+browserFunction(installPinProjection)+';');
 w.eval('var installResearchInspector='+browserFunction(installResearchInspector)+';');
 w.eval(getResearchInspectorPanelsModule().replace('export const installResearchReviewPanels =','var installResearchReviewPanels ='));
 const bridgeSource=readFileSync(new URL('../src/server/research-app/review-bridge.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function attachResearchReview','async function attachResearchReview');
 w.eval(bridgeSource+'\nwindow.attachResearchReview=attachResearchReview;');
 const route=f.app.snapshot().route,session={channel:'11111111-1111-4111-8111-111111111111',artifact:'a'.repeat(64),screen:route.screen,state:route.state,variant:route.variant,viewport:390,version,...route.mode==='detailed'?{mode:'detailed'}:{}};
 const bridge=await w.attachResearchReview(f.app,{inspection:session});
 await waitFor(()=>messages.some(entry=>entry.message.type==='ready'));
 const inspector=()=>f.doc.getElementById('order-single').__orderResearchInspector;
 const send=(type,payload,overrides={})=>{const current=inspector().inspect().session;w.dispatchEvent(new w.MessageEvent('message',{origin:overrides.origin??w.location.origin,source:overrides.source??parent,data:{scope:'ORDER_R3_HOST',channel:current.channel,artifact:current.artifact,type,payload,...overrides.data}}));};
 return {bridge,inspector,send,messages,parent,session};
}

test('review motion commands reach the actual admin loading owner and its normal/error navigation',async()=>{
 for(const [mode,state,selector] of [['complete','normal','.qa-widget-grid'],['offline','error','[data-qa-action="retry-overview"]']]){
  const f=await setup({screen:'admin-overview',state:'loading'});let review;
  try{
   const owner=f.doc.getElementById('order-app-page'),header=f.doc.getElementById('order-app-header');
   await waitFor(()=>owner.querySelector('[data-async-region="pending"]'));
   review=await attachTestReview(f);const received=[];owner.addEventListener('r3-motion-scenario',event=>received.push(event.detail.mode));
   for(const overrides of [{origin:'null'},{origin:'https://foreign.invalid'},{source:{}},{data:{scope:'foreign'}},{data:{channel:'foreign'}},{data:{artifact:'b'.repeat(64)}}])review.send('motionScenario',{mode},overrides);
   review.send('motionScenario',{mode:'unknown'});await settle();
   assert.deepEqual(received,[]);assert.equal(f.app.snapshot().route.state,'loading');
   review.send('motionScenario',{mode});await waitFor(()=>f.app.snapshot().route.state===state&&owner.querySelector(selector)&&new URL(f.win.location.href).searchParams.get('state')===state);
   assert.deepEqual(received,[mode]);assert.equal(new URL(f.win.location.href).searchParams.get('state'),state);
   assert.equal(f.doc.getElementById('order-app-page'),owner);assert.equal(f.doc.getElementById('order-app-header'),header);assert.deepEqual(f.failures,[]);
  }finally{review?.bridge.dispose();await f.close();}
 }
});

test('review wait responses use the active scene request and result replay uses the retained result owner',async()=>{
 const f=await setup({screen:'quote-wait',state:'entry'});let review;
 try{
  const owner=f.doc.getElementById('order-app-page'),root=f.doc.getElementById('order-single');await waitFor(()=>owner.dataset.waitRequest);
  const waitScene=owner.querySelector('[data-wait-scene]');assert.ok(waitScene);
  review=await attachTestReview(f);const responses=[];owner.addEventListener('order:quote-response',event=>responses.push({...event.detail}));
  const first=owner.dataset.waitRequest;review.send('motionScenario',{mode:'offline'});await waitFor(()=>owner.querySelector('[data-wait-scene]').dataset.phase==='offline');
  assert.equal(responses.at(-1).requestId,first);assert.equal(root.dataset.waitRequest,undefined);
  review.send('motionScenario',{mode:'replay'});await waitFor(()=>owner.dataset.waitRequest!==first&&owner.querySelector('[data-wait-scene]').dataset.phase==='entry');
  const second=owner.dataset.waitRequest;review.send('motionScenario',{mode:'complete',requestId:first});
  // The route changes before its async scene load finishes. Observe the actual
  // result controller mount before checking the old wait controller's teardown.
  await waitFor(()=>f.app.snapshot().route.screen==='quote-result'&&f.app.snapshot().pageRoute.screen==='quote-result'&&owner.querySelector('[data-review-result] .oq-plot'));
  assert.equal(responses.at(-1).requestId,second,'the optional bridge never forwards a caller-supplied stale request id');
  assert.equal(responses.at(-1).status,'success');assert.equal(waitScene.isConnected,false);assert.equal(owner.dataset.waitRequest,undefined);assert.equal(f.doc.getElementById('order-app-page'),owner);assert.deepEqual(f.failures,[]);
 }finally{review?.bridge.dispose();await f.close();}
 const result=await setup({screen:'quote-result',state:'equal'});let replay;
 try{
  const owner=result.doc.getElementById('order-app-page'),plot=owner.querySelector('.oq-plot');assert.ok(plot);
  replay=await attachTestReview(result);const events=[];owner.addEventListener('r3-result-state',event=>events.push({...event.detail}));
  replay.send('motionScenario',{mode:'replay'});await settle();
  assert.deepEqual(events,[{state:'equal',replay:true}]);assert.equal(owner.querySelector('.oq-plot'),plot);assert.equal(result.app.snapshot().route.state,'equal');assert.deepEqual(result.failures,[]);
 }finally{replay?.bridge.dispose();await result.close();}
});

test('review motion rejects hidden, recorded, standalone and pending-selection owners',async()=>{
 const f=await setup({screen:'admin-overview',state:'loading'});let review,release;
 try{
  review=await attachTestReview(f);const owner=f.doc.getElementById('order-app-page'),received=[];owner.addEventListener('r3-motion-scenario',event=>received.push(event.detail.mode));
  for(const [set,reset] of [[()=>owner.hidden=true,()=>owner.hidden=false],[()=>owner.inert=true,()=>owner.inert=false],[()=>owner.style.visibility='hidden',()=>owner.style.visibility=''],[()=>owner.setAttribute('aria-hidden','true'),()=>owner.removeAttribute('aria-hidden')]]){
   set();review.send('motionScenario',{mode:'complete'});await settle();reset();
  }
  assert.deepEqual(received,[]);assert.equal(f.app.snapshot().route.state,'loading');
  const inspect=f.app.inspectRoute.bind(f.app);let started=false;const hold=new Promise(resolve=>{release=resolve;});f.app.inspectRoute=async next=>{started=true;await hold;return inspect(next);};
  review.send('researchSelect',{channel:'22222222-2222-4222-8222-222222222222',artifact:'b'.repeat(64),screen:'admin-overview',state:'normal',variant:'email',viewport:390,version:'current',route:{screen:'admin-overview',state:'normal',variant:'email',mode:'simple',kind:'page'}});
  await waitFor(()=>started);review.send('motionScenario',{mode:'complete'});await settle();assert.deepEqual(received,[]);assert.equal(f.app.snapshot().route.state,'loading');
  release();await waitFor(()=>review.inspector().inspect().session.artifact==='b'.repeat(64));
  review.send('motionScenario',{mode:'complete'},{data:{channel:review.session.channel,artifact:review.session.artifact}});await settle();assert.deepEqual(received,[]);
  await f.app.navigate({screen:'admin-overview',state:'loading'});assert.equal(review.inspector().inspect().active,false);
  review.send('motionScenario',{mode:'complete'});await settle();assert.equal(f.app.snapshot().route.state,'loading');assert.deepEqual(received,[],'an app route awaiting host acknowledgement cannot accept a QA motion command');
 }finally{release?.();review?.bridge.dispose();await f.close();}
 const recorded=await setup({screen:'admin-overview',state:'loading'});let past;
 try{past=await attachTestReview(recorded,{version:'recorded'});past.send('motionScenario',{mode:'complete'});await settle();assert.equal(recorded.app.snapshot().route.state,'loading');}finally{past?.bridge.dispose();await recorded.close();}
 const standalone=await setup({screen:'admin-overview',state:'loading'});
 try{await assert.rejects(()=>attachTestReview(standalone,{standalone:true}),/INSPECTION_UNAVAILABLE/);assert.equal(standalone.app.snapshot().route.state,'loading');}finally{await standalone.close();}
});

test('standalone research application retains the common header, parent and session through intro/auth/quote routes',async()=>{
 const f=await setup();try{
  const header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg'),instance=f.app.instance;
  assert.equal(header.querySelectorAll('[data-order-brand-source="canonical"]').length,1);
  assert.ok(f.doc.querySelector('#order-app-page .ob'));
  await f.app.navigate({screen:'onboarding',state:'guest-3'});assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);
  const parent=f.doc.getElementById('order-app-page');await f.app.navigate({screen:'signup',state:'empty'});await settle();
  assert.ok(f.doc.querySelector('.product-auth-sheet .auth-sheet'));assert.equal(f.doc.getElementById('order-app-page'),parent);assert.ok(parent.querySelector('.ob'));
  await f.app.navigate({screen:'q1',mode:'detailed'});await settle();
  assert.ok(f.doc.querySelector('#order-app-quote #app'));assert.equal(f.doc.querySelectorAll('iframe').length,0);assert.equal(f.app.instance,instance);assert.equal(header.querySelector('svg'),brand);
  assert.equal(f.win.location.search.includes('view=research-r3'),true);assert.equal(f.doc.querySelectorAll('#order-single').length,1);assert.equal(f.doc.querySelectorAll('.order-product-brand').length,1);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('actual introduction and auth controls retain email focus through regular mounting and Escape resumes the same app',async()=>{
 const f=await setup();try{
  const header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg'),instance=f.app.instance;
  const click=selector=>{
   const element=f.doc.querySelector(selector);assert.ok(element,selector);assert.equal(element.disabled,false);
   for(let node=element;node;node=node.parentElement){assert.notEqual(node.inert,true,selector+' has an inert ancestor');assert.equal(node.hasAttribute('inert'),false);assert.notEqual(node.hidden,true);}
   element.focus();element.click();return element;
  };
  click('#order-app-page [data-mf-intro="3"]');await waitFor(()=>f.app.snapshot().route.state==='guest-3');
  const parent=f.doc.querySelector('#order-app-page .ob'),opener=click('#order-app-header [data-app-auth]');
  await waitFor(()=>f.doc.querySelector('.product-auth-sheet [name="email"]'));await settle();
  const email=f.doc.querySelector('.product-auth-sheet [name="email"]');
  assert.ok(f.win.OrderEmailUI.instance(email),'the original regular controller has mounted');
  assert.equal(f.doc.activeElement,email,'late contact mounting must retain the auth sheet focus');
  assert.equal(f.doc.querySelector('#order-app-page .ob'),parent);assert.equal(f.doc.querySelector('#order-app-page .auth-background'),null);
  f.doc.activeElement.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await waitFor(()=>!f.doc.querySelector('.product-auth-sheet')&&f.app.snapshot().route.screen==='onboarding');
  assert.equal(f.app.snapshot().route.state,'guest-3');assert.equal(f.doc.activeElement,opener);
  click('#order-app-page [data-mf-intro="4"]');await waitFor(()=>f.app.snapshot().route.state==='guest-4');
  click('#order-app-page [data-mf-go="simple-r3/"]');await waitFor(()=>f.app.snapshot().route.screen==='q1');
  await waitFor(()=>f.doc.querySelector('#order-app-quote #app'));
  assert.equal(f.app.snapshot().route.mode,'simple');assert.equal(f.app.instance,instance);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);
  assert.equal(f.doc.querySelectorAll('#order-single').length,1);assert.equal(f.doc.querySelectorAll('iframe').length,0);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('company sheet locks the retained header, removes its redundant title and restores the same controls when dismissed',async()=>{
 const f=await setup({screen:'onboarding',state:'company'});try{
  const header=f.doc.getElementById('order-app-header'),scene=f.doc.querySelector('.ob'),shade=scene.querySelector('.ob-shade');
  assert.equal(header.inert,true);assert.equal(shade.hidden,false);assert.equal(scene.querySelector('.ob-drawer h2'),null);
  shade.click();await settle();assert.equal(header.inert,false);assert.equal(shade.hidden,true);assert.equal(f.doc.querySelector('.ob'),scene);
  assert.equal(header.querySelector('[data-app-auth]').hidden,false);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('member account has one opener and notification preview opens a full reader with actual sent times and settings',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'onboarding',state:'member-1'});await settle();
  const header=f.doc.getElementById('order-app-header');assert.equal(header.querySelector('[data-app-auth]').hidden,true);
  header.querySelector('[data-order-account-trigger]').click();await settle();f.doc.querySelector('[data-obm-item=notifications]').click();
  await waitFor(()=>f.doc.querySelector('[data-action=research-all-notifications]'));
  const preview=f.doc.querySelector('.research-notifications');assert.ok(preview);assert.equal(preview.dataset.notificationsMode,'preview');
  const messages=await f.app.adapter.request('/notifications');assert.equal(preview.querySelectorAll('[data-notification-id]').length,Math.min(3,messages.items.length));
  assert.ok([...preview.querySelectorAll('time')].every(time=>time.dateTime));
  f.doc.querySelector('[data-action=research-all-notifications]').click();await waitFor(()=>f.app.snapshot().route.screen==='notifications');await settle();
  const full=f.doc.querySelector('#order-app-page .research-notifications');assert.equal(full.dataset.notificationsMode,'full');assert.equal(full.querySelector('h1').textContent,'알림');
  assert.ok(f.doc.querySelector('[data-notification-preferences]'));assert.equal(f.doc.getElementById('order-app-header'),header);
  const item=full.querySelector('[data-notification-id]');item.click();await waitFor(()=>full.querySelector('[data-notification-detail]'));
  assert.equal(full.querySelector('[data-notification-detail]').textContent.includes(messages.items.find(value=>value.id===item.dataset.notificationId).body),true);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('global Order menu preserves the actual quote mode confirmation and quote draft on cancellation',async()=>{
 const f=await setup();try{
  await f.app.navigate({screen:'q1',mode:'simple'});await settle();const quote=f.doc.querySelector('[data-research-quote]'),before=f.app.snapshot().quote;
  assert.equal(f.doc.querySelector('[data-app-back]').hidden,true);
  const trigger=f.doc.querySelector('.research-order-trigger');assert.equal(trigger.closest('.research-order-menu').hidden,false);trigger.click();await settle();
  f.doc.querySelector('.research-order-row').click();f.doc.querySelector('[data-order-mode=detailed]').click();await settle();
  const dialog=quote.querySelector('#quote-mode-dialog');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('[data-mode-option]').checked,false);
  dialog.querySelector('[data-mode-cancel]').click();await settle();assert.equal(f.app.snapshot().route.mode,'simple');assert.equal(f.doc.querySelector('[data-research-quote]'),quote);assert.deepEqual(f.app.snapshot().quote,before);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('guest notification entry opens login and dismissal returns to the unchanged parent without private reads',async()=>{
 const f=await setup({screen:'onboarding',state:'guest-3'});try{
  const parent=f.doc.querySelector('#order-app-page .ob'),before=f.app.adapter.fixture.inspect().calls.length;
  await f.app.navigate({screen:'notifications'});await settle();assert.equal(f.app.snapshot().route.screen,'login');assert.equal(f.app.snapshot().route.parent.state,'guest-3');
  assert.equal(f.doc.querySelector('#order-app-page .research-notifications'),null);assert.equal(f.doc.querySelector('#order-app-page .ob'),parent);
  assert.equal(f.app.adapter.fixture.inspect().calls.slice(before).some(call=>call.path==='/notifications'||call.path==='/notification-preferences'),false);
  f.doc.activeElement.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();
  assert.equal(f.app.snapshot().route.screen,'onboarding');assert.equal(f.app.snapshot().route.state,'guest-3');assert.equal(f.doc.querySelector('#order-app-page .ob'),parent);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('one Order-selector click closes the actual account stack and opens its own menu after that transition',async()=>{
 const f=await setup({screen:'onboarding',state:'member-1'});try{
  const header=f.doc.getElementById('order-app-header');header.querySelector('[data-order-account-trigger]').click();await settle();
  assert.equal(f.app.snapshot().route.kind,'account');assert.equal(f.doc.querySelector('.obm-panel').hidden,false);
  header.querySelector('.research-order-trigger').click();await waitFor(()=>!f.doc.querySelector('.research-order-stack').hidden);
  assert.equal(f.doc.querySelector('.obm-panel').hidden,true);assert.equal(f.app.snapshot().route.screen,'onboarding');assert.equal(header.querySelector('.research-order-trigger').getAttribute('aria-expanded'),'true');assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('leaving an open company sheet releases the shared account controller for quote and account navigation',async()=>{
 const f=await setup({screen:'onboarding',state:'member-1'});try{
  const header=f.doc.getElementById('order-app-header');f.doc.querySelector('[data-company-open]').click();assert.equal(header.inert,true);
  await f.app.navigate({screen:'q1',mode:'simple'});await settle();assert.equal(header.inert,false);assert.equal(f.doc.querySelector('.ob-shade'),null);
  header.querySelector('[data-order-account-trigger]').click();await settle();assert.equal(f.doc.querySelector('.obm-panel').hidden,false);assert.equal(f.app.snapshot().route.kind,'account');
  await f.app.navigate({screen:'onboarding',state:'member-1'});f.doc.querySelector('[data-company-open]').click();assert.equal(header.inert,true);
  const focused=[];f.doc.addEventListener('focusin',event=>focused.push({tag:event.target.tagName,id:event.target.id,class:event.target.className,text:event.target.textContent.slice(0,30)}));
  await f.app.navigate({screen:'profile',state:'menu'});await settle();assert.equal(header.inert,false,'company header restored');assert.equal(f.doc.querySelector('.ob-shade').hidden,true,'company shade closed');assert.equal(f.doc.querySelector('.obm-panel').hidden,false,JSON.stringify({focused,paused:header.querySelector('.brand').dataset.motionPaused,disabled:header.querySelector('[data-order-account-trigger]').disabled,route:f.app.snapshot().route,failures:f.failures}));assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('research auth source adapter rejects a missing or duplicated email validation seam',async()=>{
 const source=(await getProductAuthSheetBootstrap()).script,marker='input.validity.typeMismatch';
 assert.match(researchAuthSheetSource(source),/!w\.OrderEmail\.parse\(input\.value\)\.valid/);
 assert.throws(()=>researchAuthSheetSource(source.replace(marker,'false')),/RESEARCH_AUTH_EMAIL_SOURCE_CHANGED/);
 assert.throws(()=>researchAuthSheetSource(source+'\n'+marker),/RESEARCH_AUTH_EMAIL_SOURCE_CHANGED/);
});

test('auth sheets reuse the regular email parser and shared transient error without losing input or focus',async()=>{
 for(const [screen,state,action]of [['login','filled','submit-login'],['signup','filled','submit-signup'],['password','request','send-reset']]){
  const f=await setup({screen,state});try{
   let providerCalls=0;f.environment.auth={perform(){providerCalls++;throw Error('Invalid syntax reached the authentication provider');}};
   const input=f.doc.querySelector('[name=email]'),submit=f.doc.querySelector('[data-action="'+action+'"]');
   const editor=f.win.OrderEmailUI.instance(input),field=input.closest('.field'),display=field.querySelector('.inline-field-state');
   assert.ok(editor);assert.equal(input.type,'text');assert.equal(input.inputMode,'email');
   const type=(element,value)=>{element.focus();element.value=value;element.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));};
   type(input,'invalid-email.order.ooo');input.setSelectionRange(3,9,'backward');
   for(const password of f.doc.querySelectorAll('input[name*=password]'))type(password,'NativeOnly!2026');
   const before={value:input.value,placeholder:input.placeholder,type:input.type,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
   const fixture=f.app.adapter.fixture,beforeData=JSON.stringify(fixture.inspect().data);
   const mutations=()=>fixture.inspect().calls.filter(call=>!['GET','HEAD','OPTIONS'].includes(call.method)).length,beforeMutations=mutations();
   assert.equal(input.validity.typeMismatch,false,'a text editor cannot supply native email validation');
   assert.equal(f.win.OrderEmail.parse(input.value).valid,false);assert.equal(f.win.OrderEmail.parse('buyer@example.com').valid,true);
   submit.focus();submit.click();await settle();
   assert.equal(display.textContent,'이메일 양식을 확인해 주세요.');assert.equal(field.classList.contains('shows-message'),true);
   assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(f.doc.activeElement,input);
   assert.equal(submit.hasAttribute('aria-busy'),false,'syntax failure must remain in the authored field-error path');
   await waitFor(()=>!field.classList.contains('shows-message'));
   assert.equal(f.doc.querySelector('[name=email]'),input);assert.equal(f.win.OrderEmailUI.instance(input),editor);
   assert.equal(f.doc.activeElement,input);assert.equal(input.getAttribute('aria-invalid'),'true');
   assert.deepEqual({value:input.value,placeholder:input.placeholder,type:input.type,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection},before);
   for(const password of f.doc.querySelectorAll('input[name*=password]'))assert.equal(password.value,'NativeOnly!2026');
   assert.equal(field.querySelector('.research-field-error').textContent,'');assert.equal(providerCalls,0);
   assert.equal(JSON.stringify(fixture.inspect().data),beforeData);assert.equal(mutations(),beforeMutations);assert.deepEqual(f.failures,[]);
  }finally{await f.close();}
 }
});

test('introduction transitions retain exact source artwork and existing shell, pagination and header owners',async()=>{
 for(const prefix of ['guest','member']){
  const f=await setup({screen:'onboarding',state:prefix+'-3'});try{
   const source=await researchScene('onboarding',prefix+'-2','email'),template=f.doc.createElement('template');template.innerHTML=source.html;
   const original=template.content.querySelector('[data-intro-art]').getAttribute('src');assert.match(original,/^data:image\/webp;base64,/);
   const shell=f.doc.querySelector('.ob'),pagination=shell.querySelector('.ob-pages'),header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg');
   for(const step of [1,2,3,2]){
    f.doc.querySelector('[data-mf-intro="'+step+'"]').click();await waitFor(()=>f.app.snapshot().route.state===prefix+'-'+step);
    assert.equal(f.doc.querySelector('.ob'),shell);assert.equal(shell.querySelector('.ob-pages'),pagination);
    assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);
    const art=shell.querySelector('[data-intro-art]');
    if(step===3)assert.equal(art,null);else{assert.ok(art);assert.ok(art.getAttribute('src')===original,'the selected build artwork must remain byte-identical');assert.equal(art.width,287);assert.equal(art.height,226);}
   }
   assert.deepEqual(f.failures,[]);
  }finally{await f.close();}
 }
});

test('unavailable and stale introduction sources cannot retarget or replace the currently visible scene',async()=>{
 const f=await setup({screen:'onboarding',state:'guest-3'});try{
  const load=f.environment.loadScene,shell=f.doc.querySelector('.ob'),main=shell.querySelector('.ob-main'),url=f.win.location.href;
  f.environment.loadScene=async route=>{if(route.state==='guest-2')throw Error('SOURCE_UNAVAILABLE');return load(route);};
  assert.equal(await f.app.navigate({screen:'onboarding',state:'guest-2'}),false);
  assert.equal(f.app.snapshot().route.state,'guest-3');assert.equal(f.win.location.href,url);assert.equal(shell.querySelector('.ob-main'),main);
  assert.match(f.doc.getElementById('order-app-status').textContent,/불러오지 못/);
  let finish;
  f.environment.loadScene=route=>route.state==='guest-2'?new Promise(resolve=>{finish=()=>load(route).then(resolve);}):load(route);
  const pending=f.app.navigate({screen:'onboarding',state:'guest-2'});await waitFor(()=>finish);
  assert.equal(await f.app.navigate({screen:'onboarding',state:'guest-1'}),true);
  const newer=shell.querySelector('.ob-main'),art=newer.querySelector('[data-intro-art]').getAttribute('src');
  await finish();assert.equal(await pending,false);
  assert.equal(f.app.snapshot().route.state,'guest-1');assert.equal(f.doc.querySelector('.ob'),shell);
  assert.equal(shell.querySelector('.ob-main'),newer);assert.ok(newer.querySelector('[data-intro-art]').getAttribute('src')===art,'a stale source cannot replace the current artwork');
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('research assets and review target carry one immutable build and reject a different build URL',async()=>{
 const row=catalog.find(row=>row.id==='onboarding/guest-2/email'),artifact=await researchArtifact(row,390);
 assert.equal(artifact.application.url.includes('view=research-r3'),true);assert.equal(artifact.source.build,artifact.application.build);assert.match(artifact.editable,/<html/);
 const own=await serveResearchAsset(researchAssetBase+'research/application.mjs');assert.equal(own.status,200);assert.match(await own.text(),/mountResearchApplication/);
 const scene=await serveResearchAsset(researchAssetBase+'scene/'+row.id+'.mjs'),module=await scene.text(),runtime=module.match(/from "([^"]+)"/)[1];assert.equal((await serveResearchAsset(runtime)).status,200);assert.equal(runtime.split(artifact.application.build).length,2);
 assert.equal((await serveResearchAsset('/ia/research-assets/'+'f'.repeat(64)+'/research/application.mjs')).status,404);
});

test('the nested business date sheet keeps its own focusable branch active and restores the retained application background',async()=>{
 const f=await setup({screen:'business',state:'empty'});try{
  const header=f.doc.getElementById('order-app-header'),page=f.doc.querySelector('.business-page'),panel=f.doc.querySelector('.opening-wheels');
  const trigger=f.doc.querySelector('.opening-date>button'),year=panel.querySelector('[role="listbox"][aria-label="연도"]');
  assert.ok(page&&panel&&trigger&&year);
  header.inert=false;page.inert=false;
  const retained=f.doc.createElement('aside');retained.inert=true;f.doc.getElementById('order-single').append(retained);
  const checkOpen=()=>{
   trigger.click();assert.equal(panel.hidden,false);assert.equal(f.doc.activeElement,year);
   for(let element=year;element;element=element.parentElement)assert.notEqual(element.inert,true,'the active date sheet must not inherit an inert ancestor');
   assert.equal(page.inert,true);assert.equal(header.inert,true);assert.equal(retained.inert,true);
  };
  checkOpen();panel.querySelector('[data-action="opening-date-cancel"]').click();
  assert.equal(panel.hidden,true);assert.equal(f.doc.activeElement,trigger);
  assert.equal(header.inert,false);assert.equal(page.inert,false);assert.equal(retained.inert,true);
  checkOpen();await f.app.navigate({screen:'onboarding',state:'guest-2'});await settle();
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.inert,false);assert.equal(retained.inert,true);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('controlled quote responses follow the real retained wait controller and preserve retry request ownership',async()=>{
 const f=await setup({screen:'quote-wait',state:'entry'});try{
  const appRoot=f.doc.getElementById('order-single'),owner=f.doc.getElementById('order-app-page');
  const scene=owner.querySelector('[data-wait-scene]');assert.ok(scene);
  await waitFor(()=>owner.dataset.waitRequest);
  assert.equal(appRoot.dataset.waitRequest,undefined,'the application does not impersonate a scene request owner');
  const respond=(status,requestId)=>owner.dispatchEvent(new f.win.CustomEvent('order:quote-response',{detail:{status,requestId,canView:true}}));
  const first=owner.dataset.waitRequest;respond('offline',first);await waitFor(()=>scene.dataset.phase==='offline');
  scene.querySelector('[data-wait-retry]').click();await waitFor(()=>scene.dataset.phase==='entry');
  const second=owner.dataset.waitRequest;assert.notEqual(second,first);
  respond('success',first);await settle();assert.equal(f.app.snapshot().route.screen,'quote-wait');assert.equal(scene.dataset.phase,'entry');
  respond('success',second);await waitFor(()=>f.app.snapshot().route.screen==='quote-result');
  assert.equal(f.app.snapshot().route.state,'saving');assert.equal(f.doc.getElementById('order-app-page'),owner);
  assert.equal(owner.dataset.waitRequest,undefined,'leaving the wait page disposes its old request owner');
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('dashboard layout uses the original adapter revision and persists inside the research application without a QA host',async()=>{
 const f=await setup({screen:'admin-overview',state:'normal'});try{
  const owner=f.doc.getElementById('order-app-page'),grid=()=>owner.querySelector('.qa-widget-grid');
  const control=action=>owner.querySelector('[data-layout="'+action+'"]');
  await waitFor(()=>control('edit')&&!control('edit').disabled&&grid()?.children.length===3);
  const first=grid().firstElementChild.dataset.widgetId;
  control('edit').click();control('forward').click();control('size').click();
  const expected=[...grid().children].map(card=>({id:card.dataset.widgetId,wide:card.classList.contains('qa-widget-expanded')}));
  assert.equal(expected[1].id,first);assert.equal(expected.filter(item=>item.wide).length,1);
  control('save').click();await waitFor(()=>!control('edit').hidden);
  const state=f.app.adapter.fixture.inspect();
  assert.equal(state.calls.filter(call=>call.method==='POST'&&call.path==='/settings/dashboard-layout').length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.data.dashboardLayout)),{revision:1,data:{layout:expected}});
  const saved=JSON.parse(f.win.sessionStorage.getItem('order-research-session-v1:research:v1'));
  assert.deepEqual(saved.data.dashboardLayout,{revision:1,data:{layout:expected}});
  await f.app.navigate({screen:'admin-buyers',state:'list'});await f.app.navigate({screen:'admin-overview',state:'normal'});
  await waitFor(()=>control('edit')&&!control('edit').disabled);
  assert.deepEqual([...grid().children].map(card=>({id:card.dataset.widgetId,wide:card.classList.contains('qa-widget-expanded')})),expected);
  assert.equal(f.doc.getElementById('order-app-page'),owner);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('authored wait and result scenes use the same retained canonical application header',async()=>{
 const f=await setup();try{
  const header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg');
  for(const route of [{screen:'quote-wait',state:'entry'},{screen:'quote-result',state:'saving'},{screen:'onboarding',state:'member-2'}]){
   await f.app.inspectRoute(route);await settle();assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);assert.equal(f.doc.querySelectorAll('.brand').length,1,route.screen);assert.equal(f.doc.querySelectorAll('#order-single').length,1);
  }
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('the real consultation drawer opens on the retained result and closes without replacing its parent',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'quote-result',state:'saving'});await settle();
  const parent=f.doc.getElementById('order-app-page').firstElementChild,header=f.doc.getElementById('order-app-header');
  f.doc.querySelector('[data-action="consult"]').click();await waitFor(()=>f.doc.querySelector('[data-research-drawer] .functional-drawer'));await settle();
  assert.equal(f.app.snapshot().route.screen,'drawer');
  assert.ok(f.doc.querySelector('[data-research-drawer] .functional-drawer'));
  assert.equal(f.doc.getElementById('order-app-page').firstElementChild,parent);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(f.doc.querySelectorAll('.brand').length,1);
  await waitFor(()=>f.doc.querySelectorAll('[name="consult-pass"]').length===1);
  f.doc.querySelector('[data-research-drawer] [data-action="close-drawer"]').click();await waitFor(()=>!f.doc.querySelector('[data-research-drawer]'));await settle();
  assert.equal(f.doc.querySelector('[data-research-drawer]'),null);assert.equal(f.doc.getElementById('order-app-page').firstElementChild,parent);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('closed consultation owns selection and opener in the parent and retains the original form across Escape/reopen',async()=>{
 const f=await setup({screen:'passes',state:'loading'});try{
  const parent=f.doc.getElementById('order-app-page').firstElementChild,header=f.doc.getElementById('order-app-header'),adapter=f.app.adapter;
  await f.app.inspectRoute({screen:'drawer',state:'closed'});
  await waitFor(()=>f.doc.querySelector('[name="consult-pass"][data-id="qa-existing-quote"]'));await settle();
  const root=f.doc.querySelector('[data-research-consult-entry]'),sheet=root.querySelector('.functional-drawer');
  const choice=root.querySelector('[name="consult-pass"]'),opener=root.querySelector('[data-action="open-drawer"]');
  assert.equal(root.parentElement,f.doc.getElementById('order-app-page'));
  assert.equal(parent.isConnected,true);assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(f.app.adapter,adapter);
  assert.equal(opener.hidden,false);assert.equal(sheet.dataset.open,'false');assert.equal(root.querySelectorAll('[name="consult-pass"]').length,1);
  opener.click();await settle();assert.equal(sheet.dataset.open,'false');assert.match(root.querySelector('.consult-selection-message').textContent,/선택/);
  choice.click();opener.focus();opener.click();await waitFor(()=>sheet.dataset.open==='true');
  const memo=sheet.querySelector('.consult-memo textarea');memo.value='같은 상담 메모';memo.focus();
  memo.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await waitFor(()=>sheet.dataset.open==='false');await settle();
  assert.equal(f.doc.activeElement,opener);assert.equal(memo.isConnected,true);assert.equal(choice.checked,true);
  opener.click();await waitFor(()=>sheet.dataset.open==='true');
  assert.equal(root.querySelector('.consult-memo textarea'),memo);assert.equal(memo.value,'같은 상담 메모');
  assert.equal(adapter.fixture.inspect().source.commercial,false);
  assert.equal(adapter.fixture.inspect().calls.some(call=>call.method==='POST'),false,'opening a consultation cannot manufacture an issued quote or request');
  await f.app.navigate({screen:'onboarding',state:'member-4'});assert.equal(root.isConnected,false);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('the original consultation calendar keeps holiday rules and disposes its listeners before the same module mounts again',async()=>{
 const f=await setup({screen:'passes',state:'loading'});try{
  const OriginalDate=f.win.Date;
  f.win.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-12-15T05:00:00Z']));}static now(){return OriginalDate.parse('2026-12-15T05:00:00Z');}};
  const load=f.environment.loadScene;let cached,mounts=0,disposals=0;
  f.environment.loadScene=async route=>{
   if(route.screen!=='drawer')return load(route);
   if(!cached){cached=await load(route);const module=cached.modules.find(value=>value.id==='drawer'),mount=module.mount;
    module.mount=function(...args){mounts++;const dispose=mount.apply(this,args);return()=>{disposals++;dispose?.();};};
   }
   return cached;
  };
  const open=async()=>{
   await f.app.inspectRoute({screen:'drawer',state:'closed'});
   await waitFor(()=>f.doc.querySelector('[name="consult-pass"][data-id="qa-existing-quote"]'));
   const root=f.doc.querySelector('[data-research-consult-entry]');root.querySelector('[name="consult-pass"]').click();root.querySelector('[data-action="open-drawer"]').click();
   await waitFor(()=>root.querySelector('.functional-drawer').dataset.open==='true');
   const trigger=root.querySelector('[data-action="choose-consult-date"]'),dialog=root.querySelector('.consult-date-dialog');
   trigger.click();assert.equal(dialog.hidden,false);assert.equal(dialog.querySelectorAll('[data-day]').length,31);
   return {root,trigger,dialog,title:dialog.querySelector('h2'),next:dialog.querySelector('[data-action="next-month"]')};
  };
  const first=await open();assert.equal(first.title.textContent,'2026년 12월');
  for(const day of ['2026-12-25','2026-12-26','2026-12-14'])assert.equal(first.dialog.querySelector('[data-day="'+day+'"]').disabled,true,day);
  assert.equal(first.dialog.querySelector('[data-day="2026-12-17"]').disabled,false);
  first.next.click();assert.equal(first.title.textContent,'2027년 1월');
  first.dialog.querySelector('[data-action="previous-month"]').click();assert.equal(first.title.textContent,'2026년 12월');
  first.dialog.querySelector('[data-day="2026-12-17"]').click();
  assert.equal(first.dialog.hidden,true);assert.equal(first.trigger.querySelector('strong').textContent,'2026-12-17');assert.equal(f.doc.activeElement,first.trigger);
  const memo=first.root.querySelector('.consult-memo textarea'),submit=first.root.querySelector('[data-action="request-booking"]');
  memo.value='원본 상담 재시도 검사';first.root.querySelector('[name="topic"]').click();
  first.root.querySelector('[role="listbox"][aria-label="시"]').dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
  assert.equal(first.root.querySelector('[data-hour][aria-selected="true"]').textContent,'18시');assert.equal(first.root.querySelector('[data-minute="10"]').disabled,true);
  const writes=[],send=f.app.adapter.roleRequest;
  f.app.adapter.roleRequest=(path,body,signal)=>{if(body)writes.push(JSON.parse(JSON.stringify(body)));return send(path,body,signal);};
  f.app.adapter.fixture.configure({requests:{'role POST ':{scenario:'error',status:503}}});submit.click();
  await waitFor(()=>submit.dataset.asyncPhase==='error');assert.equal(memo.value,'원본 상담 재시도 검사');
  assert.equal(f.app.adapter.fixture.inspect().data.cases.some(item=>item.kind==='consult'),false);
  f.app.adapter.fixture.configure({requests:{'role POST ':{scenario:'loading'}}});submit.click();
  await waitFor(()=>submit.dataset.asyncPhase==='pending');assert.equal(memo.disabled,true);
  f.app.adapter.fixture.releasePending({scenario:'normal',requests:{}});await waitFor(()=>submit.dataset.requestSaved==='true');
  const creates=writes.filter(item=>item.action==='create');assert.equal(creates.length,2);assert.deepEqual(creates[0],creates[1]);
  assert.deepEqual(creates[1].context.targets,['qa-existing-quote']);assert.equal(creates[1].context.desiredDate,'2026-12-17');
  assert.match(creates[1].context.memo,/원본 상담 재시도 검사/);assert.match(creates[1].context.memo,/희망 시간: 18:00/);
  assert.equal(f.app.adapter.fixture.inspect().data.cases.find(item=>item.kind==='consult').state,'OPEN');
  assert.equal(f.app.adapter.fixture.inspect().source.commercial,false);
  await f.app.navigate({screen:'onboarding',state:'member-4'});assert.equal(first.root.isConnected,false);assert.equal(disposals,1);
  first.next.click();first.trigger.click();
  assert.equal(first.title.textContent,'2026년 12월');assert.equal(first.dialog.hidden,true,'disposed original listeners cannot reopen or mutate a detached calendar');
  const second=await open();assert.notEqual(second.root,first.root);assert.equal(mounts,2);
  second.next.click();assert.equal(second.title.textContent,'2027년 1월','reusing the loaded module must add only one date listener');
  await f.app.navigate({screen:'onboarding',state:'member-4'});assert.equal(disposals,2);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('quote result detail and QA state changes retain the original chart controller and DOM',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'quote-result',state:'saving'});await settle();
  const plot=f.doc.querySelector('.oq-plot');assert.ok(plot);
  f.doc.querySelector('.oq-series[data-kind="current"],.oq-series').click();await waitFor(()=>f.app.snapshot().route.state==='current-detail');
  assert.equal(f.doc.querySelector('.oq-plot'),plot);
  await f.app.inspectRoute({screen:'quote-result',state:'equal'});await settle();
  assert.equal(f.doc.querySelector('.oq-plot'),plot);assert.equal(f.doc.querySelector('[data-review-result]').dataset.view,'equal');
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('account routes keep their actual parent and open the original withdrawal workflow in the shared menu',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'onboarding',state:'member-4'});await settle();
  const parent=f.doc.querySelector('#order-app-page .ob'),brand=f.doc.querySelector('#order-app-header svg');
  await f.app.navigate({screen:'account-settings',state:'withdraw'});await waitFor(()=>f.doc.querySelector('.obm-panel [data-withdraw-form]'));await settle();
  assert.equal(f.doc.querySelector('#order-app-page .ob'),parent);
  assert.equal(f.doc.querySelector('#order-app-header svg'),brand);
  assert.ok(f.doc.querySelector('.obm-panel [data-withdraw-form]'));
  assert.equal(f.doc.querySelectorAll('#order-single').length,1);assert.equal(f.doc.querySelectorAll('.brand').length,1);
  const oldRevision=f.app.adapter.fixture.inspect().data.account.revision;
  f.doc.querySelector('[data-withdraw-start]').click();await settle();
  assert.equal(f.app.adapter.fixture.inspect().data.account.revision,oldRevision);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('the actual Gooey pass action opens real passes over its parent and direct passes remains a page',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'onboarding',state:'member-1'});await settle();
  const parent=f.doc.querySelector('#order-app-page .ob'),header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg'),instance=f.app.instance;
  const bell=parent.querySelector('[data-action="quick"]');assert.ok(bell);bell.click();
  assert.equal(bell.getAttribute('aria-expanded'),'true');
  const action=parent.querySelector('.pm-gooey-action[aria-label="오더 패스"]');assert.ok(action);action.click();
  const selector='[data-obm-page="manage.research.passes.grid"]';
  await waitFor(()=>f.doc.querySelector(selector+' .research-scene-panel')?.dataset.researchSceneConnection==='connected');await settle();
  const panel=f.doc.querySelector(selector);assert.equal(panel.querySelector('.obm-heading').textContent,'오더 패스');
  assert.equal(f.app.snapshot().route.screen,'passes');assert.equal(f.app.snapshot().route.kind,'account');
  assert.equal(f.app.snapshot().route.panel,'manage.research.passes.grid');assert.equal(f.app.snapshot().route.parent.screen,'onboarding');
  assert.equal(f.app.snapshot().route.parent.state,'member-1');assert.equal(f.doc.querySelector('#order-app-page .ob'),parent);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);assert.equal(f.app.instance,instance);
  assert.ok(panel.querySelector('.pass-stage [data-pass-id]'));assert.equal(panel.querySelector('[data-open-quote-draft]'),null);
  panel.querySelector('[data-view="deck"]').click();assert.equal(panel.querySelector('[data-view="deck"]').getAttribute('aria-pressed'),'true');
  const purchases=await f.app.adapter.request('/purchases'),roles=await f.app.adapter.roleRequest('/workspace');
  const passTotal=purchases.items.length+roles.quotes.filter(item=>!purchases.items.some(purchase=>purchase.quoteId===item.id)).length;
  assert.equal(passTotal,6,'the retained fixture owns five actual purchase records and one unpurchased quote');
  panel.querySelector('[data-action="deck-next"]').click();assert.equal(panel.querySelector('.deck-position').textContent,'2 / '+passTotal);
  const heading=panel.querySelector('.obm-heading');heading.focus();heading.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await waitFor(()=>f.app.snapshot().route.screen==='onboarding');assert.equal(f.app.snapshot().route.state,'member-1');
  assert.equal(f.doc.querySelector('#order-app-page .ob'),parent);assert.equal(f.doc.getElementById('order-app-header'),header);
  assert.equal(f.doc.querySelector(selector),null);
  await f.app.navigate({screen:'passes',state:'grid'});await settle();
  assert.equal(f.app.snapshot().route.kind,'page');assert.equal(f.app.snapshot().route.parent,null);assert.equal(f.app.snapshot().route.panel,null);
  assert.ok(f.doc.querySelector('#order-app-page .pass-stage'));assert.equal(f.doc.querySelector(selector),null);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);assert.equal(f.app.instance,instance);
  assert.equal(f.doc.querySelectorAll('#order-single').length,1);assert.equal(f.doc.querySelectorAll('.brand').length,1);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('authentication keeps the quote parent while internal signup and dismissal update the actual app route',async()=>{
 const f=await setup();try{
  await f.app.navigate({screen:'q1',mode:'detailed'});await settle();
  const parent=f.doc.querySelector('#order-app-quote #app');
  await f.app.navigate({screen:'login',state:'empty'});await settle();
  const overlay=f.doc.querySelector('[data-product-auth-sheet]'),dim=overlay.querySelector('.sheet-dim');
  const signup=[...overlay.querySelectorAll('button,a')].find(node=>node.textContent.trim()==='회원가입');assert.ok(signup);
  signup.click();await waitFor(()=>f.app.snapshot().route.screen==='signup');
  assert.equal(f.doc.querySelector('#order-app-quote #app'),parent);assert.equal(f.doc.querySelector('[data-product-auth-sheet] .sheet-dim'),dim);
  overlay.querySelector('input').focus();overlay.querySelector('input').dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  await waitFor(()=>!f.doc.querySelector('[data-product-auth-sheet]'));
  assert.equal(f.app.snapshot().route.screen,'q1');assert.equal(f.doc.querySelector('#order-app-quote #app'),parent);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('saved quote panel reads the real shared repository and opens the same app workspace',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'onboarding',state:'member-4'});await f.app.navigate({screen:'saved-quote',state:'list'});
  await waitFor(()=>f.doc.querySelectorAll('[data-open-quote-draft]').length===2);
  const instance=f.app.instance,header=f.doc.getElementById('order-app-header');
  assert.equal(f.doc.querySelector('[data-draft-source]').dataset.draftSource,'regular-stored-payload');
  f.doc.querySelector('[data-open-quote-draft="simple"]').click();await waitFor(()=>f.doc.querySelector('#order-app-quote #app'));
  assert.equal(f.app.snapshot().route.screen,'q1');assert.equal(f.app.snapshot().route.mode,'simple');assert.equal(f.app.instance,instance);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(f.doc.querySelectorAll('iframe').length,0);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('actual regular accordion controls update the app route without creating a new quote workspace',async()=>{
 const f=await setup();try{
  await f.app.navigate({screen:'q1',mode:'simple'});const parent=f.doc.querySelector('#order-app-quote #app');
  for(const [field,value] of [['housing','1'],['size','대란'],['pack','30']]){f.doc.querySelector(`[data-pick="${field}"][data-value="${value}"]`).click();await settle();}
  await waitFor(()=>f.app.snapshot().quote?.lines?.[0]?.pack==='30');
  f.doc.querySelector('.accordion-trigger[data-open="q2"]').click();await waitFor(()=>f.app.snapshot().route.screen==='q2');
  assert.equal(f.doc.querySelector('#order-app-quote #app'),parent);assert.equal(f.app.snapshot().quote.lines[0].pack,'30');assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('cancelled navigation preserves an unsaved business editor inside the actual app',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'store-settings',state:'add'});await waitFor(()=>f.doc.querySelector('[data-business-ref="business-name"]'));
  const name=f.doc.querySelector('[data-business-ref="business-name"]');name.value='입력 보존 검사';name.dispatchEvent(new f.win.Event('input',{bubbles:true}));
  const moving=f.app.navigate({screen:'passes',state:'grid'});await waitFor(()=>f.doc.querySelector('[data-action="research-business-cancel"]'));
  f.doc.querySelector('[data-action="research-business-cancel"]').click();await moving;
  assert.equal(f.doc.querySelector('[data-business-ref="business-name"]'),name);assert.equal(name.value,'입력 보존 검사');assert.equal(f.app.snapshot().route.screen,'store-settings');
  const approved=f.app.navigate({screen:'passes',state:'grid'});await waitFor(()=>f.doc.querySelector('[data-action="research-business-confirm"]'));
  f.doc.querySelector('[data-action="research-business-confirm"]').click();await approved;
  assert.equal(f.app.snapshot().route.screen,'passes');assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('QA empty and loading scenarios remain selectable without erasing the research session data',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'store-purchase',state:'select'});await settle();
  const offers=f.app.adapter.fixture.inspect().data.offers;
  await f.app.inspectRoute({screen:'store-purchase',state:'qa-empty'});await settle();
  assert.equal(f.app.adapter.fixture.inspect().data.offers.length,0);
  await f.app.inspectRoute({screen:'store-purchase',state:'qa-loading'});await settle();
  assert.equal(f.app.adapter.fixture.inspect().controls.scenario,'loading');
  await f.app.inspectRoute({screen:'store-purchase',state:'select'});await settle();
  assert.equal(f.app.adapter.fixture.inspect().controls.scenario,'normal');
  assert.deepEqual(f.app.adapter.fixture.inspect().data.offers,offers);
  assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('receipt inspection configures the real operator workflow after a buyer scene',async()=>{
 const f=await setup();try{
  await f.app.inspectRoute({screen:'store-purchase',state:'select'});await settle();
  assert.equal(f.app.adapter.fixture.inspect().controls.persona,'buyer');
  const header=f.doc.getElementById('order-app-header');
  await f.app.inspectRoute({screen:'receipt',state:'default'});await settle();
  const state=f.app.adapter.fixture.inspect();
  assert.equal(state.controls.persona,'operator');assert.equal(state.controls.authenticated,true);
  assert.ok(state.calls.some(call=>call.path==='/receipt-options'&&call.status===200));
  assert.equal(state.calls.some(call=>call.path==='/receipt-options'&&call.status===403),false);
  assert.equal(f.doc.querySelector('button[data-label="영수증 발급"]').disabled,false);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('every current page group composes under one retained application header',async()=>{
 const f=await setup(),rows=[...new Map(catalog.filter(row=>isResearchRow(row)&&researchRoute(row).kind==='page').map(row=>[row.screen,row])).values()];
 try{
  const header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg');
  for(const row of rows){
   try{await f.app.inspectRoute({screen:row.screen,state:row.state,variant:row.variant});await settle();}catch(error){throw new Error(row.id+': '+error.message,{cause:error});}
   assert.equal(f.doc.getElementById('order-app-header'),header,row.id);
   assert.equal(header.querySelector('svg'),brand,row.id);
   assert.equal(f.doc.querySelectorAll('#order-single').length,1,row.id);
   assert.equal(f.doc.querySelectorAll('.brand').length,1,row.id);
  }
  assert.deepEqual(f.failures,[]);assert.ok(rows.length>35);
 }finally{await f.close();}
});

test('every MVP product family has a route in the same app, including campaign and pricing state owners',async()=>{
 const rows=await listResearchRows(),families=new Set(rows.map(row=>row.screen));
 for(const screen of mvpScreens)if(!['common','component-library'].includes(screen))assert.ok(families.has(screen),'Missing MVP product family: '+screen);
 assert.deepEqual(rows.filter(row=>row.screen==='admin-campaigns').map(row=>row.state).sort(),['approved','denied','more','normal','reviewing']);
 assert.deepEqual(rows.filter(row=>row.screen==='price-workspace').map(row=>row.state).sort(),['classification','consumer-products','costs','delivery','empty','error','guest','loading','store-products']);
 assert.equal(researchRoute({screen:'admin-campaigns'}).state,'normal');
 assert.equal(researchRoute({screen:'pricing-r3'}).kind,'pricing');
 assert.equal(researchRoute({screen:'pricing-r3'}).state,'costs');
 assert.equal(rows.filter(row=>['common','component-library'].includes(row.screen)).length,0);
 assert.equal(rows.filter(row=>row.phase==='future'&&row.screen!=='admin-campaigns').length,0);
});

test('the original price editor retains its draft, menu and common header through auth and campaign routes',async()=>{
 const f=await setup({screen:'price-workspace',state:'costs'});try{
  await waitFor(()=>f.app.priceWorkspace?.workspace?.read());
  const price=f.app.priceWorkspace,owner=f.doc.getElementById('price-workspace-app'),header=f.doc.getElementById('order-app-header'),brand=header.querySelector('svg'),transport=price.transport;
  const raw=owner.querySelector('[data-cost="raw"]');assert.ok(raw);raw.focus();raw.value='6132';raw.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'6132'}));
  assert.equal(price.snapshot().model.dirty,true);
  owner.querySelector('[data-section="products"]').click();await waitFor(()=>f.app.snapshot().route.state==='store-products');
  owner.querySelector('[data-product-audience="consumer"]').click();await waitFor(()=>f.app.snapshot().route.state==='consumer-products');
  const document=JSON.stringify(price.workspace.read());
  await f.app.navigate({screen:'signup',state:'empty'});await settle();
  assert.equal(f.doc.getElementById('order-app-pricing').inert,true);assert.equal(f.doc.getElementById('price-workspace-app'),owner);
  f.doc.querySelector('.product-auth-sheet [name="email"]').dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await waitFor(()=>f.app.snapshot().route.kind==='pricing');assert.equal(f.app.snapshot().route.state,'consumer-products');
  await f.app.navigate({screen:'admin-campaigns'});assert.equal(f.app.snapshot().route.state,'normal');assert.equal(f.doc.getElementById('order-app-pricing').hidden,true);
  const more=f.doc.querySelector('#order-app-page [data-action="more"]');assert.ok(more);more.click();await waitFor(()=>f.app.snapshot().route.state==='more');
  await f.app.navigate({screen:'pricing-r3'});
  assert.equal(f.app.snapshot().route.state,'consumer-products');assert.equal(f.app.priceWorkspace,price);assert.equal(price.transport,transport);
  assert.equal(f.doc.getElementById('price-workspace-app'),owner);assert.equal(JSON.stringify(price.workspace.read()),document);
  assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(header.querySelector('svg'),brand);assert.equal(f.doc.querySelectorAll('#order-app-header').length,1);
  assert.equal(f.doc.querySelectorAll('#order-single').length,1);assert.equal(f.doc.querySelectorAll('iframe').length,0);
  assert.equal(await f.app.inspectRoute({screen:'price-workspace',state:'empty'}),false,'a QA reset must not discard the original unsaved draft');
  assert.equal(f.app.snapshot().route.state,'consumer-products');assert.equal(JSON.stringify(price.workspace.read()),document);assert.equal(price.snapshot().model.dirty,true);
  assert.equal(await f.app.inspectRoute({screen:'admin-campaigns',state:'normal'}),false,'a QA family selection must preserve the active unsaved price draft');
  assert.equal(f.app.snapshot().route.screen,'price-workspace');assert.equal(f.app.snapshot().route.state,'consumer-products');
  assert.equal(f.doc.getElementById('order-app-pricing').hidden,false);assert.equal(f.doc.getElementById('price-workspace-app'),owner);assert.equal(JSON.stringify(price.workspace.read()),document);
  assert.match(f.doc.getElementById('order-app-status').textContent,/미저장 변경/);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('price loading is a live app owner and QA completion reaches its canonical transport without blocking inspection',async()=>{
 const f=await setup({screen:'price-workspace',state:'loading'});let review;
 try{
  const price=f.app.priceWorkspace,owner=f.doc.getElementById('order-app-pricing'),header=f.doc.getElementById('order-app-header');
  assert.equal(price.workspace.read(),null);assert.ok(price.snapshot().pendingRequests>0);
  review=await attachTestReview(f);review.send('motionScenario',{mode:'complete'});
  await waitFor(()=>price.workspace.read()&&price.snapshot().pendingRequests===0);
  assert.equal(price.transport.inspect().mode,'qa-memory');assert.equal(f.app.priceWorkspace,price);assert.equal(f.doc.getElementById('order-app-pricing'),owner);assert.equal(f.doc.getElementById('order-app-header'),header);
  assert.equal(f.doc.querySelectorAll('#price-workspace-app').length,1);assert.deepEqual(f.failures,[]);
 }finally{review?.bridge.dispose();await f.close();}
});

test('a failed price module leaves the active page intact and a new request can mount the canonical editor',async()=>{
 const f=await setup();try{
  const before=f.app.snapshot().route,parent=f.doc.getElementById('order-app-page').firstElementChild,header=f.doc.getElementById('order-app-header'),load=f.environment.priceWorkspace.loadModule;
  f.environment.priceWorkspace.loadModule=async()=>{throw Error('CONTROLLED_ASSET_UNAVAILABLE');};
  assert.equal(await f.app.navigate({screen:'price-workspace'}),false);
  assert.deepEqual(f.app.snapshot().route,before);assert.deepEqual(f.app.snapshot().pageRoute,before);
  assert.equal(f.app.priceWorkspace,null);assert.equal(f.doc.getElementById('order-app-page').firstElementChild,parent);
  assert.equal(f.doc.getElementById('order-app-page').hidden,false);assert.equal(f.doc.getElementById('order-app-pricing').hidden,true);
  assert.equal(f.doc.querySelector('#price-workspace-app'),null);assert.match(f.doc.getElementById('order-app-status').textContent,/단가표를 불러오지 못했어요/);
  f.environment.priceWorkspace.loadModule=load;
  assert.equal(await f.app.navigate({screen:'price-workspace'}),true);await waitFor(()=>f.app.priceWorkspace.workspace.read());
  assert.equal(f.app.snapshot().route.kind,'pricing');assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(f.doc.querySelectorAll('#price-workspace-app').length,1);assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('QA cannot hide a live price editor dialog by selecting another product family',async()=>{
 const f=await setup({screen:'price-workspace',state:'costs'});try{
  await waitFor(()=>f.app.priceWorkspace.workspace.read());
  const control=f.app.priceWorkspace,document=JSON.stringify(control.workspace.read()),route=f.app.snapshot().route;
  f.doc.querySelector('#price-workspace-app [data-action="add-range"]').click();await settle();
  const modal=f.doc.querySelector('#pw-workspace-dialog');assert.ok(modal?.open);assert.ok(control.modal.activeIds.length);
  assert.equal(await f.app.inspectRoute({screen:'admin-campaigns',state:'normal'}),false);
  assert.deepEqual(f.app.snapshot().route,route);assert.equal(f.doc.getElementById('order-app-pricing').hidden,false);assert.equal(modal.open,true);
  assert.equal(JSON.stringify(control.workspace.read()),document);assert.match(f.doc.getElementById('order-app-status').textContent,/편집 창이나 저장 작업/);
  control.modal.close(modal,{immediate:true});await settle();
  assert.equal(await f.app.navigate({screen:'admin-campaigns'}),true);assert.equal(f.app.snapshot().route.screen,'admin-campaigns');assert.deepEqual(f.failures,[]);
 }finally{await f.close();}
});

test('a closed Order menu preserves a live email pin across blur, outside pointerdown and location restore',async()=>{
 const f=await setup({screen:'login',state:'empty',variant:'email'});let review;
 try{
  const input=f.doc.querySelector('.product-auth-sheet input[name=email]'),menu=f.doc.getElementById('research-order-menu');
  assert.ok(input);assert.equal(menu.hidden,true);
  // JSDOM has no layout. Only the input hit/rect uses a fixed fixture; the
  // served product, focus handlers, point capture and inspector index are real.
  const rect=new f.win.DOMRect(f.win.innerWidth/2-100,f.win.innerHeight/2-30,200,60);
  input.getBoundingClientRect=()=>rect;input.getClientRects=()=>[rect];f.doc.elementFromPoint=()=>input;
  input.focus();review=await attachTestReview(f);
  const veil=f.doc.getElementById('r3-veil'),paint=()=>new Promise(resolve=>f.win.requestAnimationFrame(()=>f.win.requestAnimationFrame(resolve)));
  const capture=()=>{review.send('mode',true);veil.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));const point=review.messages.filter(x=>x.message.type==='point').at(-1)?.message.payload;assert.ok(point);review.send('mode',false);return point;};
  const anchor=capture(),original=JSON.stringify(anchor),text=menu.querySelector('h2').firstChild;
  assert.notEqual(anchor.id,'screen');assert.equal(input.closest('.field').classList.contains('is-focused'),false);
  review.send('pins',[{id:'current-email',anchor,ordinal:1}]);await paint();
  assert.equal(f.doc.querySelectorAll('#r3-pins .r3-pin').length,1);
  // The native Chrome receipt showed this outside pointerdown unnecessarily
  // rewriting the hidden menu's h2, reindexing the blurred email's ancestors.
  f.doc.body.dispatchEvent(new f.win.MouseEvent('pointerdown',{bubbles:true,button:0}));await paint();
  assert.equal(f.doc.querySelectorAll('#r3-pins .r3-pin').length,1,'an outside pointer must retain the current email marker');
  assert.equal(menu.querySelector('h2').firstChild,text,'closing an already closed selector preserves its title node');
  assert.equal(menu.hidden,true);assert.equal(f.doc.querySelector('#order-single input[name=email]'),input);
  assert.equal(capture().id,anchor.id,'the same element keeps its captured identity after an unrelated pointerdown');await paint();
  review.send('restore',anchor);await waitFor(()=>f.doc.activeElement===input);await paint();
  assert.equal(f.doc.querySelectorAll('#r3-pins .r3-pin').length,1);
  assert.deepEqual([...review.messages.filter(x=>x.message.type==='missing').at(-1).message.payload.ids],[]);
  assert.equal(JSON.stringify(anchor),original);assert.deepEqual(f.failures,[]);
 }finally{review?.bridge.dispose();await f.close();}
});
