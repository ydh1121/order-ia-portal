import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {installProductWorkflowMotion} from '../src/server/product-workflow-motion.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {mountAsyncMotion} from '../src/server/r3-async-motion.mjs';
import {createProductUiLab} from './helpers/product-ui-lab.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(predicate,label){const end=performance.now()+3000;while(!predicate()&&performance.now()<end)await tick();assert.ok(predicate(),label);}
function byLabel(root,label){return [...root.querySelectorAll('label')].find(el=>el.firstChild?.textContent.startsWith(label))?.querySelector('input,select,textarea');}
function byText(root,text){return [...root.querySelectorAll('button')].find(b=>b.textContent===text);}

async function setup(t,{screen='receipt',persona='operator',reduced=true,adapter:provided,api={}}={}){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<main id="app"><p data-kept>원래 제품 화면</p></main>',{url:'https://order.test/ia',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,root=w.document.querySelector('#app'),original=root.firstChild,controllers=[],frames=new Map(),animations=[],contexts=new WeakMap();let time=0,sequence=0,network=0,prints=0;
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){}});w.print=()=>prints++;w.fetch=async()=>{network++;throw Error('Fixture must not use external network');};
  w.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);w.performance.now=()=>time;
  w.HTMLElement.prototype.setPointerCapture=function(id){this.__pointer=id;};w.HTMLElement.prototype.getAnimations=function(){return animations.filter(a=>a.element===this&&!a.cancelled);};
  w.HTMLElement.prototype.animate=function(keyframes,options){const a={element:this,keyframes,options,cancelled:false,cancel(){this.cancelled=true;},finished:Promise.resolve()};animations.push(a);return a;};
  w.HTMLCanvasElement.prototype.getContext=function(){if(!contexts.has(this)){const pixels=new Uint8Array(360*100).fill(255),ops=[];let x=0,y=0;const ctx={pixels,ops,fillStyle:'#fff',fillRect(){ops.push('clear');pixels.fill(255);},beginPath(){},moveTo(a,b){x=a;y=b;},lineTo(a,b){x=a;y=b;},stroke(){ops.push('stroke');const at=Math.round(Math.max(0,Math.min(99,y)))*360+Math.round(Math.max(0,Math.min(359,x)));pixels[at]=30;},fillText(text){ops.push('text:'+text);for(let i=0;i<text.length;i++)pixels[36+i]=Math.round(pixels[36+i]*.5);},getImageData(){return {data:pixels.slice()};}};contexts.set(this,ctx);}return contexts.get(this);};
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:360,height:100,right:360,bottom:100});
  w.__root=root;w.eval('window.__workflow=('+installProductWorkflowMotion.toString()+')(window)');
  let adapter=provided;if(!adapter){w.__session={screen,state:screen==='receipt'?'before':'draft',channel:'workflow-test',fixture:{persona}};w.eval('window.__adapter=('+installQaFixtureAdapter.toString()+')(__session,'+installProductAdapter.toString()+')');adapter=w.__adapter;await adapter.ready;}
  adapter.message??=error=>error.userMessage||error.message;
  const requests=[],originalRequest=adapter.request.bind(adapter);adapter.request=(path,body,signal)=>{requests.push({path,body:body?JSON.parse(JSON.stringify(body)):null,signal});return originalRequest(path,body,signal);};
  w.eval('window.__async=('+mountAsyncMotion.toString()+')(__root)');const motion=w.__async;
  const mount=()=>{const c=w.__workflow.mount(root,{screen,adapter,api:{motion,...api}});controllers.push(c);return c;};
  const set=(input,value)=>{input.value=value;input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
  const pointer=(el,type,props={})=>{const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:20,clientY:20,...props});for(const [key,value]of Object.entries({pointerId:1,pointerType:'pen',pressure:.7,...props}))if(['pointerId','pointerType','pressure'].includes(key))Object.defineProperty(e,key,{value});el.dispatchEvent(e);};
  const advance=ms=>{for(let i=0;i<ms;i+=1000/60){time+=1000/60;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));}};
  t.after(()=>{for(const c of controllers)c.destroy?.();motion.destroy();adapter.fixture?.dispose();w.close();assert.equal(network,0);assert.deepEqual(errors,[]);});
  return {w,root,original,adapter,requests,mount,set,pointer,advance,frames,animations,contexts,motion,controls:controllers,workflow:w.__workflow,prints:()=>prints};
}

