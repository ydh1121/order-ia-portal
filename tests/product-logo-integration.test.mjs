import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {renderProductApplication,injectProductContext} from '../src/server/product-app-page.mjs';
import {renderR3ProductPage,r3ProductAsset} from '../src/server/r3-product-page.mjs';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import * as beforeLogo from '../src/server/r3-ui/logo-correction-history.gen.mjs';

const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom'),{build}=require('esbuild');
const origin='https://order-ia-portal.pages.dev',nonce='6'.repeat(36),runId='1234567890abcdef1234567890abcdef';
const clone=value=>JSON.parse(JSON.stringify(value));
const context=authenticated=>({mode:'lab',runId,persona:authenticated?'buyer':'guest',documentId:'12345678-abcd-4abc-8def-1234567890ab',actor:{id:authenticated?'buyer':'guest',authenticated},endpoints:{product:'/test-product',role:'/test-role',price:'/test-price'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate,label){const deadline=performance.now()+5000;while(!predicate()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate(),label);}
let quoteBrandBundle;
async function servedQuoteBrand(){
 return quoteBrandBundle??=(async()=>{
  const bundled=await build({entryPoints:['/ia/r3-product/web/brand.mjs'],bundle:true,write:false,format:'iife',globalName:'OrderBrandUnderReview',platform:'browser',target:'es2022',keepNames:true,logLevel:'silent',plugins:[{name:'actual-pages-brand-modules',setup(api){
   api.onResolve({filter:/.*/},args=>{const url=new URL(args.path,args.importer?origin+args.importer:origin+'/');if(url.origin!==origin||!url.pathname.startsWith('/ia/r3-product/'))throw Error('Unexpected brand dependency '+url.href);return {path:url.pathname,namespace:'actual-pages-brand'};});
   api.onLoad({filter:/.*/,namespace:'actual-pages-brand'},async args=>{const response=r3ProductAsset(args.path);if(response.status!==200)throw Error('Missing served brand dependency '+args.path);return {contents:await response.text(),loader:'js'};});
  }}]});
  return bundled.outputFiles[0].text;
 })();
}

// Integration of the actual renderer, adapter, authored runtime and original
// CODE1. Transport responses below only permit rendering; they are not account,
// authentication or order persistence evidence. Physical geometry is Chrome's
// responsibility, so DOM layout and WAAPI timing are not asserted here.
async function document(t,{screen='onboarding',state='member-1',authenticated=true,reduced=true,previous=null,quote=false,urlQuery={}}={}){
 const ctx=context(authenticated),url=new URL('/ia',origin);for(const [key,value] of Object.entries({view:quote?'simple-r3':'product-r3',screen,state,labRun:runId,persona:ctx.persona,qaDocument:ctx.documentId,...urlQuery}))url.searchParams.set(key,value);
 const html=quote?injectProductContext(await renderR3ProductPage(nonce,'simple',ctx.actor.id),nonce,ctx):await renderProductApplication(nonce,ctx,screen,state);
 const errors=[],navigation=[],messages=[],motions=[],consumed=[],calls=[],console=new VirtualConsole();
 console.on('jsdomError',error=>{if(/^Not implemented: navigation/.test(error.message))navigation.push(error);else errors.push(error);});
 const dom=new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{url:url.href,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;
 if(quote){
  // JSDOM has no layout. Supply visibility for this connected header only so
  // the real factory's detached/hidden-stage guard can exercise its live path.
  // Dimensions here are not measurements or evidence of Figma alignment.
  const rects=w.HTMLElement.prototype.getClientRects;
  w.HTMLElement.prototype.getClientRects=function(){return this===w.document.querySelector('header .brand')&&this.isConnected&&w.getComputedStyle(this).display!=='none'?[new w.DOMRect(0,0,350,78)]:rects.call(this);};
 }
 w.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.animate=function(keyframes,timing){let resolve;const finished=new Promise(done=>{resolve=done;});const motion={target:this,keyframes,timing,finished,playState:'running',cancel(){this.playState='idle';resolve();},pause(){this.playState='paused';},play(){this.playState='running';},finish(){this.playState='finished';resolve();}};motions.push(motion);return motion;};
 Object.defineProperty(w,'parent',{value:{postMessage:(value,destination)=>messages.push({value:clone(value),destination})},configurable:true});
 if(previous)w.sessionStorage.setItem('order.brand.auth.v1.'+runId,JSON.stringify(previous));
 w.fetch=async(input,init={})=>{const path=new URL(String(input),origin).pathname;calls.push({path,method:init.method||'GET'});
  if(path==='/test-product/session')return Response.json({csrf:'render-only'});
  if(path==='/test-product/account')return Response.json({revision:0,state:'ACTIVE',profile:{name:'',phone:'',email:'',connections:[]},capabilities:{dashboard:false}});
  if(path==='/test-product/notifications')return Response.json({items:[]});
  return Response.json({error:'TEST_RENDER_TRANSPORT_UNAVAILABLE'},{status:503});};
 for(const script of w.document.querySelectorAll('script[nonce]')){
  if(script.src||script.type==='module')continue;
  w.eval(script.textContent);
  if(w.ORDER_BRAND_ACCOUNT_CONTEXT&&!w.ORDER_BRAND_ACCOUNT_CONTEXT.__observed){const source=w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival;w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival=function(){const value=source();consumed.push(value);return value;};w.ORDER_BRAND_ACCOUNT_CONTEXT.__observed=true;}
 }
 if(quote){
  // Bundle every relative import from the actual Pages asset handler. The
  // sealed factory closure, exports and original CODE1 body stay unmodified.
  w.eval(await servedQuoteBrand());assert.equal(typeof w.OrderBrandUnderReview.mountOrderBrand,'function');w.__quoteBrand=w.OrderBrandUnderReview.mountOrderBrand(w.document);
 }
 t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.__quoteBrand?.destroy();for(const motion of motions)motion.cancel();w.close();});
 await w.ORDER_APP_ADAPTER.ready;await tick();return {w,doc:w.document,errors,navigation,messages,motions,consumed,calls};
}

test('canonical introduction changes its main content in the same document and reports the exact current URL',async t=>{
 const f=await document(t),root=f.doc.getElementById('order-single'),header=root.querySelector('.ob-stage>header'),brand=header.querySelector('.brand'),mark=brand.querySelector('svg'),paths=[...mark.querySelectorAll('g>path')],menu=brand.__orderAccountMenu;
 const originalArt=root.querySelector('.ob-art').getAttribute('src');assert.match(originalArt,/^data:image\/webp;base64,/);
 assert.equal(paths.length,3);assert.ok(menu);let main=root.querySelector('.ob-main');
 for(const step of [2,3,4]){
  root.querySelector('[data-mf-intro="'+step+'"]').click();await until(()=>root.querySelector('.ob').dataset.introStep===String(step),'the actual navigation reaches step '+step);
  assert.notEqual(root.querySelector('.ob-main'),main);main=root.querySelector('.ob-main');assert.equal(root.querySelector('.ob-stage>header'),header);assert.equal(header.querySelector('.brand'),brand);assert.equal(brand.querySelector('svg'),mark);assert.deepEqual([...mark.querySelectorAll('g>path')],paths);assert.equal(brand.__orderAccountMenu,menu);
  if(step===2)assert.equal(main.querySelector('.ob-art')?.getAttribute('src'),originalArt,'the unchanged original art survives a same-document step change');
  const ready=f.messages.filter(row=>row.value.scope==='ORDER_PRODUCT_RUNTIME'&&row.value.type==='ready').at(-1);assert.equal(ready.value.state,'member-'+step);assert.equal(ready.destination,origin);assert.equal(new URL(ready.value.payload.path,origin).searchParams.get('state'),'member-'+step);assert.equal(new URL(ready.value.payload.path,origin).searchParams.get('labRun'),runId);
 }
 main.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(root.querySelector('.ob').dataset.introStep,'3');
 root.querySelector('[data-mf-intro="1"]').click();assert.equal(root.querySelector('.ob').dataset.introStep,'1');assert.equal(root.querySelector('.ob-art')?.getAttribute('src'),originalArt);assert.equal(root.querySelector('.ob-stage>header'),header);assert.deepEqual([...mark.querySelectorAll('g>path')],paths);assert.equal(brand.__orderAccountMenu,menu);assert.equal(f.navigation.length,0);assert.deepEqual(f.errors,[]);
 // An initial step 3/4 document has no image to copy. Its first return to an
 // illustrated step must use the verified original source supplied by product.
 for(const state of ['member-3','member-4']){
  const initial=await document(t,{state}),scope=initial.doc.getElementById('order-single'),initialHeader=scope.querySelector('.ob-stage>header');assert.equal(scope.querySelector('.ob-art'),null);
  if(state==='member-4')scope.querySelector('.ob-main').dispatchEvent(new initial.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  scope.querySelector('[data-mf-intro="1"]').click();assert.equal(scope.querySelector('.ob-art')?.getAttribute('src'),originalArt);assert.equal(scope.querySelector('.ob-stage>header'),initialHeader);assert.equal(initial.navigation.length,0);assert.deepEqual(initial.errors,[]);
 }
});

test('a product introduction ignores the historical member-arrival fixture and guest URLs cannot acquire an authenticated menu',async t=>{
 const member=await document(t,{reduced:false}),brand=member.doc.querySelector('.ob-stage>header .brand'),menu=brand.__orderAccountMenu;
 assert.equal(menu.inspect().arrivalCount,0);
 member.w.dispatchEvent(new member.w.MessageEvent('message',{source:member.w.parent,origin,data:{scope:'ORDER_R3_HOST',type:'memberArrival'}}));
 assert.equal(menu.inspect().arrivalCount,0,'recorded-frame control messages do not simulate a new product login');
 const guest=await document(t,{authenticated:false,state:'member-4',reduced:false,previous:{authenticated:true,at:Date.now()},urlQuery:{authenticated:'true',arrival:'1'}});
 const guestBrand=guest.doc.querySelector('.ob-stage>header .brand');assert.equal(guest.doc.querySelector('.ob').classList.contains('guest'),true);assert.equal(guestBrand.__orderAccountMenu.inspect().authenticated,false);assert.equal(guestBrand.__orderAccountMenu.open(),false);assert.equal(guestBrand.__orderAccountMenu.inspect().arrivalCount,0);assert.deepEqual(member.errors,[]);assert.deepEqual(guest.errors,[]);
});

test('every real product header consumer consumes the same one-time server-context arrival',async t=>{
 for(const options of [{screen:'onboarding',state:'member-1'},{screen:'profile',state:'default'},{screen:'login',state:'empty'},{screen:'store-purchase',state:'default'},{quote:true}]){
  const f=await document(t,{...options,reduced:false,previous:{authenticated:false,at:Date.now()}});
  assert.equal(f.consumed.filter(Boolean).length,1,JSON.stringify(options)+' must consume its pending transition once');
  const arrivals=f.motions.filter(motion=>motion.id==='order-brand-arrival');assert.equal(arrivals.length,1,JSON.stringify(options)+' mounts the one common arrival animation');
  assert.equal(f.w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false);assert.deepEqual(f.errors,[]);
 }
});

test('pre-correction artifacts retain valid source bytes and resolve their original comment hashes',async()=>{
 const digest=value=>createHash('sha256').update(value).digest('hex'),unzip=value=>gunzipSync(Buffer.from(value,'base64')).toString();
 for(const [id,row] of Object.entries(beforeLogo.archivedRows)){
  assert.equal(digest(unzip(beforeLogo.archivedBodies[row.body])),row.body,id+' body digest');
  if(row.script)assert.equal(digest(unzip(beforeLogo.archivedScripts[row.script])),row.script,id+' runtime digest');
 }
 for(const id of ['onboarding/member-1/email','profile/menu/email','login/empty/email'])for(const width of [390,1440]){
  const row=beforeLogo.archivedRows[id],hash=row.hashes[width],response=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:String(width),version:'recorded',artifactHash:hash})));assert.equal(response.status,200);
  const artifact=await response.json();assert.equal(artifact.hash,hash);assert.ok(artifact.html.includes(unzip(beforeLogo.archivedBodies[row.body])));assert.equal(artifact.mount,row.script?unzip(beforeLogo.archivedScripts[row.script]):null);
  const [screen,state,variant]=id.split('/');assert.equal(await isR3ReviewTarget({screen,state,variant,viewport:width,artifactHash:hash}),true);
 }
});
