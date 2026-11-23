import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {mountResearchOrderMenu} from '../src/server/research-app/order-menu.mjs';
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({flag=true,pending,allow=true,route={screen:'q1',kind:'quote',mode:'simple'}}={}){
  const dom=new JSDOM('<main id="order-single"><div class="brand"><span class="brand-word">Order</span><button>계정</button></div></main>',{pretendToBeVisual:true});
  const w=dom.window,d=w.document,events=[],reads=[];w.matchMedia=()=>({matches:true});
  const adapter={ready:Promise.resolve(),async request(path,body,signal){reads.push({path,body,signal});return pending?pending:{orderMenu:flag};}};
  const menu=mountResearchOrderMenu({brand:d.querySelector('.brand'),adapter,getRoute:()=>route,beforeOpen:()=>allow,onChoose:mode=>events.push(mode)});
  return {w,d,menu,events,reads,route,adapter,close(){menu.destroy();dom.window.close();}};
}
test('feature publication is checked before presenting the global selector, and failures close it',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve),f=setup({pending});try{
    assert.equal(f.d.querySelector('.research-order-menu').hidden,true);release({orderMenu:true});await f.menu.ready;
    assert.equal(f.d.querySelector('.research-order-menu').hidden,false);
    f.d.querySelector('.research-order-trigger').click();await tick();assert.equal(f.d.querySelector('[role=menu]').hidden,false);
    f.adapter.request=async()=>{throw Error('OFFLINE');};await f.menu.refresh();
    assert.equal(f.d.querySelector('.research-order-menu').hidden,true);assert.equal(f.d.querySelector('[role=menu]').hidden,true);
    assert.ok(f.reads.every(x=>x.path==='/features'&&x.body===null));assert.deepEqual(f.events,[]);
  }finally{f.close();}
});
test('stack navigation and keyboard return preserve mode choice and delegate each explicit change once',async()=>{
  const f=setup();try{
    await f.menu.ready;const trigger=f.d.querySelector('.research-order-trigger');trigger.click();await tick();
    assert.equal(f.d.querySelector('.research-order-head h2').textContent,'Order');
    f.d.querySelector('.research-order-row').click();
    assert.equal(f.d.querySelector('.research-order-head h2').textContent,'계란');
    assert.equal(f.d.activeElement.dataset.orderMode,'simple');
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    assert.equal(f.d.activeElement.dataset.orderMode,'detailed');f.d.activeElement.click();assert.deepEqual(f.events,['detailed']);assert.equal(f.d.querySelector('[role=menu]').hidden,true);
    trigger.click();await tick();f.d.querySelector('.research-order-row').click();f.d.querySelector('[data-order-mode=simple]').click();assert.deepEqual(f.events,['detailed']);
    trigger.click();await tick();f.d.querySelector('.research-order-row').click();f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(f.d.querySelector('.research-order-head h2').textContent,'Order');
    f.d.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.d.activeElement,trigger);
  }finally{f.close();}
});
test('a pending account editor vetoes opening and a disposed pending feature request cannot resurrect the menu',async()=>{
  const denied=setup({allow:false});try{await denied.menu.ready;denied.d.querySelector('.research-order-trigger').click();await tick();assert.equal(denied.d.querySelector('[role=menu]').hidden,true);}finally{denied.close();}
  let release;const pending=new Promise(resolve=>release=resolve),f=setup({pending});
  f.menu.destroy();release({orderMenu:true});await f.menu.ready;assert.equal(f.d.querySelector('.research-order-menu'),null);f.close();
});

test('closing an already hidden selector cancels its pending open without rewriting its title',async()=>{
  let release;const permission=new Promise(resolve=>release=resolve),f=setup({allow:permission});
  try{
    await f.menu.ready;const panel=f.d.querySelector('[role=menu]'),title=panel.querySelector('h2'),node=title.firstChild,trigger=f.d.querySelector('.research-order-trigger');
    trigger.click();await tick();assert.equal(panel.hidden,true);
    f.d.body.dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true,button:0}));
    assert.equal(title.firstChild,node,'a no-op close must not cause a child-list mutation');
    release(true);await tick();assert.equal(panel.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
    trigger.click();await tick();assert.equal(panel.hidden,false,'a later explicit open still works');
  }finally{f.close();}
});
