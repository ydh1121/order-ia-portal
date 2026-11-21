import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {installProductUiRegistry} from '../src/server/product-ui/bootstrap.mjs';
import {installProductAdminMotion} from '../src/server/product-admin-motion.mjs';
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

test('one Gooey page menu opens actual consultation, account and notifications; embedded panels do not duplicate it',()=>{
 const dom=new JSDOM('<main id="page"><div class="obm-brand" data-authenticated="true"></div><section class="product-panel-body"></section><section class="product-auth-sheet"></section></main>',{pretendToBeVisual:true});
 const win=dom.window,root=win.document.querySelector('main'),navigation=[],panels=[];
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const adapter={context:{actor:{authenticated:true}},consultation:{request(){}}};
 win.ORDER_APP_ADAPTER=adapter;
 root.querySelector('.obm-brand').__orderAccountMenu={open(id){panels.push(id);}};
 const registry=installProductUiRegistry(win,{admin:installProductAdminMotion}),module={id:'store-purchase',mount(){return()=>{};}},api={mode:'product',adapter,reduced:()=>true,select(...args){navigation.push(args);}};
 const dispose=registry.mount(module,root,'select',api);
 assert.equal(root.querySelectorAll('[data-product-gooey]').length,1);
 for(const label of ['납품 상담','내 계정','알림']){
  root.querySelector('.pm-gooey-trigger').click();root.querySelector('.pm-gooey-action[aria-label="'+label+'"]').click();
 }
 assert.deepEqual(navigation,[['drawer','closed']]);assert.deepEqual(panels,['profile','notifications']);
 const panelDispose=registry.mount(module,root.querySelector('.product-panel-body'),'select',api);
 const authDispose=registry.mount(module,root.querySelector('.product-auth-sheet'),'select',api);
 assert.equal(root.querySelectorAll('[data-product-gooey]').length,1);
 panelDispose();authDispose();assert.equal(root.querySelectorAll('[data-product-gooey]').length,1);
 dispose();assert.equal(root.querySelector('[data-product-gooey]'),null);dom.window.close();
});

test('guest pages have no authenticated floating actions and a page without a brand uses connected profile routes',()=>{
 const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),win=dom.window,root=win.document.querySelector('main'),navigation=[];
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const registry=installProductUiRegistry(win,{admin:installProductAdminMotion}),module={id:'profile',mount(){return()=>{};}},adapter={context:{actor:{authenticated:false}}},api={mode:'product',adapter,reduced:()=>true,select(...args){navigation.push(args);}};
 let dispose=registry.mount(module,root,'default',api);assert.equal(root.querySelector('[data-product-gooey]'),null);dispose();
 adapter.context.actor.authenticated=true;dispose=registry.mount(module,root,'default',api);
 for(const label of ['내 계정','알림']){root.querySelector('.pm-gooey-trigger').click();root.querySelector('.pm-gooey-action[aria-label="'+label+'"]').click();}
 assert.deepEqual(navigation,[['profile','default'],['profile','notification']]);dispose();dom.window.close();
});

test('Gooey leaves the last action reachable inside the actual scroller and restores layout after modal and disposal',async()=>{
 const dom=new JSDOM('<main style="height:828px;overflow:hidden;padding-bottom:28px;scroll-padding-bottom:4px"><section class="page" style="height:100%;overflow-y:auto;scroll-padding-bottom:18px!important"><button id="last">마지막 견적 상세</button></section><section role="alertdialog" hidden>수령 확인</section></main>',{pretendToBeVisual:true});
 const win=dom.window,root=win.document.querySelector('main'),page=root.querySelector('.page'),modal=root.querySelector('[role=alertdialog]');
 win.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
 const motion=installProductAdminMotion(win).mountGooey(root,[{label:'내 계정',run(){}}],{reduced:true});
 const group=root.querySelector('[data-product-gooey]'),tail=page.querySelector('.pm-gooey-clearance');
 assert.equal(tail.previousElementSibling.id,'last','space belongs after the final action in the nested page, not outside its clipping parent');
 assert.ok(parseFloat(tail.style.height)>=88);assert.equal(tail.getAttribute('aria-hidden'),'true');
 assert.equal(page.style.scrollPaddingBottom,tail.style.height);assert.equal(root.style.scrollPaddingBottom,'4px');
 assert.equal(root.style.paddingBottom,'28px','authored padding remains responsive and untouched');
 modal.hidden=false;await Promise.resolve();assert.equal(group.inert,true);assert.equal(group.style.visibility,'hidden');
 modal.hidden=true;await Promise.resolve();assert.equal(group.inert,false);assert.equal(group.style.visibility,'');
 page.style.overflowY='visible';root.style.overflowY='auto';win.dispatchEvent(new win.Event('resize'));
 assert.equal(page.style.scrollPaddingBottom,'18px');assert.equal(page.style.getPropertyPriority('scroll-padding-bottom'),'important');
 assert.equal(root.style.scrollPaddingBottom,tail.style.height,'a changed scroll owner receives the same reachability clearance');
 motion.destroy();assert.equal(root.querySelector('.pm-gooey-clearance'),null);assert.equal(root.querySelector('[data-product-gooey]'),null);
 assert.equal(root.style.scrollPaddingBottom,'4px');assert.equal(root.style.paddingBottom,'28px');
 dom.window.close();
});
