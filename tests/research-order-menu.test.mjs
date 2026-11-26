import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mountResearchOrderMenu} from '../src/server/research-app/order-menu.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({flag=true,pending,allow=true,authenticated=true,motion=false,route={screen:'q1',kind:'quote',mode:'simple'}}={}){
  const dom=new JSDOM('<main id="order-single"><div class="brand"><span class="brand-word">Order<span class="brand-dot">.</span></span><button>계정</button></div></main>',{pretendToBeVisual:true});
  const w=dom.window,d=w.document,events=[],reads=[],animations=[],word=d.querySelector('.brand-word');let member=authenticated;
  w.matchMedia=()=>({matches:!motion});w.Element.prototype.animate=function(frames,options){animations.push({node:this,frames,options});return {finished:Promise.resolve(),cancel(){}};};
  const adapter={ready:Promise.resolve(),async request(path,body,signal){reads.push({path,body,signal});return pending?pending:{orderMenu:flag};}};
  const menu=mountResearchOrderMenu({brand:d.querySelector('.brand'),adapter,getAuthenticated:()=>member,getRoute:()=>route,beforeOpen:()=>allow,onChoose:mode=>events.push(mode)});
  return {w,d,menu,events,reads,route,adapter,word,animations,setAuth(value,state={}){member=value;menu.update({authenticated:value,...state});},close(){menu.destroy();dom.window.close();}};
}
test('publication is checked before presenting the member selector and failure restores the original wordmark',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve),f=setup({pending});try{
    assert.equal(f.d.querySelector('.research-order-menu').hidden,true);assert.equal(f.word.parentNode,f.d.querySelector('.brand'));
    release({orderMenu:true});await f.menu.ready;
    assert.equal(f.d.querySelector('.research-order-menu').hidden,false);assert.equal(f.word.parentNode,f.d.querySelector('.research-order-trigger'));
    f.word.click();await tick();assert.equal(f.d.querySelector('[role=menu]').hidden,false);
    f.adapter.request=async()=>{throw Error('OFFLINE');};await f.menu.refresh();
    assert.equal(f.d.querySelector('.research-order-menu').hidden,true);assert.equal(f.d.querySelector('[role=menu]').hidden,true);assert.equal(f.word.parentNode,f.d.querySelector('.brand'));
    assert.ok(f.reads.every(x=>x.path==='/features'&&x.body===null));assert.deepEqual(f.events,[]);
  }finally{f.close();}
});
test('guests retain the plain wordmark and the member arrow joins the same arrival without replacing the word',async()=>{
  const f=setup({authenticated:false,motion:true});try{
    await f.menu.ready;const host=f.d.querySelector('.research-order-menu'),trigger=f.d.querySelector('.research-order-trigger'),wordNode=f.word.firstChild;
    assert.equal(host.hidden,true);assert.equal(trigger.disabled,true);f.word.click();trigger.click();await tick();assert.equal(f.d.querySelector('[role=menu]').hidden,true);
    f.setAuth(true,{arrival:'moving',arrivalCount:1});
    assert.equal(host.hidden,false);assert.equal(trigger.disabled,false);assert.equal(trigger.querySelector('.brand-word'),f.word);assert.equal(f.word.firstChild,wordNode);
    assert.equal(f.animations.length,1);assert.equal(f.animations[0].node,f.d.querySelector('.research-order-arrow'));
    f.menu.update({arrival:'moving',arrivalCount:1});assert.equal(f.animations.length,1,'repeated brand notifications do not replay the arrival');
    f.word.click();await tick();assert.equal(f.d.querySelector('[role=menu]').hidden,false);
    f.setAuth(false);assert.equal(host.hidden,true);assert.equal(f.word.parentNode,f.d.querySelector('.brand'));assert.equal(f.word.firstChild,wordNode);assert.equal(f.d.querySelector('[role=menu]').hidden,true);
  }finally{f.close();}
});
test('the one text-and-arrow button opens only two icon rows and preserves keyboard selection and explicit mode changes',async()=>{
  const f=setup();try{
    await f.menu.ready;const trigger=f.d.querySelector('.research-order-trigger'),panel=f.d.querySelector('[role=menu]');
    trigger.focus();f.word.click();await tick();assert.equal(panel.hidden,false);assert.equal(f.d.activeElement.dataset.orderMode,'simple');
    assert.deepEqual([...panel.querySelectorAll('[role=menuitem]')].map(row=>row.textContent),['간편 견적','상세 견적']);
    assert.equal(panel.querySelectorAll('.research-order-icon').length,2);assert.equal(panel.querySelector('header,h2,[aria-checked],#research-order-eggs,#research-order-back'),null);
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    assert.equal(f.d.activeElement.dataset.orderMode,'detailed');f.d.activeElement.click();assert.deepEqual(f.events,['detailed']);assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,trigger);
    f.d.querySelector('.research-order-arrow').dispatchEvent(new f.w.MouseEvent('click',{bubbles:true}));await tick();assert.equal(panel.hidden,false);
    f.d.querySelector('[data-order-mode=simple]').click();assert.deepEqual(f.events,['detailed'],'choosing the current mode does not open a new transaction');
    trigger.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await tick();assert.equal(f.d.activeElement.dataset.orderMode,'detailed');
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(f.d.activeElement.dataset.orderMode,'simple');
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.d.activeElement.dataset.orderMode,'detailed');
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(panel.hidden,true);assert.equal(f.d.activeElement,trigger);
  }finally{f.close();}
});
test('a pending account editor vetoes opening and disposing a pending publication read restores the original node',async()=>{
  const denied=setup({allow:false});try{await denied.menu.ready;denied.word.click();await tick();assert.equal(denied.d.querySelector('[role=menu]').hidden,true);}finally{denied.close();}
  let release;const pending=new Promise(resolve=>release=resolve),f=setup({pending});
  f.menu.destroy();release({orderMenu:true});await f.menu.ready;assert.equal(f.d.querySelector('.research-order-menu'),null);assert.equal(f.word.parentNode,f.d.querySelector('.brand'));f.close();
});
test('outside pointer cancels a pending open without rewriting the retained wordmark',async()=>{
  let release;const permission=new Promise(resolve=>release=resolve),f=setup({allow:permission});
  try{
    await f.menu.ready;const panel=f.d.querySelector('[role=menu]'),node=f.word.firstChild,trigger=f.d.querySelector('.research-order-trigger');
    f.word.click();await tick();assert.equal(panel.hidden,true);
    f.d.body.dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true,button:0}));
    assert.equal(f.word.firstChild,node,'a no-op close must not cause a child-list mutation');
    release(true);await tick();assert.equal(panel.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
    f.word.click();await tick();assert.equal(panel.hidden,false,'a later explicit open still works');
  }finally{f.close();}
});
test('loss of authentication cancels a pending account-close approval and a late feature response cannot grant access',async()=>{
  let release;const permission=new Promise(resolve=>release=resolve),f=setup({allow:permission});
  try{await f.menu.ready;f.word.click();await tick();f.setAuth(false);release(true);await tick();assert.equal(f.d.querySelector('[role=menu]').hidden,true);assert.deepEqual(f.events,[]);}finally{f.close();}
  let publish;const pending=new Promise(resolve=>publish=resolve),g=setup({pending});
  try{g.setAuth(false);publish({orderMenu:true});await g.menu.ready;assert.equal(g.d.querySelector('.research-order-menu').hidden,true);assert.equal(g.word.parentNode,g.d.querySelector('.brand'));}finally{g.close();}
});