test('receipt fixture uses the real adapter contract, persists a document, reopens it and preserves both model choices',async t=>{
  for(const persona of ['operator','supplier']){
    const v=await setup(t,{persona}),c=v.mount();await until(()=>!byText(v.root,'영수증 발급').disabled,'paid receipt options');
    const model=byLabel(v.root,'발급 주체'),recipient=byLabel(v.root,'받는 곳');assert.equal(model.value,persona==='operator'?'order-to-business':'supplier-to-site');assert.equal(recipient.options.length,persona==='operator'?2:1);
    if(persona==='operator')v.set(recipient,'supplier');byText(v.root,'영수증 발급').click();await until(()=>v.root.querySelector('.wf-paper'),'server-confirmed receipt paper');
    const stored=v.adapter.fixture.inspect().data.receipts;assert.equal(stored.length,1);assert.equal(stored[0].recipient.kind,persona==='operator'?'supplier':'site');assert.ok(v.root.querySelector('.wf-paper').textContent.includes(stored[0].number));
    const writes=v.requests.filter(r=>r.path==='/receipts'&&r.body);assert.equal(writes.length,1);assert.equal(writes[0].body.model,model.value);assert.equal('paid'in writes[0].body,false);
    await until(()=>!byText(v.root,'다시 열기').disabled,'saved receipt choice');byText(v.root,'다시 열기').click();await until(()=>v.requests.some(r=>r.path==='/receipts/'+stored[0].id),'reopen reads the immutable server document');
    byText(v.root,'인쇄').click();assert.equal(v.prints(),1);assert.equal(v.adapter.fixture.inspect().data.receipts.length,1);
    c.destroy();assert.equal(v.root.firstChild,v.original);
  }
});

test('receipt pending/error/retry keeps the selected request and never shows a previous success as the new outcome',async t=>{
  const v=await setup(t);v.mount();await until(()=>!byText(v.root,'영수증 발급').disabled,'receipt ready');const issue=byText(v.root,'영수증 발급');issue.click();await until(()=>v.root.querySelector('.wf-paper'),'first issue');await until(()=>issue.dataset.asyncPhase==='success','first confirmed success');
  const recipient=byLabel(v.root,'받는 곳');v.set(recipient,'supplier');v.adapter.fixture.configure({requests:{'product POST /receipts':{scenario:'loading'}}});issue.click();await until(()=>v.adapter.fixture.inspect().pending===1,'second issue is held');assert.equal(issue.disabled,true);assert.equal(issue.dataset.asyncPhase,'pending');assert.equal(v.adapter.fixture.inspect().data.receipts.length,1);
  v.adapter.fixture.releasePending({requests:{'product POST /receipts':{scenario:'error',errorCode:'CONTROLLED_FAILURE'}}});await until(()=>issue.dataset.asyncPhase==='error','provider failure replaces the previous success');assert.equal(v.adapter.fixture.inspect().data.receipts.length,1);assert.equal(recipient.value,'supplier');
  v.adapter.fixture.configure({requests:{}});issue.click();await until(()=>v.adapter.fixture.inspect().data.receipts.length===2,'retry creates selected recipient once');
  const writes=v.requests.filter(r=>r.path==='/receipts'&&r.body);assert.equal(writes.length,3);assert.equal(writes[1].body.requestKey,writes[2].body.requestKey);assert.deepEqual(writes[1].body,writes[2].body);
});

