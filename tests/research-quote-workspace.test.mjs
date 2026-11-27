import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {resolve,join,posix} from 'node:path';
import {webcrypto,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {quoteFiles} from '../src/server/r3-product-sources.mjs';
import {extendQuoteSource} from '../src/server/r3-product-extensions.mjs';
import {getResearchQuoteSource,getResearchQuoteMarkup,getResearchQuoteStyleSource,getResearchQuoteIntegrationSource} from '../src/server/research-app/quote-source-adapter.mjs';
import {regularContactModuleSource} from '../src/server/research-app/regular-service-assets.mjs';
const require=createRequire(join(resolve(process.env.R3_BUILD_TEST_TOOLS||'tests/build-tools'),'package.json'));
const {build}=require('esbuild'),{JSDOM}=require('jsdom');
const text=path=>gunzipSync(Buffer.from(quoteFiles[path],'base64')).toString();
const served=path=>extendQuoteSource(path,text(path));
const digest=value=>createHash('sha256').update(value).digest('hex');
const sealedBefore=digest(JSON.stringify(quoteFiles));
const parentSources=['bridge/contact-ui.mjs','web/address-contract.mjs','web/address-service.mjs','web/address-ui.mjs','src/engine/validation/email.mjs','src/engine/validation/phone.mjs'];
const harness="export * from './src/server/research-app/quote-workspace.mjs';\nimport {createRegularServices} from './src/server/research-app/regular-services.mjs';\n"+parentSources.map((path,i)=>`import * as source${i} from '/ia/research-assets/${path}';`).join('\n')+`\nexport const createParentServices=environment=>createRegularServices({...environment,loadModule:path=>Promise.resolve({${parentSources.map((path,i)=>JSON.stringify(path)+':source'+i).join(',')}}[path])});`;
const bundle=await build({stdin:{contents:harness,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',globalName:'QuoteWorkspaceTest',target:'es2022',logLevel:'silent',plugins:[{
  name:'actual-sealed-regular-quote',setup(builder){
    builder.onResolve({filter:/^\/ia\/research-assets\//},args=>({path:args.path.replace('/ia/research-assets/',''),namespace:'sealed'}));
    builder.onResolve({filter:/^\./,namespace:'sealed'},args=>({path:posix.normalize(posix.join(posix.dirname(args.importer),args.path)),namespace:'sealed'}));
    builder.onLoad({filter:/.*/,namespace:'sealed'},async args=>({contents:args.path==='bridge/contact-ui.mjs'?await regularContactModuleSource():args.path==='research/quote-integrations.mjs'?getResearchQuoteIntegrationSource():getResearchQuoteSource(args.path,served(args.path)),loader:'js'}));
  }
}]});

function setup(){
  const dom=new JSDOM('<!doctype html><html><head></head><body><header id="application-header"><span>Order.</span></header><div id="quote-workspace"></div><button id="outside">Outside</button></body></html>',{url:'https://research.example/ia/research?screen=quote-simple',runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window,failures=[],calls=[];
  win.addEventListener('error',event=>{failures.push(event.error||event.message);event.preventDefault();});
  Object.defineProperty(win,'crypto',{value:webcrypto});
  win.structuredClone=value=>win.JSON.parse(win.JSON.stringify(value));win.TextEncoder=TextEncoder;win.TextDecoder=TextDecoder;
  win.Request=Request;win.Response=Response;win.Headers=Headers;
  win.fetch=async (url,init)=>{calls.push({url:String(url),init});return new Response('{}',{status:503,headers:{'content-type':'application/json'}});};
  win.navigator.locks={request:async (name,_opts,callback)=>callback({name,mode:'exclusive'})};
  win.CSS={escape:value=>String(value).replace(/["\\]/g,'\\$&')};
  win.matchMedia=()=>Object.assign(new win.EventTarget(),{matches:true,media:'(prefers-reduced-motion: reduce)'});
  win.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  win.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};win.HTMLElement.prototype.scrollTo=()=>{};
  win.Element.prototype.getAnimations=()=>[];
  win.Element.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){},finish(){},currentTime:0,startTime:0});
  win.HTMLCanvasElement.prototype.getContext=()=>({font:'16px sans-serif',measureText:value=>({width:String(value).length*8,actualBoundingBoxLeft:0,actualBoundingBoxRight:String(value).length*8})});
  win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  win.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new win.Event('close'));};
  win.eval(bundle.outputFiles[0].text);
  const root=win.document.getElementById('quote-workspace'),navigate=[];
  const services={storage:{crypto:webcrypto,locks:win.navigator.locks},context:{authenticated:false},fetcher:win.fetch};
  return {dom,win,root,failures,calls,navigate,services,
    mount:(mode='simple',extra={})=>win.QuoteWorkspaceTest.mountResearchQuote(root,{mode,template:getResearchQuoteMarkup(),styles:false,partition:'a'.repeat(64),namespace:'test-account',services,onNavigate:value=>navigate.push(value),...extra}),
    close(){dom.window.close();}
  };
}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
const idle=async workspace=>{for(let i=0;i<100&&workspace.inspect().pending;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(workspace.inspect().pending,0);};
const until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate());};

test('research endpoint keeps sealed business modules exact and fails closed on changed integration seams',()=>{
  for(const path of ['web/simple-quote-contract.mjs','web/quantity-contract.mjs','web/cadence-contract.mjs','web/q4-validation.mjs','web/address-contract.mjs','web/quote-result.mjs'])assert.equal(getResearchQuoteSource(path,served(path)),served(path),path);
  const original=served('web/app.mjs'),adapted=getResearchQuoteSource('web/app.mjs',original);
  for(const [from,to]of [['function simpleVerdict()','const buyerTotal='],['function complete(','function changeOpen('],['function finishAddress()','$(\'start\').onclick=']]){
    const begin=original.indexOf(from),end=original.indexOf(to,begin);assert.ok(begin>=0&&end>begin,from);assert.ok(adapted.includes(original.slice(begin,end)),from);
  }
  assert.throws(()=>getResearchQuoteSource('web/app.mjs',original.replace('const addressEditor=createAddressEditor({','const addressEditor = createAddressEditor({')),/SOURCE_MISMATCH/);
  assert.equal(digest(JSON.stringify(quoteFiles)),sealedBefore);
  assert.doesNotMatch(getResearchQuoteMarkup(),/<header class="header"|<script|<iframe/);
  assert.match(getResearchQuoteStyleSource('web/styles.css',text('web/styles.css')),/^@scope \(\[data-research-quote\]\)/);
});

