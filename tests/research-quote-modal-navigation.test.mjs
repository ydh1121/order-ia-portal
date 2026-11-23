import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import {webcrypto} from 'node:crypto';
import {renderResearchApplication,researchScene,serveResearchAsset,researchAssetBase} from '../src/server/research-app/page.mjs';

const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {build}=require('esbuild'),{JSDOM,VirtualConsole}=require('jsdom');
const paths=['bridge/contact-ui.mjs','bridge/business-directory.mjs','web/region-reference.mjs','web/address-contract.mjs','web/address-service.mjs','web/address-ui.mjs','src/engine/validation/email.mjs','src/engine/validation/phone.mjs'];
// Read the application boundary directly, so this regression also runs before
// generating a new sealed release. The quote factory still uses its real adapter.
const contents="export {mountResearchApplication} from './src/server/research-app/application.mjs';\nexport {mountResearchQuote} from './src/server/research-app/quote-workspace.mjs';\n"+
  paths.map((path,i)=>`import * as service${i} from '${researchAssetBase+path}';`).join('\n')+
  '\nexport const serviceModules={'+paths.map((path,i)=>JSON.stringify(path)+':service'+i).join(',')+'};';
const compiled=await build({stdin:{contents,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',globalName:'QuoteModalTest',target:'es2022',logLevel:'silent',plugins:[{
  name:'actual-research-quote-modal-boundary',setup(builder){
    builder.onResolve({filter:/^\/ia\/research-assets\//},args=>({path:args.path.startsWith(researchAssetBase)?args.path.slice(researchAssetBase.length):args.path.slice('/ia/research-assets/'.length),namespace:'research'}));
    builder.onResolve({filter:/^\./,namespace:'research'},args=>({path:posix.normalize(posix.join(posix.dirname(args.importer),args.path)),namespace:'research'}));
    builder.onLoad({filter:/.*/,namespace:'research'},async args=>{const response=await serveResearchAsset(researchAssetBase+args.path);assert.equal(response.status,200,args.path);return {contents:await response.text(),loader:'js'};});
  }
}]});
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
const waitFor=async(predicate,message='Quote state did not settle')=>{const end=Date.now()+3000;while(!predicate()){if(Date.now()>end)assert.fail(message);await new Promise(resolve=>setTimeout(resolve,10));}};
const plain=value=>JSON.parse(JSON.stringify(value));

async function setup(){
  const html=await renderResearchApplication('a'.repeat(36),new URLSearchParams({screen:'onboarding',state:'guest-2'})),failures=[],nativeModals=new Set();
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
  // JSDOM cannot perform browser hit testing. Keep a separate native-modal
  // lifetime so hiding the owner cannot accidentally count as releasing it.
  win.HTMLDialogElement.prototype.showModal=function(){this.open=true;nativeModals.add(this);};
  win.HTMLDialogElement.prototype.close=function(){this.open=false;nativeModals.delete(this);this.dispatchEvent(new win.Event('close'));};
  let gate=null;
  win.navigator.locks={request:async(name,_options,callback)=>{if(gate){const held=gate;held.entered=true;await held.promise;}return callback({name,mode:'exclusive'});}};
  win.fetch=async input=>{const path=new URL(String(input),win.location.href).pathname;return path.startsWith('/ia/research-assets/')?serveResearchAsset(path.startsWith(researchAssetBase)?path:path.replace('/ia/research-assets/',researchAssetBase)):new Response('{}',{status:503});};
  for(const script of doc.querySelectorAll('script[nonce]:not([type])'))win.eval(script.src?await (await serveResearchAsset(new URL(script.src).pathname)).text():script.textContent);
  win.eval(compiled.outputFiles[0].text);
  const config=JSON.parse(doc.getElementById('order-app-config').textContent),environment=win.ORDER_CREATE_RESEARCH_ENV(config);
  environment.regular={loadModule:path=>Promise.resolve(win.QuoteModalTest.serviceModules[path]),crypto:webcrypto};
  environment.loadBusinessModule=path=>Promise.resolve(win.QuoteModalTest.serviceModules[path]);
  environment.loadScene=async route=>{const source=await researchScene(route.screen,route.state,route.variant);assert.ok(source,route.screen);const previous=win.ORDER_DESIGN_MODULES;win.ORDER_DESIGN_MODULES=[];try{win.eval(source.mount);return {modules:win.ORDER_DESIGN_MODULES.slice(),scene:{screen:source.row.screen,state:source.row.state,html:source.html,styles:[]}};}finally{win.ORDER_DESIGN_MODULES=previous;}};
  const app=await win.QuoteModalTest.mountResearchApplication(config,environment);await settle();
  return {win,doc,app,failures,nativeModals,
    holdWrites(){assert.equal(gate,null);let release;const held={entered:false,promise:new Promise(resolve=>{release=resolve;})};gate=held;return {get entered(){return held.entered;},release(){if(gate===held)gate=null;release();}};},
    async close(){if(gate)throw Error('TEST_WRITE_LOCK_NOT_RELEASED');app.dispose();await settle();dom.window.close();}
  };
}

async function seedQuote(f,mode='detailed'){
  assert.equal(await f.app.navigate({screen:'q1',mode}),true);
  const root=f.doc.getElementById('order-app-quote');
  // The factory's public idempotent mount returns the exact application owner.
  const workspace=await f.win.QuoteModalTest.mountResearchQuote(root,{mode,step:'q1'});
  for(const [field,value]of [['housing','1'],['size','대란'],['pack','30']]){root.querySelector(`[data-pick="${field}"][data-value="${value}"]`).click();await settle();}
  await waitFor(()=>workspace.inspect().pending===0&&workspace.snapshot().lines.length===1);
  assert.equal(workspace.navigate({step:'q2'}),true);
  const quantity=root.querySelector('[data-line-qty]');assert.ok(quantity);quantity.value='10';quantity.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'10'}));
  await waitFor(()=>workspace.inspect().pending===0&&workspace.snapshot().lines[0].qty==='10');
  return {root,workspace,parent:root.querySelector('#app'),shell:f.win.OrderModalShell,lines:plain(workspace.snapshot().lines)};
}

