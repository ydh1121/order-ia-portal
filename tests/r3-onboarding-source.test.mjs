import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import {sharedTemplates} from '../src/server/r3-ui/qa-assets.gen.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../src/server/order-engine/browser/brand-account-menu.mjs';
import {mountIntroPagination} from '../scripts/r3/authored/intro-pagination.mjs';
import {installProductAdminMotion,productAdminMotionCss} from '../src/server/product-admin-motion.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const source=await readFile(new URL('../scripts/r3/authored/onboarding.js',import.meta.url),'utf8');
const css=await readFile(new URL('../scripts/r3/authored/onboarding.css',import.meta.url),'utf8');
const core=runtimes.onboarding.slice(0,runtimes.onboarding.indexOf('})(window);')+'})(window);'.length);

function fixture(t,state='guest-1',authenticated=state.startsWith('member-'),context={}){
  const dom=new JSDOM('<!doctype html><style>'+brandAccountMenuCss+productAdminMotionCss+css+'</style><main class="ds" id="root"></main>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://qa.invalid/'});
  const w=dom.window,root=w.document.getElementById('root'),calls=[],captured=new Map();
  w.HTMLElement.prototype.setPointerCapture=function(id){captured.set(id,this);};
  w.HTMLElement.prototype.hasPointerCapture=function(id){return captured.get(id)===this;};
  w.HTMLElement.prototype.releasePointerCapture=function(id){captured.delete(id);};
  w.ORDER_QA_ASSETS=sharedTemplates;
  w.mountBrandAccountMenu=mountBrandAccountMenu;
  installProductAdminMotion(w);
  w.eval(core+'\nwindow.ORDER_INTRO_PAGINATION=('+mountIntroPagination.toString()+');\n'+source);
  const module=w.ORDER_DESIGN_MODULES.find(row=>row.id==='onboarding');
  root.innerHTML=module.render(state);
  const api={mode:'product',reduced:()=>true,brandAccount:{authenticated,...context},select(screen,next){
    calls.push([screen,next]);
    if(screen==='onboarding')root.dispatchEvent(new w.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state:next,markup:module.render(next)}}));
  }};
  let dispose=module.mount(root,state,api);
  const close=()=>{dispose?.();dispose=null;};
  t.after(()=>{close();w.close();});
  function pointer(target,type,x,y,extra={}){
    const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y,...extra});
    for(const [key,value] of Object.entries({pointerId:1,pointerType:'mouse',isPrimary:true,...extra})){
      if(['pointerId','pointerType','isPrimary'].includes(key))Object.defineProperty(event,key,{value});
    }
    target.dispatchEvent(event);return event;
  }
  return {w,root,calls,captured,module,close,pointer,step:()=>Number(root.querySelector('.ob').dataset.introStep)};
}

test('horizontal mouse and touch drags change the current intro while retaining its authenticated brand instance',t=>{
  const f=fixture(t,'member-1'),brand=f.root.querySelector('.ob-brand-common'),svg=brand.querySelector('svg'),menu=brand.__orderAccountMenu;
  f.pointer(f.root.querySelector('h1'),'pointerdown',270,150);
  assert.equal(f.pointer(f.w,'pointermove',190,153).defaultPrevented,true);
  assert.equal(f.captured.size,1);
  f.pointer(f.w,'pointerup',150,153);
  assert.equal(f.step(),2);
  assert.equal(f.captured.size,0);
  assert.equal(f.root.querySelector('.ob-brand-common'),brand);
  assert.equal(brand.querySelector('svg'),svg);
  assert.equal(brand.__orderAccountMenu,menu);
  assert.equal(menu.inspect().authenticated,true);
  f.pointer(f.root.querySelector('.ob-art'),'pointerdown',70,340,{pointerType:'touch',pointerId:8});
  assert.equal(f.pointer(f.w,'pointermove',155,342,{pointerType:'touch',pointerId:8}).defaultPrevented,true);
  f.pointer(f.w,'pointerup',190,342,{pointerType:'touch',pointerId:8});
  assert.equal(f.step(),1);
  assert.deepEqual(f.calls,[['onboarding','member-2'],['onboarding','member-1']]);
});

