import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {installProductWorkflowMotion} from '../src/server/product-workflow-motion.mjs';
import {createEvidenceEditor} from '../src/server/r3-evidence-client.mjs';
import {installResearchWorkflowPolish} from '../src/server/research-app/workflow-polish.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {mountAsyncMotion} from '../src/server/r3-async-motion.mjs';
import {readFileSync} from 'node:fs';
import {researchScene} from '../src/server/research-app/page.mjs';
import {mountResearchDrawer} from '../src/server/research-app/drawer.mjs';
const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check,label='response'){const end=Date.now()+3000;while(!check()&&Date.now()<end)await tick();assert.ok(check(),label);}
const button=(root,text)=>[...root.querySelectorAll('button')].find(node=>node.textContent===text);
async function setup(t){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error.message);});
  const dom=new JSDOM('<main id="app"></main>',{url:'https://research.test/ia',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,root=w.document.querySelector('main');
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.fetch=()=>assert.fail('no network');
  w.HTMLElement.prototype.setPointerCapture=()=>{};w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});w.HTMLElement.prototype.getAnimations=()=>[];w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const contexts=new WeakMap();w.HTMLCanvasElement.prototype.getContext=function(){if(!contexts.has(this)){let ink=false;contexts.set(this,{fillStyle:'white',fillRect(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){ink=true;},fillText(){ink=true;},getImageData:()=>({data:new Uint8Array(this.width*this.height*4).fill(ink?64:255)}),createImageData:(a,b)=>({data:new Uint8ClampedArray(a*b*4)}),putImageData(){}});}return contexts.get(this);};
  w.createImageBitmap=async()=>({width:4,height:4,close(){}});
  w.eval('('+installProductWorkflowMotion.toString()+')(window);window.ORDER_EVIDENCE_EDITOR='+createEvidenceEditor.toString()+';');
  w.eval('window.__adapter=('+installQaFixtureAdapter.toString()+')({screen:"signature",state:"empty",fixture:{persona:"buyer"}},'+installProductAdapter.toString()+')');const adapter=w.__adapter;await adapter.ready;
  const installed=installResearchWorkflowPolish(w),motion=mountAsyncMotion(root),owned=[];
  t.after(()=>{for(const dispose of owned.reverse())dispose();installed.destroy();motion.destroy();adapter.fixture.dispose();w.close();assert.deepEqual(errors,[]);});
  return {w,root,adapter,motion,owned,workflow:w.ORDER_WORKFLOW_MOTION};
}
function business(root){root.innerHTML='<section class="business-fields">'+[['business-number','123-45-67890'],['business-name','테스트 사업장'],['owner-name','검수'],['business-sector','음식점업'],['business-type','제과점업']].map(([name,value])=>'<label class="field"><input name="'+name+'" value="'+value+'"></label>').join('')+'<div class="opening-date"><button>개업일</button><output>2020/01/01</output></div></section><button data-action="verify-business">인증하기</button><button data-action="business-next">다음</button>';}
test('business field errors stop requests; a real verification acknowledgement locks the retained fields',async t=>{
  const v=await setup(t);business(v.root);const c=v.workflow.mountBusiness(v.root,{api:{adapter:v.adapter,motion:v.motion}});v.owned.push(c.destroy);
  const number=v.root.querySelector('[name=business-number]');number.value='123';v.root.querySelector('[data-action=verify-business]').click();await tick();assert.equal(number.getAttribute('aria-invalid'),'true');assert.ok(v.root.querySelector('[data-workflow-error] svg'));assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.path==='/business-verifications').length,0);
  number.value='1234567890';v.root.querySelector('[data-action=verify-business]').click();await until(()=>v.root.dataset.businessVerificationId);await tick();assert.equal(v.root.querySelector('[name=business-name]').disabled,true);assert.equal(v.root.querySelector('.opening-date button').disabled,true);assert.equal(v.root.querySelector('.business-fields').inert,true);assert.match(v.root.textContent,/검토용 인증/);assert.doesNotMatch(v.root.textContent,/정보 일치/);
});
test('provider failure offers manual evidence and permits retry without losing submitted business values',async t=>{
  const v=await setup(t);business(v.root);v.adapter.fixture.configure({requests:{'product POST /business-verifications':{scenario:'error',errorCode:'BUSINESS_PROVIDER_UNAVAILABLE',status:503}}});const c=v.workflow.mountBusiness(v.root,{api:{adapter:v.adapter,motion:v.motion}});v.owned.push(c.destroy);const verify=v.root.querySelector('[data-action=verify-business]');verify.click();await until(()=>v.root.querySelector('.research-business-manual'));assert.equal(v.root.querySelector('[name=business-name]').value,'테스트 사업장');assert.equal(v.root.querySelector('.business-fields').hidden,true);assert.equal(verify.disabled,false);
  v.adapter.fixture.configure({requests:{}});verify.click();await until(()=>v.root.dataset.businessVerificationId);assert.equal(v.root.querySelector('.business-fields').hidden,false);assert.equal(v.root.querySelector('.research-business-manual'),null);assert.equal(v.root.querySelector('[name=business-name]').disabled,true);
});
test('completed business form gives the evidence editor sole ownership of its status', async t => {
  const v = await setup(t);
  business(v.root);
  const controller = v.workflow.mountBusiness(v.root, {api: {adapter: v.adapter, motion: v.motion}});
  v.owned.push(controller.destroy);
  v.root.querySelector('[data-action=verify-business]').click();
  await until(() => v.root.querySelector('[data-business-confirmed]'));
  v.root.querySelector('[data-action=business-next]').click();
  const editor = v.root.querySelector('.wf-panel');
  assert.ok(editor);
  const status = editor.querySelector('.wf-status');
  const previousScreenMessage = '검토용 인증 응답입니다. 실제 국세청 인증이 아닙니다.';
  let overwritten = false;

  // Stop a regressed observer before its microtasks can starve the test runner.
  const guard = new v.w.MutationObserver(() => {
    if (status.textContent === previousScreenMessage) {
      overwritten = true;
      controller.destroy();
    }
  });
  guard.observe(status, {childList: true});
  t.after(() => guard.disconnect());
  await tick();
  assert.equal(overwritten, false, 'business observer rewrote the evidence editor status');
  assert.notEqual(status.textContent, previousScreenMessage);
  assert.equal(v.root.querySelector('[data-business-confirmed]'), null);
});
test('an invalid provider response retains the manual business evidence path',async t=>{
  const v=await setup(t);business(v.root);v.adapter.fixture.configure({requests:{'product POST /business-verifications':{scenario:'error',errorCode:'BUSINESS_PROVIDER_RESPONSE_INVALID',status:502}}});const c=v.workflow.mountBusiness(v.root,{api:{adapter:v.adapter,motion:v.motion}});v.owned.push(c.destroy);
  v.root.querySelector('[data-action=verify-business]').click();await until(()=>v.root.querySelector('.research-business-manual'));assert.equal(v.root.dataset.businessVerificationId,undefined);assert.equal(v.root.querySelector('[name=business-name]').value,'테스트 사업장');
  v.root.querySelector('[data-action=business-next]').click();await until(()=>v.root.querySelector('.wf-panel'));
  assert.match(v.root.querySelector('.wf-panel').textContent,/사업자등록증/);assert.equal(v.root.querySelector('.research-workflow-receipt'),null,'manual upload still requires its own saved acknowledgement');
});
test('missing signatures show an icon and shake without changing the base pad or allowing export',async t=>{
  const v=await setup(t),pad=v.workflow.signaturePad();v.root.append(pad.element);v.owned.push(pad.destroy);assert.throws(()=>pad.page(),/서명/);assert.equal(pad.element.getAttribute('aria-invalid'),'true');assert.equal(pad.element.querySelectorAll('[data-workflow-error] svg').length,1);assert.ok(pad.element.classList.contains('is-shaking'));
  const typed=pad.element.querySelector('input');typed.value='확인';typed.dispatchEvent(new v.w.Event('input',{bubbles:true}));assert.equal(pad.element.hasAttribute('aria-invalid'),false);assert.equal(pad.page(),pad.element.querySelector('canvas'));assert.ok(button(pad.element,'다시 하기'));
});
test('the immutable official catalogue populates the original Korean consonant picker only after integrity verification',async t=>{
  const v=await setup(t),bytes=readFileSync(new URL('../public/vendor/research/nts-industry-2025-edfa839b2a2d90fc.json',import.meta.url));let reads=0;
  v.w.fetch=async url=>{assert.equal(url,'/vendor/research/nts-industry-2025-edfa839b2a2d90fc.json');reads++;return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
  const source=await researchScene('business','empty','email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id==='business');v.root.innerHTML=source.html;v.owned.push(module.mount(v.root,'empty',{adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select(){}}));
  const input=v.root.querySelector('[name=business-type]');input.focus();await until(()=>v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.rows.length===1542);input.value='ㄱㅁ';input.dispatchEvent(new v.w.Event('input',{bubbles:true}));assert.ok([...v.root.querySelectorAll('.business-options button')].some(button=>button.textContent==='곡물 및 기타 식량작물 재배업'));assert.equal(v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.sectors.length,20);assert.equal(reads,1);
});
test('real evidence canvases become editable gallery pages and are zeroed on disposal without copying originals',async t=>{
  const v=await setup(t),errors=[];let uploads=0;const dispose=v.w.ORDER_EVIDENCE_EDITOR({container:v.root,caseId:'qa-reprice-case',kind:'reprice',csrf:'qa',onError:message=>errors.push(message),onReceipt:()=>true,fetcher:()=>{uploads++;assert.fail('preview does not upload');}});v.owned.push(dispose);
  const file=v.root.querySelector('input[type=file]'),bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,4,0,0,0,4]);
  Object.defineProperty(file,'files',{value:[{size:24,type:'image/png',name:'safe.png',arrayBuffer:async()=>bytes.buffer}],configurable:true});file.dispatchEvent(new v.w.Event('change',{bubbles:true}));await until(()=>v.root.querySelector('.research-evidence-pages canvas'));
  const canvas=v.root.querySelector('.research-evidence-pages canvas'),section=canvas.parentElement;assert.equal(v.root.querySelectorAll('canvas').length,2,'one document canvas and one signature canvas only');canvas.click();const dialog=v.root.querySelector('dialog');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('canvas'),canvas);button(dialog,'가림 편집').click();assert.equal(dialog.dataset.editing,'true');assert.equal(dialog.querySelector('details').hidden,false);button(dialog,'가림 저장').click();button(dialog,'확대').click();assert.equal(dialog.querySelector('.research-evidence-viewport').dataset.zoom,'true');button(dialog,'닫기').click();assert.equal(canvas.parentElement,section);assert.equal(dialog.open,false);
  canvas.click();dispose();assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(v.root.querySelector('dialog'),null);assert.equal(uploads,0);assert.deepEqual(errors,[]);
});
test('evidence headings and completion text follow the actual attach acknowledgement, with preserved upload retry',async t=>{
  const v=await setup(t),c=v.workflow.mountEvidence(v.root,{api:{screen:'signature',adapter:v.adapter,motion:v.motion},kind:'reprice'});v.owned.push(c.destroy);assert.equal(v.root.querySelector('h2').textContent,'서명이 필요해요');await until(()=>v.root.querySelector('select').options.length);button(v.root,'자료와 서명 준비').click();await until(()=>v.root.querySelector('input[type=file]'));
  const file=v.root.querySelector('input[type=file]'),bytes=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,4,0,0,0,4]);Object.defineProperty(file,'files',{value:[{size:24,type:'image/png',name:'safe.png',arrayBuffer:async()=>bytes.buffer}],configurable:true});file.dispatchEvent(new v.w.Event('change',{bubbles:true}));await until(()=>v.root.querySelector('.research-evidence-pages canvas'));
  const typed=v.root.querySelector('.wf-signature input');typed.value='테스트';typed.dispatchEvent(new v.w.Event('input',{bubbles:true}));v.root.querySelector('input[type=checkbox]').checked=true;
  v.adapter.fixture.configure({requests:{'role POST /evidence':{scenario:'error',status:503}}});const save=button(v.root,'가림 처리본 제출');save.click();await until(()=>/다시 시도/.test(v.root.querySelector('.wf-status').textContent));assert.equal(v.root.querySelector('.research-workflow-receipt'),null);assert.equal(v.root.querySelectorAll('.research-evidence-pages canvas').length,0);
  v.adapter.fixture.configure({requests:{}});save.click();await until(()=>v.root.querySelector('.research-workflow-receipt'));assert.equal(v.root.querySelector('.wf-panel').dataset.success,'true');assert.match(v.root.querySelector('.research-workflow-receipt').textContent,/최대 2영업일 이내/);assert.equal(v.root.querySelector('h2').hidden,true);assert.equal(v.adapter.fixture.inspect().data.cases.find(row=>row.id==='qa-reprice-case').state,'REVIEW');
});

