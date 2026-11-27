import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {onRequest} from '../functions/ia/[[path]].js';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {getProductPanelBootstrap} from '../src/server/product-account-panels.mjs';
import {brandPanelUiCss} from '../src/server/order-engine/browser/brand-panel-ui.gen.mjs';

const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom'),{parse}=require('rrweb-cssom');
const origin='https://order-ia-portal.pages.dev';
const verifier=deriveVerifier(randomBytes(32).toString('base64url'));
async function until(predicate,label){const deadline=performance.now()+5000;while(!predicate()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate(),label);}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function d1(sqlite){
 const prepare=(query,args=[])=>({query,args,bind:(...parameters)=>prepare(query,parameters),first:async()=>sqlite.prepare(query).get(...args)||null,all:async()=>({results:sqlite.prepare(query).all(...args)}),run:async()=>({meta:{changes:Number(sqlite.prepare(query).run(...args).changes)}})});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(statement=>{const compiled=sqlite.prepare(statement.query);return compiled.columns().length?{results:compiled.all(...statement.args),meta:{changes:0}}:{results:[],meta:{changes:Number(compiled.run(...statement.args).changes)}};});sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
}
async function workspace(t){
 const review=new DatabaseSync(':memory:'),lab=new DatabaseSync(':memory:'),doms=[];
 t.after(()=>{for(const dom of doms){dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}review.close();lab.close();});
 const migrations=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')).sort())review.exec(readFileSync(new URL(name,migrations),'utf8'));
 lab.exec(readFileSync(new URL('../migrations/lab/0001_lab_registry.sql',import.meta.url),'utf8'));
 const env={ORDER_QA_DB:d1(review),ORDER_LAB_DB:d1(lab),IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'panel-owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await verifier,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),CF_PAGES_COMMIT_SHA:'same-panel-test'};
 const session=await issueSession(env),cookie=session.cookie.split(';')[0];
 const api=(path,body)=>handleIaRequest(new Request(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{Origin:origin,'Content-Type':'application/json','X-IA-CSRF':session.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 const created=await api('/api/ia/lab/runs',{label:'같은 계정 패널의 실제 업무',requestKey:crypto.randomUUID()});assert.equal(created.status,200);const {run}=await created.json();
 const request=(role,path,body)=>api(`/api/ia/lab/runs/${run.id}/as/${role}${path}`,body);
 async function mount(persona='buyer',hold){
  const url=origin+'/ia?'+new URLSearchParams({view:'product-r3',screen:'onboarding',state:'member-1',labRun:run.id,persona});
  const response=await onRequest({request:new Request(url,{headers:{Cookie:cookie}}),env});assert.equal(response.status,200);
  const errors=[],calls=[],navigation=[],console=new VirtualConsole();console.on('jsdomError',error=>{if(/^Not implemented: navigation/.test(error.message))navigation.push(error);else if(error.type!=='css parsing')errors.push(error);});
  const dom=new JSDOM(await response.text(),{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;doms.push(dom);
  // JSDOM has no layout. Avoid cascading the full product stylesheet for every
  // semantic stack transition; stylesheet scope is tested separately below.
  for(const style of w.document.querySelectorAll('style'))style.remove();
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
  w.fetch=async(input,init={})=>{
   const dest=new URL(String(input),url);assert.equal(dest.origin,origin);const headers=new Headers(init.headers);headers.set('Cookie',cookie);if(init.body)headers.set('Origin',origin);
   const item={path:dest.pathname,method:init.method||'GET',body:init.body?JSON.parse(init.body):undefined,signal:init.signal};calls.push(item);
   const response=await handleIaRequest(new Request(dest,{method:item.method,headers,...(init.body?{body:init.body}:{})}),env);
   if(hold)await hold(item,response);return response;
  };
  for(const script of w.document.querySelectorAll('script'))if(!script.src)w.eval(script.textContent);
  await w.ORDER_APP_ADAPTER.ready;await tick();
  const brand=w.document.querySelector('.obm-brand'),menu=brand.__orderAccountMenu,panel=menu.panel,svg=brand.querySelector('svg');
  const open=async id=>{
   menu.close({immediate:true});menu.open('manage');assert.equal(menu.show(id),true);
   const content=panel.querySelector('[data-obm-page="'+id+'"] .obm-panel-content');
   assert.ok(content,'panel exists '+id);
   if(content.getAttribute('aria-busy')==='true'){
    await new Promise((resolve,reject)=>{
     const observer=new w.MutationObserver(()=>{
      if(content.getAttribute('aria-busy')==='true')return;
      clearTimeout(timer);observer.disconnect();resolve();
     });
     const timer=setTimeout(()=>{observer.disconnect();reject(Error('panel loads '+id));},30000);
     observer.observe(content,{attributes:true,attributeFilter:['aria-busy']});
    });
   }
   assert.equal(content.querySelector('.obm-load-error'),null,'panel loads successfully '+id);
   return content;
  };
  const unchanged=()=>{assert.equal(w.location.href,url);assert.equal(brand.querySelector('svg'),svg);assert.equal(menu.panel,panel);assert.equal(w.document.querySelectorAll('.obm-panel').length,1);assert.deepEqual(navigation,[]);assert.deepEqual(errors,[]);const ids=[...w.document.querySelectorAll('[id]')].map(node=>node.id);assert.equal(new Set(ids).size,ids.length,'panel field IDs do not collide with the host');};
  return {w,brand,menu,panel,calls,errors,navigation,open,unchanged};
 }
 return {mount,request,review,lab,run};
}

test('business create, reload and conflict stay in the same real account panel and isolated business handler',async t=>{
 const f=await workspace(t),view=await f.mount(),initial=(await(await f.request('buyer','/role/businesses')).json()).businesses;let content=await view.open('manage.business');
 await until(()=>content.querySelector('[data-business-ref=business-count]')?.textContent===initial.length+'개','the actual business directory is read from the real API');
 const field=key=>content.querySelector('[data-business-ref="business-'+key+'"]');
 const loseDisabledFocus=()=>{const heading=view.panel.querySelector('.obm-heading');heading.focus();heading.blur();};
 field('name').value='패널 사업장';field('road').value='검증 소재지';field('postal').value='08843';
 const region=content.querySelector('[data-business-ref=region-root]');region.value='1100000000';region.dispatchEvent(new view.w.Event('change'));content.querySelector('[data-business-ref=region-leaf]').value='1162000000';
 const submit=field('form').querySelector('[type=submit]');submit.focus();
 field('form').dispatchEvent(new view.w.Event('submit',{bubbles:true,cancelable:true}));
 // jsdom cannot blur a disabled control. Moving through the enabled heading
 // reaches the same body focus Chromium produces while the real request waits.
 loseDisabledFocus();assert.equal(view.w.document.activeElement,view.w.document.body);
 await until(()=>field('status').textContent==='사업장을 저장했습니다.','server-confirmed business save');
 assert.equal(view.w.document.activeElement,field('name'),'successful save restores focus inside the re-enabled form');
 const saved=(await(await f.request('buyer','/role/businesses')).json()).businesses.find(record=>record.profile.name==='패널 사업장');assert.ok(saved);assert.equal(saved.profile.regionSelection.leafCode,'1162000000');assert.equal(saved.revision,1);
 assert.equal(view.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/role/businesses')).length,1);view.unchanged();
 content=await view.open('manage.business');await until(()=>content.querySelectorAll('.business-card').length===initial.length+1,'reopened panel reads saved record');[...content.querySelectorAll('.business-card')].find(button=>button.textContent.includes('패널 사업장')).click();await tick();assert.equal(field('name').value,'패널 사업장');
 const newer=await f.request('buyer','/role/businesses',{id:saved.id,expectedRevision:1,requestKey:crypto.randomUUID(),deleted:false,profile:{...saved.profile,name:'다른 창 변경'}});assert.equal(newer.status,200);
 field('name').value='현재 창 입력';field('road').focus();field('form').dispatchEvent(new view.w.Event('submit',{bubbles:true,cancelable:true}));loseDisabledFocus();
 await until(()=>field('status').textContent.includes('다른 탭'),'stale revision is rejected without leaving the panel');assert.equal(view.w.document.activeElement,field('road'),'failed save restores the original form control');assert.equal(field('name').value,'현재 창 입력');assert.equal((await(await f.request('buyer','/role/businesses')).json()).businesses.find(record=>record.id===saved.id).profile.name,'다른 창 변경');view.unchanged();
 assert.equal(f.review.prepare('SELECT count(*) n FROM r3_saved_business_revision').get().n,0,'the owner review database receives no product test records');
});

test('business save does not take focus when it began outside the form or moved during the response',async t=>{
 const f=await workspace(t),view=await f.mount(),content=await view.open('manage.business'),form=content.querySelector('[data-business-ref=business-form]'),name=content.querySelector('[name=name]'),status=content.querySelector('[data-business-ref=business-status]'),heading=view.panel.querySelector('.obm-heading');
 heading.focus();heading.blur();assert.equal(view.w.document.activeElement,view.w.document.body);
 name.value='포커스 보존 사업장';form.dispatchEvent(new view.w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>status.textContent==='사업장을 저장했습니다.','save submitted from outside the form');assert.equal(view.w.document.activeElement,view.w.document.body,'a save without initial form focus does not move it');
 name.value='포커스 보존 사업장 수정';name.focus();form.dispatchEvent(new view.w.Event('submit',{bubbles:true,cancelable:true}));name.blur();heading.focus();
 await until(()=>status.textContent==='사업장을 저장했습니다.','save after focus moves to the panel heading');assert.equal(view.w.document.activeElement,heading,'an explicit focus destination during the request is preserved');view.unchanged();
});

test('purchase, cash confirmation, dispatch, receipt and dashboard reuse actual handlers without document navigation',async t=>{
 const f=await workspace(t),buyer=await f.mount('buyer');let content=await buyer.open('manage.payments');
 await until(()=>content.querySelector('[data-purchase-offer]')?.value&&!content.querySelector('[data-purchase-confirm]').disabled,'approved offers appear in the panel');
 const parentRoot=content.querySelector('.product-panel-body'),quantity=content.querySelector('[name=quantity]'),confirm=content.querySelector('[data-purchase-confirm]');quantity.value='31';quantity.dispatchEvent(new buyer.w.Event('input',{bubbles:true}));confirm.click();
 await until(()=>confirm.textContent.includes('주문 확정')&&!confirm.disabled&&confirm.getAttribute('aria-busy')!=='true','real quote confirmation is ready to submit');assert.deepEqual((await(await f.request('buyer','/product/purchases')).json()).items,[]);
 confirm.click();await until(()=>buyer.menu.inspect().page==='manage.payments.view.store-purchase.cash','confirmed purchase opens its child in the same panel');
 await until(()=>buyer.panel.querySelector('[data-purchase-id]')?.textContent===buyer.w.ORDER_APP_ADAPTER.selectedPurchaseId,'the saved order is displayed');
 const order=(await(await f.request('buyer','/product/purchases')).json()).items[0];assert.equal(order.status,'AWAITING_CASH');assert.equal(order.total,31*5970);buyer.unchanged();
 buyer.menu.back();await until(()=>buyer.panel.querySelector('[data-order-select]')?.value===order.id,'Back refreshes the retained parent with the saved order');
 assert.equal(content.querySelector('.product-panel-body'),parentRoot,'Back refreshes data without rebuilding the retained controls or motion owners');assert.equal(buyer.panel.querySelector('[data-purchase-confirm]'),confirm);assert.equal(quantity.value,'31','the next purchase keeps the quantity draft while requiring a fresh quote');
 assert.ok(buyer.panel.querySelector('[data-purchase-confirm]').textContent.includes('금액 확인'),'Back cannot leave a previous confirmed order ready to resubmit');buyer.unchanged();
 const operator=await f.mount('operator');content=await operator.open('manage.payments');
 await until(()=>content.querySelector('[data-order-action="confirm-cash"]')?.hidden===false,'operator can confirm the stored cash order');
 content.querySelector('[name=cash-reference]').value='panel-cash-reference';content.querySelector('[data-order-action="confirm-cash"]').click();
 await until(()=>content.querySelector('[data-order-status]')?.textContent==='입금을 확인했어요.','cash confirmation persisted');
 assert.equal((await(await f.request('buyer','/product/purchases')).json()).items[0].status,'PAID');operator.unchanged();
 content=await operator.open('manage.delivery');await until(()=>content.querySelector('[data-shipment-order]')?.value===order.id,'paid shipment is loaded');
 const status=content.querySelector('[name=shipment-status]');status.value='dispatched';status.dispatchEvent(new operator.w.Event('change'));content.querySelector('[data-shipment-apply]').click();
 await until(()=>content.querySelector('[data-shipment-summary]')?.textContent==='배송 정보를 저장했어요.','dispatch persisted');operator.unchanged();
 content=await buyer.open('manage.payments');await until(()=>content.querySelector('[data-order-action=receive]')?.hidden===false,'buyer can receive dispatched order');content.querySelector('[data-order-action=receive]').click();
 await until(()=>content.querySelector('[data-order-status]')?.textContent==='수령 확인을 저장했어요.','receipt persisted');buyer.unchanged();
 content=await buyer.open('manage.quotes');await until(()=>content.querySelector('[data-pass-payment]')?.textContent==='결제 확인','order pass reads actual payment');assert.ok(content.textContent.includes('31판'));buyer.unchanged();
 content=await operator.open('manage.dashboard');await until(()=>content.querySelector('[data-sales-total=orders]')?.textContent==='1건','dashboard reads the actual persisted order');assert.equal(content.querySelector('[data-sales-total=paid]').textContent,'185,070원');
 content.querySelector('[data-sales-source-rows] button')?.click();operator.unchanged();
 assert.equal(buyer.menu.show('manage.dashboard'),false,'dashboard remains operator-only');assert.equal(buyer.w.ORDER_PRODUCT_PANELS.canMount('manage.payments.view.admin-analytics.business-sales'),false,'another menu prefix cannot bypass dashboard routing');
 assert.equal(f.review.prepare('SELECT count(*) n FROM order_operation').get().n,0);
});

test('closing a panel before its real response returns disposes the workflow and ignores the late result',async t=>{
 const f=await workspace(t);let release,held;
 const block=new Promise(resolve=>{release=resolve;});const view=await f.mount('buyer',async(item,response)=>{if(item.path.endsWith('/role/businesses')&&item.method==='GET'){held=item;await block;}});
 view.menu.open('manage');view.menu.show('manage.business');await until(()=>held,'business read is in flight');const old=view.panel.querySelector('[data-obm-page="manage.business"]');view.menu.close({immediate:true});assert.equal(held.signal.aborted,true);release();await tick();await tick();
 assert.equal(view.panel.hidden,true);assert.equal(old.isConnected,false);assert.equal(view.panel.querySelector('[data-obm-page="manage.business"]'),null);view.unchanged();
});

test('panel bootstrap style additions do not introduce document-wide body, page or generic button selectors',async()=>{
 const {css}=await getProductPanelBootstrap();
 const walk=rules=>{for(const rule of rules){if(rule.selectorText)for(const selector of rule.selectorText.split(','))assert.doesNotMatch(selector.trim(),/^(?:html|body|:root|\.page\b|\.btn\b)(?![\w-])/);if(rule.cssRules)walk(rule.cssRules);}};
 walk(parse(css).cssRules);
});

test('the scoped UI inset primitive cannot stretch an account page to its previous stack height',async()=>{
 const {css}=await getProductPanelBootstrap(),rules=[...parse(brandPanelUiCss+css).cssRules].filter(rule=>rule.type===1);
 // These two selectors are class-only. Compare their actual cascade priority,
 // including source order, instead of relying on jsdom's layout-free metrics.
 const primitive=rules.findLastIndex(rule=>rule.selectorText==='.obm-panel.ds .t-page-slide .t-page'&&rule.style.getPropertyValue('inset')==='0');
 const intrinsic=rules.findLastIndex(rule=>rule.selectorText==='.obm-panel.ds .obm-stack .obm-page'&&rule.style.getPropertyValue('bottom')==='auto');
 assert.ok(primitive>=0,'the real scoped transition primitive is included');
 assert.ok(intrinsic>primitive,'the account override follows every scoped transition primitive');
 const specificity=selector=>(selector.match(/\.[\w-]+/g)||[]).length;
 assert.ok(specificity(rules[intrinsic].selectorText)>=specificity(rules[primitive].selectorText),'the inset override wins even after UI scoping adds .ds');
 assert.equal(rules[intrinsic].style.getPropertyValue('height'),'auto','the current page retains its natural content height');
});
