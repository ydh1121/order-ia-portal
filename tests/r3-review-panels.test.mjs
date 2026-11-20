import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {browserFunction} from '../src/server/browser-source.mjs';
import {installReviewPanels} from '../src/server/r3-ui/review-panels.mjs';
import {mountBrandAccountMenu} from '../src/server/order-engine/browser/brand-account-menu.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {getProductAuthSheetBootstrap} from '../src/server/product-auth-sheet.mjs';
import {getProductPanelBootstrap} from '../src/server/product-account-panels.mjs';
import {sharedCoreScript,sharedTemplates,commonMotionScript} from '../src/server/r3-ui/qa-assets.gen.mjs';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const plain=value=>JSON.parse(JSON.stringify(value));
async function until(check,label){const deadline=performance.now()+2000;while(!check()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(check(),label);}
const paint=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));

// This reproduces the immutable frame identity format, not the helper's layer
// lookup. It lets the test inspect which actual DOM element the emitted opaque
// ID names, including ambiguity. Chromium covers native hit testing separately.
function identities(root){
 const paths=new WeakMap(),nodes=new Map([['screen',root]]),fields=['id','data-action','data-mf-go','data-mf-state','data-op-route','name','for','role','aria-label','class'];
 for(const element of root.querySelectorAll('*')){
  if(element.parentElement?.closest('svg')||['STYLE','SCRIPT','META'].includes(element.tagName))continue;
  const path=(paths.get(element.parentElement)||'screen')+'/'+[element.localName,...fields.map(name=>element.getAttribute(name)||'')].join('|');paths.set(element,path);
  let hash=2166136261;for(const char of path)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  const key='a-'+(hash>>>0).toString(36);nodes.set(key,nodes.has(key)?null:element);
 }
 return nodes;
}
const resolve=(root,id)=>identities(root).get(id);

async function fixture(t,{helper=true,auth=false,workflows=false}={}){
 const errors=[],messages=[],network=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<main id="order-single" class="ds"><header>'+sharedTemplates.brand+'</header><button id="outside">소개 본문</button></main>',{url:'https://order-ia-portal.pages.dev/qa-frame',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,root=w.document.getElementById('order-single');
 const parent={postMessage:message=>messages.push(plain(message))};Object.defineProperty(w,'parent',{value:parent});Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
 Object.defineProperty(w,'crypto',{value:webcrypto});
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.visualViewport={scale:1,addEventListener(){},removeEventListener(){}};
 w.HTMLElement.prototype.scrollTo=function(x,y){this.scrollLeft=x;this.scrollTop=y;};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:20,y:40,left:20,top:40,right:280,bottom:84,width:260,height:44};};
 w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[this.getBoundingClientRect()];};
 w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
 w.fetch=(...args)=>{network.push(args);throw Error('Review panel must use the frame-only adapter');};
 w.__session={screen:'onboarding',state:'member-1',variant:'email',version:'current',channel:'11111111-1111-4111-8111-111111111111',artifact:'a'.repeat(64),fixture:{authenticated:true,persona:'buyer'}};
 w.eval(sharedCoreScript);
 if(auth||workflows)w.eval(commonMotionScript);
 if(workflows)w.eval((await getProductPanelBootstrap()).script);
 w.eval('window.__adapter=('+browserFunction(installQaFixtureAdapter)+')(__session,'+browserFunction(installProductAdapter)+');');
 w.eval('window.__menu=('+browserFunction(mountBrandAccountMenu)+')(document.querySelector(".brand"),{...window.ORDER_BRAND_ACCOUNT_CONTEXT,reducedMotion:()=>true});');
 if(auth){
  w.eval((await getProductAuthSheetBootstrap()).script);
  w.ORDER_AUTH_SHEET.attach(root,{interactive:true,screen:'onboarding',reduced:()=>true,adapter:w.__adapter,select(){throw Error('Auth review must preserve the underlying screen');}},{getState:()=> 'guest-2'});
 }
 if(helper)w.eval('('+browserFunction(installReviewPanels)+')(__session,[["login","empty"]]);');
 w.eval('('+frameCode+')(__session)');
 t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.__menu.destroy();w.__adapter.fixture.dispose();w.close();});
 const send=(type,payload,overrides={},source=parent)=>w.dispatchEvent(new w.MessageEvent('message',{source,data:{scope:'ORDER_R3_HOST',channel:w.__session.channel,artifact:w.__session.artifact,type,payload,...overrides}}));
 const open=async()=>{assert.equal(w.__menu.open('notifications'),true);await until(()=>w.__menu.inspect().page==='notifications'&&w.__menu.panel.querySelector('.obm-panel-content button'),'canonical notification content arrives');await paint(w);return w.__menu.panel.querySelector('.obm-panel-content button');};
 const point=target=>{
  w.document.elementFromPoint=()=>target;send('mode',true);const rect=target.getBoundingClientRect();
  w.dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0,clientX:rect.left+rect.width*.37,clientY:rect.top+rect.height*.61}));send('mode',false);
  const message=messages.filter(message=>message.type==='point').at(-1);assert.ok(message,errors.join('\n')||'the frozen picker emits the selected point');return message.payload;
 };
 await w.__adapter.ready;
 return {w,root,parent,menu:w.__menu,adapter:w.__adapter,send,open,point,messages,errors,network};
}

