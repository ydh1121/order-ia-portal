import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {installQaFixtureAdapter,qaFixtureContract} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {getQaApplicationDocument} from '../src/server/r3-qa-assets.mjs';
import {getProductPanelBootstrap} from '../src/server/product-account-panels.mjs';

const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const json=value=>JSON.parse(JSON.stringify(value));
async function until(predicate,label){const deadline=performance.now()+5000;while(!predicate()&&performance.now()<deadline)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),label);}
const command=(body={})=>({requestKey:crypto.randomUUID(),...body});
async function fixture(t,session={screen:'store-purchase',state:'select'}){
 const errors=[],messages=[];let network=0,storage=0;
 const console=new VirtualConsole();console.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error);});
 const dom=new JSDOM('<!doctype html><body></body>',{url:'https://review.invalid/ia?view=qa-lab',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window;
 t.after(()=>{w.ORDER_APP_ADAPTER?.fixture?.dispose();w.close();});
 w.fetch=()=>{network++;throw Error('Network must never be used by a review fixture');};
 Object.defineProperty(w,'sessionStorage',{get(){storage++;throw Error('Persistent storage must not be used by a review fixture');}});
 w.postMessage=(message,target)=>messages.push({message:json(message),target});
 w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.HTMLElement.prototype.scrollTo=function(){};w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){},pause(){},play(){}});
 w.qaSession={channel:'review-channel',artifact:'a'.repeat(64),variant:'email',...json(session)};
 w.eval('window.fixtureAdapter=('+browserFunction(installQaFixtureAdapter)+')(window.qaSession,('+browserFunction(installProductAdapter)+'));');
 const adapter=w.fixtureAdapter;await adapter.ready;
 return {w,adapter,messages,errors,session:w.qaSession,get network(){return network;},get storage(){return storage;}};
}
async function mountCanonical(f,screen='store-purchase',state='select'){
 const document=await getQaApplicationDocument(screen,state),panels=await getProductPanelBootstrap();assert.ok(document);
 f.w.document.body.innerHTML=document.body;f.w.eval(document.mount);f.w.eval(panels.script);
 const root=f.w.document.getElementById('order-single'),module=f.w.ORDER_DESIGN_MODULES.find(module=>module.id===screen),navigations=[];
 const dispose=module.mount(root,state,{screen,variant:'email',interactive:true,mode:'qa-fixture',adapter:f.adapter,brandAccount:f.w.ORDER_BRAND_ACCOUNT_CONTEXT,reduced:()=>true,select:(screen,state)=>navigations.push({screen,state}),toast(){},localState(){}});
 const menu=root.querySelector('.obm-brand').__orderAccountMenu,panel=menu.panel;
 const open=async id=>{menu.close({immediate:true});menu.open(id.startsWith('profile')?'profile':id==='notifications'?'notifications':'manage');if(id!=='notifications')assert.equal(menu.show(id),true);await until(()=>panel.querySelector('[data-obm-page="'+id+'"] .obm-panel-content')?.getAttribute('aria-busy')!=='true','canonical '+id+' panel is mounted');return panel.querySelector('[data-obm-page="'+id+'"] .obm-panel-content');};
 return {root,menu,panel,open,dispose,navigations};
}

