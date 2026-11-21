import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {installProductUiRegistry} from '../src/server/product-ui/bootstrap.mjs';
import {installProductAdminMotion,productAdminMotionCss} from '../src/server/product-admin-motion.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');

test('pass grid and deck cards stay inside their stage while standalone paper tickets retain normal flow',()=>{
 const css=readFileSync(new URL('../scripts/r3/authored/navigation.css',import.meta.url),'utf8');
 const cards=Array.from({length:4},(_,index)=>'<article class="order-pass nav-ticket" style="--index:'+index+'"><button>견적 상세</button></article>').join('');
 const dom=new JSDOM('<style>'+css+'</style><main class="ds"><section class="page"><div class="pass-stage">'+cards+'</div><article class="nav-ticket ticket-detail">견적 내역</article><div class="nav-ticket empty-ticket">내역 없음</div></section></main>');
 const w=dom.window,stage=w.document.querySelector('.pass-stage');
 for(const deck of [false,true]){
  stage.classList.toggle('is-deck',deck);
  for(const card of stage.children)assert.equal(w.getComputedStyle(card).position,'absolute','paper surface rules must not override the card placement contract');
  assert.equal(w.getComputedStyle(stage).height,deck?'400px':'620px');
 }
 for(const card of w.document.querySelectorAll('.ticket-detail,.empty-ticket'))assert.equal(w.getComputedStyle(card).position,'relative');
 dom.window.close();
});

test('the product registry never adds a separate floating menu to guest, member or embedded pages',()=>{
 const dom=new JSDOM('<main><div class="obm-brand"></div><section class="product-panel-body"></section><section class="product-auth-sheet"></section></main>',{pretendToBeVisual:true});
 const win=dom.window,root=win.document.querySelector('main');
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const registry=installProductUiRegistry(win,{admin:installProductAdminMotion}),module={id:'store-purchase',mount(){return()=>{};}};
 for(const authenticated of [false,true]){
  const adapter={context:{actor:{authenticated}},consultation:{request(){}}};
  const api={mode:'product',adapter,reduced:()=>true,select(){assert.fail('registry mounting must not navigate');}};
  const dispose=registry.mount(module,root,'select',api);
  const panelDispose=registry.mount(module,root.querySelector('.product-panel-body'),'select',api);
  const authDispose=registry.mount(module,root.querySelector('.product-auth-sheet'),'select',api);
  assert.equal(root.querySelector('[data-product-gooey],.pm-gooey-trigger'),null,'the authored notification control alone owns Gooey');
  panelDispose();authDispose();dispose();
 }
 dom.window.close();
});

function existingBell(t){
 const dom=new JSDOM('<style>'+productAdminMotionCss+'</style><main style="height:828px;overflow:hidden;padding-bottom:28px;scroll-padding-bottom:4px"><section class="page" style="height:100%;overflow-y:auto;scroll-padding-bottom:18px!important"><button id="last">마지막 견적 상세</button><div class="ob-quick" style="position:absolute;right:25px;bottom:27px"><button type="button" data-action="quick" aria-label="알림" aria-controls="account-panel" aria-expanded="false"><svg class="ob-notice-icon" aria-hidden="true"><path d="M6 6L18 18"/></svg><span class="quick-unread" hidden>3</span></button></div></section><section role="alertdialog" hidden>수령 확인</section><button id="outside">바깥 동작</button></main>',{pretendToBeVisual:true});
 const win=dom.window,root=win.document.querySelector('main'),container=root.querySelector('.ob-quick'),trigger=container.querySelector('button');
 let scheduled=0;
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 win.requestAnimationFrame=()=>{scheduled++;return scheduled;};win.cancelAnimationFrame=()=>{};
 t.after(()=>win.close());
 return {win,root,container,trigger,api:installProductAdminMotion(win),scheduled:()=>scheduled};
}

