import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {getProductAuthSheetBootstrap} from '../src/server/product-auth-sheet.mjs';
import {getProductUiBootstrap} from '../src/server/product-ui/bootstrap.mjs';
import {sharedCoreScript,commonMotionScript} from '../src/server/product-ui/assets.gen.mjs';
import {cssGzip} from '../src/server/product-ui/catalog.gen.mjs';
import {researchAuthSheetSource} from '../src/server/research-app/auth-sheet-source.mjs';
import {researchInputMotionSource} from '../src/server/research-app/input-polish-source.mjs';
import {researchAuthPolishCss} from '../src/server/research-app/auth-polish.mjs';
import {researchGoogleSignInButton} from '../src/server/research-app/auth-provider-assets.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const canonical=await getProductAuthSheetBootstrap();

async function setup(t,{review=true,state='guest-2',authState,performAction=async()=>({confirmed:false}),reduced=true}={}){
  const errors=[],navigation=[],calls=[],animations=[];
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error.message);});
  const dom=new JSDOM('<!doctype html><main id="order-single" class="ds"><section id="parent"><button id="opener">시작하기</button></section></main>',{runScripts:'outside-only',url:'https://research.example/ia',pretendToBeVisual:true,virtualConsole});
  const w=dom.window,root=w.document.querySelector('main');
  let now=Date.parse('2026-11-23T00:00:00Z'),serial=0;
  const timers=new Map();
  w.Date.now=()=>now;
  const epoch=now;w.performance.now=()=>now-epoch;
  w.setTimeout=(callback,delay=0)=>{const id=++serial;timers.set(id,{at:now+Math.max(0,Number(delay)||0),callback});return id;};
  w.clearTimeout=id=>timers.delete(id);
  w.requestAnimationFrame=callback=>w.setTimeout(()=>callback(w.performance.now()),16);w.cancelAnimationFrame=id=>w.clearTimeout(id);
  const advance=async ms=>{const end=now+ms;let iterations=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(++iterations<5000,'timers settle');now=next[1].at;timers.delete(next[0]);next[1].callback();await flush();}now=end;await flush();};
  w.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.HTMLElement.prototype.animate=function(frames,options){animations.push({target:this,frames,options});return {finished:Promise.resolve(),cancel(){},pause(){},play(){}};};
  w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText(value){return {width:Array.from(value).length*8};}});
  // Parser mechanics are exercised with the actual engine by research-application
  // and research-regular-services. Here its narrow interface isolates auth UI.
  w.OrderEmail={parse:value=>({valid:/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)})};
  const style=w.document.createElement('style');style.textContent=gunzipSync(Buffer.from(cssGzip,'base64')).toString()+getProductUiBootstrap().css+canonical.css+researchAuthPolishCss;w.document.head.append(style);
  w.eval(sharedCoreScript);w.eval(commonMotionScript);w.eval(researchInputMotionSource(getProductUiBootstrap().script));w.eval(researchAuthSheetSource(canonical.script));
  const adapter={fixture:true};
  const api={mode:'product',interactive:true,reviewScenario:review,reduced:()=>reduced,authState,adapter,
    select(...args){navigation.push(args);},
    performAction(action,detail){calls.push({action,email:detail.root.querySelector('[name=email]')?.value,emailReadOnly:detail.root.querySelector('[name=email]')?.readOnly,password:detail.root.querySelector('[name=password]')?.value,marketing:detail.root.querySelector('[name=marketing-consent]')?.checked});return performAction(action,detail);},
    async loadPolicy(id){return {id,status:'fixture',fixture:{kind:'dummy',commercial:false},version:'review-v1',title:'검토용 약관',sections:Array.from({length:5},(_,i)=>({id:'section-'+i,title:'본문 '+(i+1),paragraphs:['검토용 본문입니다.']}))};}
  };
  const controller=w.ORDER_AUTH_SHEET.attach(root,api,{getState:()=>state});
  t.after(()=>{controller.dispose();assert.deepEqual(errors,[]);w.close();});
  return {w,root,api,calls,navigation,controller,advance,timers,animations,sheet:()=>root.querySelector('[data-product-auth-sheet]'),
    async open(screen='login',value='empty'){w.document.getElementById('opener').focus();assert.equal(controller.select(screen,value),true);await flush();return this.sheet();},
    type(selector,value){const input=this.sheet().querySelector(selector);input.focus();input.value=value;input.dispatchEvent(new w.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));return input;}
  };
}