test('closing a workflow aborts its pending fixture request and restores the exact original nodes',async t=>{
  const v=await setup(t),c=v.mount();await until(()=>!byText(v.root,'영수증 발급').disabled,'receipt ready');v.adapter.fixture.configure({requests:{'product POST /receipts':{scenario:'loading'}}});byText(v.root,'영수증 발급').click();await until(()=>v.adapter.fixture.inspect().pending===1,'request waiting');const pending=v.requests.find(r=>r.path==='/receipts'&&r.body);c.destroy();assert.equal(pending.signal.aborted,true);await until(()=>v.adapter.fixture.inspect().pending===0,'pending transport cancelled');v.adapter.fixture.releasePending({requests:{}});await tick();assert.equal(v.adapter.fixture.inspect().data.receipts.length,0);assert.equal(v.root.firstChild,v.original);assert.equal(v.root.querySelector('.wf-paper'),null);
});

test('billing numeric keypad, real account selection, draft and issued reload use one document',async t=>{
  const v=await setup(t,{screen:'admin-billing'});const c=v.mount();await until(()=>byLabel(v.root,'청구 계정').options.length,'billing accounts');
  v.set(byLabel(v.root,'청구 내용'),'검수 청구');for(const digit of ['1','2','3','4','5'])byText(v.root,digit).click();byText(v.root,'삭제').click();byText(v.root,'0').click();
  const amount=byLabel(v.root,'금액 직접 입력');assert.equal(amount.value,'12340');assert.equal(v.root.querySelector('.wf-amount').getAttribute('aria-label'),'12,340원');v.set(byLabel(v.root,'납부 기한'),'2026-12-02');v.set(byLabel(v.root,'메모'),'보존할 입력');
  byText(v.root,'임시 저장').click();await until(()=>v.adapter.fixture.inspect().data.billing.length===1,'draft persisted');await until(()=>v.root.querySelector('.wf-status').textContent.includes('임시 저장했어요'),'draft acknowledgement');let item=v.adapter.fixture.inspect().data.billing[0];assert.equal(item.status,'DRAFT');assert.equal(item.amount,12340);assert.equal(item.deliveryStatus,'NOT_SENT');
  byText(v.root,'청구서 발급').click();await until(()=>v.adapter.fixture.inspect().data.billing[0].status==='ISSUED','issue persisted');await until(()=>byLabel(v.root,'청구 내용').disabled,'issued form is immutable');item=v.adapter.fixture.inspect().data.billing[0];assert.equal(item.revision,2);assert.equal(item.paid,0);assert.match(v.root.querySelector('.wf-status').textContent,/발송과 결제는 아직/);
  c.destroy();v.mount();await until(()=>byLabel(v.root,'저장한 청구서').options.length===1,'reload reads issued document');byText(v.root,'불러오기').click();assert.equal(byLabel(v.root,'청구 내용').value,'검수 청구');assert.equal(byLabel(v.root,'금액 직접 입력').value,'12340');assert.equal(byLabel(v.root,'금액 직접 입력').disabled,true);
  byText(v.root,'새 청구').click();assert.equal(byLabel(v.root,'금액 직접 입력').value,'');assert.equal(byLabel(v.root,'청구 내용').disabled,false);
});

