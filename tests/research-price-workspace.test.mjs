import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {webcrypto,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {r3ProductAsset} from '../src/server/r3-product-page.mjs';
import {mountPriceWorkspace} from '../src/server/r3-price-workspace-client.mjs';
import {createPriceWorkspaceModel} from '../src/server/r3-price-workspace-model.mjs';
import {createPriceWorkbookReader} from '../src/server/r3-price-workspace-xlsx.mjs';
import {importPriceWorkbook} from '../src/server/r3-price-workspace-import.mjs';
import {mountPriceWorkspaceTree} from '../src/server/r3-price-workspace-tree.mjs';
import {createPriceWorkspaceQaTransport} from '../src/server/r3-price-workspace-qa.mjs';
import {defaultPriceRows} from '../src/server/r3-price-workspace-defaults.mjs';
import {getResearchPriceModuleSource,getResearchPriceWorkspaceFragment,canonicalPriceModalSource} from '../src/server/research-app/price-source-adapter.mjs';

const require=createRequire(join(resolve(process.env.R3_BUILD_TEST_TOOLS||'tests/build-tools'),'package.json'));
const {build}=require('esbuild'),{JSDOM,VirtualConsole}=require('jsdom');
const digest=value=>createHash('sha256').update(value).digest('hex');
const originals=['client','model','xlsx','import','tree','defaults','page','qa'].map(name=>'src/server/r3-price-workspace-'+name+'.mjs');
const originalHashes=originals.map(path=>[path,digest(readFileSync(path))]);
const source=await getResearchPriceModuleSource(),referenceBefore=JSON.stringify(defaultPriceRows);
const bundle=await build({stdin:{contents:"export {mountResearchPriceWorkspace} from './src/server/research-app/price-workspace.mjs';import * as integration from 'sealed-price';export {integration};",resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',globalName:'ResearchPriceTest',target:'es2022',logLevel:'silent',plugins:[{
  name:'actual-price-factories',setup(builder){
    builder.onResolve({filter:/^sealed-price$/},()=>({path:'price-integrations.mjs',namespace:'price'}));
    builder.onLoad({filter:/.*/,namespace:'price'},()=>({contents:source,loader:'js'}));
  }
}]});
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate());};
const plain=value=>JSON.parse(JSON.stringify(value));

