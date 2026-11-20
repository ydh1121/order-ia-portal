import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {getQaApplicationDocument,getQaSupplemental} from '../src/server/r3-qa-assets.mjs';
import {renderProductApplication} from '../src/server/product-app-page.mjs';
import {bootProductLab,isProductLiveTarget,productLabPages,renderProductLab} from '../src/server/product-lab-page.mjs';
import {productBuild} from '../src/server/product-build.gen.mjs';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import * as brandHistory from '../src/server/r3-ui/brand-history.gen.mjs';
import * as supplementalHistory from '../src/server/r3-ui/supplemental-history.gen.mjs';
import {createProductUiLab} from './helpers/product-ui-lab.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev',nonce='1'.repeat(32);
const rowId='store-purchase/select/email',screen='component-library',state='asset-select';
const collection=await getQaSupplemental(),asset=collection.assets.find(asset=>asset.id==='select');
const source=collection.documents.get(rowId);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(value).digest('hex');
const unpack=value=>gunzipSync(Buffer.from(value,'base64')).toString();
async function until(predicate,label){for(let i=0;i<150;i++){if(predicate())return;await tick();}assert.ok(predicate(),label);}
function selection(name){
  const matches=asset.variants.filter(variant=>variant.uses.some(point=>point.id===rowId&&point.name===name));
  assert.equal(matches.length,1,'one collected variant for '+name);
  const variant=matches[0],point=variant.uses.find(point=>point.id===rowId&&point.name===name);
  return {variant,point};
}
function domFor(t,html,url=origin+'/ia?view=product-r3'){
  // This suite checks source selection and transport identity, not layout or
  // motion. Skip CSS evaluation while retaining the actual document markup.
  const dom=new JSDOM(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.HTMLElement.prototype.animate=function(){return {finished:Promise.resolve(),cancel(){},pause(){},play(){}};};
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
  return dom;
}
const selectedDocument=name=>getQaApplicationDocument(screen,state,'email',selection(name).variant.id);

test('collected product and order selects have distinct source-derived IDs, labels and exact locators',async t=>{
  const product=selection('offer-id'),order=selection('purchase-order');
  assert.notEqual(product.variant.id,order.variant.id);
  const original=domFor(t,source.body).window.document;
  const board=domFor(t,(await getQaApplicationDocument(screen,state)).body).window.document;
  for(const [item,label,index] of [[product,'상품',0],[order,'주문 선택',1]]){
    const {variant,point}=item;
    assert.match(variant.id,/^select-[a-f0-9]{12}$/);
    assert.equal(variant.id,asset.id+'-'+variant.signature.slice(0,12));
    assert.equal(variant.source,rowId);assert.equal(variant.index,index);
    assert.equal(point.index,index);assert.equal(point.selectorIndex,0);
    assert.equal(point.controlLabel,label);assert.equal(point.selector,`select[name="${point.name}"]`);
    const control=original.querySelectorAll(point.selector)[point.selectorIndex];
    assert.equal(control,original.querySelectorAll(asset.selector)[index]);
    assert.equal(original.getElementById(control.getAttribute('aria-labelledby')).textContent,label);
    const button=board.querySelector(`[data-component-variant="${variant.id}"]`);
    assert.ok(button);assert.ok(button.textContent.includes(label));
    assert.equal(button.dataset.sourceUsage,rowId);assert.equal(button.dataset.sourceLabel,label);
    assert.equal(button.dataset.sourceName,point.name);assert.equal(button.dataset.sourceSelector,point.selector);
    assert.equal(button.dataset.sourceIndex,'0');assert.equal(button.dataset.sourceCollectionIndex,String(index));
  }
});

test('each selected variant mounts the complete canonical purchase root once and highlights its own original control',async t=>{
  const lab=await createProductUiLab();t.after(()=>lab.close());
  const before={body:source.body,mount:source.mount,hashes:clone(source.hashes)};
  for(const name of ['offer-id','purchase-order']){
    const {variant,point}=selection(name),document=await selectedDocument(name);
    assert.equal(document.componentVariantId,variant.id);
    assert.deepEqual(document.componentSource,{rowId,selector:point.selector,index:0,label:point.controlLabel});
    assert.equal(document.row.state,state,'the business state is not rewritten into a variant ID');
    const originalBody=source.body.replace('id="order-single"','id="order-component-source" data-component-source');
    assert.ok(document.body.includes(originalBody),'retain the whole original root, fields, forms and loading state');
    assert.ok(document.mount.startsWith(source.mount+'\n'),'reuse the original purchase module before mounting library chrome');
    const dom=domFor(t,document.body),w=dom.window,adapter=lab.adapter('buyer'),calls=[];
    const priorReads=adapter.calls.length;
    w.ORDER_APP_CONTEXT={mode:'lab',actor:{authenticated:true}};w.ORDER_APP_ADAPTER=adapter;
    w.eval(document.mount);
    assert.deepEqual(clone(w.ORDER_LIBRARY_SOURCE),{screen:'store-purchase',state:'select',variant:'email',
      selector:point.selector,index:0,variantId:variant.id,source:digest(source.body)});
    const root=w.document.getElementById('order-single'),api={mode:'product',screen,variant:'email',adapter,
      reduced:()=>true,select(...args){calls.push(clone(args));},toast(){}};
    const disposeShared=w.QAUI.sharedMount(root,api);
    const dispose=w.ORDER_DESIGN_MODULES.find(module=>module.id===screen).mount(root,state,api);
    t.after(()=>{dispose?.();disposeShared?.();});
    await until(()=>root.querySelector('[data-component-source] [data-purchase-form]')?.inert===false,'the actual read transport resolves');
    const original=root.querySelector('[data-component-source]'),target=original.querySelector(point.selector);
    assert.equal(root.querySelectorAll('[data-component-source]').length,1);
    assert.deepEqual([...original.querySelectorAll('[data-component-target]')],[target]);
    assert.equal(target.name,name);assert.equal(original.dataset.appConnection,'connected');
    assert.ok(root.querySelector('[data-component-runtime]').textContent.includes('원본 화면과 런타임이 연결됐어요'));
    const reads=adapter.calls.slice(priorReads);
    assert.deepEqual(reads.map(call=>[call.path,call.body]),[['/purchases',undefined]],'outer chrome must not mount or fetch the nested purchase form twice');
    assert.equal(original.querySelector('[data-purchase-operations]').hidden,true,'empty real orders keep the original order section hidden');
    assert.equal(original.querySelector('select[name="purchase-order"]').options.length,0,'do not invent an order to make a library variant look successful');
    const active=root.querySelector(`[data-component-variant="${variant.id}"]`);
    assert.equal(active.getAttribute('aria-pressed'),'true');
    const other=selection(name==='offer-id'?'purchase-order':'offer-id').variant.id;
    root.querySelector(`[data-component-variant="${other}"]`).click();
    assert.deepEqual(calls,[[screen,state,{componentVariant:other}]],'variant selection stays in the library instead of opening a different business mode');
    dispose?.();disposeShared?.();w.close();
  }
  assert.equal(source.body,before.body);assert.equal(source.mount,before.mount);assert.deepEqual(source.hashes,before.hashes);
  const base=await getQaApplicationDocument(screen,state);
  assert.equal(base.componentVariantId,undefined,'selecting a variation must not mutate the cached default document');
});

async function signedPage(t){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  sqlite.exec(readFileSync(new URL('../migrations/0013_owner_session_revocations.sql',import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){const statement=sqlite.prepare(query);return {
    first:async()=>statement.get(...args)||null,run:async()=>({meta:statement.run(...args)})};}};}};
  const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'component-route@example.invalid',
    IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(24).toString('hex')),
    IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),ORDER_QA_DB:db};
  const cookie=(await issueSession(env)).cookie.split(';')[0];
  return params=>iaPage({request:new Request(origin+'/ia?'+new URLSearchParams({view:'product-r3',...params}),{headers:{Cookie:cookie}}),env});
}

