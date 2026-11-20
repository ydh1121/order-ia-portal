import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {browserFunction} from '../src/server/browser-source.mjs';
import {sharedCoreScript,sharedTemplates,commonMotionScript} from '../src/server/r3-ui/qa-assets.gen.mjs';
import {frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {getProductPanelBootstrap} from '../src/server/product-account-panels.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installReviewPanels} from '../src/server/r3-ui/review-panels.mjs';
import {mountBrandAccountMenu} from '../src/server/order-engine/browser/brand-account-menu.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const plain=value=>JSON.parse(JSON.stringify(value));
const paint=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
async function until(check,label){const deadline=performance.now()+3000;while(!check()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(check(),label);}

async function fixture(t,{date=false}={}){
 const messages=[],errors=[],network=[],console=new VirtualConsole();console.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error.message);});
 const dom=new JSDOM('<main id="order-single" class="ds"><header>'+sharedTemplates.brand+'</header></main>',{url:'https://example.invalid/qa-frame',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,root=w.document.getElementById('order-single');
 const parent={postMessage:message=>messages.push(plain(message))};Object.defineProperty(w,'parent',{value:parent});Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.visualViewport={scale:1,addEventListener(){},removeEventListener(){}};
 w.HTMLElement.prototype.scrollTo=function(x,y){this.scrollLeft=x;this.scrollTop=y;this.dispatchEvent(new w.Event('scroll'));};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:20,y:40,left:20,top:40,right:280,bottom:84,width:260,height:44};};
 w.Element.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[this.getBoundingClientRect()];};
 w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
 w.fetch=(...args)=>{network.push(args);throw Error('A QA anchor must not use external transport');};
 w.__session={screen:date?'business':'onboarding',state:date?'empty':'member-1',variant:'email',version:'current',channel:'11111111-1111-4111-8111-111111111111',artifact:'a'.repeat(64),fixture:{authenticated:true,persona:'buyer'}};
 w.eval(sharedCoreScript);w.eval(commonMotionScript);w.eval((await getProductPanelBootstrap()).script);
 w.eval('window.__adapter=('+browserFunction(installQaFixtureAdapter)+')(__session,'+browserFunction(installProductAdapter)+');');
 if(date){
  w.eval(await readFile(new URL('../scripts/r3/authored/business.js',import.meta.url),'utf8'));
  const module=w.ORDER_DESIGN_MODULES.find(module=>module.id==='business');root.innerHTML=module.render('empty',{});
 }else w.eval('window.__menu=('+browserFunction(mountBrandAccountMenu)+')(document.querySelector(".brand"),{...ORDER_BRAND_ACCOUNT_CONTEXT,reducedMotion:()=>true});');
 w.eval('('+browserFunction(installReviewPanels)+')(__session,[]);');w.eval('('+frameCode+')(__session);');
 const send=(type,payload)=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{scope:'ORDER_R3_HOST',channel:w.__session.channel,artifact:w.__session.artifact,type,payload}}));
 const point=async element=>{
  await paint(w);w.document.elementFromPoint=()=>element;send('mode',true);
  w.dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0,clientX:116,clientY:62}));send('mode',false);
  const message=messages.filter(message=>message.type==='point').at(-1);assert.ok(message,'the actual frozen picker emits an anchor');return message.payload;
 };
 const open=async id=>{assert.equal(w.__menu.open(id),true);await until(()=>w.__menu.inspect().page===id&&!w.__menu.panel.querySelector('[aria-busy=true]'),'canonical panel '+id+' arrives');await paint(w);return w.__menu.panel;};
 t.after(()=>{w.dispatchEvent(new w.Event('pagehide'));w.__menu?.destroy();w.__adapter.fixture.dispose();w.close();});
 await w.__adapter.ready;return {w,root,menu:w.__menu,adapter:w.__adapter,open,point,send,errors,network};
}

function checkReferences(root){
 const document=root.ownerDocument,ids=[...document.querySelectorAll('[id]')].map(element=>element.id);assert.equal(ids.length,new Set(ids).size,'simultaneous DOM identities remain unique');
 for(const element of root.querySelectorAll('[for],[aria-labelledby],[aria-describedby]'))for(const name of ['for','aria-labelledby','aria-describedby'])for(const id of (element.getAttribute(name)||'').split(/\s+/).filter(Boolean))assert.ok(document.getElementById(id),name+' continues to identify a real label or message');
}