function setup(){
  const console=new VirtualConsole(),errors=[];
  console.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error);});
  const dom=new JSDOM('<!doctype html><html><head></head><body><main id="order-single"><header id="order-app-header">Order.</header><section id="order-app-pricing"></section><div id="other-scene">Other</div></main></body></html>',{url:'https://research.example/ia?view=research-r3',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const window=dom.window,document=window.document,fetches=[],states=[],notices=[];
  Object.defineProperty(window,'crypto',{value:webcrypto});
  window.TextEncoder=TextEncoder;window.TextDecoder=TextDecoder;
  window.structuredClone=plain;
  window.CSS={escape:value=>String(value).replace(/["\\]/g,'\\$&')};
  window.matchMedia=()=>Object.assign(new window.EventTarget(),{matches:true,media:'(prefers-reduced-motion: reduce)'});
  window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  window.fetch=async(...args)=>{fetches.push(args);throw Error('UNEXPECTED_OPERATIONAL_FETCH');};
  window.scrollTo=()=>{};
  window.HTMLElement.prototype.scrollIntoView=()=>{};
  window.HTMLElement.prototype.scrollTo=()=>{};
  window.Element.prototype.getAnimations=()=>[];
  window.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){},finish(){}});
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  window.addEventListener('error',event=>{errors.push(event.error||event.message);event.preventDefault();});
  window.eval(bundle.outputFiles[0].text);
  const container=document.getElementById('order-app-pricing'),parentModal={parent:true};window.OrderModalShell=parentModal;
  const mount=(state='costs',options={},extra={})=>window.ResearchPriceTest.mountResearchPriceWorkspace(container,{assetBase:'/ia/research-assets/',state,environment:{priceWorkspace:{loadModule:async()=>window.ResearchPriceTest.integration,onNotice:message=>notices.push(message),...options}},onState:value=>states.push(plain(value)),...extra});
  return {dom,window,document,container,fetches,states,notices,errors,parentModal,mount,close(){dom.window.close();}};
}
function input(f,selector,value){
  const node=f.container.querySelector(selector);assert.ok(node,selector);node.value=value;node.dispatchEvent(new f.window.Event('input',{bubbles:true}));return node;
}
async function loaded(control){await control.ready;await control.workspace.ready;await settle();assert.equal(control.snapshot().ready,true);}

test('research source preserves every canonical price factory, fragment and modal block',async()=>{
  for(const fn of [mountPriceWorkspace,createPriceWorkspaceModel,createPriceWorkbookReader,importPriceWorkbook,mountPriceWorkspaceTree,createPriceWorkspaceQaTransport])assert.ok(source.includes(browserFunction(fn)),fn.name);
  const common=await r3ProductAsset('/ia/r3-product/web/common-ui.mjs').text();
  assert.ok(source.includes(canonicalPriceModalSource(common)));
  assert.throws(()=>canonicalPriceModalSource(common.replace('window.OrderModalShell=','window.OrderModalShell =')),/SOURCE_CHANGED/);
  assert.doesNotMatch(getResearchPriceWorkspaceFragment().body,/<header|<iframe|<script/);
  for(const [path,hash] of originalHashes)assert.equal(digest(readFileSync(path)),hash,path);
  assert.equal(JSON.stringify(defaultPriceRows),referenceBefore);
});

test('one original model retains edited costs, sale price and classification tab across ordinary views',async()=>{
  const f=setup();let control;
  try{
    control=f.mount();await loaded(control);
    const original=control.workspace,root=f.container.querySelector('#price-workspace-app');
    const raw=input(f,'[data-cost="raw"]','7777'),row=raw.dataset.rowId,grade=raw.dataset.gradeId;
    assert.equal(control.workspace.read().costs['1'].find(item=>item.id===row).prices[grade].raw,'7777');
    assert.equal(await control.select({state:'consumer-products'}),true);
    const sale=input(f,'[data-product-price]','12345'),productId=sale.dataset.productPrice;
    assert.equal(control.workspace.read().products.find(item=>item.id===productId).price,'12345');
    f.container.querySelector('[data-section="classification"]').click();await settle();
    f.container.querySelector('[data-class-tab="fees"]').click();
    const before=JSON.stringify(control.workspace.read());
    assert.equal(await control.select({state:'classification'}),true);
    assert.equal(f.container.querySelector('[data-class-tab="fees"]').getAttribute('aria-pressed'),'true');
    f.container.hidden=true;f.container.inert=true;f.document.getElementById('other-scene').textContent='auth / campaign';f.container.inert=false;f.container.hidden=false;
    assert.equal(await control.select({state:'classification'}),true);
    assert.equal(JSON.stringify(control.workspace.read()),before);
    assert.equal(control.workspace,original);assert.equal(f.container.querySelector('#price-workspace-app'),root);
    assert.equal(control.snapshot().model.dirty,true);
    assert.ok(f.states.some(value=>value.state==='classification'&&value.scenario===false));
    assert.equal(f.document.getElementById('order-single').priceWorkspaceQa.workspace,original);
    assert.equal(f.document.querySelectorAll('#order-app-header').length,1);
    assert.equal(f.document.querySelectorAll('iframe').length,0);
    assert.equal(f.fetches.length,0);assert.equal(f.errors.length,0);
  }finally{control?.dispose();f.close();}
});

test('dirty QA selection rejects immediately even while inert; clean explicit selection resets only the original memory transport',async()=>{
  const f=setup();let control;
  try{
    control=f.mount();await loaded(control);
    input(f,'[data-cost="raw"]','6543');
    const before=JSON.stringify(control.workspace.read()),transportBefore=JSON.stringify(control.transport.inspect());
    f.container.inert=true;
    assert.equal(await control.select({state:'error',scenario:true}),false);
    assert.equal(await control.setScenario('empty'),false);
    assert.equal(JSON.stringify(control.workspace.read()),before);
    assert.equal(JSON.stringify(control.transport.inspect()),transportBefore);
    assert.equal(control.snapshot().state,'costs');assert.deepEqual([...control.modal.activeIds],[]);
    f.container.inert=false;
    f.container.querySelector('[data-action="draft"]').click();
    await until(()=>control.snapshot().model.dirty===false);assert.equal(control.snapshot().model.revision,1);
    const instance=control.workspace;
    assert.equal(await control.select({state:'error',scenario:true}),true);await settle();
    assert.equal(control.snapshot().scenario,'error');assert.equal(control.snapshot().error,'SERVICE_UNAVAILABLE');
    assert.equal(await control.select({state:'loading',scenario:true}),true);await settle();
    assert.ok(control.snapshot().pendingRequests>0);
    assert.match(f.container.querySelector('#pw-main').textContent,/불러오는 중/);
    assert.equal(f.container.querySelector('#pw-main').inert,true);
    assert.equal(control.workspace.read(),null);
    assert.equal(await Promise.race([control.ready.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),30))]),true);
    assert.equal(await control.select({state:'empty',scenario:true}),true);await settle();
    assert.equal(control.transport.inspect().scenario,'empty');
    assert.equal(control.workspace.read().costs['1'][0].prices.king.raw,'');
    assert.notEqual(control.workspace,instance,'only a clean explicit scenario replaces the original factory owner');
    assert.equal(f.window.ResearchPriceTest.mountResearchPriceWorkspace(f.container),control,'the enclosing controller is retained');
    for(const [key,value] of Object.entries(control.snapshot().retiredLifecycle))assert.equal(value,key==='disposed'?true:0,key);
    assert.equal(f.fetches.length,0);assert.equal(f.errors.length,0);
  }finally{control?.dispose();f.close();}
});