test('document, renderer and signed Pages route reject unknown or different-asset variant IDs without a fallback',async t=>{
  const page=await signedPage(t),valid=selection('offer-id').variant.id;
  const wrongAsset=collection.assets.find(item=>item.id!==asset.id&&item.variants.length).variants[0].id;
  const context={mode:'product',actor:{id:'owner',authenticated:true},endpoints:{product:'/api/ia/product'}};
  for(const variantId of [asset.id+'-000000000000',wrongAsset,'<invalid>']){
    assert.equal(await getQaApplicationDocument(screen,state,'email',variantId),null);
    assert.equal(await renderProductApplication(nonce,context,screen,state,'email',variantId),null);
    const result=await page({screen,state,componentVariant:variantId});
    assert.equal(result.status,404);assert.match(result.headers.get('Content-Type'),/^text\/plain/);
  }
  assert.equal(await getQaApplicationDocument('store-purchase','select','email',valid),null);
  assert.equal(await renderProductApplication(nonce,context,'store-purchase','select','email',valid),null);
  assert.equal((await page({screen:'store-purchase',state:'select',componentVariant:valid})).status,404);
  const accepted=await page({screen,state,componentVariant:valid});assert.equal(accepted.status,200);
  const doc=domFor(t,await accepted.text()).window.document;
  assert.equal(doc.documentElement.dataset.productComponentVariant,valid);
  assert.equal(doc.querySelector('[data-component-source] select[name="offer-id"]').name,'offer-id');
});