test('the frozen picker selects canonical panel content without closing the panel or performing its action',async t=>{
 const h=await fixture(t),button=await h.open();
 assert.ok(h.root.contains(h.menu.panel),'the canonical portal belongs to the review screen');
 assert.equal(button.textContent,'읽음');const before=plain(h.adapter.fixture.inspect().data.notifications);
 h.send('mode',true);
 assert.equal(h.w.document.activeElement.id,'r3-veil');assert.equal(h.menu.inspect().phase,'open','moving focus to the review veil keeps the reviewed panel open');
 const anchor=h.point(button);
 assert.notEqual(anchor.id,'screen');assert.equal(anchor.instance,'onboarding');assert.equal(resolve(h.root,anchor.id),button);
 assert.ok(Math.abs(anchor.x-.37)<1e-12);assert.ok(Math.abs(anchor.y-.61)<1e-12);
 assert.ok(anchor.layers.some(id=>resolve(h.root,id)?.id==='r3-panel-state-account-notifications'),'the real frame records the helper state marker');
 assert.deepEqual(plain(h.adapter.fixture.inspect().data.notifications),before,'picking the read button must not mark a notice as read');
 assert.equal(h.adapter.fixture.inspect().calls.some(call=>call.method==='POST'),false);assert.deepEqual(h.network,[]);assert.deepEqual(h.errors,[]);
});

test('a closed notification panel reopens its canonical content before the frozen frame restores the same anchor',async t=>{
 const h=await fixture(t),original=await h.open(),anchor=h.point(original),serialized=JSON.stringify(anchor),panelId=h.menu.panel.id;
 h.menu.close({immediate:true});assert.equal(original.isConnected,false);assert.equal(h.menu.inspect().phase,'closed');
 h.send('restore',anchor);
 await until(()=>h.menu.inspect().phase==='open'&&h.menu.inspect().page==='notifications'&&h.menu.panel.querySelector('.obm-panel-content button')===h.w.document.activeElement,'restore opens and focuses the actual field through the frozen controller');
 const reopened=h.menu.panel.querySelector('.obm-panel-content button');assert.notEqual(reopened,original);assert.equal(h.menu.panel.id,panelId);assert.equal(resolve(h.root,anchor.id),reopened);assert.equal(h.point(reopened).id,anchor.id);
 assert.equal(JSON.stringify(anchor),serialized,'restoration leaves the recorded payload unchanged');assert.deepEqual(h.network,[]);assert.deepEqual(h.errors,[]);
});

