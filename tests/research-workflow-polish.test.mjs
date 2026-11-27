import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {installProductWorkflowMotion,productWorkflowMotionCss} from '../src/server/product-workflow-motion.mjs';
import {createEvidenceEditor} from '../src/server/r3-evidence-client.mjs';
import {installResearchWorkflowPolish} from '../src/server/research-app/workflow-polish.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {mountAsyncMotion} from '../src/server/r3-async-motion.mjs';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {cssGzip} from '../src/server/product-ui/catalog.gen.mjs';
import {sharedCoreScript} from '../src/server/product-ui/assets.gen.mjs';
import {researchScene} from '../src/server/research-app/page.mjs';
import {mountResearchDrawer,mountConsultationPassDetail} from '../src/server/research-app/drawer.mjs';
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
  const contexts=new WeakMap();w.HTMLCanvasElement.prototype.getContext=function(){if(!contexts.has(this)){let ink=false;contexts.set(this,{fillStyle:'white',fillRect(){ink=false;},drawImage(source,...rect){this.draw={source,rect};ink=source?.getContext?.('2d')?.getImageData?.().data?.some(value=>value<180)||false;},beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},stroke(){ink=true;},fillText(){ink=true;},getImageData:()=>({data:new Uint8Array(this.width*this.height*4).fill(ink?64:255)}),createImageData:(a,b)=>({data:new Uint8ClampedArray(a*b*4)}),putImageData(){}});}return contexts.get(this);};
  w.createImageBitmap=async()=>({width:4,height:4,close(){}});
  w.eval(sharedCoreScript);w.eval('('+installProductWorkflowMotion.toString()+')(window);window.ORDER_EVIDENCE_EDITOR='+createEvidenceEditor.toString()+';');
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
  v.adapter.fixture.configure({requests:{}});verify.click();await until(()=>v.root.dataset.businessVerificationId);assert.equal(v.root.querySelector('.business-fields').hidden,true);assert.equal(v.root.querySelector('.research-business-manual'),null);assert.equal(v.root.querySelector('[name=business-name]').disabled,true);
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
test('missing signatures use the shared CircleAlert and shake without changing the base pad or allowing export',async t=>{
  const v=await setup(t),sharedIcon=v.w.QAUI.icon,iconCalls=[];v.w.QAUI.icon=(...args)=>{iconCalls.push(args);return sharedIcon(...args);};
  const pad=v.workflow.signaturePad();v.root.append(pad.element);v.owned.push(pad.destroy);assert.throws(()=>pad.page(),/서명/);assert.equal(pad.element.getAttribute('aria-invalid'),'true');assert.equal(pad.element.querySelectorAll('[data-workflow-error] svg').length,1);assert.deepEqual(iconCalls,[['alert',18]]);const expectedIcon=v.w.document.createElement('span');expectedIcon.innerHTML=sharedIcon('alert',18);assert.equal(pad.element.querySelector('[data-workflow-error] svg').outerHTML,expectedIcon.firstElementChild.outerHTML);assert.ok(pad.element.classList.contains('is-shaking'));
  const feedback=pad.element.querySelector('[data-workflow-error]'),alternative=pad.element.querySelector('.research-signature-alternative'),summary=alternative.querySelector('summary');summary.dispatchEvent(new v.w.Event('pointerdown',{bubbles:true}));assert.equal(pad.element.querySelector('[data-workflow-error]'),feedback,'opening the alternate method must retain feedback and page height until the click');summary.click();assert.equal(alternative.open,true);assert.equal(pad.element.querySelector('[data-workflow-error]'),feedback);
  const typed=pad.element.querySelector('input');typed.value='확인';typed.dispatchEvent(new v.w.Event('input',{bubbles:true}));assert.equal(pad.element.hasAttribute('aria-invalid'),false);const submission=pad.page(),canvas=pad.element.querySelector('canvas');assert.notEqual(submission,canvas);assert.deepEqual([submission.width,submission.height],[360,100]);assert.deepEqual([canvas.width,canvas.height],[342,190]);assert.equal(submission.isConnected,false);const drawing=submission.getContext('2d').draw;assert.equal(drawing.source,canvas);assert.equal(drawing.rect[6]/drawing.rect[2],drawing.rect[7]/drawing.rect[3],'the server export must preserve the displayed strokes’ aspect ratio');assert.equal(pad.page(),submission,'the same export canvas is retained');assert.ok(button(pad.element,'다시 하기'));
});
test('the immutable official catalogue populates the original Korean consonant picker only after integrity verification',async t=>{
  const v=await setup(t),bytes=readFileSync(new URL('../public/vendor/research/nts-industry-2025-edfa839b2a2d90fc.json',import.meta.url));let reads=0;
  v.w.fetch=async url=>{assert.equal(url,'/vendor/research/nts-industry-2025-edfa839b2a2d90fc.json');reads++;return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
  const source=await researchScene('business','empty','email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id==='business');v.root.innerHTML=source.html;v.owned.push(module.mount(v.root,'empty',{adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select(){}}));
  const input=v.root.querySelector('[name=business-type]');input.focus();await until(()=>v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.rows.length===1542);input.value='ㄱㅁ';input.dispatchEvent(new v.w.Event('input',{bubbles:true}));assert.ok([...v.root.querySelectorAll('.business-options button')].some(button=>button.textContent==='곡물 및 기타 식량작물 재배업'));assert.equal(v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.sectors.length,20);assert.equal(reads,1);
});
test('business entry keeps native values and selection while focused prompts and digit slots lead to a separate verified upload step',async t=>{
  const v=await setup(t),bytes=readFileSync(new URL('../public/vendor/research/nts-industry-2025-edfa839b2a2d90fc.json',import.meta.url));
  v.w.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  const source=await researchScene('business','empty','email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id==='business');v.root.innerHTML=source.html;v.owned.push(module.mount(v.root,'empty',{adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select(){}}));
  const originalUpload=v.root.querySelector('.document-section'),file=originalUpload.querySelector('input[type=file]'),number=v.root.querySelector('[name=business-number]');
  assert.equal(originalUpload.hidden,true);assert.equal(file.disabled,true);assert.equal(v.root.querySelectorAll('.required-star').length,0);
  number.focus();number.value='1234';number.dispatchEvent(new v.w.Event('input',{bubbles:true}));assert.equal(number.value,'123-4');
  const mask=v.root.querySelector('.research-business-number-mask');assert.equal(mask.hidden,false);assert.equal(mask.textContent,'123-4□-□□□□□');assert.equal(mask.getAttribute('aria-hidden'),'true');
  number.setSelectionRange(2,2);v.w.dispatchEvent(new v.w.Event('resize'));assert.equal(number.selectionStart,2);assert.equal(number.selectionEnd,2);assert.equal(number.value,'123-4');
  const fields=[['business-name','상호명을 입력해주세요'],['owner-name','대표자명을 입력해주세요'],['business-sector','업태를 입력해주세요'],['business-type','업종을 입력해주세요']];
  for(const [name,prompt]of fields){const input=v.root.querySelector('[name="'+name+'"]'),before=input.placeholder;input.focus();assert.equal(input.placeholder,prompt);input.blur();assert.equal(input.placeholder,before);}
  assert.equal(mask.hidden,true);await until(()=>v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.rows.length===1542);
  assert.equal(v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.sectors[0],'숙박 및 음식점업');assert.equal(v.w.ORDER_RESEARCH_WORKFLOW_POLISH.businessClasses.industries[0],'제과점업');assert.equal(v.root.querySelector('[data-business-classification]'),null);
  for(const [name,value]of [['business-number','123-45-67890'],['business-name','테스트 사업장'],['owner-name','검수'],['business-sector','음식점업'],['business-type','제과점업']])v.root.querySelector('[name="'+name+'"]').value=value;
  const next=v.root.querySelector('[data-action=business-next]');assert.equal(next.hidden,true);v.root.querySelector('[data-action=verify-business]').click();await until(()=>v.root.dataset.businessVerificationId);await tick();assert.equal(next.hidden,false);assert.equal(next.textContent,'사업자등록증 제출');assert.equal(originalUpload.hidden,true);
  next.click();await until(()=>v.root.querySelector('.research-evidence-settings'));assert.equal(originalUpload.isConnected,false);assert.ok(v.root.querySelector('.research-evidence-page.business-page'));assert.equal(v.root.querySelector('input[type=file]').multiple,false);assert.equal(v.root.querySelector('.wf-signature'),null);
});
for(const state of ['document','verified'])test('business/'+state+' preview separates verification from working document upload',async t=>{
  const v=await setup(t),source=await researchScene('business',state,'email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);
  const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id==='business');v.root.innerHTML=source.html;
  const before=v.adapter.fixture.inspect().data.cases,dispose=module.mount(v.root,state,{screen:'business',reviewScenario:true,adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select(){}});
  if(state==='verified'){assert.equal(v.root.querySelector('.business-fields').hidden,true);assert.equal(v.root.querySelector('.document-section').hidden,true);assert.ok(v.root.querySelector('[data-business-confirmed]'));button(v.root,'사업자등록증 제출').click();}
  await until(()=>v.root.querySelector('.research-evidence-settings'));assert.equal(v.root.querySelector('.business-fields'),null);assert.equal(v.root.querySelector('[data-action=verify-business]'),null);assert.equal(v.root.querySelector('input[type=file]').multiple,false);assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.method==='POST').length,0);dispose();assert.deepEqual(v.adapter.fixture.inspect().data.cases,before);
});
test('unavailable business inspection has two-line guidance and retries entry without the unrelated case link or premature upload',async t=>{
  const v=await setup(t),source=await researchScene('business','unavailable','email'),navigation=[];v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id==='business');v.root.innerHTML=source.html;v.owned.push(module.mount(v.root,'unavailable',{adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select:(...args)=>navigation.push(args)}));
  assert.equal(v.root.querySelector('[data-action=open-case-business]'),null);assert.equal(v.root.querySelector('.document-section').hidden,true);assert.equal(v.root.querySelector('.business-message.info>span').textContent,'사업자 조회에 연결하지 못했어요.\n잠시 후 다시 시도해 주세요.');button(v.root,'다시 시도').click();assert.deepEqual(navigation,[['business','empty']]);assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.path==='/business-verifications').length,0);
});
test('one existing evidence case opens its real editor in document-preview-signature-consent order without a submission',async t=>{
  const v=await setup(t),before=JSON.stringify(v.adapter.fixture.inspect().data.cases),c=v.workflow.mountEvidence(v.root,{api:{screen:'proof',adapter:v.adapter,motion:v.motion},kind:'reprice'});v.owned.push(c.destroy);await until(()=>v.root.querySelector('.research-evidence-settings'));
  const panel=v.root.querySelector('.research-evidence-page.proof-page'),settings=panel.querySelector('.research-evidence-settings'),children=[...settings.children],upload=settings.querySelector('.research-file-drop'),pages=settings.querySelector('.research-evidence-pages'),signature=settings.querySelector('.wf-signature'),consent=settings.querySelector(':scope > label>input[type=checkbox]').parentElement,save=settings.querySelector('[data-evidence-submit]');
  assert.ok(children.indexOf(upload)<children.indexOf(pages));assert.ok(children.indexOf(pages)<children.indexOf(signature));assert.ok(children.indexOf(signature)<children.indexOf(consent));assert.ok(children.indexOf(consent)<children.indexOf(save));assert.equal(panel.querySelector('select').closest('.wf-field').hidden,true);assert.equal(button(panel,'자료와 서명 준비').hidden,true);assert.equal(JSON.stringify(v.adapter.fixture.inspect().data.cases),before);assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.path==='/evidence').length,0);
});
test('live evidence controls reuse shared button paint while memo count, preview and signature reset keep their original actions',async t=>{
  const v=await setup(t);v.root.classList.add('ds');
  const core=v.w.document.createElement('style');core.textContent=gunzipSync(Buffer.from(cssGzip,'base64')).toString()+productWorkflowMotionCss;v.w.document.head.prepend(core);
  const source=await researchScene('proof','selected','email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);
  const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id==='proof');v.root.innerHTML=source.html;
  v.owned.push(module.mount(v.root,'selected',{screen:'proof',reviewScenario:true,adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select(){}}));
  const originalMemo=v.root.querySelector('[name=document-memo]');
  await until(()=>v.root.querySelector('.research-evidence-page')?.dataset.reviewReady==='true');
  const memo=v.root.querySelector('[name=document-memo]'),meter=v.root.querySelector('.memo-meter'),progress=meter.querySelector('progress');
  assert.equal(memo,originalMemo);assert.equal(memo.maxLength,4000);assert.equal(memo.closest('.field.is-floating').htmlFor,memo.id);assert.equal(memo.closest('.input-shell.is-multiline').querySelector('textarea'),memo);assert.equal(v.w.document.getElementById(memo.getAttribute('aria-labelledby')).textContent,'추가 요청 · 선택');assert.ok(v.w.document.getElementById(memo.getAttribute('aria-describedby')));
  const meterStyle=v.w.getComputedStyle(meter),progressStyle=v.w.getComputedStyle(progress);
  assert.equal(meterStyle.display,'flex');assert.equal(meterStyle.justifyContent,'flex-end');assert.equal(meterStyle.gap,'12px');
  assert.equal(progressStyle.width,'80px');assert.equal(progressStyle.height,'6px');
  memo.value='계란 🥚';memo.dispatchEvent(new v.w.Event('input',{bubbles:true}));
  assert.equal(progress.value,3);assert.equal(meter.querySelector('output').textContent,'497자 남음');
  const preview=button(v.root,'크게 보기'),pad=v.root.querySelector('.wf-signature'),clear=button(pad,'다시 하기'),typed=pad.querySelector('input'),canvas=pad.querySelector('canvas');
  for(const control of [preview,clear]){
    const paint=v.w.getComputedStyle(control);assert.equal(paint.minHeight,'44px');assert.equal(paint.borderTopWidth,'0px');assert.equal(paint.display,'inline-flex');
  }
  assert.equal(typed.closest('details').open,false);assert.equal(clear.parentElement.classList.contains('signature-label'),true);assert.equal(canvas.width,342);assert.equal(canvas.height,190);
  preview.click();assert.equal(v.root.querySelector('.research-evidence-viewer').open,true);
  button(v.root.querySelector('.research-evidence-viewer'),'닫기').click();assert.equal(v.root.querySelector('.research-evidence-viewer').open,false);
  assert.equal(pad.hidden,true);button(v.root,'다음').click();assert.equal(pad.hidden,false);assert.equal(v.root.querySelector('.research-evidence-page').dataset.evidenceStep,'signature');
  v.root.querySelector('[data-evidence-submit]').click();assert.equal(pad.getAttribute('aria-invalid'),'true');assert.match(pad.querySelector('[data-workflow-error]').textContent,/서명/);assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.method==='POST').length,0);
  typed.closest('details').open=true;typed.value='검토';typed.dispatchEvent(new v.w.Event('input',{bubbles:true}));assert.equal(pad.dataset.ink,'true');clear.click();
  assert.equal(typed.value,'');assert.equal(pad.dataset.ink,'false');assert.equal(pad.querySelector('canvas'),canvas);
  button(v.root,'자료 수정').click();assert.equal(v.root.querySelector('.research-evidence-page').dataset.evidenceStep,'proof');assert.equal(pad.hidden,true);assert.equal(v.root.querySelector('[name=document-memo]'),memo);assert.equal(memo.value,'계란 🥚');assert.equal(progress.value,3);
  assert.equal(v.root.querySelector('.research-evidence-pages canvas'),preview.parentElement.querySelector('canvas'));assert.equal(v.root.querySelector('.wf-signature canvas'),canvas);
  assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.method==='POST').length,0);
});
for(const [screen,states]of [['proof',['empty','selected','oversize','format','checking','blocked','error','ready']],['signature',['empty','drawn','missing','processing','done']]])for(const state of states)test('explicit '+screen+'/'+state+' review uses the real editor without a submission or changed case',async t=>{
  const v=await setup(t),before=JSON.stringify(v.adapter.fixture.inspect().data.cases),source=await researchScene(screen,state,'email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(row=>row.id===screen);v.root.innerHTML=source.html;v.owned.push(module.mount(v.root,state,{screen,reviewScenario:true,adapter:v.adapter,motion:v.motion,reduced:()=>true,toast(){},select(){}}));
  await until(()=>v.root.querySelector('.research-evidence-page')?.dataset.reviewReady==='true',screen+'/'+state+' review ready');
  const panel=v.root.querySelector('.research-evidence-page'),settings=panel.querySelector('.research-evidence-settings');assert.equal(panel.dataset.reviewScenario,screen+'/'+state);assert.equal(panel.dataset.success,undefined);assert.equal(panel.dataset.reviewOnly,'true');assert.ok(settings);
  if(screen==='proof'&&['oversize','format','blocked','error'].includes(state)){assert.equal(panel.querySelector('.wf-status').dataset.error,'true');assert.match(panel.querySelector('.wf-status').textContent,/다시/);}
  if(screen==='proof'&&['selected','checking','ready'].includes(state))assert.equal(settings.querySelectorAll('.research-evidence-pages canvas').length,1);
  if(screen==='signature'&&state==='missing'){assert.equal(settings.querySelector('.wf-signature').getAttribute('aria-invalid'),'true');assert.ok(settings.querySelector('[data-workflow-error] svg'));}
  if(screen==='signature'&&['drawn','processing'].includes(state))assert.equal(settings.querySelector('.wf-signature').dataset.ink,'true');
  if(state==='processing'||state==='checking')assert.equal(button(settings,'가림 처리본 제출')?.getAttribute('aria-busy')||settings.querySelector('button[aria-busy=true]')?.getAttribute('aria-busy'),'true');
  const receipt=panel.querySelector('.research-workflow-receipt');assert.equal(Boolean(receipt),screen==='signature'&&state==='done');if(receipt){assert.equal(receipt.dataset.reviewOnly,'true');assert.equal(receipt.getAttribute('aria-label'),'검토용 접수 예시');assert.match(receipt.textContent,/최대 2영업일/);}
  assert.equal(JSON.stringify(v.adapter.fixture.inspect().data.cases),before);assert.equal(v.adapter.fixture.inspect().calls.filter(call=>call.method==='POST').length,0);
});
test('a done route cannot create a receipt without an explicit dummy review scenario',async t=>{
  const v=await setup(t),c=v.workflow.mountEvidence(v.root,{api:{screen:'signature',reviewScenario:false,adapter:v.adapter,motion:v.motion},state:'done',kind:'reprice'});v.owned.push(c.destroy);await until(()=>v.root.querySelector('.research-evidence-settings'));assert.equal(v.root.querySelector('.research-workflow-receipt'),null);assert.equal(v.root.querySelector('.wf-panel').dataset.reviewOnly,undefined);assert.equal(v.root.querySelector('.wf-panel').dataset.success,undefined);
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
  v.adapter.fixture.configure({requests:{'role POST /evidence':{scenario:'error',status:503}}});const save=v.root.querySelector('[data-evidence-submit]');save.click();await until(()=>/다시 시도/.test(v.root.querySelector('.wf-status').textContent));assert.equal(v.root.querySelector('.research-workflow-receipt'),null);assert.equal(v.root.querySelectorAll('.research-evidence-pages canvas').length,0);
  v.adapter.fixture.configure({requests:{}});save.click();await until(()=>v.root.querySelector('.research-workflow-receipt'));assert.equal(v.root.querySelector('.wf-panel').dataset.success,'true');assert.match(v.root.querySelector('.research-workflow-receipt').textContent,/최대 2영업일 이내/);assert.equal(v.root.querySelector('h2').hidden,true);assert.equal(v.adapter.fixture.inspect().data.cases.find(row=>row.id==='qa-reprice-case').state,'REVIEW');
});

test('connected consultation keeps actual compound cards and shows the requested receipt only after saving the case',async t=>{
  const v=await setup(t),send=v.adapter.roleRequest;
  v.adapter.roleRequest=async(...args)=>{const value=await send(...args);if(args[0]==='/workspace')return {...value,quotes:value.quotes.map(quote=>({...quote,lines:[{productName:'특란',quantity:20,unit:'tray',serviceDate:'2026-12-17'},{productName:'대란',quantity:5,unit:'box',serviceDate:'2026-12-18'}]}))};return value;};
  const source=await researchScene('drawer','closed','email');v.w.ORDER_DESIGN_MODULES=[];v.w.eval(source.mount);const module=v.w.ORDER_DESIGN_MODULES.find(module=>module.id==='drawer');const dispose=mountResearchDrawer({container:v.root,scene:{state:'closed',html:source.html,styles:[]},module,api:{mode:'product',adapter:v.adapter,motion:v.motion,reduced:()=>true,select(){}}});v.owned.push(dispose);
  await until(()=>v.root.querySelector('.consult-ticket-detail .ticket-item'));assert.equal(v.root.querySelectorAll('.consult-ticket-detail .ticket-item').length,2);assert.match(v.root.querySelector('.consult-ticket-detail').textContent,/5상자/);
  const opener=v.root.querySelector('[data-action=consult-ticket-detail]'),card=opener.closest('.consult-ticket'),detail=card.querySelector('.consult-ticket-detail');opener.click();
  const dialog=v.root.querySelector('.consult-pass-dialog');assert.equal(dialog.open,true);assert.equal(dialog.querySelector('.ticket-detail'),detail.querySelector('.ticket-detail'));assert.equal(detail.hidden,false);assert.equal(card.style.visibility,'hidden');assert.equal(dialog.dataset.motion,'open','reduced motion opens without a flight');
  dialog.querySelector('.consult-pass-close').click();assert.equal(dialog.open,false);assert.equal(detail.parentNode,card);assert.equal(detail.hidden,true);assert.equal(v.w.document.activeElement,opener);
  v.root.querySelector('[name=consult-pass]').click();v.root.querySelector('[data-action=open-drawer]').click();const memo=v.root.querySelector('.consult-memo textarea');memo.value='실제 상담 요청';v.root.querySelector('[name=topic]').checked=true;
  const picker=v.root.querySelector('[data-action=choose-consult-date]');if(picker){picker.click();const day=[...v.root.querySelectorAll('[data-day]')].find(button=>!button.disabled);assert.ok(day);day.click();}else v.root.querySelector('[name=desiredDate]').value='2026-12-17';
  const submit=v.root.querySelector('[data-action=request-booking]');submit.click();await until(()=>v.root.querySelector('.consult-complete'));assert.equal(v.root.querySelector('.consult-complete h2').textContent,'상담을 예약했어요');assert.match(v.root.querySelector('.consult-complete').textContent,/예약시간 확정 후 담당자가 연락드릴 예정이에요/);assert.equal(submit.hidden,true);assert.equal(v.adapter.fixture.inspect().data.cases.find(row=>row.kind==='consult').state,'OPEN');
});

test('consultation pass expands from the selected card and shrinks back without replacing the retained selection or booking draft',async t=>{
  const v=await setup(t);v.w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  v.root.innerHTML='<article class="consult-ticket"><label><input name="consult-pass" type="checkbox" checked><span>사업장</span></label><button data-action="consult-ticket-detail" aria-expanded="false">패스 상세</button><section class="consult-ticket-detail" hidden><article class="nav-ticket ticket-detail"><h2>사업장</h2><div class="ticket-item">특란 · 20판</div><div class="ticket-item">대란 · 5상자</div></article></section></article><label><input name="topic" type="checkbox" checked>수량</label><textarea>유지할 상담 메모</textarea><input name="desiredDate" value="2026-12-17">';
  const card=v.root.querySelector('.consult-ticket'),opener=card.querySelector('button'),detail=card.querySelector('.consult-ticket-detail'),ticket=detail.querySelector('.ticket-detail'),memo=v.root.querySelector('textarea'),selection=card.querySelector('input'),topic=v.root.querySelector('[name=topic]');
  card.getBoundingClientRect=()=>({left:24,top:460,width:290,height:128});ticket.getBoundingClientRect=()=>({left:16,top:200,width:358,height:320});
  const flights=[];ticket.animate=(frames,timing)=>{let resolve;const job={frames,timing,cancelled:false,finished:new Promise(done=>{resolve=done;}),cancel(){job.cancelled=true;},finish(){resolve();}};flights.push(job);return job;};
  const controller=new v.w.AbortController(),viewer=mountConsultationPassDetail(v.root,{signal:controller.signal});v.owned.push(viewer.destroy);
  opener.click();const dialog=v.root.querySelector('dialog');assert.equal(dialog.open,true);assert.equal(dialog.dataset.motion,'opening');assert.equal(flights.length,1);
  assert.equal(flights[0].frames[0].transform,'translate(8px,260px) scale('+290/358+','+128/320+')');assert.equal(flights[0].frames[1].transform,'none');
  flights[0].finish();await tick();assert.equal(dialog.dataset.motion,'open');assert.equal(flights[0].cancelled,true);
  dialog.querySelector('button').click();assert.equal(dialog.dataset.motion,'closing');assert.equal(dialog.open,true);assert.equal(flights.length,2);assert.equal(flights[1].frames[1].transform,flights[0].frames[0].transform);
  flights[1].finish();await tick();assert.equal(dialog.open,false);assert.equal(card.style.visibility,'');assert.equal(detail.parentNode,card);assert.equal(detail.hidden,true);assert.equal(v.w.document.activeElement,opener);
  assert.equal(v.root.querySelector('textarea'),memo);assert.equal(memo.value,'유지할 상담 메모');assert.equal(selection.checked,true);assert.equal(topic.checked,true);assert.equal(v.root.querySelector('[name=desiredDate]').value,'2026-12-17');
  opener.click();const opening=flights.at(-1);dialog.dispatchEvent(new v.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(opening.cancelled,true);assert.equal(dialog.dataset.motion,'closing');flights.at(-1).finish();await tick();assert.equal(dialog.open,false);
  opener.click();controller.abort();assert.equal(v.root.querySelector('dialog'),null);assert.equal(card.style.visibility,'');assert.equal(detail.parentNode,card);assert.equal(memo.value,'유지할 상담 메모');assert.equal(v.adapter.fixture.inspect().calls.some(call=>call.method==='POST'),false);
});
