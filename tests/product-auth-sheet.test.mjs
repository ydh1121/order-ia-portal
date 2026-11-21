import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {renderProductApplication} from '../src/server/product-app-page.mjs';
import {getProductAuthSheetBootstrap} from '../src/server/product-auth-sheet.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {installQaReviewRuntime} from '../src/server/r3-ui/qa-review-runtime.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const {parse}=createRequire(new URL('./build-tools/package.json',import.meta.url))('rrweb-cssom');
const origin='https://order-ia-portal.pages.dev';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check,label){const until=performance.now()+5000;while(!check()&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(check(),label);}

async function mount(t,{qa=false,state='guest-2',reducedMotion=true}={}){
 const url=origin+'/ia?'+new URLSearchParams({view:qa?'qa-lab':'product-r3',screen:qa?'onboarding/'+state+'/email':'onboarding',state});
 let artifact,html;
 if(qa){
  const response=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id:'onboarding/'+state+'/email',width:'390',version:'current'})));
  assert.equal(response.status,200);artifact=await response.json();html=artifact.html;
 }else html=await renderProductApplication('a'.repeat(32),{mode:'lab',runId:'auth-sheet-test',persona:'guest',actor:{id:'guest',authenticated:false}},'onboarding',state);
 const errors=[],navigation=[],calls=[],messages=[],console=new VirtualConsole();
 console.on('jsdomError',error=>{if(error.type==='css parsing')return;if(/^Not implemented: navigation/.test(error.message))navigation.push(error.message);else errors.push(error.message);});
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;
 t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.close();});
 Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;
 Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
 w.matchMedia=()=>({matches:reducedMotion,addEventListener(){},removeEventListener(){}});
 w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
 w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const parent={postMessage(message){messages.push(message);}};Object.defineProperty(w,'parent',{value:parent});
 w.fetch=async(input,init={})=>{calls.push({path:String(input),method:init.method||'GET'});if(qa)throw Error('A QA auth sheet cannot call a network');return Response.json({error:'AUTHENTICATION_REQUIRED'},{status:401});};
 let session;
 if(qa){
  w.eval(artifact.mount);w.eval((await getProductAuthSheetBootstrap()).script);
  session=w.JSON.parse(JSON.stringify({channel:randomUUID(),artifact:artifact.hash,screen:'onboarding',state,variant:'email',version:'current',fixture:artifact.fixture}));
  w.__authTestSession=session;
  w.eval('('+browserFunction(installQaReviewRuntime)+')(__authTestSession,'+browserFunction(installQaFixtureAdapter)+','+browserFunction(installProductAdapter)+');');
  w.eval('('+frameCode+')(__authTestSession)');
 }else for(const script of w.document.querySelectorAll('script'))if(!script.src&&script.type!=='application/json')w.eval(script.textContent);
 await tick();
 const root=w.document.getElementById('order-single'),stage=root.querySelector('.ob-stage'),main=root.querySelector('.ob-main'),brand=root.querySelector('.obm-brand svg');
 const open=(screen='login')=>{const button=root.querySelector('[data-mf-go="'+screen+'/empty"]');assert.ok(button,screen+' entry exists in the canonical introduction');button.focus();button.click();assert.ok(root.querySelector('[data-product-auth-sheet]'));return button;};
 const sheet=()=>root.querySelector('[data-product-auth-sheet]');
 const unchanged=()=>{assert.equal(w.location.href,url);assert.equal(root.querySelector('.ob-stage'),stage);assert.equal(root.querySelector('.ob-main'),main);assert.equal(root.querySelector('.obm-brand svg'),brand);assert.equal(root.querySelector('.ob').dataset.introStep,state.slice(-1));assert.deepEqual(navigation,[]);assert.deepEqual(errors,[]);};
 const scenario=mode=>root.dispatchEvent(new w.CustomEvent('r3-motion-scenario',{detail:{mode}}));
 const fillLogin=()=>{sheet().querySelector('[name=email]').value='member@example.invalid';sheet().querySelector('[name=password]').value='Dummy-test-123!';};
 return {w,root,stage,main,open,sheet,unchanged,scenario,fillLogin,calls,messages,parent,session};
}