test('a root menu pin returns from an already open child before restoring its original button',async t=>{
 const h=await fixture(t),before=plain(h.adapter.fixture.inspect().data);
 assert.equal(h.menu.open(),true);await paint(h.w);
 const original=h.menu.panel.querySelector('[data-obm-item=manage]'),anchor=h.point(original),serialized=JSON.stringify(anchor);
 const profile=h.menu.panel.querySelector('[data-obm-item=profile]'),profileAnchor=h.point(profile);
 assert.equal(resolve(h.root,anchor.id),original);assert.equal(resolve(h.root,profileAnchor.id),profile);assert.notEqual(anchor.id,profileAnchor.id,'root menu rows remain individually selectable');
 assert.ok(anchor.layers.some(id=>resolve(h.root,id)?.id==='r3-panel-state-account-root'));
 assert.equal(h.menu.open('profile'),true);await paint(h.w);
 assert.equal(h.menu.inspect().page,'profile');assert.equal(original.isConnected,false);
 h.send('restore',anchor);
 await until(()=>h.menu.inspect().page==='root'&&h.w.document.activeElement===original,'the saved root-menu button is restored while a child was open');
 assert.equal(h.point(original).id,anchor.id);assert.equal(JSON.stringify(anchor),serialized);
 assert.deepEqual(plain(h.adapter.fixture.inspect().data),before);assert.equal(h.adapter.fixture.inspect().calls.some(call=>call.method==='POST'),false);assert.deepEqual(h.network,[]);assert.deepEqual(h.errors,[]);
});

test('a forged source, channel, artifact or anchor identity cannot open a reviewed panel',async t=>{
 const h=await fixture(t),anchor=h.point(await h.open());h.menu.close({immediate:true});
 const invalid=[
  {source:{postMessage(){}}},
  {envelope:{scope:'OTHER_HOST'}},
  {envelope:{channel:'22222222-2222-4222-8222-222222222222'}},
  {envelope:{artifact:'b'.repeat(64)}},
  {anchor:{...anchor,artifactHash:'b'.repeat(64)}},
  {anchor:{...anchor,instance:'signup'}}
 ];
 for(const attempt of invalid){h.send('restore',attempt.anchor||anchor,attempt.envelope||{},attempt.source||h.parent);await paint(h.w);assert.equal(h.menu.inspect().phase,'closed');assert.equal(h.menu.panel.hidden,true);}
 assert.deepEqual(h.network,[]);assert.deepEqual(h.errors,[]);
});

test('the focus regression is observable without the QA compatibility helper',async t=>{
 const h=await fixture(t,{helper:false});await h.open();h.send('mode',true);
 assert.equal(h.menu.inspect().phase,'closed','the native menu normally dismisses when its focus leaves');
});

test('the canonical auth overlay records its layer and restores the same real email input after Escape',async t=>{
 const h=await fixture(t,{auth:true}),controller=h.root.__orderAuthSheet,originalRoot=h.root;
 assert.equal(controller.open('login','empty','compact'),true);await paint(h.w);
 const input=h.root.querySelector('[data-product-auth-sheet] [name=email]'),expectedId=[...identities(h.root)].find(([,node])=>node===input)?.[0],anchor=h.point(input),originalId=input.id;
 // The released frame keeps its identity during focus-only class changes.
 // Read the identity before the picking veil blurs the canonical field.
 assert.notEqual(anchor.id,'screen');assert.equal(anchor.id,expectedId);
 assert.ok(anchor.layers.some(id=>resolve(h.root,id)?.id==='r3-panel-state-auth-login-empty'));
 input.focus();input.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(controller.inspect().open,false);assert.equal(input.isConnected,false);
 h.send('restore',anchor);
 await until(()=>h.w.document.activeElement?.matches('[data-product-auth-sheet] [name=email]'),'auth restoration focuses the original semantic field');
 const reopened=h.w.document.activeElement;assert.equal(reopened.id,originalId);assert.equal(resolve(h.root,anchor.id),reopened);assert.equal(h.w.document.getElementById('order-single'),originalRoot);
 assert.equal(h.adapter.fixture.inspect().calls.some(call=>call.method==='POST'),false);assert.deepEqual(h.network,[]);assert.deepEqual(h.errors,[]);
 controller.dispose();
});