test('serialized fixture transport identifies dummy data, infers authentication, and never uses fetch or persistent storage',async t=>{
 const f=await fixture(t,{screen:'login',state:'empty'}),{adapter,w}=f;
 assert.equal(adapter.context.mode,qaFixtureContract.mode);assert.equal(adapter.context.source.kind,'dummy');assert.equal(adapter.context.source.persistent,false);
 assert.equal(adapter.context.actor.authenticated,false);assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.authenticated,false);
 for(const [screen,state,authenticated] of [['signup','success',false],['password','complete',false],['otp','verified',true]]){
  const current=await fixture(t,{screen,state});assert.equal(current.adapter.context.actor.authenticated,authenticated,screen+'/'+state);
 }
 await assert.rejects(adapter.request('/purchases'),error=>error.message==='AUTHENTICATION_REQUIRED');
 await assert.rejects(adapter.request('/unknown'),error=>error.status===501&&error.message==='QA_FIXTURE_UNSUPPORTED');
 await assert.rejects(adapter.priceRequest('/quote',command({expectedRevision:0})),error=>error.status===501&&error.message==='QA_FIXTURE_UNSUPPORTED');
 f.session.state='success';adapter.fixture.configure();assert.equal(adapter.context.actor.authenticated,true);assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),true);assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.consumeArrival(),false);
 adapter.fixture.configure({persona:'operator'});assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.canAccess('manage.dashboard'),true);
 adapter.fixture.configure({persona:'buyer'});assert.equal(w.ORDER_BRAND_ACCOUNT_CONTEXT.canAccess('manage.dashboard'),false);
 let before=0;w.addEventListener('order-qa-before-navigate',()=>before++);f.session.channel='next-channel';f.session.artifact='b'.repeat(64);
 w.ORDER_BRAND_ACCOUNT_CONTEXT.navigate('manage.business');assert.equal(before,1);
 assert.deepEqual(f.messages,[{target:'*',message:{scope:'ORDER_R3_FRAME',channel:'next-channel',artifact:'b'.repeat(64),type:'navigate',payload:{screen:'store-settings',state:'default'}}}]);
 assert.equal(f.network,0);assert.equal(f.storage,0);assert.deepEqual(f.errors,[]);
});

test('memory account and purchase transitions preserve revisions and identities without confirming external payments',async t=>{
 const f=await fixture(t),a=f.adapter;
 const change=command({action:'update',expectedRevision:1,profile:{name:'QA 수정 회원',phone:'010-1111-2222'}}),saved=await a.request('/account',change);
 assert.equal(saved.revision,2);assert.equal((await a.request('/account',change)).revision,2);
 await assert.rejects(a.request('/account',command({...change,requestKey:crypto.randomUUID()})),error=>error.message==='REVISION_CONFLICT');
 const notice=(await a.request('/notifications')).items[0];await a.request('/notifications',command({action:'read',id:notice.id,expectedRevision:notice.revision}));assert.ok((await a.request('/notifications')).items[0].readAt);
 const offer=(await a.request('/purchases')).offers[0],quote=await a.request('/purchase-quote',command({offerId:offer.id,quantity:31,expectedRevision:0}));
 const create=command({action:'create',expectedRevision:0,offerId:offer.id,quantity:31,paymentMethod:'cash',channel:'store',acceptedQuoteId:quote.quoteId,serviceDate:quote.serviceDate});
 const {item}=await a.request('/purchases',create);assert.equal(item.total,186000);assert.equal(item.status,'AWAITING_CASH');
 assert.equal((await a.request('/purchases',create)).item.id,item.id);assert.equal((await a.request('/purchases')).items.filter(value=>value.id===item.id).length,1);
 await assert.rejects(a.request('/purchases',command({...create,requestKey:crypto.randomUUID(),quantity:32})),error=>error.message==='QUOTE_INPUT_CHANGED');
 await assert.rejects(a.request('/purchases',command({action:'card',expectedRevision:1,id:'qa-order-card'})),error=>error.message==='PAYMENT_PROVIDER_UNAVAILABLE');
 assert.equal((await a.request('/purchases')).items.find(item=>item.id==='qa-order-card').status,'AWAITING_CARD');
 a.fixture.configure({persona:'operator',selectedPurchaseId:item.id});let changed=await a.request('/purchases',command({action:'confirm-cash',id:item.id,expectedRevision:1,reference:'QA 현금 상태 검토'}));assert.equal(changed.item.status,'PAID');
 a.fixture.configure({persona:'supplier'});changed=await a.request('/purchases',command({action:'dispatch',id:item.id,expectedRevision:2,carrier:'farm',tracking:''}));assert.equal(changed.item.status,'DISPATCHED');
 a.fixture.configure({persona:'buyer'});changed=await a.request('/purchases',command({action:'receive',id:item.id,expectedRevision:3}));assert.equal(changed.item.status,'RECEIVED');assert.equal((await a.request('/documents/'+item.id)).receipt.paid,186000);
 a.fixture.configure({persona:'operator'});assert.equal((await a.request('/sales')).items.find(row=>row.id===item.id).paid,186000);
 assert.ok(a.fixture.inspect().operations.every(operation=>operation.scope==='ORDER_QA_FIXTURE'&&operation.source.commercial===false));assert.equal(f.messages.length,0,'fixture mutations cannot emit server-operation acknowledgements');assert.equal(f.network,0);
});