test('research provider replacement uses the official round bytes and preserves the canonical square record',async t=>{
  const f=await setup(t);await f.open();
  const records=f.w.ORDER_QA_PROVIDER_BUTTONS,google=f.sheet().querySelector('[data-action=social-google] img');
  assert.equal(f.sheet().querySelectorAll('.integrated-provider img').length,3);
  assert.equal(google.src,'data:image/png;base64,'+researchGoogleSignInButton.png);
  assert.equal(createHash('sha256').update(Buffer.from(records.google.png,'base64')).digest('hex'),'ea659900b78dcab746c26cfa4f7bf0bf3769b46115dcce906280c16b68d6c07c');
  assert.match(records.google.member,/Shape=Pill/);assert.deepEqual(Array.from(records.google.nativeSize),[80,80]);
  const old=JSON.parse(canonical.script.match(/window\.ORDER_QA_PROVIDER_BUTTONS=([^\n]+);\n/)[1]);
  assert.equal(createHash('sha256').update(Buffer.from(old.google.png,'base64')).digest('hex'),'707f430da8d0de13091baa30729a49475cd84af6b1d849b2a76aeabe0c093397');
  assert.equal(records.kakao.png,old.kakao.png);assert.equal(records.naver.png,old.naver.png);
});

test('research source adapter rejects drift at the presentation and provider seams',()=>{
  assert.throws(()=>researchAuthSheetSource(canonical.script.replace('namespace(scene,id);','namespaceChanged(scene,id);')),/RESEARCH_AUTH_PRESENTATION_SOURCE_CHANGED/);
  assert.throws(()=>researchAuthSheetSource(canonical.script.replace('707f430da8d0de13091baa30729a49475cd84af6b1d849b2a76aeabe0c093397','changed')),/RESEARCH_AUTH_PROVIDER_SOURCE_CHANGED/);
});

test('password, unknown-email and mismatch errors distinguish the actual invalid field and preserve its value',async t=>{
  const f=await setup(t);await f.open('login','error');
  let password=f.sheet().querySelector('[name=password]');
  assert.match(password.closest('.field').querySelector('.inline-field-state').textContent,/비밀번호가 틀렸어요/);
  f.api.authState={reason:'email_unknown'};f.controller.open('signup','empty');f.controller.open('login','error');
  const email=f.sheet().querySelector('[name=email]');password=f.sheet().querySelector('[name=password]');
  assert.equal(password.getAttribute('aria-invalid'),'false');assert.equal(email.getAttribute('aria-invalid'),'true');
  assert.match(email.closest('.field').querySelector('.inline-field-state').textContent,/등록된 이메일 정보가 없어요/);
  f.controller.open('signup','mismatch');
  const confirm=f.sheet().querySelector('[name=password-confirm]');
  assert.match(confirm.closest('.field').querySelector('.inline-field-state').textContent,/비밀번호를 입력해 주세요/);
  confirm.value='saved-not-valid';confirm.focus();confirm.setSelectionRange(2,5);
  await f.advance(1800);assert.equal(confirm.value,'saved-not-valid');assert.equal(confirm.selectionStart,2);assert.equal(confirm.selectionEnd,5);assert.equal(confirm.getAttribute('aria-invalid'),'true');
  assert.equal(confirm.closest('.field').classList.contains('shows-message'),false);
});

test('password visibility has a closed eye for visible text and an open eye for masked text',async t=>{
  const f=await setup(t);await f.open();
  const input=f.sheet().querySelector('[name=password]'),button=f.sheet().querySelector('[data-action=password-visibility]');
  assert.equal(input.type,'password');assert.equal(button.classList.contains('is-visible'),false);
  button.click();await flush();assert.equal(input.type,'text');assert.equal(button.classList.contains('is-visible'),true);
  button.click();await flush();assert.equal(input.type,'password');assert.equal(button.classList.contains('is-visible'),false);
});