async function openReview(f,q){
  q.root.querySelector('#input-review-open').click();await settle();
  const dialog=q.root.querySelector('#input-review-dialog');
  assert.equal(dialog.open,true);assert.equal(f.nativeModals.has(dialog),true);
  assert.equal(q.workspace.inspect().lifecycle.modalHistory,true);
  assert.ok(q.shell.activeIds.includes(dialog.id));
  return dialog;
}

function assertReviewReleased(f,q,dialog){
  assert.equal(dialog.open,false,'the original native dialog must be closed');
  assert.equal(f.nativeModals.has(dialog),false,'a hidden parent does not release a native modal');
  assert.equal(q.shell.activeIds.includes(dialog.id),false,'the owning shell must retire its entry');
  assert.equal(q.workspace.inspect().lifecycle.modalHistory,false,'the local modal history must be retired');
  const content=q.root.querySelector('[data-research-quote]');
  assert.equal(content.classList.contains('ui-modal-locked'),false);
  assert.equal(content.classList.contains('ui-modal-body-locked'),false);
  assert.equal(q.root.querySelector('#app'),q.parent);
  assert.deepEqual(plain(q.workspace.snapshot().lines),q.lines);
}

test('same-quote navigation releases the real input review and its local modal history without resetting input',async()=>{
  for(const mode of ['simple','detailed']){
    const f=await setup();try{
      const q=await seedQuote(f,mode),dialog=await openReview(f,q),url=f.win.location.href;
      assert.equal(q.workspace.navigate({step:'review'}),true,'reselecting an already open review is harmless');
      assert.equal(dialog.open,true);assert.equal(q.workspace.inspect().lifecycle.modalHistory,true);
      assert.equal(q.workspace.navigate({step:'q3'}),true);await settle();
      assertReviewReleased(f,q,dialog);assert.equal(q.workspace.inspect().step,'q3');
      assert.equal(q.workspace.back(),false,'no stale modal history may consume the next application Back');
      assert.equal(new URL(f.win.location.href).origin,new URL(url).origin);
      assert.deepEqual(f.failures,[]);
    }finally{await f.close();}
  }
});