test('canonical auth styles are scoped to the overlay rather than every current QA page',async()=>{
 const {css}=await getProductAuthSheetBootstrap();
 const inspect=rules=>{for(const rule of rules){if(rule.selectorText)assert.ok(rule.selectorText.startsWith('.ds .product-auth-sheet'),rule.selectorText);if(rule.cssRules)inspect(rule.cssRules);}};
 inspect(parse(css).cssRules);
});

test('the inline auth sheet has one transform motion owner while focus and the canonical form stay intact',async t=>{
 const view=await mount(t,{state:'guest-1',reducedMotion:false}),{w}=view,flights=[];
 const animate=w.HTMLElement.prototype.animate;
 w.HTMLElement.prototype.animate=function(keyframes,options){
  if(this.matches('.auth-sheet'))flights.push({element:this,keyframes,options});
  return animate.call(this,keyframes,options);
 };
 view.open();const dialog=view.sheet().querySelector('.auth-sheet'),email=dialog.querySelector('[name=email]');
 assert.equal(flights.length,1,'the canonical mount and overlay must not start separate entrance motions');
 assert.equal(flights[0].element,dialog);assert.ok(flights[0].keyframes.every(frame=>'transform' in frame));
 assert.equal(w.getComputedStyle(dialog).transition,'none','CSS modal transitions must not interpolate the same transform as the sheet animation and drag');
 assert.ok(dialog.contains(w.document.activeElement));
 email.value='kept@example.invalid';dialog.querySelector('[name=password]').focus();email.focus();
 assert.equal(view.sheet().querySelector('.auth-sheet'),dialog);assert.equal(email.value,'kept@example.invalid');
 assert.equal(flights.length,1,'focus changes keep the original sheet and its one entrance animation');
 view.root.__orderAuthSheet.close({immediate:true});view.unchanged();
});

test('the product opens the canonical compact login over the same introduction and closes by Escape, scrim and drag',async t=>{
 const view=await mount(t,{state:'guest-3'}),{w}=view;
 const opener=view.open();
 const originalEmailId=view.sheet().querySelector('[name=email]').id;
 assert.equal(view.sheet().querySelector('.auth-background'),null,'the sheet does not invent a second introduction');
 assert.ok(view.sheet().querySelector('.auth-layout.compact'));
 assert.equal(view.sheet().querySelectorAll('[data-action^="social-"] img[src^="data:image/png;base64,"]').length,3);
 assert.equal(view.stage.closest('[inert]')!==null,true,'only the actual background is inert');
 const password=view.sheet().querySelector('[name=password]');
 view.sheet().querySelector('[data-action=password-visibility]').click();
 assert.equal(password.type,'text','shared page and sheet field handlers do not toggle twice');
 password.focus();password.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(view.sheet(),null);assert.equal(w.document.activeElement,opener);assert.equal(view.stage.closest('[inert]'),null);view.unchanged();
 view.open('signup');view.sheet().querySelector('.sheet-dim').click();assert.equal(view.sheet(),null);view.unchanged();
 view.open();assert.equal(view.sheet().querySelector('[name=email]').id,originalEmailId,'reopening an annotated field preserves its inline identity');
 const email=view.sheet().querySelector('[name=email]');email.value='kept@example.invalid';view.root.__orderAuthSheet.open('login','empty','compact');assert.equal(view.sheet().querySelector('[name=email]'),email);assert.equal(email.value,'kept@example.invalid','restoring an already open layer does not reset its draft');
 const grip=view.sheet().querySelector('.sheet-handle'),sheet=view.sheet().querySelector('.auth-sheet');
 sheet.getBoundingClientRect=()=>({x:0,y:300,left:0,top:300,right:390,bottom:600,width:390,height:300});
 for(const [type,y] of [['pointerdown',100],['pointermove',300],['pointerup',300]]){
  const event=new w.MouseEvent(type,{bubbles:true,button:0,clientY:y});Object.defineProperty(event,'pointerId',{value:7});grip.dispatchEvent(event);
 }
 assert.equal(view.sheet(),null);assert.equal(w.document.documentElement.style.overflow,'');view.unchanged();
 const controller=view.root.__orderAuthSheet;
 assert.equal(controller.inspect().open,false);assert.equal(controller.open('password','request','compact'),true);
 assert.deepEqual(JSON.parse(JSON.stringify(controller.inspect())),{open:true,screen:'password',state:'request',variant:'compact'});
 controller.close({immediate:true});assert.equal(view.sheet(),null);view.unchanged();
});