const icons=['<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6H20V18H4Z"/></svg>','<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C7 3 4 12 4 16C4 23 20 23 20 16C20 12 17 3 12 3Z"/><path d="M9 9L15 16"/></svg>'];
function actions(run=()=>{}){return [{id:'order-pass',label:'오더 패스',icon:icons[0],run:()=>run('order-pass')},{id:'market-price',label:'시세 알림',icon:icons[1],run:()=>run('market-price')}];}
function translation(button){
 const values=button.style.transform.match(/translate(?:3d)?\(\s*([-.\d]+)px,\s*([-.\d]+)px/);
 assert.ok(values,'radial actions translate on both horizontal and vertical axes');
 return values.slice(1,3).map(Number);
}
function bellState(button){return {html:button.innerHTML,className:button.className,style:button.style.cssText,aria:['aria-label','aria-expanded','aria-controls','aria-haspopup'].map(name=>button.getAttribute(name))};}

test('Gooey requires a supplied notification button and never manufactures another entrypoint',t=>{
 const f=existingBell(t),before=f.root.innerHTML;
 const controller=f.api.mountGooey(f.root,actions(),{reduced:true});
 assert.equal(f.root.innerHTML,before);
 assert.equal(f.root.querySelector('[data-product-gooey]'),null);
 controller.destroy();
 assert.equal(f.root.querySelectorAll('.ob-quick>button').length,1);
});

test('the existing bell opens only two radial icon actions with accessible close, focus and abort cleanup',t=>{
 const f=existingBell(t),original=bellState(f.trigger),abort=new f.win.AbortController(),runs=[];
 const motion=f.api.mountGooey(f.root,actions(id=>runs.push([id,f.trigger.getAttribute('aria-expanded')])),{trigger:f.trigger,container:f.container,signal:abort.signal,reduced:()=>true});
 const group=f.root.querySelector('[data-product-gooey]'),buttons=[...group.querySelectorAll('.pm-gooey-action')];
 assert.equal(f.root.querySelectorAll('.ob-quick>button').length,1);assert.equal(f.container.querySelector(':scope>button'),f.trigger);
 assert.equal(f.root.querySelectorAll('.pm-gooey-trigger').length,1);assert.equal(f.root.querySelector('.pm-gooey-trigger'),f.trigger);
 assert.deepEqual(buttons.map(b=>b.getAttribute('aria-label')),['오더 패스','시세 알림']);
 assert.equal(group.querySelector('.pm-gooey-label'),null,'there are no visible label boxes');
 for(const b of buttons){assert.equal(b.querySelectorAll('svg').length,1);assert.equal(b.textContent,'');assert.equal(b.inert,true);assert.equal(b.tabIndex,-1);b.click();}
 assert.deepEqual(runs,[],'closed actions cannot invoke their destinations');
 f.trigger.click();
 assert.equal(f.trigger.getAttribute('aria-expanded'),'true');assert.equal(f.trigger.getAttribute('aria-controls'),group.querySelector('.pm-gooey-actions').id);
 assert.deepEqual(buttons.map(translation),[[-82,-20],[-22,-82]]);
 assert.ok(buttons.every(b=>b.inert===false&&b.tabIndex===0));
 assert.equal(f.scheduled(),0,'reduced motion paints the final two-dimensional positions without RAF');
 buttons[0].click();assert.deepEqual(runs,[['order-pass','false']]);
 f.trigger.click();buttons[1].click();assert.deepEqual(runs,[['order-pass','false'],['market-price','false']]);
 f.trigger.click();f.trigger.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
 assert.equal(f.win.document.activeElement,buttons[0]);
 buttons[0].dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(f.trigger.getAttribute('aria-expanded'),'false');assert.equal(f.win.document.activeElement,f.trigger);
 motion.setOpen(true);f.root.querySelector('#outside').dispatchEvent(new f.win.MouseEvent('pointerdown',{bubbles:true}));
 assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
 motion.setOpen(true);motion.close();assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
 motion.setOpen(true);abort.abort();motion.destroy();
 assert.equal(f.root.querySelector('[data-product-gooey]'),null);assert.equal(f.container.querySelector(':scope>button'),f.trigger);
 assert.deepEqual(bellState(f.trigger),original,'the supplied bell, badge and original ARIA are restored on disposal');
 f.trigger.click();assert.equal(f.root.querySelector('[data-product-gooey]'),null);assert.equal(runs.length,2,'disposed listeners cannot reopen or invoke actions');
});

test('an existing notification control keeps authored layout and returns after modal ownership without duplication',async t=>{
 const f=existingBell(t),page=f.root.querySelector('.page'),modal=f.root.querySelector('[role=alertdialog]');
 const original={root:f.root.style.cssText,page:page.style.cssText,container:f.container.style.cssText,trigger:bellState(f.trigger)};
 const motion=f.api.mountGooey(f.root,actions(),{trigger:f.trigger,container:f.container,reduced:true});
 const group=f.root.querySelector('[data-product-gooey]');
 assert.equal(f.root.querySelector('.pm-gooey-clearance'),null,'an existing control must not inject unrelated page spacing');
 assert.equal(f.root.style.cssText,original.root);assert.equal(page.style.cssText,original.page);
 motion.setOpen(true);modal.hidden=false;await Promise.resolve();
 assert.equal(f.trigger.getAttribute('aria-expanded'),'false');
 assert.equal(f.win.getComputedStyle(f.container).visibility,'hidden','the original bell and its actions yield to the modal together');
 assert.equal(f.container.inert,true);
 modal.hidden=true;await Promise.resolve();
 assert.equal(f.win.getComputedStyle(f.container).visibility,'visible');assert.equal(f.container.inert,false);
 assert.equal(f.root.querySelectorAll('[data-product-gooey]').length,1);assert.equal(f.root.querySelector('[data-product-gooey]'),group);
 f.trigger.click();assert.equal(f.trigger.getAttribute('aria-expanded'),'true');
 motion.destroy();motion.destroy();
 assert.equal(f.root.querySelector('[data-product-gooey],.pm-gooey-clearance'),null);
 assert.equal(f.container.parentElement,page);assert.equal(f.container.querySelector(':scope>button'),f.trigger);
 assert.equal(f.root.style.cssText,original.root);assert.equal(page.style.cssText,original.page);assert.equal(f.container.style.cssText,original.container);assert.deepEqual(bellState(f.trigger),original.trigger);
 const remounted=f.api.mountGooey(f.root,actions(),{trigger:f.trigger,container:f.container,reduced:true});
 assert.equal(f.root.querySelectorAll('[data-product-gooey]').length,1);f.trigger.click();assert.equal(f.trigger.getAttribute('aria-expanded'),'true');remounted.destroy();
});