test('the original editor modal is scoped, blocks destructive selection and releases its own lifetime',async()=>{
  const f=setup();let control;
  try{
    control=f.mount();await loaded(control);
    f.container.querySelector('[data-action="add-range"]').click();await settle();
    const dialog=f.container.querySelector('#pw-workspace-dialog');assert.ok(dialog?.open);
    assert.deepEqual([...control.modal.activeIds],['pw-workspace-dialog']);
    assert.equal(f.window.OrderModalShell,f.parentModal);
    assert.equal(control.canLeave(),false);
    const before=JSON.stringify(control.workspace.read());
    assert.equal(await control.select({state:'empty',scenario:true}),false);
    assert.equal(JSON.stringify(control.workspace.read()),before);
    control.dispose();
    assert.equal(f.document.getElementById('order-single').priceWorkspaceQa,undefined);
    assert.equal(f.window.OrderModalShell,f.parentModal);
    assert.equal(f.container.childElementCount,0);
    for(const [key,value] of Object.entries(control.snapshot().lifecycle))assert.equal(value,key==='disposed'?true:0,key);
    assert.equal(f.errors.length,0);
  }finally{control?.dispose();f.close();}
});

test('ordinary revisit retries a failed first read through the same provider without resetting saved prices',async()=>{
  const f=setup();let control,raw,failed=false,resets=0;
  try{
    control=f.mount('costs',{async createTransport({model,reference,scenario}){
      raw=createPriceWorkspaceQaTransport(model,reference,{scenario});
      const saved=await raw.request('/workspace');
      saved.document.costs['1'][0].prices.king.raw='9123';
      await raw.request('/workspace',{action:'draft',expectedRevision:0,requestKey:webcrypto.randomUUID(),document:saved.document});
      return {request(path,body){
        if(path==='/workspace'&&body===undefined&&!failed){failed=true;return Promise.reject(Error('TEMPORARY_PRICE_UNAVAILABLE'));}
        return raw.request(path,body);
      },inspect:()=>raw.inspect(),reset(value){resets++;raw.reset(value);},setScenario:value=>raw.setScenario(value),destroy:()=>raw.destroy()};
    }});
    await control.ready;await control.workspace.ready;await settle();
    const original=control.workspace,root=f.container.querySelector('#price-workspace-app');
    assert.equal(control.snapshot().ready,false);assert.equal(control.snapshot().error,'TEMPORARY_PRICE_UNAVAILABLE');
    assert.equal(control.workspace.read(),null);
    f.container.hidden=true;f.document.getElementById('other-scene').textContent='campaign';f.container.hidden=false;
    assert.equal(await control.select({state:'costs'}),true);await settle();
    assert.equal(control.snapshot().ready,true);assert.equal(control.snapshot().error,null);
    assert.equal(control.workspace,original);assert.equal(f.container.querySelector('#price-workspace-app'),root);
    assert.equal(control.workspace.read().costs['1'][0].prices.king.raw,'9123');
    assert.equal(control.snapshot().model.revision,1);assert.equal(raw.inspect().revision,1);assert.equal(resets,0);
    assert.equal(f.fetches.length,0);assert.equal(f.errors.length,0);
  }finally{control?.dispose();f.close();}
});