test('inactive selector completion preserves opening and mode choice while focus follows current document ownership',async()=>{
  let release;const permission=new Promise(resolve=>release=resolve),f=setup({allow:permission});
  try{
    await f.menu.ready;const state={focused:true,active:false},attempts=[],focus=f.w.HTMLElement.prototype.focus;
    f.d.hasFocus=()=>state.focused;Object.defineProperty(f.w.navigator,'userActivation',{value:{get isActive(){return state.active;}}});
    f.w.HTMLElement.prototype.focus=function(options){attempts.push(this);return focus.call(this,options);};
    const panel=f.d.querySelector('[role=menu]'),trigger=f.d.querySelector('.research-order-trigger');
    trigger.click();await tick();state.focused=false;release(true);await tick();
    assert.equal(panel.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(attempts.length,0,'a pending account close does not retain stale focus permission');
    panel.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));
    f.d.querySelector('[data-order-mode=detailed]').click();assert.deepEqual(f.events,['detailed']);assert.equal(panel.hidden,true);assert.equal(attempts.length,0);
    state.active=true;trigger.click();await tick();assert.equal(f.d.activeElement.dataset.orderMode,'simple');
    panel.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));assert.equal(f.d.activeElement.dataset.orderMode,'detailed');
    panel.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.d.activeElement,trigger);assert.equal(panel.hidden,true);
  }finally{f.close();}
});