test('application quote, external page and authentication boundaries close only the read-only review and retain the same quote',async()=>{
  const f=await setup();try{
    const q=await seedQuote(f),header=f.doc.getElementById('order-app-header');
    for(const destination of [{screen:'q1',mode:'detailed'},{screen:'onboarding',state:'guest-2'},{screen:'signup',state:'empty'}]){
      if(q.root.hidden)assert.equal(await f.app.navigate({screen:'q2',mode:'detailed'}),true);
      const dialog=await openReview(f,q);
      assert.equal(await f.app.navigate(destination),true);await settle();
      assert.equal(f.app.snapshot().route.screen,destination.screen);
      assertReviewReleased(f,q,dialog);
      assert.equal(f.doc.getElementById('order-app-header'),header);
      if(destination.screen==='onboarding')assert.equal(q.root.hidden,true);
      if(destination.screen==='signup'){
        assert.equal(q.root.hidden,false);const overlay=f.doc.querySelector('[data-product-auth-sheet]');assert.ok(overlay);
        const input=overlay.querySelector('input');input.focus();input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
        await waitFor(()=>!f.doc.querySelector('[data-product-auth-sheet]'));assert.equal(f.app.snapshot().route.kind,'quote');
      }
    }
    assert.deepEqual(plain((await q.workspace.repository.read('detailed')).data.lines),q.lines);
    assert.deepEqual(f.failures,[]);
  }finally{await f.close();}
});

test('a quote-owned modal is retired even if its retained parent was already hidden and the application route is elsewhere',async()=>{
  const f=await setup();try{
    const q=await seedQuote(f);assert.equal(await f.app.navigate({screen:'onboarding',state:'guest-2'}),true);
    // Reproduce the old retained-owner condition independently of its fixed
    // entry path: the quote is hidden but its native modal remains active.
    const dialog=await openReview(f,q);assert.equal(q.root.hidden,true);assert.equal(f.app.snapshot().route.screen,'onboarding');
    assert.equal(await f.app.navigate({screen:'signup',state:'empty'}),true);await settle();
    assertReviewReleased(f,q,dialog);assert.ok(f.doc.querySelector('[data-product-auth-sheet]'));
    assert.deepEqual(f.failures,[]);
  }finally{await f.close();}
});

test('SKU drafts and ordinary confirmation dialogs reject every navigation boundary without cancelling their owner',async()=>{
  const f=await setup();try{
    const q=await seedQuote(f);
    assert.equal(await f.app.navigate({screen:'q1',mode:'detailed'}),true);
    q.root.querySelector('#added-lines [data-edit]').click();await settle();
    const editor=q.root.querySelector('#sku-dialog');assert.equal(editor.open,true);
    const choice=editor.querySelector('[data-pick="size"][data-value="특란"]');assert.ok(choice);choice.click();await settle();
    const route=plain(f.app.snapshot().route),url=f.win.location.href;
    const draftChoices=()=>[...editor.querySelectorAll('[data-pick][aria-pressed="true"]')].map(node=>[node.dataset.pick,node.dataset.value]);
    const draft=draftChoices();
    for(const destination of [{screen:'q2',mode:'detailed'},{screen:'onboarding',state:'guest-2'},{screen:'signup',state:'empty'}]){
      assert.equal(await f.app.navigate(destination),false);await settle();
      assert.deepEqual(plain(f.app.snapshot().route),route);assert.equal(f.win.location.href,url);
      assert.equal(editor.open,true);assert.equal(f.nativeModals.has(editor),true);assert.equal(q.root.hidden,false);
      assert.equal(q.root.querySelector('#sku-dialog'),editor);assert.equal(q.root.querySelector('#app'),q.parent);
      assert.deepEqual(draftChoices(),draft);assert.equal(q.workspace.inspect().lifecycle.modalHistory,true);
      assert.deepEqual(plain(q.workspace.snapshot().lines),q.lines);assert.equal(q.shell.inspect().pendingDiscard,null);
      assert.equal(f.doc.querySelector('[data-product-auth-sheet]'),null);
    }
    // Do not invoke the dirty editor's cancel path in a navigation test: dispose
    // it through its owner, then test an unedited ordinary confirmation separately.
    assert.deepEqual(f.failures,[]);
  }finally{await f.close();}
  const clean=await setup();try{
    const q=await seedQuote(clean);q.root.querySelector('#quote-mode-switch').click();await settle();
    const dialog=q.root.querySelector('#quote-mode-dialog');assert.equal(dialog.open,true);assert.equal(q.workspace.canLeave(),true,'ordinary confirmation passes the existing edit guard');
    const route=plain(clean.app.snapshot().route);
    assert.equal(await clean.app.navigate({screen:'onboarding',state:'guest-2'}),false);
    assert.equal(dialog.open,true);assert.equal(clean.nativeModals.has(dialog),true);assert.deepEqual(plain(clean.app.snapshot().route),route);
    assert.equal(q.workspace.back(),true);await settle();assert.equal(dialog.open,false);
    assert.equal(await clean.app.navigate({screen:'onboarding',state:'guest-2'}),true);
    assert.deepEqual(plain(q.workspace.snapshot().lines),q.lines);assert.deepEqual(clean.failures,[]);
  }finally{await clean.close();}
});