test('product validation is canonical and an unavailable real auth adapter cannot claim login success',async t=>{
 const view=await mount(t);view.open();
 const email=view.sheet().querySelector('[name=email]'),password=view.sheet().querySelector('[name=password]'),submit=view.sheet().querySelector('[data-action=submit-login]');
 email.value='invalid';submit.click();assert.equal(email.getAttribute('aria-invalid'),'true');assert.equal(password.getAttribute('aria-invalid'),'true');
 view.fillLogin();submit.click();await tick();
 assert.equal(view.sheet().dataset.authState,'empty');assert.equal(view.sheet().querySelector('.auth-complete'),null);
 assert.match(view.sheet().querySelector('[data-auth-feedback]').textContent,/연결되지 않은/);
 assert.equal(view.w.ORDER_APP_ADAPTER.context.actor.authenticated,false);
 assert.equal(view.calls.some(call=>call.method==='POST'),false);view.unchanged();
});

test('QA auth uses the real controlled request, stays inside the current review frame and ignores completion after close',async t=>{
 const view=await mount(t,{qa:true});view.open();view.fillLogin();view.scenario('delay');
 const submit=view.sheet().querySelector('[data-action=submit-login]');submit.click();
 assert.equal(submit.dataset.asyncPhase,'pending');assert.equal(submit.dataset.asyncSource,'controlled-qa');
 assert.equal(view.messages.filter(message=>message.type==='navigate').length,0);view.unchanged();
 const {session,w,parent}=view;
 w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{scope:'ORDER_R3_HOST',channel:session.channel,artifact:session.artifact,type:'mode',payload:true}}));
 assert.equal(w.document.getElementById('r3-veil').hidden,false);
 assert.ok(view.root.contains(view.sheet().querySelector('[name=email]')),'the review frame indexes the actual sheet field');
 w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{scope:'ORDER_R3_HOST',channel:session.channel,artifact:session.artifact,type:'mode',payload:false}}));
 view.sheet().querySelector('.sheet-dim').click();assert.equal(view.sheet(),null);
 view.scenario('complete');await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(view.messages.filter(message=>message.type==='navigate').length,0,'late QA completion cannot replace the original slide');
 assert.deepEqual(view.calls,[]);view.unchanged();
});

test('controlled QA login completes only after its request and returns to the caller introduction step',async t=>{
 const view=await mount(t,{qa:true,state:'guest-2'});view.open();view.fillLogin();view.scenario('delay');
 view.sheet().querySelector('[data-action=submit-login]').click();await tick();
 assert.equal(view.sheet().dataset.authState,'empty');view.scenario('complete');
 await until(()=>view.sheet()?.dataset.authState==='success','the canonical success view follows the completed fixture');
 await until(()=>view.messages.some(message=>message.type==='navigate'&&message.payload.screen==='onboarding'),'the success exit returns to introduction');
 const destination=view.messages.filter(message=>message.type==='navigate').at(-1);assert.equal(destination.payload.state,'member-2');
 assert.equal(view.sheet(),null);assert.deepEqual(view.calls,[]);view.unchanged();
});