test('connected consultation keeps actual compound cards and shows the requested receipt only after saving the case',async t=>{
  const v=await setup(t),send=v.adapter.roleRequest;
  v.adapter.roleRequest=async(...args)=>{const value=await send(...args);if(args[0]==='/workspace')return {...value,quotes:value.quotes.map(quote=>({...quote,lines:[{productName:'특란',quantity:20,unit:'tray',serviceDate:'2026-12-17'},{productName:'대란',quantity:5,unit:'box',serviceDate:'2026-12-18'}]}))};return value;};
  const source=await researchScene('drawer','closed','email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(module=>module.id==='drawer');const dispose=mountResearchDrawer({container:v.root,scene:{state:'closed',html:source.html,styles:[]},module,api:{mode:'product',adapter:v.adapter,motion:v.motion,reduced:()=>true,select(){}}});v.owned.push(dispose);
  await until(()=>v.root.querySelector('.consult-ticket-detail dt'));assert.equal(v.root.querySelectorAll('.consult-ticket-detail dt').length,2);assert.match(v.root.querySelector('.consult-ticket-detail').textContent,/5상자/);v.root.querySelector('[data-action=consult-ticket-detail]').click();assert.equal(v.root.querySelector('.consult-ticket-detail').hidden,false);
  v.root.querySelector('[name=consult-pass]').click();v.root.querySelector('[data-action=open-drawer]').click();const memo=v.root.querySelector('.consult-memo textarea');memo.value='실제 상담 요청';v.root.querySelector('[name=topic]').checked=true;
  const picker=v.root.querySelector('[data-action=choose-consult-date]');if(picker){picker.click();const day=[...v.root.querySelectorAll('[data-day]')].find(button=>!button.disabled);assert.ok(day);day.click();}else v.root.querySelector('[name=desiredDate]').value='2026-12-17';
  const submit=v.root.querySelector('[data-action=request-booking]');submit.click();await until(()=>v.root.querySelector('.consult-complete'));assert.equal(v.root.querySelector('.consult-complete h2').textContent,'상담을 예약했어요');assert.match(v.root.querySelector('.consult-complete').textContent,/예약시간 확정 후 담당자가 연락드릴 예정이에요/);assert.equal(submit.hidden,true);assert.equal(v.adapter.fixture.inspect().data.cases.find(row=>row.kind==='consult').state,'OPEN');
});
