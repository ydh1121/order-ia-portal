import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {mountSheetGesture} from '../scripts/r3/authored/sheet-motion.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
function markup(screen,state){
  const row=catalog.find(row=>row.screen===screen&&row.state===state);
  return gunzipSync(Buffer.from(frames[row.current],'base64')).toString();
}
test('current login, signup and OTP exports retain only accessible error reasons',()=>{
  for(const [screen,state] of [['login','email-error'],['signup','mismatch'],['password','request-error'],['otp','error'],['otp','expired']]){
    const doc=new JSDOM(markup(screen,state)).window.document;
    assert.equal(doc.querySelectorAll('.inline-field-state').length,0);
    const invalid=doc.querySelector('input[aria-invalid=true]');
    assert.ok(invalid,screen);
    const ids=invalid.getAttribute('aria-describedby').split(/\s+/);
    assert.ok(ids.some(id=>doc.getElementById(id)?.classList.contains('sr-only')),screen);
    if(state==='expired')assert.equal(doc.querySelector('[data-otp-clock]').textContent,'00분 00초');
    doc.defaultView.close();
  }
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
  assert.equal(jelly.querySelectorAll('[data-jelly]').length,3);
  let event=new w.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state:'guest-4',markup:markup('onboarding','guest-4')}});
  assert.equal(root.dispatchEvent(event),true);
  for(const step of [3,4,2]){
    const state='member-'+step;
    event=new w.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state,markup:markup('onboarding',state)}});
    assert.equal(root.dispatchEvent(event),false);assert.equal(root.querySelector('header'),header);
    assert.equal(root.querySelector('header svg'),jelly);assert.equal(root.querySelector('.ob').dataset.introStep,String(step));
    if(step===4){
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