test('actual simple/detailed factories boot one header with Q1–Q4 and dispose every owned lifetime',async()=>{
  const f=setup();try{
    for(const mode of ['simple','detailed','simple']){
      const workspace=await f.mount(mode);await settle();
      assert.equal(workspace.inspect().mode,mode);assert.equal(workspace.inspect().ready,true);assert.equal(workspace.inspect().step,'q1');
      assert.equal(f.win.document.querySelectorAll('#application-header').length,1);assert.equal(f.root.querySelectorAll('header.header,iframe').length,0);
      for(const step of ['q1','q2','q3','q4'])assert.ok(f.root.querySelector('[data-open="'+step+'"]'),step);
      assert.equal(f.win.document.documentElement.dataset.r3QuoteMode,undefined,'quote tokens stay inside the workspace');
      workspace.dispose();await settle();assert.equal(f.root.childElementCount,0);assert.equal(f.win.OrderQ4Review,undefined);assert.equal(f.win.OrderModalShell,undefined);
      const lifetime=workspace.inspect().lifecycle;assert.equal(lifetime.disposed,true);for(const field of ['timers','frames','observers','listeners','globals'])assert.equal(lifetime[field],0,field);
    }
    assert.deepEqual(f.failures,[]);assert.equal(f.calls.some(call=>call.url.includes('/api/order/features')),false,'regular header menu never mounts');
  }finally{f.close();}
});

test('regular Q1→Q2 input and atomic mode copy survive remount without regular navigation or storage keys',async()=>{
  const f=setup();try{
    const initialURL=f.win.location.href,workspace=await f.mount();
    for(const [field,value]of [['housing','1'],['size','대란'],['pack','30']])f.root.querySelector('[data-pick="'+field+'"][data-value="'+value+'"]').click();
    await idle(workspace);assert.equal(workspace.snapshot().lines.length,1,JSON.stringify({inspect:workspace.inspect(),errors:f.failures.map(e=>e.message),feedback:f.root.querySelector('#form-error').textContent}));assert.equal(workspace.snapshot().lines[0].pack,'30');
    assert.equal(workspace.navigate({step:'q2'}),true);const field=f.root.querySelector('[data-line-qty]');assert.ok(field);
    field.value='10';field.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'10'}));await idle(workspace);
    assert.equal(workspace.snapshot().lines[0].qty,'10');assert.equal((await workspace.save()).ok,true);
    f.root.querySelector('#quote-mode-switch').click();await settle();const dialog=f.root.querySelector('#quote-mode-dialog');assert.equal(dialog.open,true);
    const copy=dialog.querySelector('[data-mode-option]');assert.equal(copy.closest('label').hidden,false);assert.equal(copy.checked,false,'copying simple data is opt-in on every opening');assert.match(dialog.querySelector('#quote-mode-description').textContent,/모드별로 최근 작성한 내용 하나씩/);copy.checked=true;dialog.querySelector('[data-mode-confirm]').click();await until(()=>f.navigate.some(value=>value.type==='mode'));
    assert.equal(f.navigate.at(-1)?.type,'mode');assert.equal(f.navigate.at(-1)?.mode,'detailed');assert.equal(f.win.location.href,initialURL);
    workspace.dispose();const detailed=await f.mount('detailed');assert.equal(detailed.snapshot().lines.length,1);assert.equal(detailed.snapshot().lines[0].qty,'10');
    f.root.querySelector('#quote-mode-switch').click();await settle();const returnDialog=f.root.querySelector('#quote-mode-dialog');assert.equal(returnDialog.open,true);assert.equal(returnDialog.querySelector('[data-mode-option]').checked,false,'the save notice is shown by default');assert.equal(returnDialog.querySelector('[data-mode-option-label]').textContent,'다시 표시하지 않기');returnDialog.querySelector('[data-mode-cancel]').click();await until(()=>!returnDialog.open);detailed.dispose();
    const restored=await f.mount('simple');assert.equal(restored.snapshot().lines[0].qty,'10');restored.dispose();
    const keys=Object.keys(f.win.localStorage);assert.ok(keys.some(key=>key.endsWith('_simple')));assert.ok(keys.some(key=>key.endsWith('_detailed')));assert.ok(keys.every(key=>key.startsWith('order.app.test-account:')));
    assert.deepEqual(f.failures,[]);assert.equal(digest(JSON.stringify(quoteFiles)),sealedBefore);
  }finally{f.close();}
});