test('billing serializes draft/issue while pending and retains failed input and request key for retry',async t=>{
  const v=await setup(t,{screen:'admin-billing'});v.mount();await until(()=>byLabel(v.root,'청구 계정').options.length,'billing accounts');v.set(byLabel(v.root,'청구 내용'),'실패 후 보존');v.set(byLabel(v.root,'금액 직접 입력'),'8300');v.set(byLabel(v.root,'납부 기한'),'2026-12-03');
  const draft=byText(v.root,'임시 저장'),issue=byText(v.root,'청구서 발급');v.adapter.fixture.configure({requests:{'product POST /billing':{scenario:'loading'}}});draft.click();await until(()=>v.adapter.fixture.inspect().pending===1,'draft waiting');issue.click();await tick();assert.equal(v.requests.filter(r=>r.path==='/billing'&&r.body).length,1,'another action cannot replace or race the pending payload');assert.equal(v.adapter.fixture.inspect().data.billing.length,0);
  v.adapter.fixture.releasePending({requests:{'product POST /billing':{scenario:'error',errorCode:'CONTROLLED_FAILURE'}}});await until(()=>draft.dataset.asyncPhase==='error','failed write');assert.equal(byLabel(v.root,'청구 내용').value,'실패 후 보존');assert.equal(byLabel(v.root,'금액 직접 입력').value,'8300');assert.equal(draft.disabled,false);assert.equal(v.adapter.fixture.inspect().data.billing.length,0);
  v.adapter.fixture.configure({requests:{}});draft.click();await until(()=>v.adapter.fixture.inspect().data.billing.length===1,'retry draft');const writes=v.requests.filter(r=>r.path==='/billing'&&r.body);assert.equal(writes.length,2);assert.deepEqual(writes[0].body,writes[1].body);
});

test('the product workflow reads and writes canonical SQLite handlers through the same mount',async t=>{
  const lab=await createProductUiLab();t.after(()=>lab.close());const buyer=lab.adapter('buyer'),operator=lab.adapter('operator'),offer=(await buyer.request('/purchases')).offers[0];
  const purchase=(await buyer.request('/purchases',{action:'create',expectedRevision:0,requestKey:crypto.randomUUID(),offerId:offer.id,quantity:10,paymentMethod:'cash',channel:'store'})).item;
  const paid=(await operator.request('/purchases',{action:'confirm-cash',expectedRevision:1,requestKey:crypto.randomUUID(),id:purchase.id,reference:'WORKFLOW-DOM-TEST'})).item;
  const v=await setup(t,{adapter:operator});v.mount();await until(()=>!byText(v.root,'영수증 발급').disabled,'actual paid purchase loaded');byText(v.root,'영수증 발급').click();await until(()=>v.root.querySelector('.wf-paper'),'actual saved receipt');
  const receipts=(await operator.request('/receipts')).items;assert.equal(receipts.length,1);assert.equal(receipts[0].paid,paid.paid);assert.equal(receipts[0].status,'ISSUED');assert.match(receipts[0].documentDigest,/^[a-f0-9]{64}$/);assert.ok(v.root.querySelector('.wf-paper').textContent.includes(receipts[0].number));
});

test('signature uses captured pointer ink, flushes the spring before export, and ignores other pointers',async t=>{
  const v=await setup(t,{reduced:false}),signal=new v.w.AbortController(),pad=v.workflow.signaturePad({signal:signal.signal});v.controls.push(pad);v.root.append(pad.element);const canvas=pad.element.querySelector('canvas'),ctx=canvas.getContext('2d');assert.throws(()=>pad.page(),/서명/);
  v.pointer(canvas,'pointerdown',{pointerId:1,clientX:10,clientY:10});v.pointer(canvas,'pointermove',{pointerId:1,clientX:120,clientY:50});v.advance(100);assert.equal(pad.element.dataset.ink,'true');
  const previous=ctx.pixels.slice();v.pointer(canvas,'pointermove',{pointerId:2,clientX:350,clientY:95});v.pointer(canvas,'pointerup',{pointerId:1,clientX:120,clientY:50});v.advance(1200);
  const page=pad.page();assert.equal(page,canvas);assert.ok(ctx.ops.includes('stroke'));assert.ok([...ctx.pixels].some(v=>v<255));assert.equal(ctx.pixels[95*360+350],255,'another pointer cannot redirect the captured signature to its position');assert.ok(previous.some(v=>v<255));
  signal.abort();assert.equal(v.frames.size,0);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});