test('explicit limited fixture counts down and releases the CTA without inventing a normal deadline',async t=>{
  const f=await setup(t);await f.open('login','limited');
  const submit=f.sheet().querySelector('[data-action=submit-login]');
  assert.equal(submit.disabled,true);assert.match(submit.textContent,/02분 00초/);
  assert.match(f.sheet().querySelector('.notice.error').textContent,/5회 연속/);
  await f.advance(119000);assert.match(submit.textContent,/00분 01초/);assert.equal(submit.disabled,true);
  await f.advance(1000);assert.equal(submit.disabled,false);assert.equal(submit.textContent,'로그인');
  assert.equal(f.w.ORDER_RESEARCH_AUTH_POLISH.state({reviewScenario:false},'login','limited'),undefined);
  const supplied={retryAt:123456,failedAttempts:2};assert.equal(f.w.ORDER_RESEARCH_AUTH_POLISH.state({reviewScenario:true,authState:supplied},'login','limited'),supplied);
});

test('OTP countdown expires all digits and verify while keeping resend available without a group border',async t=>{
  const f=await setup(t);await f.open('otp','error');
  const wrap=f.sheet().querySelector('.otp-wrap'),digits=[...f.sheet().querySelectorAll('.otp-digit')];
  assert.match(f.sheet().querySelector('[data-otp-clock]').textContent,/15분 00초/);
  assert.equal(f.w.getComputedStyle(wrap).outline,'none');assert.equal(f.w.getComputedStyle(wrap).boxShadow,'none');
  assert.equal(f.w.getComputedStyle(f.sheet().querySelector('.otp-meta')).fontSize,'15px');
  await f.advance(15*60*1000);
  assert.equal(f.sheet().querySelector('[data-otp-clock]').textContent,'00분 00초');
  assert.ok(digits.every(input=>input.disabled&&input.getAttribute('aria-invalid')==='true'));
  assert.equal(f.sheet().querySelector('[data-action=verify-otp]').disabled,true);assert.equal(f.sheet().querySelector('[data-action=resend]').disabled,false);
  assert.equal(f.calls.length,0);assert.equal(f.navigation.length,0);
});

test('signup success shows its response deadline and inbox advice, and cancels its timer on dismissal',async t=>{
  const f=await setup(t);await f.open('signup','success');
  const copy=f.sheet().querySelector('[data-auth-expiry]');
  assert.match(copy.textContent,/15분 00초/);assert.match(copy.textContent,/\n\n스팸메일함과 휴면 메일함/);
  await f.advance(1000);assert.match(copy.textContent,/14분 59초/);
  f.controller.close({immediate:true});const last=copy.textContent;await f.advance(2000);assert.equal(copy.textContent,last);assert.equal(f.sheet(),null);
});

test('required consent highlights its contents without a group border and optional opt-out submits false',async t=>{
  let resolve;const f=await setup(t,{performAction:()=>new Promise(done=>{resolve=done;})});await f.open('signup','terms');
  const row=f.sheet().querySelector('.consent-error .check-row');
  assert.equal(f.w.getComputedStyle(row).outline,'none');assert.equal(f.w.getComputedStyle(row).boxShadow,'none');
  assert.match(f.sheet().querySelector('[name=marketing-consent]').closest('label').textContent,/마케팅 수신 동의/);
  f.type('[name=email]','case@example.com');f.type('[name=password]','Test-pass-123!');f.type('[name=password-confirm]','Test-pass-123!');
  const required=f.sheet().querySelector('[name=required-consent]');required.checked=true;required.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  f.sheet().querySelector('[data-action=submit-signup]').click();await flush();
  const prompt=f.sheet().querySelector('[data-opt-choice]');assert.equal(prompt.hidden,false);assert.equal(f.calls.length,0);
  assert.equal(f.sheet().querySelector('.consent-block').classList.contains('consent-error'),false);
  prompt.querySelector('[data-action=skip-notices]').click();await flush();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].marketing,false);assert.equal(f.sheet().querySelector('[name=marketing-consent]').checked,false);
  resolve({confirmed:false,error:'AUTH_PROVIDER_UNAVAILABLE'});await flush();assert.equal(f.sheet().dataset.authState,'terms');assert.equal(f.sheet().querySelector('.auth-complete'),null);
});