test('signup, its terms draft and OTP use the same canonical modules within one sheet',async t=>{
 const view=await mount(t,{qa:true});view.open('signup');
 view.sheet().querySelector('[name=email]').value='draft@example.invalid';view.sheet().querySelector('[name=password]').value='Dummy-test-123!';view.sheet().querySelector('[name=password-confirm]').value='Dummy-test-123!';
 view.sheet().querySelector('[data-action=open-terms]').click();assert.equal(view.sheet().dataset.authScreen,'terms');
 view.sheet().querySelector('[name=terms-check]').checked=true;view.sheet().querySelector('[data-action=terms-done]').click();
 assert.equal(view.sheet().dataset.authScreen,'signup');assert.equal(view.sheet().querySelector('[name=email]').value,'draft@example.invalid');assert.equal(view.sheet().querySelector('[name=password]').value,'Dummy-test-123!');assert.equal(view.sheet().querySelector('[name=required-consent]').checked,true);
 view.sheet().querySelector('[name=marketing-consent]').checked=true;view.scenario('complete');view.sheet().querySelector('[data-action=submit-signup]').click();
 await until(()=>view.sheet()?.dataset.authState==='success','signup fixture completion');view.sheet().querySelector('[data-action=open-otp]').click();
 assert.equal(view.sheet().dataset.authScreen,'otp');assert.equal(view.sheet().querySelectorAll('.otp-digit').length,6);
 view.sheet().querySelector('[data-action=verify-otp]').click();assert.equal(view.sheet().querySelector('.otp-digit').getAttribute('aria-invalid'),'true');
 for(const [i,input] of [...view.sheet().querySelectorAll('.otp-digit')].entries())input.value=String(i+1);
 view.sheet().querySelector('[data-action=verify-otp]').click();await until(()=>view.sheet()?.dataset.authState==='verified','the six digit canonical verifier completes');
 await until(()=>view.sheet()===null,'verified signup closes');
 assert.equal(view.messages.filter(message=>message.type==='navigate').at(-1).payload.state,'member-2');assert.deepEqual(view.calls,[]);view.unchanged();
});

test('terms inside the signup sheet retain keyboard focus at both modal boundaries',async t=>{
 const view=await mount(t,{qa:true});view.open('signup');
 view.sheet().querySelector('[name=email]').value='draft@example.invalid';
 view.sheet().querySelector('[data-action=open-terms]').click();
 const {w}=view,dialog=view.sheet().querySelector('[role=dialog]'),first=dialog.querySelector('[data-action=back]'),last=dialog.querySelector('[data-action=terms-done]');
 last.focus();const forward=new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});last.dispatchEvent(forward);
 assert.equal(forward.defaultPrevented,true,'Tab at the final terms action remains inside the modal');assert.equal(w.document.activeElement,first);
 const backward=new w.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true});first.dispatchEvent(backward);
 assert.equal(backward.defaultPrevented,true,'Shift+Tab at the first terms action wraps within the modal');assert.equal(w.document.activeElement,last);
 const middle=dialog.querySelector('[name=terms-check]');middle.focus();const native=new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});middle.dispatchEvent(native);assert.equal(native.defaultPrevented,false,'ordinary Tab navigation remains native');
 first.click();assert.equal(view.sheet().dataset.authScreen,'signup');assert.equal(view.sheet().querySelector('[name=email]').value,'draft@example.invalid');
 view.sheet().querySelector('.sheet-dim').click();assert.equal(view.sheet(),null);view.unchanged();assert.deepEqual(view.calls,[]);
});

test('password recovery keeps the introduction while using canonical validation and controlled completion',async t=>{
 const view=await mount(t,{qa:true,state:'guest-3'});view.open();view.sheet().querySelector('[data-action=reset-password]').click();
 assert.equal(view.sheet().dataset.authScreen,'password');view.sheet().querySelector('[name=email]').value='member@example.invalid';view.scenario('complete');view.sheet().querySelector('[data-action=send-reset]').click();
 await until(()=>view.sheet()?.dataset.authState==='sent','controlled reset request');view.sheet().querySelector('[data-action=show-password]').click();
 const password=view.sheet().querySelector('[name=new-password]'),confirm=view.sheet().querySelector('[name=password-confirm]');password.value='Dummy-test-123!';confirm.value='different';view.sheet().querySelector('[data-action=submit-password]').click();assert.equal(confirm.getAttribute('aria-invalid'),'true');
 confirm.value=password.value;view.sheet().querySelector('[data-action=submit-password]').click();await until(()=>view.sheet()?.dataset.authState==='complete','canonical reset completion');
 view.sheet().querySelector('[data-action=login]').click();assert.equal(view.sheet().dataset.authScreen,'login');view.sheet().querySelector('.sheet-dim').click();assert.equal(view.sheet(),null);
 assert.equal(view.messages.filter(message=>message.type==='navigate').length,0);assert.deepEqual(view.calls,[]);view.unchanged();
});