test('concurrent mount is one owner and modal back stays inside the quote workspace',async()=>{
  const f=setup();try{
    const [a,b]=await Promise.all([f.mount(),f.mount()]);assert.equal(a,b);assert.equal(f.root.querySelectorAll('#app').length,1);
    f.root.querySelector('#quote-mode-switch').click();await settle();assert.equal(f.root.querySelector('#quote-mode-dialog').open,true,JSON.stringify({inspect:a.inspect(),errors:f.failures.map(e=>e.message),feedback:f.root.querySelector('#form-error').textContent}));
    assert.equal(a.back(),true);await settle();assert.equal(f.root.querySelector('#quote-mode-dialog').open,false);assert.equal(a.back(),false);assert.equal(f.navigate.length,0);
    a.dispose();assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

for(const [mode,helper] of [['simple','계란 규격을 선택해 주세요.'],['detailed','계란 제품을 한 개 이상 선택해 주세요.']]){
  for(const source of ['completion','error fixture']){
    test(mode+' Q1 '+source+' exposes individual missing choices and clears each repaired group',async()=>{
      const f=setup();try{
        const workspace=await f.mount(mode,{fixtureScope:source==='error fixture'});await settle();
        const groups=()=>['housing','size','pack'].map(name=>f.root.querySelector('#picks-'+name));
        if(source==='completion')f.root.querySelector('#to-result').click();
        else assert.equal((await workspace.applyScenario({screen:'q1',state:'error'})).ok,true);
        await settle();
        assert.equal(f.root.querySelector('#err-q1').textContent,helper);
        for(const group of groups())assert.ok([...group.querySelectorAll('[data-pick]')].every(button=>button.getAttribute('aria-invalid')==='true'),group.id+' must use the existing missing-choice verdict');
        f.root.querySelector('[data-pick="housing"][data-value="1"]').click();await settle();
        assert.ok([...groups()[0].querySelectorAll('[data-pick]')].every(button=>!button.hasAttribute('aria-invalid')),'a selected field is no longer an error');
        for(const group of groups().slice(1))assert.ok([...group.querySelectorAll('[data-pick]')].every(button=>button.getAttribute('aria-invalid')==='true'),group.id);
        for(const [field,value]of [['size','대란'],['pack','30']])f.root.querySelector('[data-pick="'+field+'"][data-value="'+value+'"]').click();
        await idle(workspace);assert.equal(workspace.snapshot().lines.length,1);assert.equal(f.root.querySelector('#err-q1').hidden,true);
        assert.ok(groups().every(group=>!group.querySelector('[aria-invalid=true]')));
        assert.equal(workspace.snapshot().lines[0].qty,'','selection must not invent the later purchase data');
        workspace.dispose();assert.deepEqual(f.failures,[]);
      }finally{f.close();}
    });
  }
}

test('Q1 summary tags come from actual Q2 data, and stack edit plus swipe cancel retain the original quote transaction',async()=>{
  const f=setup();try{
    const workspace=await f.mount('detailed');
    for(const [field,value]of [['housing','1'],['size','대란'],['pack','30']])f.root.querySelector('[data-pick="'+field+'"][data-value="'+value+'"]').click();
    await idle(workspace);workspace.navigate({step:'q1'});await settle();
    let row=f.root.querySelector('#added-lines [data-saved-row]');assert.ok(row);assert.equal(row.querySelector('.saved-quantity-tags'),null,'title alone before Q2 input');
    row.querySelector('[data-edit]').click();await settle();assert.equal(f.root.querySelector('#sku-dialog').open,true);
    f.root.querySelector('#cancel-sku').click();await until(()=>!f.root.querySelector('#sku-dialog').open);
    workspace.navigate({step:'q2'});await settle();
    for(const [selector,value]of [['[data-line-qty]','100'],['[data-line-price]','5000']]){const input=f.root.querySelector(selector);input.value=value;input.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));await idle(workspace);}
    assert.equal((await workspace.save()).ok,true);workspace.navigate({step:'q1'});await settle();
    row=f.root.querySelector('#added-lines [data-saved-row]');const tags=[...row.querySelectorAll('.saved-quantity-tags>span')].map(span=>span.textContent);
    assert.deepEqual(tags,['월 100판','월 구매액 500,000원']);assert.equal(row.querySelector('.saved-quantity-tags button'),null);
    const before=JSON.stringify(workspace.snapshot()),pointer=(type,x,y=10)=>{const event=new f.win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});row.dispatchEvent(event);};
    pointer('pointerdown',150);pointer('pointermove',70);pointer('pointerup',50);assert.equal(row.dataset.savedOpen,'true');assert.equal(JSON.stringify(workspace.snapshot()),before);
    row.querySelector('[data-remove]').click();await settle();assert.equal(f.root.querySelector('#sku-delete-dialog').open,true);
    f.root.querySelector('#sku-delete-cancel').click();await until(()=>!f.root.querySelector('#sku-delete-dialog').open);assert.equal(JSON.stringify(workspace.snapshot()),before);
    workspace.dispose();assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('mode popup content follows the real modal lifecycle, honors reduced motion and returns to the retained header after cancel or copy failure',async()=>{
  const f=setup();try{
    const header=f.win.document.createElement('button');header.id='research-order-trigger';header.textContent='Order';f.win.document.querySelector('#application-header').append(header);
    const preference=Object.assign(new f.win.EventTarget(),{matches:false,media:'(prefers-reduced-motion: reduce)'}),motions=[],focusCalls=[];
    const focus=f.win.HTMLElement.prototype.focus;f.win.HTMLElement.prototype.focus=function(...args){focusCalls.push({id:this.id,step:this.dataset.open,stack:new Error().stack.split('\n').slice(1,4)});return focus.apply(this,args);};
    f.win.matchMedia=query=>query.includes('prefers-reduced-motion')?preference:Object.assign(new f.win.EventTarget(),{matches:false,media:query});
    const animate=f.win.Element.prototype.animate;
    f.win.Element.prototype.animate=function(frames,options){if(this.matches('#quote-mode-dialog>.q1-confirm'))motions.push({frames,options});return animate.call(this,frames,options);};
    const workspace=await f.mount('simple');
    for(const [field,value]of [['housing','1'],['size','대란'],['pack','30']])f.root.querySelector('[data-pick="'+field+'"][data-value="'+value+'"]').click();
    await idle(workspace);
    const trigger=f.root.querySelector('#quote-mode-switch'),dialog=f.root.querySelector('#quote-mode-dialog');
    header.focus();trigger.click();await settle();assert.equal(dialog.open,true);assert.equal(motions.length,1);assert.equal(motions[0].frames.length,5);assert.match(motions[0].frames[1].transform,/1\.04,\.96/);
    dialog.querySelector('[data-mode-cancel]').click();await until(()=>!dialog.open);await until(()=>f.win.document.activeElement===header).catch(error=>{throw Error(JSON.stringify({active:f.win.document.activeElement?.outerHTML,focusCalls,shell:f.win.OrderModalShell.inspect()}),{cause:error});});assert.equal(motions.length,2);assert.equal(motions[1].frames.at(-1).transform,'scale(.82,.12)');
    const setItem=f.win.Storage.prototype.setItem;
    f.win.Storage.prototype.setItem=function(key,value){if(String(key).endsWith('_detailed'))throw new f.win.DOMException('Unavailable storage','QuotaExceededError');return setItem.call(this,key,value);};
    header.focus();trigger.click();await settle();dialog.querySelector('[data-mode-option]').checked=true;dialog.querySelector('[data-mode-confirm]').click();
    await until(()=>!dialog.querySelector('[data-mode-error]').hidden);assert.equal(dialog.open,true);assert.equal(f.navigate.length,0,'a failed atomic copy cannot navigate or simulate success');assert.equal(workspace.snapshot().lines.length,1);
    dialog.querySelector('[data-mode-cancel]').click();await until(()=>!dialog.open);await until(()=>f.win.document.activeElement===header);
    f.win.Storage.prototype.setItem=setItem;
    preference.matches=true;preference.dispatchEvent(new f.win.Event('change'));const before=motions.length;trigger.click();await settle();assert.equal(dialog.open,true);assert.equal(motions.length,before,'reduced motion skips the added wobble while retaining the native dialog');
    workspace.dispose();await settle();assert.equal(workspace.inspect().lifecycle.observers,0);assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('QA scenarios hydrate the regular model in a distinct scope and open its actual editors',async()=>{
  const f=setup();try{
    let workspace=await f.mount('detailed');
    await assert.rejects(workspace.applyScenario({screen:'q2',state:'filled'}),/SCOPE_REQUIRED/);
    for(const [field,value]of [['housing','2'],['size','특란'],['pack','10']])f.root.querySelector('[data-pick="'+field+'"][data-value="'+value+'"]').click();
    await idle(workspace);const user=workspace.snapshot().lines[0];workspace.dispose();
    for(const [screen,state,dialog]of [['q2','filled',null],['q1','edit','sku-dialog'],['q3','open','site-editor-dialog'],['q4','open','q4-regular-dialog'],['quote-review','filled',null]]){
      workspace=await f.mount('detailed',{fixtureScope:true});const result=await workspace.applyScenario({screen,state});assert.equal(result.ok,true,JSON.stringify(result));await settle();
      assert.equal(workspace.snapshot().lines[0].housing,'1');if(dialog)assert.equal(f.root.querySelector('#'+dialog).open,true,dialog);
      workspace.dispose();
    }
    workspace=await f.mount('simple',{fixtureScope:true});assert.equal((await workspace.applyScenario({screen:'q2',state:'unknown'})).ok,true);assert.equal(workspace.snapshot().simpleQuote.specUnknown,true);workspace.dispose();
    workspace=await f.mount('detailed');assert.equal(workspace.snapshot().lines[0].id,user.id);assert.equal(workspace.snapshot().lines[0].housing,'2');assert.equal(workspace.snapshot().lines[0].qty,'');workspace.dispose();
    assert.ok(Object.keys(f.win.localStorage).some(key=>key.startsWith('order.app.test-account:fixtures:')));assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('research saved-row actions follow actual Q1/Q3/Q4 data without changing validation or creating rows',async()=>{
  const f=setup();try{
    const workspace=await f.mount('detailed',{fixtureScope:true});await settle();
    assert.equal(workspace.snapshot().lines.length,0);assert.equal(f.root.querySelector('#q1-step-actions').hidden,true);
    assert.equal(f.root.querySelector('#q3-next').hidden,true);assert.equal(f.root.querySelector('#q4-next'),null);
    assert.equal(f.root.querySelector('#add-line').textContent,'계란 추가');assert.equal(f.root.querySelector('#add-line .ui-text-plus'),null);
    assert.equal((await workspace.applyScenario({screen:'q3',state:'closed'})).ok,true);await settle();
    assert.equal(workspace.snapshot().locations.length,1);assert.equal(f.root.querySelector('#q3-next').hidden,false);
    assert.equal(workspace.snapshot().allocations.length,0);assert.equal(f.root.querySelector('#q4-next'),null);
    assert.equal((await workspace.applyScenario({screen:'q4',state:'closed'})).ok,true);await settle();
    assert.equal(workspace.snapshot().allocations.length,1);assert.equal(f.root.querySelector('#q4-next'),null);
    const before=workspace.snapshot(),empty=f.win.JSON.parse(JSON.stringify({...before,locations:[],allocations:[]}));
    assert.equal((await workspace.applyScenario({screen:'q3',state:'closed',payload:empty})).ok,true);await settle();
    assert.equal(f.root.querySelector('#q3-next').hidden,true);assert.equal(f.root.querySelector('#q4-next'),null);
    assert.equal(workspace.snapshot().lines[0].id,before.lines[0].id);assert.equal(workspace.snapshot().lines[0].qty,before.lines[0].qty);
    assert.equal(workspace.inspect().validation.valid,false,'hiding completion buttons cannot validate missing business/allocation data');
    workspace.dispose();assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('closed business and delivery headers accept horizontal swipes, preserve scrolling, and retain their original confirmation transactions',async()=>{
  const f=setup();try{
    const workspace=await f.mount('detailed',{fixtureScope:true});
    const pointer=(element,type,x,y=12)=>{const event=new f.win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});element.dispatchEvent(event);};
    const swipe=(element,{vertical=false,cancel=false}={})=>{pointer(element,'pointerdown',160);pointer(element,'pointermove',vertical?157:70,vertical?80:14);pointer(element,cancel?'pointercancel':'pointerup',vertical?155:50,vertical?110:15);};
    assert.equal((await workspace.applyScenario({screen:'q3',state:'closed'})).ok,true);workspace.navigate({step:'q3'});await settle();
    const siteHeader=f.root.querySelector('.q3-site-accordion>.accordion-trigger'),siteBefore=JSON.stringify(workspace.snapshot());
    swipe(siteHeader,{vertical:true});assert.equal(siteHeader.getAttribute('aria-expanded'),'false','a vertical scroll must not open actions');
    swipe(siteHeader,{cancel:true});assert.equal(siteHeader.getAttribute('aria-expanded'),'false','canceled pointer gestures do not open actions');
    swipe(siteHeader);assert.equal(siteHeader.getAttribute('aria-expanded'),'true');
    const siteAction=f.root.querySelector('[data-site-delete]');assert.equal(siteAction.closest('[data-saved-row]').dataset.savedOpen,'true');
    assert.equal(JSON.stringify(workspace.snapshot()),siteBefore,'revealing actions changes no stored model');
    siteAction.click();const siteDialog=f.root.querySelector('#q3-action-confirm');assert.equal(siteDialog.open,true);
    siteDialog.querySelector('[data-q3-confirm-cancel]').click();await until(()=>!siteDialog.open);assert.equal(JSON.stringify(workspace.snapshot()),siteBefore,'cancel preserves business and allocation records');
    assert.equal((await workspace.applyScenario({screen:'q4',state:'mixed'})).ok,true);workspace.navigate({step:'q4'});await settle();
    const deliveryHeader=f.root.querySelector('.q4-body-toggle'),before=workspace.snapshot();assert.equal(before.allocations.length,2);
    assert.equal(deliveryHeader.querySelector('.research-q4-tag').textContent,'2개 사업장 · 혼합 주문');
    swipe(deliveryHeader);assert.equal(deliveryHeader.getAttribute('aria-expanded'),'true');
    const actions=[...f.root.querySelectorAll('.q4-body-item [data-delete-allocation]')];assert.equal(actions.length,2);
    assert.ok(actions.every(action=>action.textContent==='해제'&&action.closest('[data-saved-row]').dataset.savedOpen==='true'));
    actions[0].click();const confirmation=f.root.querySelector('#q4-delete-confirm');assert.equal(confirmation.open,true);
    assert.match(confirmation.querySelector('h2').textContent,/연결을 해제/);assert.equal(f.root.querySelector('#q4-delete-commit').textContent,'해제');
    f.root.querySelector('#q4-delete-cancel').click();await until(()=>!confirmation.open);assert.equal(workspace.snapshot().allocations.length,2);
    actions[0].click();const removed=actions[0].dataset.deleteAllocation;f.root.querySelector('#q4-delete-commit').click();await until(()=>workspace.snapshot().allocations.length===1);await until(()=>!confirmation.open);
    assert.equal(workspace.snapshot().allocations[0].id,before.allocations.find(row=>row.id!==removed).id,'the existing transaction removes only the selected allocation');
    assert.equal(workspace.snapshot().locations.length,2);assert.equal(workspace.snapshot().lines[0].id,before.lines[0].id);
    workspace.dispose();assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('a delayed stage focus cannot leave a visible application control for a hidden, inert or non-form quote workspace',async()=>{
  const f=setup();try{
    const workspace=await f.mount('detailed'),outside=f.win.document.getElementById('outside');
    for(const state of ['hidden','inert','home']){
      f.root.hidden=false;f.root.inert=false;assert.equal(workspace.navigate({step:'q1'}),true);
      if(state==='home')assert.equal(workspace.navigate({page:'home'}),true);else f.root[state]=true;
      outside.focus();await new Promise(resolve=>setTimeout(resolve,90));assert.equal(f.win.document.activeElement,outside,state);
    }
    workspace.dispose();assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('inactive preview initialization and Q1 scenario keep the native modal without requesting focus, while user entry retains editor focus',async()=>{
  const f=setup();let focused=false,activated=false;const attempts=[],nativeOpens=[];
  try{
    Object.defineProperty(f.win.document,'hasFocus',{value:()=>focused});
    Object.defineProperty(f.win.navigator,'userActivation',{value:{get isActive(){return activated;}}});
    const focus=f.win.HTMLElement.prototype.focus;
    f.win.HTMLElement.prototype.focus=function(options){
      attempts.push({id:this.id,allowed:focused||activated});
      assert.ok(focused||activated,'an inactive preview must not attempt programmatic focus');
      return focus.call(this,options);
    };
    // Model the native dialog focus eligibility separately from the explicit
    // application focus calls. Chromium skips this step for an inert dialog.
    f.win.HTMLDialogElement.prototype.showModal=function(){
      nativeOpens.push({id:this.id,inert:this.hasAttribute('inert')});this.open=true;
      if(!this.hasAttribute('inert'))(this.querySelector('button,input')||this).focus();
    };
    for(const mode of ['simple','detailed']){
      focused=false;activated=false;const beforeAttempts=attempts.length;
      const workspace=await f.mount(mode,{fixtureScope:true});
      assert.equal(workspace.navigate({step:'q2'}),true);
      assert.equal((await workspace.applyScenario({screen:'q1',state:'edit'})).ok,true);
      await new Promise(resolve=>setTimeout(resolve,90));
      const dialog=f.root.querySelector('#sku-dialog');
      assert.equal(dialog.open,true);assert.equal(dialog.hasAttribute('inert'),false);
      assert.deepEqual(nativeOpens.at(-1),{id:'sku-dialog',inert:true});
      assert.equal(attempts.length,beforeAttempts,'initial stages and scenario editor preserve the parent focus');
      const before=JSON.stringify(workspace.snapshot());
      activated=true;f.root.querySelector('#cancel-sku').click();await until(()=>!dialog.open);
      assert.equal(JSON.stringify(workspace.snapshot()),before,'cancel retains saved Q1/Q2 values');
      const opener=f.root.querySelector('[data-edit]');opener.focus();focused=true;activated=false;opener.click();
      await until(()=>dialog.contains(f.win.document.activeElement));
      await new Promise(resolve=>setTimeout(resolve,40));
      assert.deepEqual(nativeOpens.at(-1),{id:'sku-dialog',inert:false});
      assert.equal(f.win.document.activeElement,f.root.querySelector('#picks-housing button[aria-pressed="true"]'));
      f.root.querySelector('#cancel-sku').click();await until(()=>!dialog.open);
      await until(()=>f.win.document.activeElement===f.root.querySelector('[data-edit]'));
      assert.equal(JSON.stringify(workspace.snapshot()),before);
      workspace.navigate({step:'q2'});await until(()=>f.win.document.activeElement===f.root.querySelector('#section-q2>.accordion-trigger'));
      assert.equal(f.root.querySelector('[data-line-qty]').value,'100');
      assert.equal(f.root.querySelector('[data-line-price]').value.replaceAll(',',''),'5000');
      workspace.dispose();
    }
    assert.ok(attempts.length>0);assert.ok(attempts.every(row=>row.allowed));assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('inactive stage navigation preserves scroll without focus, rechecks document ownership and restores inert attributes on errors',async()=>{
  const f=setup();let focused=false;const attempts=[],scrolls=[];
  try{
    Object.defineProperty(f.win.document,'hasFocus',{value:()=>focused});
    Object.defineProperty(f.win.navigator,'userActivation',{value:{isActive:false}});
    const focus=f.win.HTMLElement.prototype.focus;
    f.win.HTMLElement.prototype.focus=function(options){attempts.push(this);return focus.call(this,options);};
    f.win.HTMLElement.prototype.scrollIntoView=function(options){scrolls.push({target:this,options});};
    const workspace=await f.mount('detailed');
    await until(()=>scrolls.at(-1)?.target===f.root.querySelector('#section-q1>.accordion-trigger'));
    assert.equal(attempts.length,0,'inactive initial mount scrolls to Q1 without taking parent focus');
    assert.equal(workspace.navigate({step:'q2'}),true);
    await until(()=>scrolls.at(-1)?.target===f.root.querySelector('#section-q2>.accordion-trigger'));
    assert.deepEqual({...scrolls.at(-1).options},{block:'nearest',behavior:'instant'});
    assert.equal(attempts.length,0,'an inactive stage change retains its original scroll and skips only focus');
    focused=true;assert.equal(workspace.navigate({step:'q1'}),true);focused=false;
    await until(()=>scrolls.at(-1)?.target===f.root.querySelector('#section-q1>.accordion-trigger'));
    assert.equal(attempts.length,0,'a later loss of document focus skips focus while preserving stage scroll');
    const environment=f.win.QuoteWorkspaceTest.createResearchQuoteEnvironment(f.root,{mode:'detailed',partition:'a'.repeat(64),services:f.services});
    const dialog=f.win.document.createElement('dialog');dialog.setAttribute('inert','preserved');f.root.append(dialog);
    dialog.showModal=()=>{assert.equal(dialog.hasAttribute('inert'),true);throw Error('native-open-failed');};
    assert.throws(()=>environment.showModal(dialog),/native-open-failed/);assert.equal(dialog.getAttribute('inert'),'preserved');
    dialog.removeAttribute('inert');assert.throws(()=>environment.showModal(dialog),/native-open-failed/);assert.equal(dialog.hasAttribute('inert'),false);
    environment.dispose();workspace.dispose();
    focused=true;const entered=await f.mount('detailed',{step:'q2'});
    await until(()=>f.win.document.activeElement===f.root.querySelector('#section-q2>.accordion-trigger'));
    assert.ok(attempts.length>0,'first entry from the focused application retains the regular accordion focus');
    entered.dispose();assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('saved-site availability follows the active workspace and ignores late data after disposal',async()=>{
  const f=setup(),requests=[];
  try{
    const adapter={ready:Promise.resolve(),roleRequest:(path,body,signal)=>new Promise(resolve=>requests.push({path,signal,resolve}))};
    const services={...f.services,adapter,context:{actor:{authenticated:true},endpoints:{role:'/__qa_fixture/role'}}};
    const open=()=>f.mount('detailed',{step:'q3',fixtureScope:true,services});
    const original=await open();
    await until(()=>requests.length===1);
    const old=f.root.querySelector('[data-order-saved-business-open]');
    assert.equal(old.hidden,true);
    original.dispose();
    assert.equal(requests[0].signal.aborted,true);
    const current=await open();
    await until(()=>requests.length===2);
    const trigger=f.root.querySelector('[data-order-saved-business-open]');
    requests[0].resolve({businesses:[{id:'former',profile:{name:'이전 주소록'}}]});
    requests[1].resolve({businesses:[]});
    await settle();
    assert.equal(trigger.hidden,true);
    f.win.dispatchEvent(new f.win.Event('focus'));
    await until(()=>requests.length===3);
    requests[2].resolve({businesses:[{id:'current',profile:{name:'현재 주소록'}}]});
    await until(()=>!trigger.hidden);
    current.dispose();
    f.win.dispatchEvent(new f.win.Event('focus'));
    await settle();
    assert.equal(requests.length,3);
    assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('quote import and disposal preserve the already installed application contact owner',async()=>{
  const f=setup();let regular,release;try{
    regular=await f.win.QuoteWorkspaceTest.createParentServices({document:f.win.document,origin:f.win.location.origin,crypto:webcrypto,fetcher:f.win.fetch});
    release=regular.installRegularGlobals(f.win);const owner=f.win.OrderPhone,mail=f.win.OrderEmailUI;
    const input=f.win.document.createElement('input');input.type='tel';f.win.document.body.append(input);const phone=regular.mountPhone(input);phone.set('02-1234-5678');
    const workspace=await f.mount('detailed',{fixtureScope:true,services:{...f.services,regular}});
    assert.equal(f.win.OrderPhone,owner);assert.equal(f.win.OrderEmailUI,mail);assert.equal(regular.hasRegularGlobals(f.win),true);
    assert.equal((await workspace.applyScenario({screen:'q3',state:'open'})).ok,true);
    const inside=f.root.querySelector('#site-contact-phone'),insideEmail=f.root.querySelector('#site-email'),original=f.win.OrderPhone.instance(inside),bound=regular.mountPhone(inside);
    assert.ok(original);assert.equal(bound.get(),original.get());assert.equal(f.root.querySelectorAll('#site-contact-phone').length,1);
    workspace.dispose();await settle();assert.equal(f.win.OrderPhone,owner);assert.equal(f.win.OrderEmailUI,mail);assert.equal(regular.hasRegularGlobals(f.win),true);assert.equal(phone.get(),'02-1234-5678');
    assert.equal(mail.instance(insideEmail),undefined);assert.equal(owner.instance(inside),undefined);assert.equal(regular.inspect().mountedFields,1,'only the parent form owner remains');
    phone.dispose();assert.deepEqual(f.failures,[]);
  }finally{release?.();regular?.dispose();f.close();}
});

test('authenticated research sync and mode copy use regular storage only, picker uses the fixture adapter, and original restore rejects a stale record',async()=>{
  const f=setup();try{
    const domain=[],context={actor:{authenticated:true},endpoints:{role:'/__qa_fixture/role',price:'/__qa_fixture/price'}};
    const adapter={context,ready:Promise.resolve(),request(){throw Error('REGULAR_PRODUCT_REQUEST_MUST_NOT_RUN');},async roleRequest(path){domain.push(path);return {businesses:[{id:'research-only',profile:{name:'연구 사업장',region:'서울특별시 종로구'}}]};}};
    const otherSync={flush(){throw Error('OTHER_APPLICATION_SYNC_MUST_NOT_RUN');}};
    f.win.ORDER_APP_ADAPTER=adapter;f.win.ORDER_APP_CONTEXT=context;f.win.ORDER_QUOTE_DRAFT_SYNC=otherSync;const services={...f.services,adapter,context};
    let workspace=await f.mount('simple',{services});await workspace.sync.start();
    assert.equal(f.win.ORDER_APP_ADAPTER,adapter,'workspace adapter is virtual and preserves the application owner');
    assert.equal(f.win.ORDER_QUOTE_DRAFT_SYNC,otherSync,'mode copying must use this workspace sync, never a foreign global owner');
    for(const [field,value]of [['housing','1'],['size','대란'],['pack','30']])f.root.querySelector('[data-pick="'+field+'"][data-value="'+value+'"]').click();
    await idle(workspace);workspace.navigate({step:'q2'});const quantity=f.root.querySelector('[data-line-qty]');quantity.value='10';quantity.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'10'}));await idle(workspace);
    assert.equal((await workspace.flush()).ok,true);assert.equal((await workspace.repository.request('/drafts/simple')).data.lines[0].qty,'10');
    const saved=await workspace.repository.read('simple');quantity.value='12';quantity.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText',data:'12'}));await idle(workspace);
    assert.equal((await workspace.restoreDraft(saved)).status,'CONFLICT');assert.equal(workspace.snapshot().lines[0].qty,'12');
    const current=await workspace.repository.read('simple');assert.equal((await workspace.restoreDraft(current)).ok,true);
    workspace.navigate({step:'q3'});const trigger=f.root.querySelector('[data-order-saved-business-open]');await until(()=>!trigger.hidden);trigger.click();await until(()=>f.root.querySelector('#saved-business-picker input[type=checkbox]'));
    assert.deepEqual(domain,['/businesses','/businesses']);assert.equal(f.root.querySelector('#saved-business-picker input').value,'research-only');
    f.root.querySelector('#saved-business-picker [data-copy-cancel]').click();await settle();
    f.root.querySelector('#quote-mode-switch').click();await settle();const dialog=f.root.querySelector('#quote-mode-dialog');dialog.querySelector('[data-mode-option]').checked=true;dialog.querySelector('[data-mode-confirm]').click();await until(()=>f.navigate.some(value=>value.type==='mode'));
    workspace.dispose();workspace=await f.mount('detailed',{services});assert.equal(workspace.snapshot().lines[0].qty,'12');assert.equal((await workspace.repository.request('/drafts/detailed')).data.lines[0].qty,'12');
    workspace.dispose();assert.equal(f.win.ORDER_APP_ADAPTER,adapter);assert.equal(f.win.ORDER_QUOTE_DRAFT_SYNC,otherSync);assert.equal(f.calls.length,0,'no regular API or undeclared native fetch can escape the quote environment');
    assert.ok(Object.keys(f.win.localStorage).every(key=>key.startsWith('order.app.test-account:')));assert.deepEqual(f.failures,[]);
  }finally{f.close();}
});

test('result recompare keeps the native modal and gives initial focus only to an active document or user activation',async()=>{
 const {researchScene}=await import('../src/server/research-app/page.mjs');
 const source=getResearchQuoteSource('web/quote-result-screen.mjs',served('web/quote-result-screen.mjs'));
 const scene=await researchScene('quote-result','recompare');
 for(const entry of ['quote','review'])for(const [focused,activated] of [[false,false],[true,false],[false,true]]){
  const dom=new JSDOM('<main><div data-review-result></div></main>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,doc=w.document,root=doc.querySelector('main'),host=root.querySelector('[data-review-result]');
  const attempts=[],opens=[];let dispose;
  w.matchMedia=()=>({matches:true});
  Object.defineProperty(doc,'hasFocus',{value:()=>focused});Object.defineProperty(w.navigator,'userActivation',{value:{isActive:activated}});
  const focus=w.HTMLElement.prototype.focus;w.HTMLElement.prototype.focus=function(options){attempts.push(this);return focus.call(this,options);};
  w.HTMLDialogElement.prototype.showModal=function(){opens.push({dialog:this,inert:this.hasAttribute('inert')});this.open=true;if(!this.hasAttribute('inert'))this.querySelector('button').focus();};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  try{
   if(entry==='quote'){
    const mount=w.eval(source.replace(/^export /gm,'')+'\nmountQuoteResult'),view=mount(host,{brand:false,reducedMotion:()=>true});
    dispose=()=>view.clear();view.show({state:'expired',issued:Date.parse('2026-11-14T00:00:00+09:00'),end:Date.parse('2026-11-21T00:00:00+09:00')});view.chooseConditions();
   }else{
    w.eval(scene.mount);dispose=w.ORDER_DESIGN_MODULES.find(r=>r.id==='quote-result').mount(root,'recompare',{select(){}});
   }
   const dialog=doc.querySelector('dialog');assert.ok(dialog?.open,entry);
   assert.equal(dialog.getAttribute('aria-label'),'동일한 조건으로 다시 비교하겠어요?');
   assert.equal(opens.length,1);assert.equal(opens[0].dialog,dialog);assert.equal(opens[0].inert,!(focused||activated));
   assert.equal(attempts.length,focused||activated?1:0,entry+' must preserve inactive parent focus');
   assert.equal(dialog.hasAttribute('inert'),false,'native modal remains interactive after its synchronous open');
   assert.deepEqual([...dialog.querySelectorAll('button')].map(button=>button.textContent),['새로운 견적','동일한 조건']);
   dialog.close();assert.equal(doc.querySelector('dialog'),null);
  }finally{dispose?.();dom.window.close();}
 }
});

test('issued and expiry dates appear together only when disclosed on the regular and review result screens',async()=>{
 const {researchScene}=await import('../src/server/research-app/page.mjs');
 const dom=new JSDOM('<main><div data-review-result></div></main>',{runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,root=w.document.querySelector('main'),host=root.querySelector('[data-review-result]');
 w.matchMedia=()=>({matches:true});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 try{
  const path='web/quote-result-screen.mjs',source=getResearchQuoteSource(path,served(path));
  const mount=w.eval(source.replace(/^export /gm,'')+'\nmountQuoteResult');
  const actions=[],view=mount(host,{brand:false,reducedMotion:()=>true,onAction:action=>actions.push(action)});
  const issued=Date.parse('2026-11-14T00:00:00+09:00'),end=Date.parse('2026-11-21T00:00:00+09:00');
  for(const start of [undefined,NaN,end,end+1,issued]){
   view.show({state:'expired',issued:start,end,proposed:'11940000'});
   assert.equal(host.querySelector('.oq-note').textContent,start===issued?'견적 유효기간\n2026.11.14 ~ 2026.11.21':'견적 만료일 2026.11.21');
   assert.equal(host.querySelectorAll('.oq-series:not([hidden])').length,0);
   const details=host.querySelector('.oq-expired-details');assert.equal(details.hidden,false);details.click();
   const dialog=host.querySelector('dialog');assert.ok(dialog.open);
   assert.equal(dialog.getAttribute('aria-label'),'이전 견적서 상세보기');
   assert.ok(dialog.textContent.includes(host.querySelector('.oq-note').textContent));
   assert.doesNotMatch(host.textContent,/11,?940,?000/,'expired prices stay absent even when supplied to the renderer');
   assert.deepEqual([...dialog.querySelectorAll('button')].map(button=>button.textContent),['닫기','동일한 조건']);
   dialog.querySelector('button:last-child').click();assert.equal(host.querySelector('dialog'),null);
  }
  assert.deepEqual(actions,Array(5).fill('same'),'the previous quote action retains the caller’s conditions handler');
  view.show({state:'unverified'});assert.equal(host.querySelector('.oq-expired-details').hidden,true);
  view.clear();const scene=await researchScene('quote-result','expired');
  w.eval(scene.mount);const dispose=w.ORDER_DESIGN_MODULES.find(r=>r.id==='quote-result').mount(root,'expired',{select(){}});
  assert.equal(host.querySelector('.oq-note').textContent,'견적 유효기간\n2026.11.14 ~ 2026.11.21');
  assert.equal(host.querySelectorAll('.oq-series:not([hidden])').length,0);
  dispose?.();
 }finally{dom.window.close();}
});

test('issued result gate uses the live actor and re-reads the same quote after verification',async()=>{
  const f=setup(),id='qa-access-case',requests=[],actions=[];
  try{
    f.dom.reconfigure({url:'https://research.example/ia?view=research-r3&quote='+id});
    const actor={authenticated:false};
    let status=401;
    f.services.context={actor,endpoints:{price:'/api/ia/r3-price',role:'/api/ia/r3-role'}};
    f.services.adapter={ready:Promise.resolve(),async priceRequest(path){
      requests.push(path);
      if(status!==200)throw Object.assign(Error('ACCESS_REQUIRED'),{status});
      return {id,status:'ISSUED',expiresAt:new Date(Date.now()+86400000).toISOString(),issuedAt:new Date().toISOString(),
        response:{status:'OK',completion:'COMPLETE',quotes:[{currency:'KRW',total:{minorUnits:'738241',decimal:'738241',scale:0},comparisonEligibility:'INELIGIBLE'}]}};
    }};
    f.services.onAuthRequest=action=>actions.push(action);
    const workspace=await f.mount();
    const result=()=>f.root.querySelector('#receipt');
    const open=async()=>{await workspace.navigate({page:'result'});await settle();};
    await open();
    const guest=result().querySelector('.oq-lock');
    assert.equal(guest.dataset.state,'guest');assert.doesNotMatch(result().innerHTML,/738,?241|최저가를 찾았어요!/);
    assert.equal(requests.length,0);
    guest.querySelector('[data-action=signup]').click();assert.deepEqual(actions,['signup']);
    guest.querySelector('[data-action=consult]').click();assert.equal(f.navigate.at(-1).screen,'role-consult');
    actor.authenticated=true;status=403;await open();
    assert.equal(result().querySelector('.oq-lock').dataset.state,'unverified');
    result().querySelector('[data-action=verify]').click();assert.deepEqual(actions,['signup','verify']);
    status=200;await open();assert.equal(result().querySelector('.oq-lock'),null);
    assert.equal(result().querySelector('[data-order-result]').dataset.state,'offer');
    assert.match(result().textContent,/738,241/);
    status=403;await open();assert.doesNotMatch(result().innerHTML,/738,?241/);
    assert.deepEqual(requests,Array(3).fill('/quote?id='+id));
    workspace.dispose();
  }finally{f.close();}
});