test('vertical scrolling, canceled drags and non-primary pointers never select another intro',t=>{
  const f=fixture(t),heading=f.root.querySelector('h1');
  f.pointer(heading,'pointerdown',200,160,{pointerType:'touch'});
  assert.equal(f.pointer(f.w,'pointermove',202,220,{pointerType:'touch'}).defaultPrevented,false);
  assert.equal(f.pointer(f.w,'pointerup',80,222,{pointerType:'touch'}).defaultPrevented,false);
  assert.equal(f.captured.size,0);
  f.pointer(heading,'pointerdown',240,160);
  f.pointer(f.w,'pointermove',170,161);
  f.pointer(f.w,'pointercancel',170,161);
  f.pointer(f.w,'pointerup',90,161);
  assert.equal(f.captured.size,0);
  f.pointer(heading,'pointerdown',240,160);
  f.pointer(f.w,'pointermove',170,161);
  f.pointer(f.root.querySelector('.ob-main'),'lostpointercapture',170,161);
  f.pointer(f.w,'pointerup',90,161);
  f.pointer(heading,'pointerdown',240,160,{isPrimary:false,pointerId:2});
  f.pointer(f.w,'pointermove',90,161,{isPrimary:false,pointerId:2});
  f.pointer(f.w,'pointerup',90,161,{isPrimary:false,pointerId:2});
  f.pointer(heading,'pointerdown',240,160,{button:2});
  f.pointer(f.w,'pointerup',90,161,{button:2});
  assert.equal(f.step(),1);
  assert.deepEqual(f.calls,[]);
});

test('a dragged pagination control selects the nearest page once and disposal releases active capture and listeners',t=>{
  const f=fixture(t),buttons=[...f.root.querySelectorAll('[data-mf-intro]')];
  buttons.forEach((button,i)=>{button.getBoundingClientRect=()=>({x:100+i*30,width:24,height:44});});
  f.pointer(buttons[0],'pointerdown',112,650);
  f.pointer(f.w,'pointermove',170,650);
  f.pointer(f.w,'pointerup',202,650);
  assert.equal(f.step(),4);
  buttons[3].click();
  assert.deepEqual(f.calls,[['onboarding','guest-4']]);
  f.pointer(f.root.querySelector('h1'),'pointerdown',240,160);
  f.pointer(f.w,'pointermove',170,160);
  assert.equal(f.captured.size,1);
  f.close();
  assert.equal(f.captured.size,0);
  f.pointer(f.w,'pointerup',80,160);
  f.root.querySelector('h1').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.deepEqual(f.calls,[['onboarding','guest-4']]);
});

test('intro text and image native drags are suppressed while actions and keyboard pagination remain usable',t=>{
  const f=fixture(t),heading=f.root.querySelector('h1'),image=f.root.querySelector('.ob-art');
  const selection=new f.w.Event('selectstart',{bubbles:true,cancelable:true});heading.dispatchEvent(selection);
  const nativeDrag=new f.w.Event('dragstart',{bubbles:true,cancelable:true});image.dispatchEvent(nativeDrag);
  assert.equal(selection.defaultPrevented,true);
  assert.equal(nativeDrag.defaultPrevented,true);
  const login=f.root.querySelector('.ob-login');
  f.pointer(login,'pointerdown',250,720);f.pointer(f.w,'pointermove',100,720);f.pointer(f.w,'pointerup',100,720);
  assert.equal(f.step(),1);
  login.click();
  assert.deepEqual(f.calls,[['login','empty']]);
  heading.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(f.step(),2);
  f.root.querySelector('[data-mf-intro="4"]').click();
  assert.equal(f.step(),4);
});

test('the company drawer cancels a pending intro drag, isolates its backdrop and restores keyboard focus',t=>{
  const f=fixture(t),opener=f.root.querySelector('[data-company-open]'),stage=f.root.querySelector('.ob-stage');
  f.pointer(f.root.querySelector('h1'),'pointerdown',250,160);
  f.pointer(f.w,'pointermove',180,160);
  opener.click();
  assert.equal(f.captured.size,0);
  assert.equal(stage.inert,true);
  assert.equal(f.root.querySelector('.ob-shade').hidden,false);
  assert.equal(f.w.document.activeElement,f.root.querySelector('[data-company-close]'));
  assert.equal(f.w.getComputedStyle(stage.querySelector('header')).backgroundColor,'rgb(255, 255, 255)');
  f.pointer(f.w,'pointerup',80,160);
  f.pointer(f.root.querySelector('h1'),'pointerdown',250,160);
  f.pointer(f.w,'pointermove',100,160);f.pointer(f.w,'pointerup',100,160);
  assert.deepEqual(f.calls,[]);
  f.root.querySelector('.ob-grip').dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(stage.inert,false);
  assert.equal(f.root.querySelector('.ob-shade').hidden,true);
  assert.equal(f.w.document.activeElement,opener);
});