test('a pending real request masks the displayed password without clearing values and restores editing on failure',async t=>{
  let resolve;const f=await setup(t,{review:false,performAction:()=>new Promise(done=>{resolve=done;})});await f.open();
  const email=f.type('[name=email]','case@example.com'),password=f.type('[name=password]','NativeOnly!2026');
  f.sheet().querySelector('[data-action=submit-login]').click();await flush();
  const button=f.sheet().querySelector('[data-action=submit-login]');
  assert.equal(button.getAttribute('aria-busy'),'true');assert.equal(email.readOnly,true);assert.equal(password.readOnly,true);
  assert.equal(email.value,'case@example.com');assert.equal(password.value,'NativeOnly!2026');assert.equal(f.calls[0].password,'NativeOnly!2026');
  assert.equal(f.calls[0].emailReadOnly,false,'the real action must observe the original editable input and start contact validation before the visual pending lock');
  assert.equal(email.closest('.input-shell').querySelector('.auth-pending-placeholder').textContent,'case@example.com');
  assert.equal(password.closest('.input-shell').querySelector('.auth-pending-placeholder').textContent,'•'.repeat(15));
  assert.equal(f.w.getComputedStyle(button).color,'rgba(0, 0, 0, 0)');
  resolve({confirmed:false});await flush();assert.equal(button.getAttribute('aria-busy'),null);assert.equal(email.readOnly,false);assert.equal(password.readOnly,false);
  assert.equal(f.sheet().querySelector('.auth-pending-placeholder'),null);assert.equal(password.value,'NativeOnly!2026');assert.equal(f.sheet().dataset.authState,'empty');
});

test('optional consent is a focus-contained popup and Escape keeps the signup draft without opting in',async t=>{
  const f=await setup(t);await f.open('signup','empty');
  f.type('[name=email]','draft@example.com');f.type('[name=password]','Saved-pass-123!');f.type('[name=password-confirm]','Saved-pass-123!');
  const required=f.sheet().querySelector('[name=required-consent]');required.checked=true;required.dispatchEvent(new f.w.Event('change',{bubbles:true}));
  const submit=f.sheet().querySelector('[data-action=submit-signup]');submit.focus();submit.click();await flush();
  const popup=f.sheet().querySelector('[data-opt-choice]'),buttons=[...popup.querySelectorAll('button')];
  assert.equal(popup.getAttribute('role'),'alertdialog');assert.equal(popup.getAttribute('popover'),'manual');assert.equal(popup.dataset.choiceOpen,'true');
  assert.equal(f.w.document.activeElement,buttons[0]);assert.equal(submit.inert,true);
  buttons[0].dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(f.w.document.activeElement,buttons.at(-1));
  buttons.at(-1).dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await flush();
  assert.equal(popup.hidden,true);assert.equal(submit.inert,false);assert.equal(f.w.document.activeElement,submit);
  assert.equal(f.sheet().querySelector('[name=marketing-consent]').checked,false);assert.equal(f.sheet().querySelector('[name=password]').value,'Saved-pass-123!');assert.equal(f.calls.length,0);
});

