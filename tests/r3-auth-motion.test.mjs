import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {catalog,frames,cssGzip} from '../src/server/r3-ui/catalog.gen.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {sharedCoreScript} from '../src/server/product-ui/assets.gen.mjs';
import {mountSheetGesture} from '../scripts/r3/authored/sheet-motion.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const authoredAccount=readFileSync(new URL('../scripts/r3/authored/account.js',import.meta.url),'utf8');
const authoredAccountCss=readFileSync(new URL('../scripts/r3/authored/account.css',import.meta.url),'utf8');
function markup(screen,state){
  const row=catalog.find(row=>row.screen===screen&&row.state===state);
  return gunzipSync(Buffer.from(frames[row.current],'base64')).toString();
}
test('current login, signup and OTP exports retain accessible error reasons independently of decorative messages',()=>{
  for(const [screen,state] of [['login','email-error'],['signup','mismatch'],['password','request-error'],['otp','error'],['otp','expired']]){
    const doc=new JSDOM(markup(screen,state)).window.document;
    for(const message of doc.querySelectorAll('.inline-field-state'))assert.equal(message.getAttribute('aria-hidden'),'true');
    const invalid=doc.querySelector('input[aria-invalid=true]');
    assert.ok(invalid,screen);
    const ids=invalid.getAttribute('aria-describedby').split(/\s+/);
    assert.ok(ids.some(id=>doc.getElementById(id)?.classList.contains('sr-only')),screen);
    if(state==='expired')assert.equal(doc.querySelector('[data-otp-clock]').textContent,'00분 00초');
    doc.defaultView.close();
  }
});

function authoredLogin(state='empty'){
  const dom=new JSDOM('<main id="order-single" class="ds"></main>',{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()}),w=dom.window,root=w.document.querySelector('main');
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  let now=0,serial=0;const timers=new Map();
  w.setTimeout=(callback,delay=0)=>{const id=++serial;timers.set(id,{at:now+delay,callback,delay});return id;};w.clearTimeout=id=>timers.delete(id);
  const advance=ms=>{now+=ms;for(const[id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.callback();}};
  w.eval(sharedCoreScript);w.eval(authoredAccount);
  const module=w.ORDER_DESIGN_MODULES.find(item=>item.id==='login');root.innerHTML=module.render(state,{variant:'email'});
  // Authored mounting must also repair already shipped markup without this hook.
  for(const display of root.querySelectorAll('.inline-field-state'))display.remove();
  const legacyDom=new JSDOM(markup('login','email-error')),legacy=legacyDom.window.document.querySelector('#r3-auth-motion')?.textContent||'';legacyDom.window.close();
  const style=w.document.createElement('style');style.textContent=gunzipSync(Buffer.from(cssGzip,'base64')).toString()+legacy+authoredAccountCss;w.document.head.append(style);
  const requests=[],api={mode:'product',interactive:true,reduced:()=>true,select(){},performAction(action){requests.push({action,email:root.querySelector('[name=email]').value});return Promise.resolve({confirmed:false});}};
  const sharedDispose=w.QAUI.sharedMount(root,api),dispose=module.mount(root,state,api);
  return {w,root,timers,requests,advance,close(){dispose();sharedDispose();dom.window.close();}};
}

test('existing email error uses the shared 1800ms display and restores the same typed value and focus',()=>{
  const f=authoredLogin('email-error');
  try{
    const input=f.root.querySelector('[name=email]'),field=input.closest('.field'),display=field.querySelector('.inline-field-state');input.focus();
    assert.equal(display.textContent,'이메일 양식을 확인해 주세요.');assert.equal(field.classList.contains('shows-message'),true);assert.equal(f.w.getComputedStyle(display).display,'block');assert.equal(display.getAttribute('aria-hidden'),'true');
    assert.equal(input.value,'my.order.ooo');assert.equal(input.type,'email');assert.equal(input.placeholder,'my@order.ooo');assert.ok([...f.timers.values()].some(timer=>timer.delay===1800));
    f.advance(1799);assert.equal(field.classList.contains('shows-message'),true);f.advance(1);
    assert.equal(field.classList.contains('shows-message'),false);assert.equal(f.w.getComputedStyle(display).display,'none');assert.equal(input.value,'my.order.ooo');assert.equal(input.placeholder,'my@order.ooo');assert.equal(f.w.document.activeElement,input);assert.equal(input.getAttribute('aria-invalid'),'true','the presentation timer does not claim the value is valid');
  }finally{f.close();}
});

test('actual login submit and Enter use existing email validity before calling the product action',async()=>{
  const f=authoredLogin();
  try{
    const email=f.root.querySelector('[name=email]'),password=f.root.querySelector('[name=password]'),button=f.root.querySelector('[data-action=submit-login]');email.value='bad@';password.value='preserved-password';
    button.click();assert.equal(email.validity.typeMismatch,true);assert.equal(f.requests.length,0);assert.equal(email.closest('.field').querySelector('.inline-field-state').textContent,'이메일 양식을 확인해 주세요.');assert.equal(email.value,'bad@');assert.equal(password.value,'preserved-password');
    const enter=new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});email.dispatchEvent(enter);assert.equal(enter.defaultPrevented,true);assert.equal(f.requests.length,0);
    email.value='valid@example.com';email.dispatchEvent(new f.w.InputEvent('input',{bubbles:true}));assert.equal(email.closest('.field').classList.contains('shows-message'),false);
    email.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(f.requests,[{action:'submit-login',email:'valid@example.com'}]);assert.equal(email.value,'valid@example.com');assert.equal(password.value,'preserved-password');assert.equal(email.getAttribute('aria-invalid'),'false');
  }finally{f.close();}
});