test('a canonical purchase child route restores its input through the published panel target and frozen layers',async t=>{
 const h=await fixture(t,{workflows:true});
 assert.equal(h.menu.open('manage.payments'),true);
 const purchasePage=()=>h.menu.panel.querySelector('[data-obm-page="manage.payments"]');
 await until(()=>purchasePage()?.querySelector('[data-purchase-offer]')?.value&&!purchasePage().querySelector('[data-purchase-confirm]').disabled,'the real canonical purchase form reads its fixture offer');
 const quantity=purchasePage().querySelector('[name=quantity]'),confirm=purchasePage().querySelector('[data-purchase-confirm]');
 quantity.value='31';quantity.dispatchEvent(new h.w.Event('input',{bubbles:true}));confirm.click();
 await until(()=>confirm.textContent.includes('주문 확정'),'the canonical quote request is acknowledged before purchase');
 confirm.click();
 const cashRoute='manage.payments.view.store-purchase.cash';
 await until(()=>h.menu.inspect().page===cashRoute&&h.menu.panel.querySelector('[data-obm-page="'+cashRoute+'"] [data-purchase-id]')?.textContent===h.adapter.selectedPurchaseId,'the actual purchase action opens its child with the selected dummy order');
 const selected=h.adapter.selectedPurchaseId,created=h.adapter.fixture.inspect().data.purchases.find(item=>item.id===selected);
 assert.equal(created.quantity,31);assert.equal(created.status,'AWAITING_CASH');
 // This is the real child navigation from the canonical cash page. Neither
 // its title nor its renderer is supplied by the test's mount callbacks.
 h.menu.panel.querySelector('[data-obm-page="'+cashRoute+'"] [data-qa-go="store-purchase"][data-qa-state="select"]').click();
 const route='manage.payments.view.store-purchase.select',target=plain(h.w.ORDER_PRODUCT_PANELS.targets).find(target=>target.id===route);
 assert.ok(target,'the workflow publishes the route produced by its own navigation');
 const child=()=>h.menu.panel.querySelector('[data-obm-page="'+route+'"]');
 await until(()=>h.menu.inspect().page===route&&child()?.querySelector('[name=quantity]')&&!child().querySelector('[data-purchase-confirm]').disabled,'the dynamic select child mounts its real form');
 await paint(h.w);
 const original=child().querySelector('[name=quantity]'),originalId=original.id,anchor=h.point(original),stored=JSON.stringify(anchor);
 assert.notEqual(anchor.id,'screen');assert.equal(resolve(h.root,anchor.id),original);
 assert.ok(anchor.layers.some(id=>resolve(h.root,id)?.id==='r3-panel-state-account-'+route),'the helper records the actual dynamic child route');
 const before=plain(h.adapter.fixture.inspect()),writes=before.calls.filter(call=>call.method==='POST').length;
 h.menu.close({immediate:true});assert.equal(original.isConnected,false);
 await h.open();h.menu.close({immediate:true});
 h.send('restore',anchor);
 await until(()=>h.menu.inspect().page===route&&child()?.querySelector('[name=quantity]')===h.w.document.activeElement,'restoration opens the canonical child and focuses its actual input');
 const restored=h.w.document.activeElement;
 assert.notEqual(restored,original);assert.equal(restored.id,originalId);
 assert.equal(child().querySelector('.obm-heading').textContent,target.title,'the title comes from the canonical target metadata');
 // Restore focuses this field. The frozen index intentionally survives focus
 // classes and DOMTokenList's whitespace normalization. Verify its live map
 // by restoring the emitted anchor, rather than recomputing an identity from
 // the changed class attribute after focus/blur.
 const again=h.point(restored);assert.equal(again.id,anchor.id);assert.deepEqual(again.layers,anchor.layers);assert.equal(again.x,anchor.x);assert.equal(again.y,anchor.y);
 assert.notEqual(h.w.document.activeElement,restored,'picking moved focus to the veil');
 h.send('restore',again);
 await until(()=>h.w.document.activeElement===restored,'the actual frozen index still resolves the selected child input after focus/blur');
 assert.equal(JSON.stringify(anchor),stored);assert.equal(h.adapter.selectedPurchaseId,selected);
 const after=plain(h.adapter.fixture.inspect());assert.deepEqual(after.data,before.data);assert.equal(after.calls.filter(call=>call.method==='POST').length,writes,'restoring a location must not create or confirm another purchase');
 assert.deepEqual(h.network,[]);assert.deepEqual(h.errors,[]);
});