// No business response is fabricated here. All document API reads fail closed;
// this test observes the actual browser bootstrap's identity/ready message only.
async function readyMessage(t,name,context){
  const variantId=selection(name).variant.id;
  const html=await renderProductApplication(nonce,context,screen,state,'email',variantId);
  const dom=domFor(t,html),w=dom.window,messages=[],requests=[];
  w.postMessage=(message,destination)=>messages.push({message:clone(message),destination});
  w.fetch=async(input,init={})=>{requests.push({path:String(input),method:init.method||'GET'});return Response.json({error:'ACCESS_DENIED'},{status:403});};
  for(const script of w.document.querySelectorAll('script[nonce]'))w.eval(script.textContent);
  await tick();await tick();
  assert.equal(w.document.documentElement.dataset.productComponentVariant,variantId);
  const ready=messages.find(item=>item.message.scope==='ORDER_PRODUCT_RUNTIME'&&item.message.type==='ready');
  assert.ok(ready);assert.equal(ready.destination,origin);
  assert.deepEqual(ready.message,{scope:'ORDER_PRODUCT_RUNTIME',type:'ready',runId:context.runId,persona:context.persona,
    documentId:context.documentId,screen,state,componentVariant:variantId,source:context.source});
  assert.equal(messages.some(item=>item.message.type==='operation'),false);
  assert.ok(requests.every(item=>item.method==='GET'),'rendering/selecting a component cannot submit a purchase');
  assert.equal(w.ORDER_APP_ADAPTER.context.mode,'lab');
  return ready.message;
}

test('real ready messages produce separate library comment states while preserving role, run and business mode',async t=>{
  const runId='9'.repeat(32),context={mode:'lab',runId,persona:'buyer',documentId:'12345678-abcd-4abc-8def-1234567890ab',
    actor:{id:'lab-buyer',authenticated:true},source:{applicationSourceDigest:productBuild.digest},
    endpoints:{product:`/api/ia/lab/runs/${runId}/as/buyer/product`}};
  const messages=[];for(const name of ['offer-id','purchase-order'])messages.push(await readyMessage(t,name,context));
  const host=domFor(t,renderProductLab(nonce),origin+'/ia?view=qa-lab&page=component-library&run='+runId),w=host.window,targets=[];
  const run={id:runId,state:'ACTIVE',label:'컴포넌트 식별 전송 검증',source:{applicationSourceDigest:productBuild.digest}};
  // Only host reads are stubbed; capture the real target passed to feedback.
  // No record creation or persisted success is claimed by this identity test.
  const reads={
    '/api/ia/auth/me':{csrf:'identity-test'},'/api/ia/lab/session':{source:run.source},
    '/api/ia/r3-qa/navigation':{revision:0,layout:{groups:[{id:'mvp',name:'1차 MVP'},{id:'future',name:'정식 - 향후 검토'}],assignments:{}}},
    '/api/ia/lab/runs':{runs:[run]}
  };
  w.fetch=async(path,init={})=>{assert.equal(init.method,'GET');assert.ok(Object.hasOwn(reads,String(path)),String(path));return Response.json(reads[String(path)]);};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.__pages=clone(productLabPages);w.__feedback=async options=>targets.push(clone(options.target));
  w.eval('('+bootProductLab.toString()+')(window.__pages,'+JSON.stringify(productBuild.digest)+',window.__feedback);');
  const frame=w.document.getElementById('product-frame');
  await until(()=>frame.src.includes('qaDocument='),'the host has opened an identified document');
  const documentId=new URL(frame.src).searchParams.get('qaDocument');
  const deliver=message=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:frame.contentWindow,data:{...message,documentId}}));
  for(const message of messages){
    deliver(message);w.document.getElementById('live-feedback').click();await tick();
    const expected={screen:'live-component-library',state:state+'--'+message.componentVariant,variant:'buyer',viewport:390,artifactHash:productBuild.digest};
    assert.deepEqual(targets.at(-1),expected);assert.equal(isProductLiveTarget(expected),true);
  }
  assert.notEqual(targets[0].state,targets[1].state);
  deliver({...messages[0],persona:'supplier'});w.document.getElementById('live-feedback').click();await tick();
  assert.deepEqual(targets.at(-1),targets[1],'another role cannot replace the active component comment identity');
  assert.equal(w.document.getElementById('live-persona').value,'buyer');
  assert.equal(new URL(frame.src).searchParams.get('persona'),'buyer');
});

test('selecting current component variants leaves exact historical replay bodies, mounts and hashes addressable',async()=>{
  for(const name of ['offer-id','purchase-order'])await selectedDocument(name);
  const cases=[
    {id:'component-library/asset-select/email',row:supplementalHistory.supplementalHistoryRows['component-library/asset-select/email'],bodies:supplementalHistory.supplementalHistoryBodies,scripts:supplementalHistory.supplementalHistoryScripts},
    {id:'profile/menu/email',row:brandHistory.archivedRows['profile/menu/email'],bodies:brandHistory.archivedBodies,scripts:brandHistory.archivedScripts,replay:unpack(brandHistory.replayFrameGzip)}
  ];
  for(const saved of cases){
    const originalBody=unpack(saved.bodies[saved.row.body]),originalMount=unpack(saved.scripts[saved.row.script]);
    assert.equal(digest(originalBody),saved.row.body);assert.equal(digest(originalMount),saved.row.script);
    const result=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({
      id:saved.id,width:'390',version:'recorded',artifactHash:saved.row.hashes[390]})));
    assert.equal(result.status,200);const replay=await result.json();
    assert.equal(replay.version,'prior-r3');assert.equal(replay.hash,saved.row.hashes[390]);
    assert.ok(replay.html.includes(originalBody));assert.equal(replay.mount,originalMount);
    if(saved.replay)assert.equal(replay.replayFrame,saved.replay);
  }
});