test('footer terms stay read-only while signup terms keep their consent and return path',async t=>{
  const f=await setup(t);await f.open('terms','required');
  let page=f.sheet().querySelector('.terms-page');assert.equal(f.sheet().dataset.termsContext,'read');
  assert.equal(page.querySelector('.check-row'),null);assert.equal(page.querySelector('.bottom-actions'),null);
  assert.equal(page.querySelector('.page-head'),null);assert.equal(page.querySelector('.page-title'),null);assert.equal(page.querySelector('[data-policy-meta]'),null);
  await f.open('signup','empty');f.sheet().querySelector('[data-action=open-terms]').click();await flush();page=f.sheet().querySelector('.terms-page');
  assert.equal(f.sheet().dataset.termsContext,'consent');assert.notEqual(f.w.getComputedStyle(page.querySelector('.check-row')).display,'none');
  assert.equal(page.querySelector('.page-head').children.length,1);assert.ok(page.querySelector('[data-action=back]'));
});

test('password strength bridges changed capsules on entry and removal and honors reduced motion',async t=>{
  const f=await setup(t,{reduced:false});await f.open('signup','empty');
  const meter=f.sheet().querySelector('.password-meter');f.animations.length=0;
  f.type('[name=password]','abcdef');assert.equal(meter.dataset.level,'2');
  const neck=f.animations.find(x=>x.target.tagName==='EM'&&x.target.closest('.password-meter'));
  assert.ok(neck);assert.equal(neck.options.duration,300);assert.equal(neck.options.direction,'normal');
  assert.equal(neck.frames.find(x=>x.offset===.443).opacity,1);assert.equal(neck.frames.find(x=>x.offset===.667).opacity,0);
  f.animations.length=0;f.type('[name=password]','a');assert.equal(meter.dataset.level,'1');
  assert.equal(f.animations.find(x=>x.target.tagName==='EM'&&x.target.closest('.password-meter')).options.direction,'reverse');
  const reduced=await setup(t,{reduced:true});await reduced.open('signup','empty');reduced.animations.length=0;reduced.type('[name=password]','abcdef');
  assert.equal(reduced.sheet().querySelector('.password-meter').dataset.level,'2');assert.equal(reduced.animations.filter(x=>x.target.closest('.password-meter')).length,0);
});

test('floating input motion meets the native asymmetric baseline without changing the submitted value',async t=>{
  const f=await setup(t,{reduced:false});await f.open('signup','empty');
  const input=f.sheet().querySelector('[name=password]');
  Object.assign(input.style,{paddingTop:'25px',paddingBottom:'8px',borderTopWidth:'0px',borderBottomWidth:'0px',lineHeight:'24px',fontSize:'15px'});
  Object.defineProperty(input,'offsetHeight',{get:()=>62});
  input.getBoundingClientRect=()=>({left:25,top:418,width:340,height:62,right:365,bottom:480});
  f.type('[name=password]','abc');await flush();
  const mirror=f.w.document.querySelector('.r3-input-mirror');assert.ok(mirror);
  assert.equal(mirror.style.paddingTop,'27.5px');assert.equal(input.value,'abc');assert.equal(mirror.textContent,'•••');
  input.dispatchEvent(new f.w.FocusEvent('blur',{bubbles:true}));await flush();
  assert.equal(f.w.document.querySelector('.r3-input-mirror'),null);assert.equal(input.value,'abc');
});

test('closing a pending auth view disposes presentation and prevents a late response from navigating',async t=>{
  let resolve;const f=await setup(t,{review:false,performAction:()=>new Promise(done=>{resolve=done;})});await f.open();
  f.type('[name=email]','case@example.com');const password=f.type('[name=password]','NativeOnly!2026');
  f.sheet().querySelector('[data-action=submit-login]').click();await flush();assert.equal(password.readOnly,true);
  f.sheet().querySelector('.sheet-dim').click();assert.equal(f.sheet(),null);assert.equal(password.readOnly,false);
  resolve({confirmed:true});await flush();await f.advance(1000);assert.equal(f.sheet(),null);assert.deepEqual(f.navigation,[]);
});