test('pending canonical storage prevents review cleanup and route changes until the write finishes',async()=>{
  const f=await setup();let held;try{
    const q=await seedQuote(f),dialog=await openReview(f,q),route=plain(f.app.snapshot().route);
    held=f.holdWrites();const saving=q.workspace.save();await waitFor(()=>held.entered&&q.workspace.inspect().pending>0);
    for(const destination of [{screen:'q3',mode:'detailed'},{screen:'onboarding',state:'guest-2'},{screen:'signup',state:'empty'}]){
      assert.equal(await f.app.navigate(destination),false);await settle();
      assert.deepEqual(plain(f.app.snapshot().route),route);assert.equal(q.root.hidden,false);
      assert.equal(dialog.open,true);assert.equal(f.nativeModals.has(dialog),true);assert.equal(q.workspace.inspect().lifecycle.modalHistory,true);
      assert.deepEqual(plain(q.workspace.snapshot().lines),q.lines);
    }
    held.release();held=null;assert.equal((await saving).ok,true);await waitFor(()=>q.workspace.inspect().pending===0);
    assert.equal(await f.app.navigate({screen:'onboarding',state:'guest-2'}),true);await settle();assertReviewReleased(f,q,dialog);
    assert.deepEqual(f.failures,[]);
  }finally{held?.release();await f.close();}
});

test('modal cleanup and disposal use the captured quote shell when another owner replaces the shared global',async()=>{
  const f=await setup();try{
    const q=await seedQuote(f),dialog=await openReview(f,q);
    let foreignClose=0,foreignDestroy=0;
    const foreign={close(){foreignClose++;},destroy(){foreignDestroy++;}};
    f.win.OrderModalShell=foreign;
    assert.equal(await f.app.navigate({screen:'onboarding',state:'guest-2'}),true);await settle();assertReviewReleased(f,q,dialog);
    assert.equal(f.win.OrderModalShell,foreign);assert.equal(foreignClose,0);
    // Reopen with the original read-only controller, then destroy while it owns
    // an actual native modal. The replacement shell must remain untouched.
    await openReview(f,q);f.app.dispose();await settle();
    assert.equal(dialog.open,false);assert.equal(f.nativeModals.has(dialog),false);assert.equal(q.workspace.inspect().lifecycle.disposed,true);
    assert.equal(f.win.OrderModalShell,foreign);assert.equal(foreignDestroy,0);assert.deepEqual(f.failures,[]);
  }finally{await f.close();}
});