test('business fixture writes preserve other records and reject stale revisions or unsupported roles',async t=>{
 const {adapter:a}=await fixture(t),initial=(await a.roleRequest('/businesses')).businesses;
 const body=command({id:'qa-new-business',expectedRevision:0,deleted:false,profile:{name:'QA 새 사업장',road:'검토 소재지',postal:'12345',email:'qa-new@example.invalid'}});
 const saved=await a.roleRequest('/businesses',body);assert.equal(saved.revision,1);
 assert.equal((await a.roleRequest('/businesses')).businesses.length,initial.length+1);assert.ok((await a.roleRequest('/businesses')).businesses.some(row=>row.id===initial[0].id));
 await assert.rejects(a.roleRequest('/businesses',command({...body,requestKey:crypto.randomUUID()})),error=>error.message==='REVISION_CONFLICT');
 await a.roleRequest('/businesses',command({...body,requestKey:crypto.randomUUID(),expectedRevision:1,deleted:true}));assert.equal((await a.roleRequest('/businesses')).businesses.length,initial.length);
 await assert.rejects(a.roleRequest('/verification',command({expectedRevision:0})),error=>error.message==='QA_FIXTURE_UNSUPPORTED');
 a.fixture.configure({authenticated:false});await assert.rejects(a.roleRequest('/businesses'),error=>error.message==='AUTHENTICATION_REQUIRED');
});

test('loading, errors, abort and disposal are controlled without timers or partial writes',async t=>{
 const {adapter:a,w}=await fixture(t,{screen:'store-purchase',state:'select',fixture:{requests:{'role GET /businesses':{scenario:'loading'}}}});
 const controller=new w.AbortController(),reading=a.roleRequest('/businesses',null,controller.signal);await until(()=>a.fixture.inspect().pending===1,'the explicit loading request waits');
 const cancelled=assert.rejects(reading,error=>error.name==='AbortError');controller.abort();await cancelled;assert.equal(a.fixture.inspect().pending,0);
 a.fixture.configure({requests:{'product POST /account':{scenario:'loading'}}});const body=command({action:'update',expectedRevision:1,profile:{name:'지연된 QA 수정',phone:''}}),writing=a.request('/account',body);
 await until(()=>a.fixture.inspect().pending===1,'a write is waiting before mutation');assert.equal(a.fixture.inspect().data.account.revision,1);
 const failed=assert.rejects(writing,error=>error.message==='REVISION_CONFLICT');a.fixture.releasePending({requests:{'product POST /account':{scenario:'error',errorCode:'REVISION_CONFLICT',status:409}}});await failed;
 assert.equal(a.fixture.inspect().data.account.revision,1);a.fixture.configure({requests:{},scenario:'normal'});assert.equal((await a.request('/account',body)).revision,2);
 a.fixture.configure({requests:{'product POST /account':{scenario:'loading'}}});const late=a.request('/account',command({action:'update',expectedRevision:2,profile:{name:'종료 뒤 수정 금지',phone:''}}));await until(()=>a.fixture.inspect().pending===1,'a final write is pending');
 const stopped=assert.rejects(late,error=>error.name==='AbortError');a.fixture.dispose();await stopped;assert.equal(a.fixture.inspect().data.account.revision,2);await assert.rejects(a.request('/account'),error=>error.name==='AbortError');
});