test('shared temporary messages preserve selection and cancel on new input without restoring an old value',()=>{
  const f=authoredLogin();
  try{
    const input=f.root.querySelector('[name=password]'),field=input.closest('.field');input.value='keep-this-password';input.focus();input.setSelectionRange(2,7,'backward');
    f.w.QAUI.setFieldError(input,'입력한 내용을 확인해 주세요.');assert.equal(field.classList.contains('shows-message'),true);assert.equal(input.value,'keep-this-password');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,7);assert.equal(input.selectionDirection,'backward');
    f.advance(1000);f.w.QAUI.setFieldError(input,'다시 확인해 주세요.');f.advance(800);assert.equal(field.classList.contains('shows-message'),true,'the earlier message timer cannot hide a newer message');
    f.advance(1000);assert.equal(field.classList.contains('shows-message'),false);assert.equal(input.value,'keep-this-password');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,7);assert.equal(input.selectionDirection,'backward');assert.equal(f.w.document.activeElement,input);
    f.w.QAUI.setFieldError(input,'다시 확인해 주세요.');input.value='edited-password';input.setSelectionRange(4,4);input.dispatchEvent(new f.w.InputEvent('input',{bubbles:true}));
    assert.equal(field.classList.contains('shows-message'),false);f.advance(1800);assert.equal(input.value,'edited-password');assert.equal(input.selectionStart,4);assert.equal(input.getAttribute('aria-invalid'),'false');assert.equal(f.w.document.activeElement,input);
    f.w.QAUI.setFieldError(input,'입력한 내용을 확인해 주세요.');input.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true}));
    assert.equal(field.classList.contains('shows-message'),false,'composition must immediately reveal native text without rewriting it');assert.equal(input.value,'edited-password');assert.equal(input.selectionStart,4);assert.equal(input.getAttribute('aria-invalid'),'true');
    input.dispatchEvent(new f.w.CompositionEvent('compositionend',{bubbles:true}));
  }finally{f.close();}
});
test('one sheet controller owns rubber band, short release, peek, cancel, close and page unlock',()=>{
  const dom=new JSDOM('<main><button id="grip"></button><section></section></main>');
  const doc=dom.window.document,sheet=doc.querySelector('section'),grip=doc.querySelector('button');
  sheet.getBoundingClientRect=()=>({height:500});
  const signal=new dom.window.AbortController();
  let closes=0;
  mountSheetGesture(sheet,[grip],{signal:signal.signal,reduced:()=>true,close(){closes++;}});
  const pointer=(name,y)=>{
    const event=new dom.window.Event(name,{bubbles:true,cancelable:true});
    Object.assign(event,{pointerId:1,clientY:y,button:0,isPrimary:true});grip.dispatchEvent(event);
  };
  assert.equal(doc.documentElement.style.overflow,'hidden');
  pointer('pointerdown',100);pointer('pointermove',64);
  assert.match(sheet.style.transform,/-10\.2/);
  pointer('pointerup',64);assert.equal(sheet.dataset.sheetSnap,'open');
  pointer('pointerdown',100);pointer('pointermove',170);pointer('pointerup',170);
  assert.equal(sheet.dataset.sheetSnap,'peek');
  pointer('pointerdown',120);pointer('pointermove',200);pointer('pointercancel',200);
  assert.equal(sheet.dataset.sheetSnap,'peek');assert.equal(closes,0);
  pointer('pointerdown',120);pointer('pointermove',202);pointer('pointerup',202);
  assert.equal(closes,1);signal.abort();assert.equal(doc.documentElement.style.overflow,'');
  dom.window.close();
});
test('authored updates preserve header and CODE1 instance and mount official search shapes on the fourth step',()=>{
  const dom=new JSDOM(markup('onboarding','member-2'),{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.eval(runtimes.onboarding);
  const root=w.document.querySelector('#order-single'),header=root.querySelector('header'),jelly=header.querySelector('svg');
  const dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='onboarding').mount(root,'member-2',{select(){},reduced:()=>true});
  const nav=root.querySelector('.ob-pages');
  assert.equal(root.querySelector('.ob-mode.detail').dataset.magneticAction,'rest');
  assert.equal(jelly.querySelectorAll('[data-jelly]').length,3);
  let event=new w.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state:'guest-4',markup:markup('onboarding','guest-4')}});
  assert.equal(root.dispatchEvent(event),true);
  for(const step of [3,4,2]){
    const state='member-'+step;
    event=new w.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state,markup:markup('onboarding',state)}});
    assert.equal(root.dispatchEvent(event),false);assert.equal(root.querySelector('header'),header);
    assert.equal(root.querySelector('header svg'),jelly);assert.equal(root.querySelector('.ob').dataset.introStep,String(step));
    if(step===3)assert.equal(root.querySelector('.ob-pages'),nav);
    if(step===4){
      assert.equal(root.querySelector('.ob-mode.detail [data-magnetic-label] [data-intro-icon]').dataset.introIcon,'file-search');
      assert.equal(root.querySelectorAll('[data-intro-icon]').length,2);
      assert.equal(root.querySelector('[data-intro-icon=search] circle').getAttribute('r'),'8');
      assert.equal(root.querySelector('[data-intro-icon=file-search] circle').getAttribute('cx'),'11.5');
    }
  }
  assert.equal(typeof w.ORDER_CUSTOMER_CONTROLS?.speedDial,'function');
  dispose();w.close();
});
test('video 6 strength reacts to the changed boundary only, including a single paste and deletion',()=>{
  const dom=new JSDOM(markup('signup','empty'),{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.eval(runtimes.accountFeedback);
  const captures=[];
  w.Element.prototype.animate=function(frames,options){
    captures.push({target:this,frames,options});
    return {finished:new Promise(()=>{}),cancel(){}};
  };
  const root=w.document.querySelector('#order-single'),input=root.querySelector('[name=password]'),meter=root.querySelector('.password-meter');
  const dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='signup').mount(root,'empty',{interactive:false,select(){},reduced:()=>false});
  const next=value=>{input.value=value;input.dispatchEvent(new w.InputEvent('input',{bubbles:true}));};
  next('x');
  assert.equal(meter.dataset.level,'1');
  assert.equal(captures.filter(e=>e.target.tagName==='EM').length,0);
  next('xxxxxxx');
  const joins=captures.filter(e=>e.target.tagName==='EM');
  assert.equal(joins.length,1);assert.equal(joins[0].options.duration,300);
  assert.equal(joins[0].target.parentElement,[...meter.querySelectorAll('i')][1]);
  assert.equal(joins[0].frames.find(frame=>frame.offset===.667).opacity,0);
  const before=captures.length;next('xxxxxxxx');
  assert.equal(captures.length,before);
  next('ABcdefghijk1234!');
  assert.equal(meter.dataset.level,'4');assert.equal(meter.querySelectorAll('i.filled').length,4);
  next('');
  assert.equal(meter.dataset.level,'0');
  assert.equal(captures.filter(e=>e.target.tagName==='EM'&&e.options.direction==='reverse').length,3);
  assert.ok(input.getAttribute('aria-describedby').split(' ').includes(meter.querySelector('.meter-label').id));
  dispose();w.close();
});