test('terms keep three filters and readable sections without recreating numbered navigation',async t=>{
  const f=await setup(t);let scrollIndices=0;f.w.ORDER_ADMIN_MOTION={mountScrollIndex(){scrollIndices++;return {destroy(){}};}};
  await f.open('signup','empty');f.type('[name=email]','draft@example.com');f.type('[name=password]','Saved-pass-123!');f.type('[name=password-confirm]','Saved-pass-123!');
  f.sheet().querySelector('[data-action=open-terms]').click();await flush();
  assert.equal(f.sheet().dataset.authScreen,'terms');assert.equal(f.sheet().querySelectorAll('[data-term]').length,3);
  assert.equal(f.sheet().querySelectorAll('[data-policy-section]').length,5);assert.equal(scrollIndices,0);assert.equal(f.sheet().querySelector('.terms-reading>nav'),null);
  const check=f.sheet().querySelector('[name=terms-check]'),done=f.sheet().querySelector('[data-action=terms-done]');
  assert.equal(done.disabled,false);done.click();assert.equal(check.getAttribute('aria-invalid'),'true');
  assert.equal(f.w.document.activeElement,f.sheet().querySelector('[data-term=required]'));
  assert.equal(f.w.getComputedStyle(check.closest('label')).outline,'none');
  check.checked=true;check.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(check.getAttribute('aria-invalid'),'false');
  done.click();await flush();assert.equal(f.sheet().dataset.authScreen,'signup');
  assert.equal(f.sheet().querySelector('[name=email]').value,'draft@example.com');assert.equal(f.sheet().querySelector('[name=password]').value,'Saved-pass-123!');assert.equal(f.sheet().querySelector('[name=required-consent]').checked,true);
});

test('signup success uses the actual Check path, has no continue control, and opens quote-mode selection',async t=>{
  const f=await setup(t,{state:'guest-3'});await f.open('otp','verified');
  assert.equal(f.sheet().querySelector('h2').textContent,'회원가입이 완료됐어요');assert.equal(f.sheet().querySelector('.sheet-title'),null);
  assert.equal(f.sheet().querySelector('.auth-complete button'),null);assert.equal(f.sheet().querySelector('.sheet-close'),null);
  const path=f.sheet().querySelector('.success-mark path');
  assert.equal(path.getAttribute('d'),'M5 13l4 4L19 7');
  assert.ok(Number(path.style.getPropertyValue('--auth-check-length'))>0);
  const entry=f.w.getComputedStyle(path.closest('.success-mark')).animation;
  for(const timing of ['fade 550ms','turn 550ms','blur 500ms','rise 450ms'])assert.ok(entry.includes(timing),entry);
  assert.match(f.w.getComputedStyle(path).animation,/draw 550ms .* 80ms/);
  await f.advance(250);assert.equal(f.sheet(),null);assert.deepEqual(f.navigation,[['onboarding','member-4']]);
});

test('login success keeps the caller introduction step independently of the signup destination',async t=>{
  const f=await setup(t,{state:'guest-3'});await f.open('login','success');await f.advance(250);
  assert.equal(f.sheet(),null);assert.deepEqual(f.navigation,[['onboarding','member-3']]);
});

test('OTP keeps native six-digit paste and error behavior while the original digit spring runs without claiming verification',async t=>{
  const f=await setup(t,{reduced:false});await f.open('otp','empty');
  const digits=[...f.sheet().querySelectorAll('.otp-digit')],glyphs=[...f.sheet().querySelectorAll('.auth-otp-glyph')];
  digits[0].value='1';digits[0].dispatchEvent(new f.w.InputEvent('input',{bubbles:true,inputType:'insertText',data:'1'}));
  assert.equal(glyphs[0].textContent,'1');assert.match(glyphs[0].style.transform,/-14\.00px/);assert.equal(f.w.document.activeElement,digits[1]);
  await f.advance(800);assert.match(glyphs[0].style.transform,/translateY\(-?0\.0\dpx\)/);assert.equal(Number(glyphs[0].style.opacity),1);
  const event=new f.w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:()=> '482916'}});digits[2].dispatchEvent(event);
  assert.equal(digits.map(input=>input.value).join(''),'482916');assert.equal(glyphs.map(glyph=>glyph.textContent).join(''),'482916');
  await f.advance(1000);assert.equal(f.sheet().dataset.authState,'empty');assert.equal(f.sheet().querySelector('[data-auth-otp-confirmed]'),null);assert.equal(f.calls.length,0);
});