test('the two retained illustrations regain their supplied captions and the member quick control retains its notification hooks',t=>{
  const f=fixture(t,'member-1');
  assert.equal(f.root.querySelector('.ob-art-caption').textContent,'1일 출하량 약 12만 구 이상 규모난각번호 1번, 2번 합산 기준');
  const quick=f.root.querySelector('[data-action="quick"]');
  assert.equal(quick.querySelector('.ob-notice-icon').getAttribute('viewBox'),'0 0 24 24');
  assert.equal(quick.querySelectorAll('.ob-notice-icon path').length,2);
  assert.ok(quick.querySelector('.quick-unread[hidden]'));
  assert.equal(f.root.querySelectorAll('[data-product-gooey]').length,1);
  assert.equal(quick.closest('[data-product-gooey]'),quick.parentElement);
  const fragment=f.w.document.createElement('div');fragment.innerHTML=f.module.render('guest-2');
  assert.equal(fragment.querySelector('.ob-copy p').textContent,'가격 거품을 최대한 걷어내고국내 최대 규모의 농장에서 직접 배송해요');
  assert.equal(fragment.querySelector('.ob-art-caption').textContent,'당사 1일 출하량 약 120,000 구 이상난각번호 1번, 2번 합산 기준전국 1일 평균 : 약 16,000구');
  fragment.innerHTML=f.module.render('guest-3');
  assert.equal(fragment.querySelector('.ob-art'),null);
  assert.equal(fragment.querySelector('.ob-art-caption'),null);
});

test('the existing notification bell offers only Order Pass and market notification routes with its live unread count',async t=>{
  const seen=[],rendered=[];
  const f=fixture(t,'member-1',true,{unread:3,onStateChange:snapshot=>seen.push(snapshot.unread),renderPanel({id,container,setUnread}){
    rendered.push(id);
    const control=container.ownerDocument.createElement('button');control.textContent='모두 읽음';
    control.addEventListener('click',()=>setUnread(0));container.append(control);
  }});
  const quick=f.root.querySelector('[data-action="quick"]'),badge=quick.querySelector('.quick-unread'),menu=f.root.querySelector('.ob-brand-common').__orderAccountMenu;
  const actions=[...f.root.querySelectorAll('.pm-gooey-action')];
  assert.equal(badge.textContent,'3');assert.equal(badge.hidden,false);
  assert.equal(f.root.querySelectorAll('.ob-quick>button').length,1);
  assert.equal(quick.getAttribute('aria-controls'),f.root.querySelector('.pm-gooey-actions').id);
  assert.deepEqual(actions.map(button=>button.getAttribute('aria-label')),['오더 패스','시세 알림']);
  assert.ok(actions[1].querySelector('.ob-market-notice-icon path[data-currency="KRW"]'),'the egg contains the Korean won mark requested by the user');
  assert.equal(actions[1].querySelector('path[d="M9 9L15 16"]'),null,'a lone backslash is not the currency mark');
  assert.equal(f.root.querySelector('.pm-gooey-label'),null);
  quick.click();
  assert.equal(quick.getAttribute('aria-expanded'),'true');assert.deepEqual(rendered,[],'the bell opens the radial actions before any account panel');
  actions[0].click();await Promise.resolve();
  assert.equal(menu.inspect().page,'manage.quotes');assert.deepEqual(rendered,['manage.quotes']);
  assert.equal(quick.getAttribute('aria-expanded'),'false');
  menu.close({immediate:true});await Promise.resolve();
  quick.click();actions[1].click();
  await Promise.resolve();
  assert.equal(menu.inspect().page,'notifications');
  assert.deepEqual(rendered,['manage.quotes','notifications']);
  assert.equal(quick.getAttribute('aria-expanded'),'false');
  menu.panel.querySelector('[data-obm-page="notifications"] .obm-panel-content button').click();
  assert.equal(menu.inspect().unread,0);
  assert.equal(badge.hidden,true);
  assert.ok(seen.includes(0));
  menu.update({unread:5});
  assert.equal(badge.textContent,'5');assert.equal(badge.hidden,false);
  menu.close({immediate:true});
  assert.equal(quick.getAttribute('aria-expanded'),'false');
  await Promise.resolve();
  quick.click();
  f.root.dispatchEvent(new f.w.CustomEvent('r3-onboarding-state',{cancelable:true,detail:{state:'member-2',markup:f.module.render('member-2')}}));
  assert.equal(f.root.querySelector('[data-action="quick"]'),quick);assert.equal(f.root.querySelectorAll('[data-product-gooey]').length,1);assert.equal(f.root.querySelectorAll('.pm-gooey-action').length,2);
  assert.equal(quick.getAttribute('aria-expanded'),'false','changing intro steps closes the same existing owner');
  f.close();assert.equal(f.root.querySelector('[data-product-gooey],.pm-gooey-action'),null);assert.equal(f.root.querySelector('[data-action="quick"]'),quick);
});