test('profile, business and purchase anchors restore their actual input after another panel and unrelated field renders',async t=>{
 const f=await fixture(t),before=plain(f.adapter.fixture.inspect().data);
 for(const [route,selector] of [['profile.account','[name=name]'],['profile.personal','[name=name]'],['manage.business','[name=name]'],['manage.payments','[name=quantity]']]){
  const panel=await f.open(route),input=panel.querySelector(selector),id=input.id,anchor=await f.point(input);
  assert.notEqual(anchor.id,'screen');checkReferences(panel);f.menu.close({immediate:true});
  await f.open('notifications');f.menu.close({immediate:true});f.w.QAUI.field('다른 입력','unrelated','');
  f.send('restore',anchor);
  await until(()=>f.w.document.activeElement?.id===id&&f.menu.inspect().page===route,'saved '+route+' anchor reopens and focuses its original semantic field');
  const restored=f.w.document.activeElement;assert.notEqual(restored,input);assert.equal((await f.point(restored)).id,anchor.id);checkReferences(f.menu.panel);f.menu.close({immediate:true});
 }
 assert.deepEqual(plain(f.adapter.fixture.inspect().data),before,'view restoration never saves a profile, business or notification');assert.equal(f.adapter.fixture.inspect().calls.some(call=>call.method==='POST'),false);assert.deepEqual(f.network,[]);assert.deepEqual(f.errors,[]);
});

test('a real concurrent field collision gets a stable alternate identity without changing labels or ARIA references',async t=>{
 const f=await fixture(t);
 for(const route of ['profile.account','manage.business']){
  const panel=await f.open(route),id=panel.querySelector('[name=name]').id;f.menu.close({immediate:true});
  const other=f.w.document.createElement('input');other.id=id;f.w.document.body.append(other);
  const second=await f.open(route),input=second.querySelector('[name=name]'),alternate=input.id;
  assert.notEqual(alternate,id);checkReferences(second);const anchor=await f.point(input);f.menu.close({immediate:true});f.send('restore',anchor);
  await until(()=>f.w.document.activeElement?.id===alternate,'same live collision retains the saved alternate identity');checkReferences(f.menu.panel);f.menu.close({immediate:true});other.remove();
  assert.equal((await f.open(route)).querySelector('[name=name]').id,id,'after the other live instance is removed no unnecessary suffix remains');f.menu.close({immediate:true});
 }
 assert.deepEqual(f.network,[]);assert.deepEqual(f.errors,[]);
});

test('published workflow targets describe only existing canonical routes including members',async t=>{
 const f=await fixture(t),panels=f.w.ORDER_PRODUCT_PANELS,targets=plain(panels.targets),ids=targets.map(target=>target.id);
 assert.equal(new Set(ids).size,ids.length);assert.ok(ids.includes('manage.business.members'));
 for(const target of targets){assert.ok(target.title);assert.ok(target.id==='manage.business.members'||panels.canMount(target.id),target.id+' resolves through the existing canonical allowlist');}
 assert.ok(ids.includes('manage.payments.view.store-purchase.cash'));assert.ok(ids.includes('manage.dashboard.view.admin-analytics.campaign-sales'));
 assert.equal(ids.includes('manage.payments.view.admin-analytics.business-sales'),false,'publishing replay targets does not broaden a workflow route');
});

test('a date option keeps its frozen anchor when a draft selection is cancelled and the picker reopens',async t=>{
 const f=await fixture(t,{date:true}),control=f.root.querySelector('.opening-date>button'),output=f.root.querySelector('.opening-date output'),value=output.textContent;
 control.click();const panel=f.root.querySelector('.opening-wheels'),year=panel.querySelector('.opening-year'),current=Number(year.querySelector('[aria-selected=true]').dataset.openingValue),option=year.querySelector('[data-opening-value="'+(current-2)+'"]');option.click();
 assert.equal(option.getAttribute('aria-selected'),'true');const anchor=await f.point(option),id=option.id,scroll=year.scrollTop;assert.notEqual(anchor.id,'screen');
 panel.querySelector('[data-action=opening-date-cancel]').click();assert.equal(panel.hidden,true);assert.equal(output.textContent,value);
 f.send('restore',anchor);await until(()=>!panel.hidden&&f.w.document.activeElement?.id===id,'the frozen controller can identify and focus the formerly selected date option');
 assert.equal(year.scrollTop,scroll,'the existing saved scroll restores the draft wheel position');assert.equal(output.textContent,value,'replaying a location never commits the draft date');
 assert.equal((await f.point(option)).id,anchor.id);assert.deepEqual(f.network,[]);assert.deepEqual(f.errors,[]);
});
