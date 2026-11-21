import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import * as productSources from '../src/server/r3-product-sources.mjs';
import {runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
import * as history from '../src/server/r3-ui/brand-history.gen.mjs';
import {extendBrandAccountSource} from '../src/server/r3-brand-account-extension.mjs';
import {extendQuoteSource} from '../src/server/r3-product-extensions.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from '../src/server/order-engine/browser/brand-account-menu.mjs';
import {getQaMvpRuntimeSource} from '../src/server/r3-ui/qa-mvp-runtime.mjs';
import {buyerResultClient,projectBuyerResult} from '../src/server/r3-quote-result.mjs';
const {quoteJellyRuntime,quoteFiles}=productSources;
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
  const {beforeMount,...settings}=options;beforeMount?.({dom,w,d,brand,mark,paths});
  const api=mountBrandAccountMenu(brand,{reducedMotion:true,...settings});
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
test('the account panel stays inside its screen, remounts with stable identity, and anchors at the upper right',()=>{
  const f=fixture({authenticated:true,beforeMount({d,brand}){const root=d.createElement('main');root.id='order-single';d.body.prepend(root);root.append(brand.closest('header'));}});
  Object.defineProperty(f.w,'innerWidth',{value:390});Object.defineProperty(f.w,'innerHeight',{value:844});
  f.api.trigger.getBoundingClientRect=()=>({left:314,top:24,width:52,height:44,right:366,bottom:68});
  const id=f.api.panel.id;f.api.open();
  assert.equal(f.api.panel.parentElement.id,'order-single');assert.equal(f.api.panel.style.top,'24px');assert.equal(f.api.panel.style.left,'46px');
  f.api.destroy();const again=mountBrandAccountMenu(f.brand,{authenticated:true,reducedMotion:true});assert.equal(again.panel.id,id);again.destroy();f.close();
});
test('a long account form keeps the trigger origin and uses the remaining viewport for its scroll container',async()=>{
  const f=fixture({authenticated:true,renderPanel({container}){
    Object.defineProperty(container.closest('[data-obm-page]'),'scrollHeight',{value:1500,configurable:true});
    const last=f.d.createElement('button');last.textContent='마지막 저장';container.append(last);
  }});
  Object.defineProperty(f.w,'innerWidth',{value:375});Object.defineProperty(f.w,'innerHeight',{value:828});
  const triggerTop=20.37389;
  f.api.trigger.getBoundingClientRect=()=>({left:299,top:triggerTop,width:51.874,height:44,right:350.874,bottom:triggerTop+44});
  f.api.open();f.api.show('manage');f.api.show('manage.business');await tick();await tick();
  const panel=f.api.panel,menu=panel.querySelector('.obm-menu'),last=panel.querySelector('.obm-panel-content button');
  assert.equal(parseFloat(panel.style.top),triggerTop,'a long form must not shift the morph above its trigger');
  assert.ok(Math.abs(parseFloat(panel.style.height)-(828-12-triggerTop))<.0001,'height is limited by the available space below the trigger');
  assert.equal(f.w.getComputedStyle(menu).overflow,'auto','long content retains the internal scroll path');
  assert.equal(last.textContent,'마지막 저장');assert.equal(last.closest('[hidden],[inert]'),null);
  f.d.querySelector('#outside').dispatchEvent(new f.w.MouseEvent('pointerdown',{bubbles:true}));
  assert.equal(f.api.inspect().phase,'closed','outside pointer input still closes the morph');f.close();
});
test('unread changes reach the shared notification button once per actual change',()=>{
  const notices=[];const f=fixture({authenticated:true,onStateChange:value=>notices.push(value.unread)});
  notices.length=0;f.api.setUnread(5);f.api.setUnread(5);f.api.setUnread(0);
  assert.deepEqual(notices,[5,0]);f.close();
});
test('Figma geometry applies to the visible logo paths and preserves the original padded SVG',()=>{
  for(const canvas of ['-36 -40 572.045 280','0 0 500.045 200']){
    const f=fixture({beforeMount({mark}){mark.setAttribute('viewBox',canvas);mark.style.width='43px';mark.style.height='22px';}});
    const value=key=>parseFloat(f.brand.style.getPropertyValue(key)),[x,y,width,height]=canvas.split(' ').map(Number);
    const sx=value('--obm-svg-w')/width,sy=value('--obm-svg-h')/height;
    assert.ok(Math.abs(sx-sy)<1e-9,'the original circles must retain uniform scaling');
    assert.ok(Math.abs(500.045*sx-51.8740081787)<.001,'measure the original paths, not the padded canvas');
    assert.ok(Math.abs(200*sy-20.7477855682)<.001);
    assert.ok(Math.abs(value('--obm-svg-x')-x*sx)<.001);
    assert.ok(Math.abs(value('--obm-svg-y')-y*sy)<.001);
    assert.equal(value('--obm-trigger-w'),value('--obm-mark-w'),'no additional horizontal inset at the Figma right edge');
    assert.equal(f.mark.getAttribute('viewBox'),canvas);assert.deepEqual([...f.api.trigger.querySelectorAll('g>path')],f.paths);
    f.close();
  }
});
function captureAnimations(w){
  const animations=[];
  w.HTMLElement.prototype.animate=function(keyframes,timing){
    let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const motion={target:this,keyframes,timing,finished,cancelled:false,cancel(){this.cancelled=true;reject(new Error('cancelled'));},finish(){resolve();}};animations.push(motion);return motion;
  };
  return animations;
}
test('authenticated arrival uses measured two-dimensional positions and a reversal cannot finish the previous route',async()=>{
  let movements,visual=null;
  const f=fixture({reducedMotion:false,beforeMount({w,brand}){
    movements=captureAnimations(w);
    const original=w.HTMLElement.prototype.getBoundingClientRect;
    w.HTMLElement.prototype.getBoundingClientRect=function(){
      if(!this.matches?.('[data-order-account-trigger]'))return original.call(this);
      const member=brand.dataset.authenticated==='true',left=visual?.left??(member?299:104),top=visual?.top??(member?20.3739:19.6406);
      return {left,top,width:51.874,height:44,right:left+51.874,bottom:top+44,x:left,y:top};
    };
  }});
  f.api.setAuthenticated(true);const outbound=movements.find(a=>a.target===f.api.trigger);
  assert.match(outbound.keyframes[0].transform,/translate\(-195px,-0\.733/);assert.equal(f.api.inspect().arrival,'moving');
  visual={left:210,top:20};
  // A cancelled WAAPI route exposes the new base layout when measured again.
  const cancel=outbound.cancel.bind(outbound);outbound.cancel=()=>{cancel();visual=null;};
  f.api.setAuthenticated(false);const inbound=movements.filter(a=>a.target===f.api.trigger).at(-1);
  assert.match(inbound.keyframes[0].transform,/translate\(106px,0\.359/);assert.ok(outbound.cancelled);assert.equal(f.api.inspect().authenticated,false);
  outbound.finish();await tick();assert.equal(f.api.inspect().arrival,'moving','old completion cannot settle the reverse animation');
  movements.filter(a=>!a.cancelled).forEach(a=>a.finish());await tick();assert.equal(f.api.inspect().arrival,'rest');
  assert.deepEqual([...f.api.trigger.querySelectorAll('g>path')],f.paths);f.close();
});
test('explicit initial login arrival is opt-in and a same-account refresh does not replay it',async()=>{
  for(const animateInitial of [false,true]){
    let animations;
    const f=fixture({authenticated:true,animateInitial,arrivalOrigin:{left:104,top:19.6406},reducedMotion:false,beforeMount({w,brand}){
      animations=captureAnimations(w);const original=w.HTMLElement.prototype.getBoundingClientRect;
      w.HTMLElement.prototype.getBoundingClientRect=function(){return this.matches?.('[data-order-account-trigger]')?{left:299,top:20.3739,width:51.874,height:44,right:350.874,bottom:64.3739}:original.call(this);};
    }});
    assert.equal(animations.filter(a=>a.target===f.api.trigger).length,animateInitial?1:0);
    f.api.update({authenticated:true,unread:1});assert.equal(animations.filter(a=>a.target===f.api.trigger).length,animateInitial?1:0);
    f.api.pause();assert.equal(f.api.inspect().arrival,'rest');assert.ok(animations.every(a=>a.cancelled));f.close();
  }
});
test('guest interaction runs the original CODE1 simulation while keeping the panel closed',t=>{
  let choice=0;t.mock.method(Math,'random',()=>choice);
  for(const [random,kind] of [[.25,'gather'],[.75,'idle']]){
    choice=random;let now=0,sequence=0;const queue=new Map(),starts=[];
    const f=fixture({reducedMotion:false,beforeMount({w,mark}){
      // Idle profiles may legitimately delay every circle for up to 180ms.
      // Fix both branch and seed, and drive one clock, so the same ten frames
      // exercise real deformation without depending on wall time or chance.
      w.crypto.getRandomValues=values=>{values.fill(0);return values;};
      w.performance.now=()=>now;
      w.requestAnimationFrame=callback=>{const id=++sequence;queue.set(id,callback);return id;};
      w.cancelAnimationFrame=id=>queue.delete(id);
      mark.addEventListener('code1:motionstart',event=>starts.push(event.detail));
    }});
    try{
      const before=f.paths.map(path=>path.getAttribute('d'));f.api.trigger.click();
      assert.equal(starts.length,1);assert.equal(starts[0].kind,kind);assert.equal(starts[0].seed,0);
      for(let frame=0;frame<10;frame++){now=frame*16;const work=[...queue.values()];queue.clear();for(const callback of work)callback(now);}
      assert.notDeepEqual(f.paths.map(path=>path.getAttribute('d')),before,kind+' changes the original paths');
      assert.equal(f.api.panel.hidden,true);assert.equal(f.api.inspect().authenticated,false);
    }finally{f.close();}
  }
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
test('Stack Panel moves whole page layers and preserves the parent rows when returning',async()=>{
  let animations;const f=fixture({authenticated:true,reducedMotion:false,beforeMount({w}){animations=captureAnimations(w);}});
  for(const token of ['--morph-open-dur','--morph-close-dur','--duration-stagger','--page-slide-dur','--page-fade-dur','--stack-push-dur'])f.api.panel.style.setProperty(token,'1ms');
  f.api.open();await new Promise(resolve=>setTimeout(resolve,20));
  const slider=f.api.panel.querySelector('.obm-stack'),panel=f.api.panel,rootPage=panel.querySelector('[data-obm-page=root]'),profile=rootPage.querySelector('[data-obm-item=profile]');
  slider.getBoundingClientRect=()=>({left:0,top:0,width:300,height:148,right:300,bottom:148});
  profile.click();const layers=animations.filter(a=>a.target.classList.contains('obm-stack-layer'));
  assert.equal(layers.length,2);assert.equal(layers[0].keyframes[1].transform,'translateX(-90px)');assert.equal(layers[1].keyframes[0].transform,'translateX(300px)');
  assert.equal(rootPage.parentElement.dataset.obmLayer,'outgoing');assert.equal(f.api.panel,panel);
  f.api.back();await new Promise(resolve=>setTimeout(resolve,115));
  assert.equal(panel.querySelector('[data-obm-page=root]'),rootPage);assert.equal(rootPage.querySelector('[data-obm-item=profile]'),profile);
  assert.equal(panel.querySelectorAll('.obm-stack-layer').length,0);assert.equal(f.d.activeElement,profile);f.close();
});
test('edge back drag commits beyond the source threshold and pointer cancellation retains the current panel',async()=>{
  const f=fixture({authenticated:true,reducedMotion:false});
  for(const token of ['--morph-open-dur','--morph-close-dur','--duration-stagger','--page-slide-dur','--page-fade-dur','--stack-push-dur'])f.api.panel.style.setProperty(token,'1ms');
  f.api.open();await new Promise(resolve=>setTimeout(resolve,20));
  const slider=f.api.panel.querySelector('.obm-stack');slider.getBoundingClientRect=()=>({left:0,top:0,width:300,height:148,right:300,bottom:148});
  const pointer=(type,x,time)=>{const e=new f.w.MouseEvent(type,{clientX:x,clientY:20,button:0,buttons:1,bubbles:true,cancelable:true});Object.defineProperties(e,{pointerId:{value:1},isPrimary:{value:true},timeStamp:{value:time}});slider.dispatchEvent(e);};
  f.api.show('profile');await new Promise(resolve=>setTimeout(resolve,115));
  pointer('pointerdown',4,10);pointer('pointermove',124,110);pointer('pointerup',124,120);
  assert.equal(f.api.inspect().page,'root');await new Promise(resolve=>setTimeout(resolve,115));
  f.api.show('profile');await new Promise(resolve=>setTimeout(resolve,115));
  pointer('pointerdown',4,200);pointer('pointermove',44,300);pointer('pointercancel',44,310);
  assert.equal(f.api.inspect().page,'profile');await new Promise(resolve=>setTimeout(resolve,115));
  assert.equal(f.api.inspect().page,'profile');assert.equal(slider.querySelectorAll('.obm-stack-layer').length,0);
  pointer('pointerdown',90,400);pointer('pointermove',220,500);pointer('pointerup',220,510);assert.equal(f.api.inspect().page,'profile','middle-of-panel scrolling cannot trigger edge navigation');f.close();
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
test('account recipes cannot restyle product pages, morphs, resizers or notification badges outside the panel',()=>{
  const dom=new JSDOM('<style>.t-page-slide .t-page{position:relative;opacity:1;transform:none;filter:none;pointer-events:auto}.t-morph{width:222px;height:111px;border-radius:9px}.t-resize{transition:height 90ms linear}.t-badge{position:static;top:3px;right:4px}.t-badge-dot{opacity:.8;transform:none;filter:none}</style><main id="product"><div class="t-page-slide" data-page="1"><section class="t-page" data-page-id="2">Product form</section></div><div class="t-morph" data-open="true"><div class="t-morph-menu">Product menu</div></div><div class="t-resize">Product resizer</div><div class="t-badge" data-open="false"><span class="t-badge-dot">2</span></div></main><aside class="obm-panel"><div class="t-page-slide" data-page="1"><section class="t-page" data-page-id="2">Account page</section></div></aside>',{pretendToBeVisual:true});
  const w=dom.window,properties=['position','opacity','transform','filter','pointerEvents','width','height','borderRadius','transition','animation','top','right','willChange'];
  const snapshot=()=>[...w.document.querySelectorAll('#product *')].map(node=>{const style=w.getComputedStyle(node);return Object.fromEntries(properties.map(key=>[key,style[key]]));});
  const before=snapshot(),style=w.document.createElement('style');style.textContent=brandAccountMenuCss;w.document.head.append(style);
  assert.deepEqual(snapshot(),before,'installing account CSS must not change any existing product recipe');
  const account=w.getComputedStyle(w.document.querySelector('.obm-panel .t-page'));
  assert.equal(account.position,'absolute');assert.equal(account.opacity,'0');assert.equal(account.pointerEvents,'none');
  assert.doesNotMatch(brandAccountMenuCss,/@keyframes t-badge-slide-in\b/);dom.window.close();
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
  const header=productSources.quoteTemplate.match(/<header class="header">[\s\S]*?<\/header>/)?.[0];assert.ok(header,'exercise the actual sealed product header');
  const dom=new JSDOM(header,{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.eval(quoteJellyRuntime);
  const originalJelly=w.Code1Jelly;let mounts=0,switches=0;
  w.Code1Jelly={...originalJelly,mount(...args){mounts++;return originalJelly.mount(...args);}};
  w.OrderSharedMount=mountBrandAccountMenu;w.OrderSharedCss=brandAccountMenuCss;w.ORDER_BRAND_ACCOUNT_CONTEXT={authenticated:true,renderPanel(){},jelly:w.Code1Jelly};
  const sealedBrand=gunzipSync(Buffer.from(quoteFiles['web/brand.mjs'],'base64')).toString();
  const extension=extendQuoteSource('web/brand.mjs',sealedBrand);
  assert.equal(extension,extendBrandAccountSource('web/brand.mjs',sealedBrand));
  if(sealedBrand.includes('export function createOrderBrand(doc=document){')){
    assert.equal(extension,sealedBrand,'the canonical factory must be served byte-identically');
    assert.match(extension,/export function mountOrderBrandElement/);
    assert.throws(()=>extendBrandAccountSource('web/brand.mjs',sealedBrand.replace('context.consumeArrival()===true','true')),/SOURCE_MISMATCH/);
  }else assert.match(extension,/import \* as Code1Jelly from '.\/code1-jelly.mjs'/);
  w.eval('const Code1Jelly=window.Code1Jelly,mountBrandAccountMenu=window.OrderSharedMount,brandAccountMenuCss=window.OrderSharedCss;\n'+extension.replace(/^import .*;\n/gm,'').replace(/\bexport (const|function)\b/g,'$1')+'\nwindow.mountOrderBrand=mountOrderBrand;');
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
test('MVP brand consumers require explicit server authentication and consume arrival only for a fresh member mount',()=>{
  for(const authenticated of [false,true]){
    const dom=new JSDOM('<main id="root"><div class="brand"><span class="brand-word">Order</span>'+svg+'</div></main>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
    w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.eval(quoteJellyRuntime);
    let consumed=0;const supplied=[];
    w.ORDER_APP_CONTEXT={mode:'lab',actor:{id:authenticated?'lab-buyer':'lab-guest',authenticated}};
    w.mountBrandAccountMenu=(brand,options)=>{supplied.push(options);return mountBrandAccountMenu(brand,options);};
    w.eval('('+getQaMvpRuntimeSource()+')()');
    const api={screen:'component-library',reduced:()=>true,select(){},brandAccount:{authenticated,consumeArrival(){consumed++;return true;}}};
    const root=w.document.querySelector('#root'),module=w.ORDER_DESIGN_MODULES.find(module=>module.id==='component-library');
    const first=module.mount(root,'components',api),second=module.mount(root,'components',api);
    assert.equal(root.querySelector('.brand').__orderAccountMenu.inspect().authenticated,authenticated);
    assert.equal(supplied[0].animateInitial,authenticated);assert.equal(supplied[1].animateInitial,false);
    assert.equal(consumed,authenticated?1:0,'a guest actor object or repeated mount cannot consume a login transition');
    second();first();w.close();
  }
});
test('the signed result closure mounts the sealed canonical factory and never derives authentication from its price state',()=>{
  assert.equal(typeof productSources.productBrandRuntime,'string','seal the verified canonical product before publishing this result consumer');
  const now=Date.now(),money=value=>({minorUnits:String(value),scale:0,decimal:String(value)});
  const snapshot={id:'unit-result',status:'ISSUED',issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),response:{status:'OK',completion:'COMPLETE',quotes:[{currency:'KRW',total:money(100),comparisonEligibility:'ELIGIBLE',comparison:{current:money(200),difference:money(100)}}]}};
  for(const authenticated of [false,true]){
    const dom=new JSDOM('<main id="result"></main>',{url:'https://example.invalid/ia',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
    w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
    w.ORDER_BRAND_ACCOUNT_CONTEXT={authenticated,renderPanel(){}};
    w.eval('window.createBuyerResult='+buyerResultClient+';');
    const host=w.document.querySelector('#result'),view=w.createBuyerResult(host,projectBuyerResult,async()=>snapshot,()=>{});
    view.show(snapshot);
    const brand=host.querySelector('.order-product-brand'),svg=brand?.querySelector('svg'),paths=[...svg.querySelectorAll('g>path')];
    assert.equal(brand.dataset.orderBrandSource,'canonical');assert.equal(brand.__orderAccountMenu.inspect().authenticated,authenticated);
    assert.equal(paths.length,3);assert.equal(w.OrderProductBrand,undefined,'the signed controller keeps its factory dependency local');
    view.gate();assert.equal(host.querySelector('.order-product-brand'),brand);assert.equal(brand.querySelector('svg'),svg);
    assert.deepEqual([...svg.querySelectorAll('g>path')],paths);assert.equal(brand.__orderAccountMenu.inspect().authenticated,authenticated,'result state cannot grant or remove authentication');
    view.clear();assert.equal(w.document.querySelector('.obm-panel'),null);assert.equal(host.childElementCount,0);w.close();
  }
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