test('resend morphs from loading to a check only after a confirmed provider result',async t=>{
  let resolve;const f=await setup(t,{performAction:()=>new Promise(done=>{resolve=done;})});await f.open('otp','expired');
  const button=f.sheet().querySelector('[data-action=resend]');button.click();await flush();
  assert.equal(button.dataset.authMotionPhase,'loading');assert.equal(parseFloat(button.style.width),56);assert.equal(Number(button.querySelector('.auth-motion-done').style.opacity),0);
  resolve({confirmed:true});await flush();await f.advance(0);
  assert.equal(button.dataset.authMotionPhase,'done');assert.equal(button.getAttribute('aria-label'),'인증번호를 보냈어요');assert.equal(Number(button.querySelector('.auth-motion-done').style.opacity),1);
  await f.advance(159);assert.equal(f.sheet().dataset.authState,'expired');await f.advance(1);
  assert.equal(f.sheet().dataset.authState,'empty');assert.match(f.sheet().querySelector('[data-otp-clock]').textContent,/15분 00초/);
});

test('an unconfirmed resend returns to its label without a success pill or changing expired inputs',async t=>{
  const f=await setup(t);await f.open('otp','expired');const button=f.sheet().querySelector('[data-action=resend]');button.click();await flush();
  assert.equal(button.dataset.authMotionPhase,'idle');assert.equal(parseFloat(button.style.width),168);assert.equal(Number(button.querySelector('.auth-motion-done').style.opacity),0);
  assert.equal(f.sheet().dataset.authState,'expired');assert.ok([...f.sheet().querySelectorAll('.otp-digit')].every(input=>input.disabled));
});

test('verified OTP merges its boxes only after confirmation and then enters the completion sheet',async t=>{
  let resolve;const f=await setup(t,{performAction:()=>new Promise(done=>{resolve=done;})});await f.open('otp','empty');
  const input=f.sheet().querySelector('.otp-digit');input.value='482916';input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
  f.sheet().querySelector('[data-action=verify-otp]').click();await flush();assert.equal(f.sheet().querySelector('[data-auth-otp-confirmed]'),null);
  resolve({confirmed:true});await flush();assert.ok(f.sheet().querySelector('[data-auth-otp-confirmed]'));
  assert.equal(Number(f.sheet().querySelector('.auth-otp-success').style.opacity),1);assert.equal(f.sheet().dataset.authState,'empty');
  await f.advance(160);assert.equal(f.sheet().dataset.authState,'verified');await f.advance(250);assert.equal(f.sheet(),null);assert.deepEqual(f.navigation,[['onboarding','member-4']]);
});

test('ordinary entries cannot open a completion or acquire a simulated authentication deadline',async t=>{
  const f=await setup(t,{review:false});assert.equal(f.controller.select('otp','verified'),false);assert.equal(f.controller.select('signup','success'),false);assert.equal(f.sheet(),null);
  await f.open('otp','empty');assert.match(f.sheet().querySelector('[data-otp-clock]').textContent,/받은 메일/);
  assert.equal(f.sheet().querySelector('[data-auth-expiry]'),null);assert.deepEqual(f.calls,[]);
});

test('the limited login opens three real recovery choices and an unavailable delivery preserves the email and selection',async t=>{
  const f=await setup(t,{performAction:async()=>({confirmed:false,error:'AUTH_PROVIDER_UNAVAILABLE'})});
  await f.open('login','limited');
  f.sheet().querySelector('[data-action=reset-password]').click();
  assert.equal(f.sheet().dataset.authScreen,'password');
  const sheet=f.sheet(),options=[...sheet.querySelectorAll('[name=recovery-method]')],submit=sheet.querySelector('[data-action=send-reset]');
  assert.deepEqual(options.map(input=>input.value),['send-login-code','send-temporary-password','send-reset']);
  assert.equal(f.calls.length,0);
  submit.click();await flush();assert.equal(f.calls.length,0);
  const email=f.type('[name=email]','buyer@example.com');
  for(const option of options){
    option.click();assert.equal(f.calls.length,options.indexOf(option));
    submit.click();await flush();
    assert.equal(f.calls.at(-1).action,option.value);
    assert.equal(option.checked,true);assert.equal(option.disabled,false);
    assert.equal(email.value,'buyer@example.com');assert.equal(email.readOnly,false);
    assert.equal(sheet.dataset.authState,'request');assert.equal(sheet.querySelector('.auth-complete'),null);
    assert.match(sheet.querySelector('[data-auth-feedback]').textContent,/아직 연결되지/);
  }
});