test('confirmed mode switches close their own dialog after success, while pending and failed copies retain it',async()=>{
  const f=await setup();let held;try{
    let q=await seedQuote(f,'simple');const header=f.doc.getElementById('order-app-header'),instance=f.app.instance;
    const original=plain(q.workspace.snapshot().lines);
    for(const mode of ['detailed','simple']){
      q.root.querySelector('#quote-mode-switch').click();await settle();
      const dialog=q.root.querySelector('#quote-mode-dialog'),confirm=dialog.querySelector('[data-mode-confirm]'),option=dialog.querySelector('[data-mode-option]');
      assert.equal(dialog.open,true);assert.equal(f.nativeModals.has(dialog),true);
      if(mode==='detailed'){
        assert.equal(option.closest('label').hidden,false);option.checked=true;held=f.holdWrites();
      }
      confirm.click();
      if(held){
        await waitFor(()=>held.entered&&confirm.disabled);
        assert.equal(confirm.disabled,true);assert.equal(option.checked,true);
        for(const destination of [{screen:'onboarding',state:'guest-2'},{screen:'signup',state:'empty'}]){
          assert.equal(await f.app.navigate(destination),false);
          assert.equal(f.app.snapshot().route.mode,'simple');assert.equal(dialog.open,true);
          assert.equal(f.nativeModals.has(dialog),true);assert.equal(q.workspace.inspect().lifecycle.modalHistory,true);
          assert.equal(q.root.querySelector('#app'),q.parent);assert.deepEqual(plain(q.workspace.snapshot().lines),original);
        }
        held.release();held=null;
      }
      await waitFor(()=>f.app.snapshot().route.mode===mode&&f.app.snapshot().quote?.lines?.[0]?.qty==='10'&&q.root.querySelector('#app')!==q.parent,'Confirmed quote mode did not change');
      await settle();
      assert.equal(dialog.open,false);assert.equal(f.nativeModals.has(dialog),false);assert.equal(f.nativeModals.size,0);
      assert.equal(q.workspace.inspect().lifecycle.disposed,true);assert.deepEqual([...q.shell.activeIds],[]);
      const workspace=await f.win.QuoteModalTest.mountResearchQuote(q.root,{mode,step:'q1'});
      q={root:q.root,workspace,parent:q.root.querySelector('#app'),shell:f.win.OrderModalShell,lines:original};
      assert.deepEqual(plain(workspace.snapshot().lines),original);assert.equal(workspace.inspect().lifecycle.modalHistory,false);
      assert.equal(f.doc.getElementById('order-app-header'),header);assert.equal(f.app.instance,instance);
    }
    // The destination now contains the previous copy. Changing the source
    // produces the canonical copy-conflict error, without replacing that draft.
    assert.equal(q.workspace.navigate({step:'q2'}),true);
    const quantity=q.root.querySelector('[data-line-qty]');quantity.value='12';quantity.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'12'}));
    await waitFor(()=>q.workspace.inspect().pending===0&&q.workspace.snapshot().lines[0].qty==='12');
    q.root.querySelector('#quote-mode-switch').click();await settle();
    const dialog=q.root.querySelector('#quote-mode-dialog'),confirm=dialog.querySelector('[data-mode-confirm]'),option=dialog.querySelector('[data-mode-option]'),error=dialog.querySelector('[data-mode-error]');
    option.checked=true;confirm.click();await waitFor(()=>!confirm.disabled&&!error.hidden);
    assert.match(error.textContent,/작성 중인 규격/);assert.equal(dialog.open,true);assert.equal(f.nativeModals.has(dialog),true);
    assert.equal(q.workspace.inspect().lifecycle.modalHistory,true);assert.equal(option.checked,true);
    assert.equal(f.app.snapshot().route.mode,'simple');assert.equal(q.root.querySelector('#app'),q.parent);
    assert.equal(q.workspace.snapshot().lines[0].qty,'12');
    assert.deepEqual(plain((await q.workspace.repository.read('detailed')).data.lines),original);
    assert.equal(await f.app.navigate({screen:'signup',state:'empty'}),false,'a failed confirmation must still be resolved by the user');
    assert.equal(dialog.open,true);assert.deepEqual(f.failures,[]);
  }finally{held?.release();await f.close();}
});