test('empty fixtures expose empty collections and maintain a separate source for each review frame',async t=>{
 const empty=await fixture(t,{screen:'admin-analytics',state:'business-sales',fixture:{scenario:'empty'}}),normal=await fixture(t);
 for(const path of ['/purchases','/notifications','/sales'])assert.equal((await empty.adapter.request(path)).items.length,0);
 assert.equal((await empty.adapter.roleRequest('/businesses')).businesses.length,0);assert.equal((await empty.adapter.roleRequest('/account')).members.length,0);
 assert.equal((await empty.adapter.request('/revenue')).data.contributors.length,0);assert.equal(empty.adapter.selectedPurchaseId,null);
 assert.equal((await normal.adapter.request('/purchases')).items.length,5);assert.equal(empty.network+normal.network,0);
});

test('canonical profile and business account panels use the fixture transport without copied forms',async t=>{
 const f=await fixture(t),ui=await mountCanonical(f);t.after(ui.dispose);
 let body=await ui.open('profile.account');await until(()=>body.querySelector('[name=name]')?.value==='QA 검토 회원','canonical account form has data');
 body.querySelector('[name=name]').value='실제 공통 폼 수정';body.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>f.adapter.fixture.inspect().data.account.profile.name==='실제 공통 폼 수정','canonical form stores its dummy input');
 body=await ui.open('manage.business');await until(()=>body.querySelectorAll('.business-card').length===1,'canonical business list uses memory records');
 const form=body.querySelector('[data-business-ref=business-form]');form.querySelector('[name=name]').value='QA 패널 사업장';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>body.querySelector('[data-business-ref=business-status]')?.textContent==='사업장을 저장했습니다.','canonical business save completes');
 assert.equal(f.adapter.fixture.inspect().data.businesses.length,2);assert.equal(f.w.document.querySelectorAll('.obm-panel').length,1);assert.equal(f.network,0);assert.equal(f.storage,0);assert.deepEqual(f.errors,[]);
});

test('canonical purchase and dashboard panel runtimes display fixture results and keep nested work in the same panel',async t=>{
 const f=await fixture(t),ui=await mountCanonical(f);t.after(ui.dispose);const panel=ui.panel,body=await ui.open('manage.payments');
 await until(()=>body.querySelector('[data-purchase-offer]')?.value&&!body.querySelector('[data-purchase-confirm]').disabled,'canonical purchase form is ready');
 const count=body.querySelector('[name=quantity]'),confirm=body.querySelector('[data-purchase-confirm]');count.value='31';count.dispatchEvent(new f.w.Event('input',{bubbles:true}));confirm.click();
 await until(()=>confirm.textContent.includes('주문 확정'),'canonical quote calculation completes');confirm.click();
 await until(()=>ui.menu.inspect().page==='manage.payments.view.store-purchase.cash','canonical child opens in the account stack');
 await until(()=>panel.querySelector('[data-purchase-amount]')?.textContent==='186,000원','child reads the created fixture order');
 assert.equal(ui.menu.panel,panel);assert.equal(f.adapter.fixture.inspect().data.purchases.find(row=>row.id===f.adapter.selectedPurchaseId).quantity,31);
 ui.menu.close({immediate:true});f.adapter.fixture.configure({persona:'operator'});ui.menu.update({canAccess:f.w.ORDER_BRAND_ACCOUNT_CONTEXT.canAccess});
 const dashboard=await ui.open('manage.dashboard');await until(()=>dashboard.querySelector('[data-sales-total=orders]')?.textContent==='5건','canonical sales computation consumes the fixture records');
 assert.equal(ui.menu.panel,panel);assert.equal(f.network,0);assert.deepEqual(f.errors,[]);
});

test('closing the canonical business panel aborts its pending fixture request',async t=>{
 const f=await fixture(t),ui=await mountCanonical(f);t.after(ui.dispose);
 f.adapter.fixture.configure({requests:{'role GET /businesses':{scenario:'loading'}}});ui.menu.open('manage');ui.menu.show('manage.business');
 await until(()=>f.adapter.fixture.inspect().pending===1,'business panel is awaiting fixture data');ui.menu.close({immediate:true});
 await until(()=>f.adapter.fixture.inspect().pending===0,'canonical disposal cancels the fixture read');assert.equal(ui.panel.hidden,true);assert.equal(ui.panel.querySelector('[data-business-ref=business-form]'),null);
 assert.equal(f.network,0);assert.deepEqual(f.errors,[]);
});