test('typed signature is accessible, replayable byte for byte and clear cannot mutate a locked signature',async t=>{
  const v=await setup(t),signal=new v.w.AbortController();let locked=false;const pad=v.workflow.signaturePad({signal:signal.signal,locked:()=>locked});v.controls.push(pad);v.root.append(pad.element);const typed=byLabel(pad.element,'또는 이름 입력'),canvas=pad.element.querySelector('canvas'),ctx=canvas.getContext('2d');
  v.set(typed,'동의한 사용자');pad.page();const first=ctx.pixels.slice();pad.page();assert.deepEqual(ctx.pixels,first,'retries do not accumulate extra antialias ink');assert.equal(pad.element.dataset.ink,'true');locked=true;byText(pad.element,'다시 하기').click();assert.equal(typed.value,'동의한 사용자');locked=false;byText(pad.element,'다시 하기').click();assert.equal(typed.value,'');assert.throws(()=>pad.page(),/서명/);signal.abort();
});

function businessForm(v){
  v.root.innerHTML='<div class="business-fields"><input name="business-number" value="1234567890"><input name="business-name" value="검수용 사업장"><input name="owner-name" value="검수 담당자"><input name="business-sector" value="검수 업태"><input name="business-type" value="검수 종목"></div><div class="opening-date"><button type="button">개업일</button><output>2020/01/02</output></div><button data-action="verify-business">인증하기</button><button data-action="business-next">다음</button>';
}

test('business QA labels its verification and changing the date cannot reopen a stale case by pressing Next twice',async t=>{
  const v=await setup(t,{screen:'business',persona:'buyer'});businessForm(v);let opened=0;v.w.ORDER_EVIDENCE_EDITOR=()=>{opened++;return()=>{};};
  const c=v.workflow.mountBusiness(v.root,{api:{adapter:v.adapter,motion:v.motion}});v.controls.push(c);v.root.querySelector('[data-action=verify-business]').click();await until(()=>v.root.dataset.businessVerificationId,'fixture verification completed');
  assert.match(v.root.querySelector('.wf-status').textContent,/검토용 인증 결과/);assert.match(v.root.querySelector('.wf-status').textContent,/실제 국세청 조회가 아니/);assert.equal(v.adapter.fixture.inspect().data.businessVerifications.length,1);
  const output=v.root.querySelector('.opening-date output');output.textContent='2021/02/03';output.dispatchEvent(new v.w.Event('change',{bubbles:true}));
  assert.equal(v.root.dataset.businessVerificationId,undefined,'stale verification identity is removed with the edited input');const next=v.root.querySelector('[data-action=business-next]');next.click();next.click();await tick();await tick();
  assert.ok(v.root.querySelector('.business-fields'),'the old case is not attached after an informational message changes');assert.equal(opened,0);assert.equal(v.adapter.fixture.inspect().data.businessVerifications.length,1);
});

test('provider failure preserves business inputs and manual evidence receives the existing case and selected files',async t=>{
  const v=await setup(t,{screen:'business',persona:'buyer'});businessForm(v);let editorOptions=null;v.w.ORDER_EVIDENCE_EDITOR=options=>{editorOptions=options;return()=>{};};const selected=new v.w.File(['synthetic'],'registration.png',{type:'image/png'});v.root.__orderSelectedFiles=[selected];
  v.adapter.fixture.configure({requests:{'product POST /business-verifications':{scenario:'error',errorCode:'BUSINESS_PROVIDER_UNAVAILABLE'}}});const c=v.workflow.mountBusiness(v.root,{api:{adapter:v.adapter,motion:v.motion}});v.controls.push(c);v.root.querySelector('[data-action=verify-business]').click();await until(()=>v.root.querySelector('[data-action=verify-business]').dataset.asyncPhase==='error','verification failure');
  assert.equal(v.root.querySelector('[name=business-number]').value,'1234567890');assert.equal(v.root.querySelector('[name=owner-name]').value,'검수 담당자');assert.equal(v.adapter.fixture.inspect().data.businessVerifications.length,0);
  v.root.querySelector('[data-action=business-next]').click();await until(()=>editorOptions,'manual evidence editor opened');assert.equal(editorOptions.kind,'business');assert.ok(editorOptions.caseId);assert.equal(editorOptions.initialFiles[0],selected);assert.equal(editorOptions.readOnly,false);
});