test('revisiting a forced error retries its provider but preserves the explicit error until QA selects another scenario',async()=>{
  const f=setup();let control;
  try{
    control=f.mount('error');await control.ready;await control.workspace.ready;await settle();
    const original=control.workspace,calls=control.transport.inspect().calls.length;
    assert.equal(control.snapshot().error,'SERVICE_UNAVAILABLE');
    assert.equal(await control.select({state:'error'}),true);await settle();
    assert.equal(control.transport.inspect().calls.length,calls+2);
    assert.equal(control.snapshot().scenario,'error');assert.equal(control.snapshot().state,'error');
    assert.equal(control.snapshot().error,'SERVICE_UNAVAILABLE');assert.equal(control.workspace,original);
    assert.equal(await control.select({state:'costs',scenario:true}),true);await loaded(control);
    assert.equal(control.snapshot().scenario,'normal');assert.equal(control.snapshot().error,null);
    assert.equal(f.fetches.length,0);assert.equal(f.errors.length,0);
  }finally{control?.dispose();f.close();}
});

test('injected provider owns every request; pending writes cannot be reset and late replies cannot repaint a disposed parent',async()=>{
  const f=setup();let control,release,raw,destroys=0;
  try{
    control=f.mount('costs',{createTransport({model,reference,scenario}){
      raw=createPriceWorkspaceQaTransport(model,reference,{scenario});
      return {request:async(path,body)=>{if(body!==undefined)await new Promise(resolve=>{release=resolve;});return raw.request(path,body);},
        inspect:()=>({...raw.inspect(),mode:'injected-test'}),reset:value=>raw.reset(value),setScenario:value=>raw.setScenario(value),
        destroy(){destroys++;raw.destroy();}};
    }});
    await loaded(control);input(f,'[data-cost="raw"]','8111');
    f.container.querySelector('[data-action="draft"]').click();await until(()=>control.snapshot().pendingWrites===1);
    const before=JSON.stringify(control.workspace.read());assert.equal(await control.select({state:'empty',scenario:true}),false);assert.equal(JSON.stringify(control.workspace.read()),before);
    control.dispose();f.document.getElementById('other-scene').textContent='kept parent';release();await settle();
    assert.equal(destroys,1);assert.equal(control.snapshot().pendingWrites,0);
    assert.equal(f.document.getElementById('other-scene').textContent,'kept parent');
    assert.equal(f.container.childElementCount,0);assert.equal(f.fetches.length,0);assert.equal(f.errors.length,0);
  }finally{control?.dispose();f.close();}
});

test('module and provider failures fail closed without operational fallback or late owners',async()=>{
  for(const options of [
    {loadModule:async()=>{throw Error('SEALED_ASSET_UNAVAILABLE');}},
    {loadModule:async()=>({})},
    {createTransport:async()=>{throw Error('PROVIDER_UNAVAILABLE');}}
  ]){
    const f=setup();const control=f.mount('costs',options);
    try{await assert.rejects(control.ready,/UNAVAILABLE|MODULE_INVALID/);assert.equal(control.snapshot().disposed,true);assert.equal(f.container.childElementCount,0);assert.equal(f.window.OrderModalShell,f.parentModal);assert.equal(f.fetches.length,0);}
    finally{control.dispose();f.close();}
  }
  const f=setup();let resolveModule;
  const control=f.mount('costs',{loadModule:()=>new Promise(resolve=>{resolveModule=resolve;})});
  try{
    await settle();control.dispose();resolveModule(f.window.ResearchPriceTest.integration);
    await assert.rejects(control.ready,/DISPOSED/);
    assert.equal(f.container.childElementCount,0);assert.equal(f.window.OrderModalShell,f.parentModal);
  }finally{control.dispose();f.close();}
});
