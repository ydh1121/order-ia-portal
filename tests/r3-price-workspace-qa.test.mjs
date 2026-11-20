import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {createPriceWorkspaceModel} from '../src/server/r3-price-workspace-model.mjs';
import {defaultPriceRows} from '../src/server/r3-price-workspace-defaults.mjs';
import {priceWorkspaceFragment,renderPriceWorkspace} from '../src/server/r3-price-workspace-page.mjs';
import {getPriceWorkspaceQaDocuments,getPriceWorkspaceQaRuntimeSource,createPriceWorkspaceQaTransport} from '../src/server/r3-price-workspace-qa.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const plain=value=>JSON.parse(JSON.stringify(value));
const sha=value=>createHash('sha256').update(value).digest('hex');
const wait=async (condition,label)=>{for(let i=0;i<250;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail(label);};

async function review(state){
  const source=(await getPriceWorkspaceQaDocuments()).find(document=>document.row.state===state);
  assert.ok(source,'QA state '+state);
  const errors=[],network=[],animations=[],console=new VirtualConsole();
  console.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error);});
  // about:blank deliberately provides no same-origin storage or API base. The
  // shipping frame uses an opaque origin and connect-src none as well.
  const dom=new JSDOM('<!doctype html><html><head><style>'+source.css+'</style></head><body>'+source.body+'</body></html>',{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window,d=w.document,root=d.getElementById('order-single');
  w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;w.DecompressionStream=DecompressionStream;w.crypto.randomUUID=()=>crypto.randomUUID();
  w.ORDER_APP_CONTEXT={endpoints:{price:'https://operational.invalid/private-price'}};
  const rejectNetwork=(...args)=>{network.push(args);throw Error('QA must not use a network fallback');};
  w.fetch=rejectNetwork;w.XMLHttpRequest=rejectNetwork;w.WebSocket=rejectNetwork;w.EventSource=rejectNetwork;
  w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.Element.prototype.animate=function(keyframes,options){animations.push({element:this,keyframes:plain(keyframes),options:plain(options)});return {finished:Promise.resolve(),cancel(){},finish(){}};};
  w.eval(source.mount);
  const module=w.ORDER_DESIGN_MODULES.find(entry=>entry.id==='price-workspace');
  const dispose=module.mount(root,state,{reduced:()=>false});
  const control=root.priceWorkspaceQa;
  const q=selector=>{const element=d.querySelector(selector);assert.ok(element,'Missing '+selector);return element;};
  const click=selector=>(typeof selector==='string'?q(selector):selector).click();
  const input=(selector,value,event='input')=>{const element=typeof selector==='string'?q(selector):selector;element.value=value;element.dispatchEvent(new w.Event(event,{bubbles:true}));};
  const row=name=>{const element=[...d.querySelectorAll('[data-sales-product]')].find(element=>element.querySelector('th').textContent===name);assert.ok(element,'Missing product '+name);return element;};
  const submit=()=>q('.pw-dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  return {w,d,root,source,control,animations,network,q,click,input,row,submit,
    async closed(){await wait(()=>!d.querySelector('.pw-dialog'),'Dialog did not close: '+d.querySelector('.pw-dialog-error')?.textContent);},
    close(){dispose();w.close();assert.deepEqual(network,[]);assert.deepEqual(errors,[]);}};
}

test('R1 price documents share the standalone fragment and freeze the canonical modal and editor source',async()=>{
  const docs=await getPriceWorkspaceQaDocuments(),fragment=priceWorkspaceFragment({header:false});
  assert.deepEqual(docs.map(document=>document.row.state),['costs','store-products','consumer-products','classification','delivery','loading','error','empty','guest']);
  const source=await getPriceWorkspaceQaRuntimeSource();
  assert.equal(docs[0].mount,source,'regenerate the frozen QA runtime after changing its canonical sources');
  assert.equal(defaultPriceRows.reduce((count,row)=>count+row.cells.length,0),152);
  for(const document of docs){
    assert.equal(document.qaOnly,true);assert.equal(document.css,fragment.css);assert.ok(document.body.includes(fragment.body));
    assert.equal(document.provenance.mountSha256,sha(document.mount));assert.equal(document.provenance.cssSha256,sha(document.css));
    assert.equal(document.provenance.referenceSha256,sha(JSON.stringify(defaultPriceRows)));
    assert.equal(document.provenance.storage,'per-frame-memory');
    assert.ok(!document.body.includes('pw-page-header'),'R1 owns the outside review shell');
  }
  assert.ok(renderPriceWorkspace('standalone').includes(fragment.css));
  assert.ok(source.includes('window.OrderModalShell=Object.freeze('));
  assert.doesNotMatch(source,/^\s*(?:import|export)\s/m,'opaque frames require no external module imports');
});

test('R1 executes actual consumer percent/KRW modal, blank-base skip, manual override, and isolated save/reload',async()=>{
  const frame=await review('consumer-products'),{control,click,input,row,q,d,submit}=frame;
  try{
    await control.ready;
    assert.equal(d.querySelectorAll('[data-sales-product]').length,160);
    assert.equal(q('[data-product-audience=consumer]').getAttribute('aria-pressed'),'true');
    assert.equal(frame.w.location.origin,'null');
    click('[data-product-audience=store]');assert.equal(d.querySelectorAll('[data-sales-product]').length,160);
    input(row('1번 왕란 30구').querySelector('[data-product-price]'),'8000');
    assert.equal(row('1번 왕란 6구').querySelector('[data-product-price]').value,'');
    click('[data-product-audience=consumer]');
    click(row('1번 왕란 30구').querySelector('[data-consumer-select]'));click(row('1번 왕란 6구').querySelector('[data-consumer-select]'));
    input('#pw-markup-value','10');click('[data-action=consumer-markup]');
    assert.equal(q('#pw-dialog-title').textContent,'소비자 판매가 일괄 변경');
    assert.match(q('.pw-dialog-body').textContent,/1개 적용 · 1개 제외/);assert.match(q('.pw-markup-skipped').textContent,/사업장 판매가 미입력/);
    assert.deepEqual([...frame.w.OrderModalShell.activeIds],['pw-workspace-dialog']);
    assert.equal(q('.pw-dialog').dataset.modalRole,'editor');assert.ok(q('.q4-regular-panel'));
    assert.ok(frame.animations.some(animation=>animation.element.matches('.pw-dialog')&&animation.options.duration>0&&animation.keyframes[0].opacity===0&&animation.keyframes[1].opacity===1),'canonical modal opens through its actual WAAPI fade');
    assert.ok(frame.animations.some(animation=>animation.options.pseudoElement==='::backdrop'));
    submit();await frame.closed();
    assert.equal(row('1번 왕란 30구').querySelector('[data-product-price]').value,'8800');
    assert.equal(row('1번 왕란 6구').querySelector('[data-product-price]').value,'');
    input('#pw-markup-kind','amount','change');input('#pw-markup-value','200');click('[data-action=consumer-markup]');submit();await frame.closed();
    assert.equal(row('1번 왕란 30구').querySelector('[data-product-price]').value,'8200','KRW uplift starts from business price');
    input(row('1번 왕란 30구').querySelector('[data-product-price]'),'9111');
    assert.equal(row('1번 왕란 30구').querySelector('[data-product-mode]').textContent,'직접 입력');
    click('[data-product-audience=store]');input(row('1번 왕란 30구').querySelector('[data-product-price]'),'8100');click('[data-product-audience=consumer]');
    assert.equal(row('1번 왕란 30구').querySelector('[data-product-price]').value,'9111');
    click('[data-action=save]');submit();await frame.closed();await wait(()=>q('#pw-notice').textContent.includes('반영했습니다'),'memory apply');
    assert.equal(control.transport.inspect().revision,1);await control.workspace.reload();
    assert.equal(row('1번 왕란 30구').querySelector('[data-product-price]').value,'9111');
    const persisted=control.transport.inspect().document,consumer=persisted.products.find(product=>product.audience==='consumer'&&product.name==='1번 왕란 30구');
    assert.equal(consumer.markup,undefined);assert.equal(consumer.price,'9111');
    assert.deepEqual(plain(control.transport.inspect().calls.filter(call=>call.method==='POST').map(call=>call.path)),['/workspace']);
    const separate=await review('consumer-products');
    try{await separate.control.ready;assert.equal(separate.row('1번 왕란 30구').querySelector('[data-product-price]').value,'');assert.equal(separate.control.transport.inspect().revision,0);}finally{separate.close();}
  }finally{frame.close();}
});

test('R1 executes actual delivery rule modal, unit conversion, overlap validation, gap and blank fare preservation',async()=>{
  const frame=await review('delivery'),{control,click,input,q,d,submit}=frame;
  try{
    await control.ready;assert.equal(q('#pw-main h2').textContent,'배송수단 및 운임');
    for(const [name,type]of [['QA 택배','parcel'],['QA 화물','freight']]){
      click('[data-action=add-carrier]');input('.pw-dialog [name=name]',name);input('.pw-dialog [name=type]',type,'change');submit();await frame.closed();
      assert.equal(q('[data-carrier-field=base]').value,'');
    }
    const carrier=name=>control.workspace.read().carriers.find(entry=>entry.name===name).id;
    const rule=(unit,min,max,name,fee='')=>{
      click('[data-action=add-delivery-rule]');input('.pw-dialog [name=package]','pack-30');input('.pw-dialog [name=carrier]',carrier(name));
      input('.pw-dialog [name=unit]',unit);input('.pw-dialog [name=min]',String(min));input('.pw-dialog [name=max]',String(max));input('.pw-dialog [name=fee]',fee);
    };
    rule('pack',1,10,'QA 택배','3000');assert.equal(q('.pw-delivery-conversion').textContent,'1~10묶음 · 30~300알');submit();await frame.closed();
    rule('egg',360,660,'QA 화물');assert.equal(q('.pw-delivery-conversion').textContent,'360~660알 · 12~22묶음');submit();await frame.closed();
    rule('egg',300,360,'QA 화물');submit();await wait(()=>q('.pw-dialog-error').textContent.includes('겹칩니다'),'overlap rejection');
    assert.equal(d.querySelectorAll('[data-delivery-rule]').length,2);click('.pw-dialog [data-close]');await frame.closed();
    click('[data-action=save]');submit();await frame.closed();await control.workspace.reload();
    const saved=control.transport.inspect().document,model=createPriceWorkspaceModel(),delivery=quantity=>model.deliveryFor(saved,{shell:'1',grade:'king',package:'pack-30',quantity});
    assert.equal(d.querySelectorAll('[data-delivery-rule]').length,2);assert.equal(delivery(10).fee,3000);assert.equal(delivery(11).status,'unconfigured');assert.equal(delivery(12).fee,null);
    assert.equal(saved.deliveryRules[1].fee,'');assert.equal(saved.carriers[1].base,'');assert.match(d.querySelectorAll('[data-delivery-rule]')[1].textContent,/미입력/);
    assert.ok(frame.animations.some(animation=>animation.element.matches('.pw-dialog')&&animation.keyframes[1].opacity===0),'canonical modal closes with its fade');
  }finally{frame.close();}
});

test('R1 real cost/classification controls update only the QA model',async()=>{
  const frame=await review('classification'),{control,click,input,q}=frame;
  try{
    await control.ready;assert.equal(q('#pw-main h2').textContent,'상품 분류 · 계란');
    click('[data-section=costs]');click('[data-shell="2"]');input('[data-cost=raw]','7000');
    assert.equal(control.workspace.read().costs['2'][0].prices.king.raw,'7000');assert.equal(control.workspace.read().costs['1'][0].prices.king.raw,'5980');
    click('[data-action=add-shell]');input('.pw-dialog [name=number]','5');frame.submit();await frame.closed();
    assert.ok(control.workspace.read().shells.some(shell=>shell.number===5));
    click('[data-section=classification]');click('[data-action=add-pack]');input('.pw-dialog [name=eggs]','8');frame.submit();await frame.closed();
    assert.ok(control.workspace.read().packages.some(pack=>pack.eggs===8));
    click('[data-section=products]');assert.equal(frame.d.querySelectorAll('[data-sales-product]').length,225,'5 environments × 5 grades × 9 packs');
    assert.equal(control.transport.inspect().revision,0,'edits stay unsaved until the real save action');
  }finally{frame.close();}
});

test('R1 loading/error/empty/guest controls never invoke login navigation, operational fetch, or persistent storage',async()=>{
  const loading=await review('loading');
  try{
    await wait(()=>loading.control.transport.inspect().pending===1,'held workspace load');assert.match(loading.q('#pw-main').textContent,/불러오는 중/);assert.equal(loading.q('#pw-main').inert,true);
    loading.root.dispatchEvent(new loading.w.CustomEvent('r3-motion-scenario',{detail:{mode:'complete'}}));
    await wait(()=>loading.d.querySelector('[data-cost]'),'released actual workspace');assert.equal(loading.q('#pw-main').inert,false);
    const held=loading.control.setScenario('loading');await wait(()=>loading.control.transport.inspect().pending===1,'held second load');
    loading.close();await held;assert.equal(loading.control.transport.inspect().pending,0,'disposing a review cancels held responses');
  }catch(error){loading.close();throw error;}
  for(const state of ['error','guest','empty']){
    const frame=await review(state);
    try{
      await frame.control.ready;
      if(state==='empty'){
        assert.equal(frame.d.querySelectorAll('[data-sales-product]').length,160);assert.ok([...frame.d.querySelectorAll('[data-product-price]')].every(input=>input.value===''));
        frame.click('[data-product-audience=store]');assert.ok([...frame.d.querySelectorAll('[data-product-price]')].every(input=>input.value===''));
      }else assert.match(frame.q('#pw-notice').textContent,state==='guest'?/계정 권한/:/저장소에 연결/);
      assert.equal(frame.d.querySelector('#pw-login'),null);assert.equal(frame.w.location.href,'about:blank');
      await frame.control.setScenario('normal');await wait(()=>frame.d.querySelector('[data-cost], [data-product-price]'),'recovered '+state);
      assert.equal(frame.q('#pw-notice').textContent,'','recovering the real request clears the obsolete error state');
      assert.deepEqual(frame.network,[]);
    }finally{frame.close();}
  }
});

test('QA memory transport rejects all external paths and preserves saved versions and idempotent retries',async()=>{
  const transport=createPriceWorkspaceQaTransport(createPriceWorkspaceModel(),defaultPriceRows),initial=await transport.request('/workspace');
  assert.equal((await transport.request('/session')).practiceAllowed,false);
  for(const path of ['https://api.invalid/workspace','/api/ia/r3-price/workspace','//private/workspace','/workspace?account=other','/session?next=/ia/'])await assert.rejects(transport.request(path),/QA_REQUEST_NOT_ALLOWED/);
  const request={action:'apply',expectedRevision:0,requestKey:'12345678-1234-1234-1234-123456789abc',document:initial.document};
  const saved=await transport.request('/workspace',request);assert.equal(saved.saved.revision,1);
  assert.equal((await transport.request('/workspace',request)).saved.revision,1);
  await assert.rejects(transport.request('/workspace',{...request,requestKey:'22345678-1234-1234-1234-123456789abc'}),/REVISION_CONFLICT/);
  const history=await transport.request('/workspace?revision=1');assert.deepEqual(history.document,initial.document);assert.equal(history.effective.revision,1);
  history.document.costs['1'][0].prices.king.raw='1';assert.equal((await transport.request('/workspace')).document.costs['1'][0].prices.king.raw,'5980','reads cannot mutate stored versions');
  transport.destroy();await assert.rejects(transport.request('/workspace'),/QA_TRANSPORT_DISPOSED/);
});