test('login-code delivery requires its own challenge and verification before login can finish',async t=>{
  let issue=false,verified=false;
  const f=await setup(t,{review:false,performAction:async(action,detail)=>{
    if(action==='send-login-code')return issue?{confirmed:true,challengeId:'login-challenge'}:{confirmed:true};
    assert.equal(detail.challengeId,'login-challenge');
    return {confirmed:verified};
  }});
  await f.open('password','request');f.type('[name=email]','buyer@example.com');
  f.sheet().querySelector('[value=send-login-code]').click();
  const send=f.sheet().querySelector('[data-action=send-reset]');
  send.click();await flush();assert.equal(f.sheet().dataset.authScreen,'password');
  issue=true;send.click();await flush();
  assert.equal(f.sheet().dataset.authScreen,'otp');assert.equal(f.sheet().querySelector('h1').textContent,'이메일 로그인 코드 입력');
  f.type('.otp-digit','123456');
  const verify=f.sheet().querySelector('[data-action=verify-otp]');
  verify.click();await flush();assert.equal(f.calls.at(-1).action,'verify-login-code');
  assert.equal(f.sheet().dataset.authState,'empty');assert.equal(f.navigation.length,0);
  verified=true;verify.click();await flush();await f.advance(160);
  assert.equal(f.sheet().dataset.authScreen,'login');assert.equal(f.sheet().dataset.authState,'success');
});

test('issuing a temporary password returns to login and reset retains its own instructions',async t=>{
  const f=await setup(t,{review:false,performAction:async()=>({confirmed:true})});
  await f.open('password','request');f.type('[name=email]','buyer@example.com');
  f.sheet().querySelector('[value=send-temporary-password]').click();
  f.sheet().querySelector('[data-action=send-reset]').click();await flush();
  assert.equal(f.sheet().dataset.authScreen,'login');assert.equal(f.sheet().dataset.authState,'empty');
  assert.match(f.sheet().querySelector('[data-auth-feedback]').textContent,/가입 정보와 일치하면 임시 비밀번호/);
  assert.deepEqual(f.navigation,[]);
  f.sheet().querySelector('[data-action=reset-password]').click();f.type('[name=email]','buyer@example.com');
  f.sheet().querySelector('[data-action=send-reset]').click();await flush();
  assert.equal(f.sheet().dataset.authScreen,'password');assert.equal(f.sheet().dataset.authState,'sent');
});

test('reported login failures keep typed values and use only the provider count and retry deadline',async t=>{
  const f=await setup(t,{review:false,performAction:async()=>({
    confirmed:false,reason:'password_incorrect',failedAttempts:2,remainingAttempts:0,retryAt:f.w.Date.now()+3000
  })});
  await f.open();const email=f.type('[name=email]','buyer@example.com'),pass=f.type('[name=password]','My-password-1!');
  const submit=f.sheet().querySelector('[data-action=submit-login]');
  submit.click();await flush();await f.advance(0);
  assert.equal(email.value,'buyer@example.com');assert.equal(pass.value,'My-password-1!');
  assert.equal(pass.getAttribute('aria-invalid'),'true');
  assert.match(f.sheet().querySelector('[data-auth-feedback]').textContent,/2회 연속/);
  assert.equal(submit.textContent,'00분 03초 후 로그인 가능해요');assert.equal(submit.disabled,true);
  await f.advance(3000);assert.equal(submit.disabled,false);assert.equal(submit.textContent,'로그인');
});
