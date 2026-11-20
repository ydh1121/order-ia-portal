import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import {quoteJellyRuntime,quoteFiles} from '../src/server/r3-product-sources.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import * as history from '../src/server/r3-ui/brand-history.gen.mjs';
import {extendBrandAccountSource} from '../src/server/r3-brand-account-extension.mjs';
import {extendQuoteSource} from '../src/server/r3-product-extensions.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../src/server/order-engine/browser/brand-account-menu.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const original=gunzipSync(Buffer.from(frames[catalog.find(row=>row.screen==='onboarding'&&row.state==='guest-1').current],'base64')).toString();
const source=new JSDOM(original),svg=source.window.document.querySelector('header svg').outerHTML;source.window.close();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
  const dom=new JSDOM('<style>'+brandAccountMenuCss+'</style><header><span class="brand"><span class="brand-word">Order<span class="brand-dot">.</span></span>'+svg+'</span></header><button id="outside">다른 화면</button>',{runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.eval(quoteJellyRuntime);
  const brand=d.querySelector('.brand'),mark=brand.querySelector('svg'),paths=[...mark.querySelectorAll('g>path')];
  const api=mountBrandAccountMenu(brand,{reducedMotion:true,...options});
  return {dom,w,d,brand,mark,paths,api,close(){api.destroy();w.close();}};
}
test('the original CODE1 paths remain the only trigger mark; a guest cannot open a menu',()=>{
  const f=fixture();
  assert.equal(f.api.open(),false);f.api.trigger.click();
  assert.equal(f.api.panel.hidden,true);assert.equal(f.api.trigger.hasAttribute('aria-haspopup'),false);
  assert.deepEqual([...f.api.trigger.querySelectorAll('g>path')],f.paths);
  assert.equal(f.api.inspect().phase,'closed');
  const again=mountBrandAccountMenu(f.brand,{unread:2});assert.equal(again,f.api);
  f.api.destroy();assert.equal(f.brand.querySelector('svg'),f.mark);assert.equal(f.d.querySelector('[data-order-account-panel]'),null);f.w.close();
});
test('guest interaction runs the original CODE1 simulation while keeping the panel closed',()=>{
  const f=fixture({reducedMotion:false}),before=f.paths.map(path=>path.getAttribute('d')),queue=[];
  f.w.requestAnimationFrame=callback=>{queue.push(callback);return queue.length;};
  f.w.cancelAnimationFrame=()=>{};
  f.api.trigger.click();
  for(let time=0;time<10;time++){const work=queue.splice(0);for(const callback of work)callback(f.w.performance.now()+16*time);}
  assert.notDeepEqual(f.paths.map(path=>path.getAttribute('d')),before);
  assert.equal(f.api.panel.hidden,true);assert.equal(f.api.inspect().authenticated,false);f.close();
});
test('a member opens the original three roots and all specified children inside the same panel',async()=>{
  const calls=[],f=fixture({authenticated:true,renderPanel({id,container}){calls.push(id);container.textContent='서버에서 받은 '+id;}});
  f.api.open();const panel=f.api.panel;
  assert.deepEqual([...panel.querySelectorAll('[data-obm-item]')].map(node=>node.dataset.obmItem),['profile','notifications','manage']);
  panel.querySelector('[data-obm-item=profile]').click();
  assert.deepEqual([...panel.querySelector('[data-obm-page=profile]').querySelectorAll('[data-obm-item]')].map(node=>node.dataset.obmItem),['profile.account','profile.personal','profile.connections']);
  panel.querySelector('[data-obm-item="profile.account"]').click();await tick();
  assert.deepEqual(calls,['profile.account']);assert.equal(f.api.panel,panel);
  assert.match(panel.textContent,/서버에서 받은 profile.account/);
  f.api.back();f.api.back();panel.querySelector('[data-obm-item=manage]').click();
  assert.deepEqual([...panel.querySelector('[data-obm-page=manage]').querySelectorAll('[data-obm-item]')].map(node=>node.dataset.obmItem),['manage.delivery','manage.payments','manage.quotes','manage.business','manage.dashboard']);
  assert.equal(f.d.querySelectorAll('[data-order-account-panel]').length,1);f.close();
});
test('account and notifications resolve from the injected adapter, with nested business members on the same stack',async()=>{
  let request;const f=fixture({authenticated:true,renderPanel(context){request=context;context.container.textContent=context.id;}});
  f.api.open('manage');f.api.show('manage.business');await tick();
  assert.equal(request.id,'manage.business');request.push('manage.business.members','구성원과 권한');await tick();
  assert.equal(f.api.inspect().page,'manage.business.members');assert.equal(request.id,'manage.business.members');
  assert.equal(f.api.panel.querySelector('h2').textContent,'구성원과 권한');
  f.api.close();f.api.open('notifications');await tick();
  assert.equal(request.id,'notifications');f.close();
});
test('leaving a loading panel aborts its request and disposes late completions',async()=>{
  let resolve,signal,disposed=0;const f=fixture({authenticated:true,renderPanel(context){signal=context.signal;return new Promise(done=>{resolve=done;});}});
  f.api.open('notifications');await tick();f.api.back();assert.equal(signal.aborted,true);
  resolve(()=>disposed++);await tick();assert.equal(disposed,1);assert.equal(f.api.inspect().page,'root');
  assert.equal(f.api.panel.querySelector('[data-obm-page=notifications]'),null);f.close();
});
test('unread counts, same-auth refresh, keyboard back and outside focus keep one coherent menu state',async()=>{
  const f=fixture({authenticated:true,renderPanel(){}});f.api.setUnread(7);f.api.open();
  assert.equal(f.api.panel.querySelector('.t-badge').dataset.open,'true');
  assert.equal(f.api.panel.querySelector('.t-badge-dot').textContent,'7');
  f.api.update({authenticated:true,unread:0});assert.equal(f.api.trigger.getAttribute('aria-expanded'),'true');
  assert.equal(f.api.panel.querySelector('.t-badge').dataset.open,'false');
  f.api.show('profile');f.api.panel.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(f.api.inspect().page,'root');
  f.d.querySelector('#outside').focus();assert.equal(f.api.inspect().phase,'closed');assert.equal(f.d.activeElement.id,'outside');
  f.api.trigger.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  assert.equal(f.d.activeElement.dataset.obmItem,'manage');
  f.api.panel.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(f.d.activeElement,f.api.trigger);f.close();
});
test('rapid close/reopen cannot keep the surface inert or let a stale transition close it',async()=>{
  const f=fixture({authenticated:true,reducedMotion:false});
  for(const token of ['--morph-open-dur','--morph-close-dur','--duration-stagger'])f.api.panel.style.setProperty(token,'1ms');
  f.api.open();f.api.close();f.api.open();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(f.api.inspect().phase,'open');assert.equal(f.api.panel.inert,false);assert.equal(f.api.panel.hidden,false);
  assert.equal(f.api.panel.querySelector('.t-morph').dataset.open,'true');
  f.api.setAuthenticated(false);assert.equal(f.api.inspect().phase,'closed');assert.equal(f.api.panel.hidden,true);f.close();
});
test('the production styles retain source morphology, side-by-side, and reduced-motion guards without duplicate root tokens',()=>{
  assert.match(brandAccountMenuCss,/width var\(--morph-open-dur\) var\(--morph-ease\)/);
  assert.match(brandAccountMenuCss,/height var\(--morph-close-dur\) var\(--morph-close-ease\)/);
  assert.match(brandAccountMenuCss,/border-radius var\(--morph-open-dur\) var\(--morph-ease\)/);
  assert.match(brandAccountMenuCss,/\.t-morph-menu[\s\S]*?filter: blur\(var\(--morph-blur\)\)/);
  assert.match(brandAccountMenuCss,/\.t-page-slide[\s\S]*?will-change: opacity, transform, filter/);
  assert.match(brandAccountMenuCss,/@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(brandAccountMenuCss,/:root\s*\{|transition:\s*all\b/);
});
test('onboarding and profile consumers invoke the same context-backed logo instead of a separate profile trigger',async()=>{
  for(const [screen,state] of [['onboarding','member-1'],['profile','menu']]){
    const row=catalog.find(row=>row.screen===screen&&row.state===state),dom=new JSDOM(gunzipSync(Buffer.from(frames[row.current],'base64')).toString(),{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
    const calls=[],selected=[];w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    w.ORDER_BRAND_ACCOUNT_CONTEXT={authenticated:true,renderPanel({id,container}){calls.push(id);container.textContent=id;}};
    w.eval(runtimes[row.runtimeFamily]);const root=w.document.querySelector('#order-single'),mark=root.querySelector('header svg');
    const dispose=w.ORDER_DESIGN_MODULES.find(module=>module.id===screen).mount(root,state,{select:(...args)=>selected.push(args),reduced:()=>true});
    assert.equal(root.querySelector('.account-trigger'),null);assert.equal(root.querySelector('header svg'),mark);
    if(screen==='onboarding')root.querySelector('[data-order-account-trigger]').click();
    const panel=w.document.querySelector('[data-order-account-panel]');assert.equal(panel.classList.contains('ds'),true);
    panel.querySelector('[data-obm-item=profile]').click();panel.querySelector('[data-obm-item="profile.account"]').click();await tick();
    assert.deepEqual(calls,['profile.account']);assert.deepEqual(selected,[]);dispose();w.close();
  }
});
test('the shared-brand revision preserves every previous current artifact and its original executable family',()=>{
  assert.equal(Object.keys(history.archivedRows).length,catalog.length);
  for(const row of catalog){const before=history.archivedRows[row.id];assert.ok(before);assert.ok(history.archivedBodies[before.body]);if(before.script)assert.ok(history.archivedScripts[before.script]);}
  const prior=history.archivedRows['profile/menu/email'];
  assert.match(gunzipSync(Buffer.from(history.archivedBodies[prior.body],'base64')).toString(),/class="account-trigger"/);
  assert.match(gunzipSync(Buffer.from(history.archivedScripts[prior.script],'base64')).toString(),/function accountPanel/);
  assert.notEqual(prior.body,catalog.find(row=>row.id==='profile/menu/email').current);
});
test('the sealed product mounts one original CODE1 instance and keeps the feature-controlled Order arrow beside its wordmark',async()=>{
  const dom=new JSDOM('<header class="header"><span class="brand"><span>Order</span><span class="brand-dot">.</span>'+svg+'</span></header>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.eval(quoteJellyRuntime);
  const originalJelly=w.Code1Jelly;let mounts=0,switches=0;
  w.Code1Jelly={...originalJelly,mount(...args){mounts++;return originalJelly.mount(...args);}};
  w.OrderSharedMount=mountBrandAccountMenu;w.OrderSharedCss=brandAccountMenuCss;w.ORDER_BRAND_ACCOUNT_CONTEXT={authenticated:true,renderPanel(){}};
  const sealedBrand=gunzipSync(Buffer.from(quoteFiles['web/brand.mjs'],'base64')).toString();
  const extension=extendQuoteSource('web/brand.mjs',sealedBrand);
  assert.equal(extension,extendBrandAccountSource('web/brand.mjs',sealedBrand));
  assert.match(extension,/import \* as Code1Jelly from '.\/code1-jelly.mjs'/);
  w.eval('const Code1Jelly=window.Code1Jelly,mountBrandAccountMenu=window.OrderSharedMount,brandAccountMenuCss=window.OrderSharedCss;\n'+extension.replace(/^import .*;\n/gm,'').replace('export function mountOrderBrand','window.mountOrderBrand=function'));
  const a=w.mountOrderBrand(),b=w.mountOrderBrand();assert.equal(mounts,1);assert.equal(w.document.querySelectorAll('style[data-order-brand-account-css]').length,1);
  const sealedMenu=gunzipSync(Buffer.from(quoteFiles['web/order-menu.mjs'],'base64')).toString();
  w.fetch=async()=>({ok:true,json:async()=>({orderMenu:true})});
  w.eval(extendQuoteSource('web/order-menu.mjs',sealedMenu).replace('export function mountOrderMenu','window.mountOrderMenu=function'));
  w.mountOrderMenu({simple:true,switchMode(){switches++;}});await tick();
  const mode=w.document.querySelector('.order-menu'),word=w.document.querySelector('.obm-wordmark');
  assert.equal(mode.previousElementSibling,word);assert.equal(mode.hidden,false);
  mode.querySelector('.order-menu-trigger').click();mode.querySelectorAll('[role=menuitemradio]')[1].click();assert.equal(switches,1);
  assert.equal(w.document.querySelectorAll('[data-order-account-trigger]').length,1);a.destroy();b.destroy();assert.equal(w.document.querySelector('[data-order-account-panel]'),null);w.close();
});
test('brand adapters reject changed sealed source shapes and leave unrelated product source alone',()=>{
  assert.throws(()=>extendBrandAccountSource('web/brand.mjs','export function changed(){}'),/SOURCE_MISMATCH/);
  assert.throws(()=>extendBrandAccountSource('web/order-menu.mjs','other source'),/SOURCE_MISMATCH/);
  assert.equal(extendBrandAccountSource('web/app.mjs','unrelated source'),null);
});
test('denied capabilities hide rows and reject direct entry, while a refreshed capability updates the same menu',()=>{
  const f=fixture({authenticated:true,canAccess:id=>id!=='manage.dashboard'});
  assert.equal(f.api.open('manage.dashboard'),false);assert.equal(f.api.panel.hidden,true);
  f.api.open('manage');let row=f.api.panel.querySelector('[data-obm-item="manage.dashboard"]');
  assert.equal(row.hidden,true);assert.equal(f.api.show('manage.dashboard'),false);assert.equal(f.api.inspect().page,'manage');
  f.api.update({canAccess:()=>true});assert.equal(row.hidden,false);assert.equal(f.api.show('manage.dashboard'),true);
  f.api.update({canAccess:id=>id!=='manage'});assert.equal(f.api.inspect().page,'root');assert.equal(f.api.panel.querySelector('[data-obm-item=manage]').hidden,true);
  assert.equal(f.api.show('manage.business'),false);f.close();
});
