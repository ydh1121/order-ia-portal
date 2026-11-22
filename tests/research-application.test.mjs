import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import {webcrypto} from 'node:crypto';
import {renderResearchApplication,researchScene,serveResearchAsset,researchAssetBase,researchArtifact} from '../src/server/research-app/page.mjs';
import {catalog} from '../src/server/product-ui/catalog.gen.mjs';
import {researchRoute} from '../src/server/research-app/routes.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {build}=require('esbuild'),{JSDOM,VirtualConsole}=require('jsdom');
const paths=['bridge/contact-ui.mjs','bridge/business-directory.mjs','web/region-reference.mjs','web/address-contract.mjs','web/address-service.mjs','web/address-ui.mjs','src/engine/validation/email.mjs','src/engine/validation/phone.mjs'];
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
 environment.loadScene=async route=>{const source=await researchScene(route.screen,route.state,route.variant);assert.ok(source,route.screen);const previous=win.ORDER_DESIGN_MODULES;win.ORDER_DESIGN_MODULES=[];try{win.eval(source.mount);return {modules:win.ORDER_DESIGN_MODULES.slice(),scene:{screen:source.row.screen,state:source.row.state,html:source.html,styles:[]}};}finally{win.ORDER_DESIGN_MODULES=previous;}};
 const app=await win.ResearchTest.mountResearchApplication(config,environment);await settle();
 return {win,doc,app,failures,async close(){app.dispose();await settle();dom.window.close();}};
}

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

test('research assets and review target carry one immutable build and reject a different build URL',async()=>{
 const row=catalog.find(row=>row.id==='onboarding/guest-2/email'),artifact=await researchArtifact(row,390);
 assert.equal(artifact.application.url.includes('view=research-r3'),true);assert.equal(artifact.source.build,artifact.application.build);assert.match(artifact.editable,/<html/);
 const own=await serveResearchAsset(researchAssetBase+'research/application.mjs');assert.equal(own.status,200);assert.match(await own.text(),/mountResearchApplication/);
 const scene=await serveResearchAsset(researchAssetBase+'scene/'+row.id+'.mjs'),module=await scene.text(),runtime=module.match(/from "([^"]+)"/)[1];assert.equal((await serveResearchAsset(runtime)).status,200);assert.equal(runtime.split(artifact.application.build).length,2);
 assert.equal((await serveResearchAsset('/ia/research-assets/'+'f'.repeat(64)+'/research/application.mjs')).status,404);
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
  panel.querySelector('[data-action="deck-next"]').click();assert.equal(panel.querySelector('.deck-position').textContent,'2 / 4');
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

test('every current page group composes under one retained application header',async()=>{
 const f=await setup(),rows=[...new Map(catalog.filter(row=>row.phase!=='future'&&!['component-library','price-workspace','common'].includes(row.screen)&&researchRoute(row).kind==='page').map(row=>[row.screen,row])).values()];
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
