import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import {defaultQaNavigation,normalizeQaNavigation,handleQaNavigation} from '../src/server/r3-qa-navigation.mjs';
import {getQaSupplemental} from '../src/server/r3-qa-assets.mjs';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import {bootApprovedShell} from '../src/server/r3-ui/approved-controller.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';
import {getQaMvpRuntimeSource} from '../src/server/r3-ui/qa-mvp-runtime.mjs';
import {sharedCoreScript,commonMotionScript} from '../src/server/r3-ui/qa-assets.gen.mjs';
import {createProductUiLab} from './helpers/product-ui-lab.mjs';
import {qaSalesFixture} from '../src/server/r3-qa-sales.mjs';
import {researchScene} from '../src/server/research-app/page.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const extras=await getQaSupplemental();
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const activeDoms=new Set();afterEach(()=>{for(const dom of activeDoms)dom.window.close();activeDoms.clear();});
const artifact=async(id,options={})=>serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version:'current',...options})));
function setup(body){const dom=new JSDOM(body,{url:'https://order-ia-portal.pages.dev/ia?view=qa-lab',runScripts:'outside-only',pretendToBeVisual:true});dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});activeDoms.add(dom);return dom;}
async function settled(){for(let i=0;i<8;i++)await tick();}
async function until(check,label){const deadline=Date.now()+5000;while(!check()&&Date.now()<deadline)await tick();assert.ok(check(),label);}
async function mount(id,{adapter,sourceRuntime=false}={}){
  const source=extras.documents.get(id);assert.ok(source,id);const dom=setup(source.body),w=dom.window,calls=[];
  w.ORDER_APP_CONTEXT={mode:'lab',now:'2026-11-20T00:00:00.000Z'};if(adapter)w.ORDER_APP_ADAPTER=adapter;
  w.HTMLElement.prototype.animate=function(){return {finished:Promise.resolve(),cancel(){},pause(){},play(){}};};
  w.eval(sourceRuntime?source.mount:sharedCoreScript+'\n'+commonMotionScript+'\n('+getQaMvpRuntimeSource()+')()');
  const root=w.document.querySelector('#order-single'),api={screen:source.row.screen,reduced:()=>false,select(...args){calls.push(args);},toast(){}};
  const unmountShared=w.QAUI.sharedMount(root,api),module=w.ORDER_DESIGN_MODULES.find(m=>m.id===source.row.screen),dispose=module.mount(root,source.row.state,api);
  const cleanup=()=>{dispose?.();unmountShared?.();};await settled();return {dom,w,root,calls,cleanup};
}

test('MVP classification reuses every original screen exactly once and leaves future expansion separate',()=>{
  const ids=[...new Set(catalog.map(r=>r.screen))],layout=defaultQaNavigation(ids);
  assert.deepEqual(layout.groups.map(g=>g.name),['1차 MVP','정식 - 향후 검토']);
  assert.equal(Object.keys(layout.assignments).length,97);
  for(const id of ['onboarding','q3','admin-orders','admin-payments','admin-shipments','admin-negotiations','admin-campaigns','receipt','account-settings','common'])assert.equal(layout.assignments[id],'mvp',id);
  for(const id of ['consumer-subscription','partner-storefront','admin-rights'])assert.equal(layout.assignments[id],'future',id);
  assert.throws(()=>normalizeQaNavigation({...layout,assignments:{...layout.assignments,invented:'mvp'}},ids));
  assert.throws(()=>normalizeQaNavigation({...layout,groups:[{id:'mvp',name:' '},{id:'future',name:'나중'}]},ids));
});

test('account-owned navigation retains history, rejects stale tabs and isolates other owners',async()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0016_r3_qa_navigation.sql',import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...args){const st=sqlite.prepare(sql);return {first:async()=>st.get(...args),run:async()=>({meta:st.run(...args)})};}};}};
  const send=(actorId,body)=>handleQaNavigation({env:{ORDER_QA_DB:db},actor:{id:actorId,role:'OWNER'},request:new Request('https://x/api/ia/r3-qa/navigation',body?{method:'POST',body:JSON.stringify(body)}:{})});
  const first=await(await send('owner-a')).json();assert.equal(first.revision,0);
  assert.equal(first.layout.assignments.notifications,'mvp','native app routes remain selectable and persistable in QA navigation');
  first.layout.groups[0].name='첫 매장';first.layout.assignments['admin-rights']='mvp';
  assert.equal((await send('owner-a',{expectedRevision:0,layout:first.layout})).status,200);
  const stale=await send('owner-a',{expectedRevision:0,layout:first.layout});assert.equal(stale.status,409);assert.equal((await stale.json()).current.layout.groups[0].name,'첫 매장');
  const second=await(await send('owner-b')).json();assert.equal(second.revision,0);assert.equal(second.layout.assignments['admin-rights'],'future');
  const reopened=await(await send('owner-a')).json();assert.equal(reopened.revision,1);assert.equal(reopened.layout.assignments['admin-rights'],'mvp');
  assert.equal(reopened.layout.assignments.notifications,'mvp');
  reopened.layout.assignments['admin-rights']='future';assert.equal((await send('owner-a',{expectedRevision:1,layout:reopened.layout})).status,200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM qa_navigation_revisions WHERE actor_id=?').get('owner-a').n,2);
  sqlite.close();
});

test('navigation accordions support rename, mouse transfer and keyboard transfer without duplicate modules',async()=>{
  const dom=setup(approvedShellBody()),w=dom.window;w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollTo=()=>{};
  const screens=['onboarding','admin-rights','login'].map(id=>catalog.find(r=>r.screen===id));
  let layout=defaultQaNavigation(screens.map(r=>r.screen)),shell;const saved=[];
  const h={snapshot:()=>({screens,current:null,records:new Map(),legacy:new Map(),navigation:{revision:1,layout},navigationReady:true,navigationPending:false}),saveNavigation(value){layout=value;saved.push(value);shell.render();},isTest:()=>false,select(){},width:()=>390,notes(){},leaveEditor(){},close(){}};
  w.__h=h;w.eval('window.__shell=('+bootApprovedShell.toString()+')(window.__h)');shell=w.__shell;shell.render();
  const $=s=>w.document.querySelector(s);
  assert.equal(w.document.querySelectorAll('#catalog [data-module]').length,3);
  $('[data-move-module="admin-rights"]').click();assert.equal(layout.assignments['admin-rights'],'mvp');
  $('[data-module="login"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true,cancelable:true}));assert.equal(layout.assignments.login,'future');
  $('[data-nav-group=mvp] summary').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true,cancelable:true}));
  const input=$('[aria-label="아코디언 이름"]');input.value='첫 매장 MVP';input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  assert.equal(layout.groups[0].name,'첫 매장 MVP');assert.equal(saved.length,3);
  $('#catalog-search').value='login';$('#catalog-search').dispatchEvent(new w.Event('input'));assert.equal($('[data-nav-group=future]').open,true);
  assert.equal(w.document.querySelectorAll('#catalog [data-module]').length,1);dom.window.close();
});

test('simple and detailed calculators have separate QA menu entries and retain mode through state changes and board previews',()=>{
  const dom=setup(approvedShellBody()),w=dom.window;w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollTo=()=>{};
  const screens=catalog.filter(row=>['q1','q2','q3','q4'].includes(row.screen)).map(row=>({...row,application:true}));
  let current={...screens.find(row=>row.screen==='q1'&&row.state==='before'),mode:'simple'},shell;const selected=[],previews=[];
  const layout=defaultQaNavigation(screens.map(row=>row.screen));
  w.__h={snapshot:()=>({screens,current,records:new Map(),legacy:new Map(),navigation:{layout},navigationReady:true}),
    label:row=>(row.mode==='detailed'?'상세 견적':'간편 견적')+' · '+row.label,
    select(row){current=row;selected.push(row);shell.render();},width:()=>390,info:()=>({}),feedbackFor:()=>[],
    loadPreview:async row=>{previews.push(row);},notes(){},leaveEditor(){},close(){}};
  w.eval('window.__shell=('+bootApprovedShell.toString()+')(window.__h)');shell=w.__shell;shell.render();
  const $=selector=>w.document.querySelector(selector);
  for(const screen of ['q1','q2','q3','q4'])for(const mode of ['simple','detailed'])assert.ok($(`[data-module="${screen}"][data-quote-mode="${mode}"]`));
  $('[data-module="q1"][data-quote-mode="detailed"]').click();assert.equal(selected.at(-1).mode,'detailed');
  assert.equal(w.document.querySelectorAll('#catalog [aria-current="page"]').length,1);
  assert.equal($('#catalog [aria-current="page"]').dataset.quoteMode,'detailed');
  $('#state-buttons [data-state="error"]').click();assert.equal(selected.at(-1).state,'error');assert.equal(selected.at(-1).mode,'detailed');
  shell.setActiveMode('board');assert.ok(previews.length>1);assert.ok(previews.every(row=>row.mode==='detailed'));
  $('[data-module="q1"][data-quote-mode="simple"]').click();assert.equal(selected.at(-1).mode,'simple');
  $('#catalog-search').value='상세 견적';$('#catalog-search').dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelectorAll('#catalog [data-quote-mode="simple"]').length,0);
  assert.equal(w.document.querySelectorAll('#catalog [data-quote-mode="detailed"]').length,4);
  dom.window.close();
});

test('new review assets have independent targets and prior delivery artifacts remain byte-identical',async()=>{
  const list=await(await serveR3Artifact(new Request('https://x/api/ia/r3-qa/artifact'))).json();
  const originals=list.items.filter(r=>!r.supplemental);assert.equal(originals.length,catalog.length-8);assert.equal(new Set(originals.map(r=>r.screen)).size,96);
  for(const source of extras.assets)for(const use of source.usages){const original=catalog.find(r=>r.id===use.id),supplement=extras.documents.get(use.id);assert.ok(original||supplement,use.id);if(!use.supplemental)assert.equal(original.current,use.source);else assert.ok(supplement,use.id);assert.equal((supplement?.row||original).label,use.label);}
  const item=list.items.find(r=>r.id==='component-library/asset-email/email');assert.ok(item);
  const doc=await(await artifact(item.id)).json();assert.equal(doc.hash,item.hashes[390]);assert.equal(await isR3ReviewTarget({screen:item.screen,state:item.state,variant:'email',viewport:390,artifactHash:doc.hash}),true);
  const original=catalog.find(r=>r.id==='delivery-request/ready/email');
  const old=await(await artifact(original.id,{version:'recorded',artifactHash:original.hashes[390]})).json();
  assert.equal(old.hash,original.hashes[390]);assert.ok(old.html.includes(gunzipSync(Buffer.from(frames[original.current],'base64')).toString()));
  const current=await(await artifact(original.id)).json();assert.notEqual(current.hash,old.hash);assert.ok(current.application);
  const scene=await researchScene(original.screen,original.state,original.variant);assert.match(scene.html,/data-pass-card/);
  const allRows=[...catalog,...extras.rows];
  for(const [id,source] of extras.documents){
    const d=setup(source.body);for(const b of d.window.document.querySelectorAll('[data-qa-go]'))assert.ok(allRows.some(r=>r.screen===b.dataset.qaGo&&r.state===b.dataset.qaState),id+' → '+b.dataset.qaGo+'/'+b.dataset.qaState);d.window.close();
  }
});

test('large Order Pass uses the shared ticket and flips in place; withdrawal waits for the actual account operation',async()=>{
  const pass=await mount('delivery-request/ready/email'),card=pass.root.querySelector('[data-pass-card]');
  assert.ok(card.querySelector('.order-pass.nav-ticket'));
  pass.root.querySelector('[data-qa-flip]').click();assert.equal(card.dataset.face,'back');assert.equal(pass.calls.length,0);
  card.querySelector('.qa-pass-back button').click();assert.equal(card.dataset.face,'front');assert.equal(pass.root.querySelector('[data-pass-card]'),card);pass.cleanup();pass.w.close();
  const lab=await createProductUiLab(),adapter=lab.adapter('buyer');
  const {w,root,calls,cleanup}=await mount('account-settings/withdraw/email',{adapter}),button=root.querySelector('[data-withdraw-start]');
  const fill=(name,value)=>{const el=root.querySelector('[name='+name+']');el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  fill('withdraw-phrase','회원탈퇴');assert.equal(button.disabled,true);fill('withdraw-reason','other');assert.equal(button.disabled,true);
  fill('withdraw-note','필요할 때 다시 가입할게요');assert.equal(button.disabled,false);fill('withdraw-phrase','회원탈퇴 ');assert.equal(button.disabled,true);fill('withdraw-phrase','회원탈퇴');
  button.click();assert.equal(root.querySelector('[data-withdraw-dialog]').hidden,false);assert.equal(calls.length,0);
  root.querySelector('[data-withdraw-cancel]').click();assert.equal(calls.length,0);button.click();root.querySelector('[data-withdraw-confirm]').click();assert.equal(calls.length,0,'click alone cannot signal completion');
  await until(()=>calls.length>0,'the actual account handler must acknowledge withdrawal before navigation');assert.deepEqual(calls,[['account-settings','closed']]);
  assert.equal(adapter.calls.find(call=>call.body?.action==='withdraw').body.phrase,'회원탈퇴');cleanup();w.close();lab.close();
});

test('purchase confirms the canonical quantity-tier quote and card/cash use the same accepted amount',async()=>{
  const lab=await createProductUiLab(),adapter=lab.adapter('buyer'),a=await mount('store-purchase/select/email',{adapter});
  const confirm=a.root.querySelector('[data-purchase-confirm]'),quantity=a.root.querySelector('[name=quantity]'),unit=a.root.querySelector('[name=unit-price]');
  assert.equal(unit.readOnly,true);quantity.value='0';confirm.click();await settled();assert.equal(adapter.calls.filter(call=>call.path==='/purchase-quote').length,0);assert.equal(quantity.getAttribute('aria-invalid'),'true');
  quantity.value='31';quantity.dispatchEvent(new a.w.Event('input',{bubbles:true}));a.root.querySelector('[value=card]').checked=true;confirm.click();await settled();
  assert.deepEqual(a.calls,[],'price confirmation must not create an order');
  const totals=[...a.root.querySelectorAll('[data-same-price]')].map(el=>el.textContent);assert.equal(totals[0],totals[1]);assert.match(confirm.textContent,/주문 확정/);assert.equal(unit.value,'5970','31 trays use the server tier, not the 10-tray offer summary');
  confirm.click();assert.deepEqual(a.calls,[]);await settled();assert.deepEqual(a.calls,[['store-purchase','card']]);
  const create=adapter.calls.find(call=>call.body?.action==='create');assert.ok(create.body.acceptedQuoteId);assert.equal(Object.hasOwn(create.body,'unitPrice'),false);assert.equal(Object.hasOwn(create.body,'total'),false);
  const saved=(await adapter.request('/purchases')).items[0];assert.equal(saved.total,5970*31);assert.equal(saved.paid,0);a.cleanup();a.w.close();
  const card=await mount('store-purchase/card/email',{adapter});card.root.querySelector('[data-purchase-card]').click();await settled();assert.match(card.root.querySelector('[data-purchase-status]').textContent,/아직 연결되지/);assert.equal((await adapter.request('/purchases')).items[0].status,'AWAITING_CARD');card.cleanup();card.w.close();lab.close();
});

test('shared fields validate revenue settings, retain failed input and persist only an acknowledged allocation',{timeout:10000},async()=>{
  const lab=await createProductUiLab(),adapter=lab.adapter('operator'),b=await mount('admin-revenue-rules/settings/email',{adapter}),apply=b.root.querySelector('[data-revenue-apply]');
  assert.equal(apply.disabled,true);b.root.querySelector('[name=gross]').value='100000';b.root.querySelector('[name=cost]').value='40000';b.root.querySelector('[data-rate]').value='100';b.root.querySelector('form').dispatchEvent(new b.w.Event('input',{bubbles:true}));
  assert.equal(apply.disabled,false);apply.click();await settled();assert.equal(b.root.querySelector('[data-name]').getAttribute('aria-invalid'),'true');assert.equal(adapter.calls.filter(call=>call.body).length,0);
  b.root.querySelector('[data-name]').value='첫 기여자';b.root.querySelector('form').dispatchEvent(new b.w.Event('input',{bubbles:true}));assert.equal(b.root.querySelector('[data-contributors] output').textContent,'60,000원');
  // The real API may finish after any number of event-loop turns. This event
  // follows both success and failure, so the original result assertions remain
  // responsible for distinguishing an acknowledged save from a failed one.
  const completed=new Promise(resolve=>b.root.addEventListener('order-app-operation-end',resolve,{once:true}));
  apply.click();assert.equal(apply.dataset.busy,'true');await completed;
  assert.match(b.root.querySelector('[data-revenue-note]').textContent,/저장했어요/);assert.equal((await adapter.request('/revenue')).data.contributors[0].name,'첫 기여자');
  b.root.querySelector('[data-contributor-add]').click();assert.equal(b.root.querySelector('[data-contributors]').children.length,2);b.root.querySelectorAll('[data-rate]')[1].value='10';b.root.querySelector('form').dispatchEvent(new b.w.Event('input',{bubbles:true}));assert.equal(apply.disabled,true);b.cleanup();b.w.close();lab.close();
});

test('an absent product API never activates purchase, revenue or withdrawal completion',async()=>{
  for(const [id,selector] of [['store-purchase/select/email','[data-purchase-confirm]'],['admin-revenue-rules/settings/email','[data-revenue-apply]'],['account-settings/withdraw/email','[data-withdraw-start]']]){
    const item=await mount(id);assert.equal(item.root.dataset.appConnection,'unconnected');assert.equal(item.root.querySelector(selector).disabled,true);item.root.querySelector(selector).click();assert.deepEqual(item.calls,[]);item.cleanup();item.w.close();
  }
});

test('sales review calculates business and campaign totals, filters dates and targets, and never double subtracts refunds',async()=>{
  for(const [state,expected] of [
    ['business-sales',{orders:'5건',trays:'80판',ordered:'489,000원',paid:'366,000원',cancelled:'42,400원',refunded:'42,400원',net:'323,600원',unpaid:'123,000원'}],
    ['campaign-sales',{orders:'4건',trays:'250판',ordered:'1,460,000원',paid:'1,252,000원',cancelled:'200,200원',refunded:'82,200원',net:'1,169,800원',unpaid:'90,000원'}]
  ]){
    const {w,root,calls,cleanup}=await mount('admin-analytics/'+state+'/email',{adapter:{request:async path=>{assert.equal(path,'/sales');return {items:qaSalesFixture};}}});
    const $=selector=>root.querySelector(selector),total=key=>$('[data-sales-total='+key+']').textContent;
    for(const [key,value] of Object.entries(expected))assert.equal(total(key),value,state+' '+key);
    assert.equal($('[data-sales-rows]').children.length,2);assert.match($('[data-sales-provenance]').textContent,/QA 실행.*운영 매출과 분리/);
    const search=$('[data-sales-search]'),period=$('[data-sales-period]');
    search.value=state==='business-sales'?'첫 번째':'동네장터';search.dispatchEvent(new w.Event('input'));
    assert.equal(total('net'),state==='business-sales'?'150,000원':'756,800원');assert.equal(total('unpaid'),state==='business-sales'?'30,000원':'90,000원');
    search.value='';search.dispatchEvent(new w.Event('input'));period.value='previous';period.dispatchEvent(new w.Event('change'));
    assert.equal(total('orders'),'1건');assert.equal(total('net'),state==='business-sales'?'49,600원':'348,000원');
    period.value='month';period.dispatchEvent(new w.Event('change'));
    search.value=state==='business-sales'?'QA-B-1103':'QA-C-1104';search.dispatchEvent(new w.Event('input'));
    assert.equal(total('orders'),'1건');assert.equal(total('net'),'0원');assert.equal(total('unpaid'),'0원','cancelled orders do not become unpaid after refund');
    search.value='no-such-target';search.dispatchEvent(new w.Event('input'));assert.equal($('[data-sales-empty]').hidden,false);assert.equal(total('orders'),'0건');
    search.value='';$('[data-sales-from]').value='2026-11-20';$('[data-sales-to]').value='2026-11-01';$('[data-sales-from]').dispatchEvent(new w.Event('input'));assert.equal($('[data-sales-error]').hidden,false);assert.equal(total('net'),'0원','invalid period must not retain stale totals');
    period.value='all';period.dispatchEvent(new w.Event('change'));assert.equal($('[data-sales-error]').hidden,true);assert.equal(total('orders'),state==='business-sales'?'6건':'5건');
    $('[data-qa-go=admin-analytics][data-qa-state='+(state==='business-sales'?'campaign-sales':'business-sales')+']').click();assert.deepEqual(calls.at(-1),['admin-analytics',state==='business-sales'?'campaign-sales':'business-sales']);
    $('[data-qa-go='+(state==='business-sales'?'admin-negotiations':'admin-campaigns')+']').click();assert.deepEqual(calls.at(-1),state==='business-sales'?['admin-negotiations','list']:['admin-campaigns','normal']);w.close();
  }
});

test('sales is the discoverable first analytics state while original analytics and consult workflow stay available',async()=>{
  const list=await(await serveR3Artifact(new Request('https://x/api/ia/r3-qa/artifact'))).json(),analytics=list.items.filter(row=>row.screen==='admin-analytics');
  assert.deepEqual(analytics.slice(0,2).map(row=>row.state),['business-sales','campaign-sales']);assert.equal(analytics[0].label,'매출 현황');
  assert.deepEqual(analytics.filter(row=>!row.supplemental).map(row=>row.state),['normal','loading','partial','empty','denied']);
  for(const row of catalog.filter(row=>row.screen==='admin-analytics')){
    const doc=await(await artifact(row.id)).json(),entry=list.items.find(item=>item.id===row.id);
    assert.equal(entry.contentHashes[390],row.hashes[390]);assert.equal(doc.hash,entry.hashes[390]);
    assert.equal(doc.source.kind,'research-application');assert.equal(doc.source.build,doc.application.build);
    const url=new URL(doc.application.url,'https://order-ia-portal.pages.dev');assert.equal(url.searchParams.get('screen'),row.screen);assert.equal(url.searchParams.get('state'),row.state);
    const scene=await researchScene(row.screen,row.state,row.variant);assert.equal(scene.html,gunzipSync(Buffer.from(frames[row.current],'base64')).toString(),'the current app still serves the selected original analytics scene');
  }
  const shell=setup(approvedShellBody()),link=shell.window.document.querySelector('#consult-candidates a');
  assert.equal(link.getAttribute('href'),'/ia?view=roles-r3&menu=consult');assert.equal(link.closest('iframe'),null);assert.equal(shell.window.document.querySelector('#frame').getAttribute('sandbox'),'allow-scripts');shell.window.close();
});

test('BLOUB composes original upper-to-result blocks and reduced-motion shows the selected result in one view',async()=>{
  const source=extras.documents.get('component-library/bloub/email'),dom=setup(source.body),w=dom.window,definitions=[];
  const {bloubMontages}=await import('../src/server/r3-bloub.mjs'),{waitMontages}=await import('../src/server/r3-quote-wait.mjs');
  let destroyed=0;w.BloubR4={async mountBloub(slot,definition,options){definitions.push({definition,options});let time=0;const duration=definition.blocks.reduce((s,b)=>s+b.duration,0);return {seek(value){time=value;},pause(){},getState(){return {time,duration,blockedBy:[]};},destroy(){destroyed++;}};}};
  w.eval('('+getQaMvpRuntimeSource()+')('+JSON.stringify({...bloubMontages,...waitMontages})+')');
  const root=w.document.querySelector('#order-single'),dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='component-library').mount(root,'bloub',{reduced:()=>true,select(){}});
  root.querySelector('[data-bloub-upper]').value='delayed';root.querySelector('[data-bloub-outcome]').value='equal';root.querySelector('[data-bloub-play]').click();await tick();
  assert.deepEqual(Array.from(definitions[0].definition.blocks,b=>b.state),[...waitMontages.delayed.blocks,...waitMontages.finishing.blocks,...waitMontages.complete.blocks].map(b=>b.state));
  assert.equal(definitions[0].options.autoplay,false);assert.equal(root.querySelector('[data-bloub-result-panel]').hidden,false);assert.match(root.querySelector('[data-bloub-result-panel]').textContent,/동일 가격/);
  root.querySelector('[data-bloub-reset]').click();assert.equal(destroyed,1);assert.equal(root.querySelector('[data-bloub-result-panel]').hidden,true);dispose();w.close();
});

test('3D motion variants keep the original image and separate source usage from variant review targets',async()=>{
  const original=extras.assets.find(asset=>asset.id==='intro-art');assert.ok(original);
  const sourceArt=JSON.parse(readFileSync(new URL('../scripts/r3/authored/onboarding-art.json',import.meta.url),'utf8'));
  const still=setup(extras.documents.get('component-library/asset-intro-art/email').body);
  assert.equal(still.window.document.querySelector('img').getAttribute('src'),'data:image/webp;base64,'+sourceArt.data);still.window.close();
  for(const motion of ['float','emphasis']){
    const variant=extras.assets.find(asset=>asset.id==='intro-art-'+motion);
    assert.equal(variant.preview,original.preview);assert.equal(variant.sourceSha256,original.sourceSha256);assert.equal(variant.derivedFrom,original.id);
    assert.deepEqual(variant.usages,[],'new variants must not pretend to be used by original product screens');assert.deepEqual(variant.sourceUsages,original.usages);
    const {w,root,cleanup}=await mount('component-library/asset-'+variant.id+'/email'),stage=root.querySelector('[data-qa-art-motion]');
    assert.equal(stage.dataset.qaArtMotion,motion);assert.match(root.querySelector('[data-qa-motion-provenance]').textContent,/원본 3D 이미지.*변형/);
    const play=root.querySelector('[data-qa-art-play]'),pause=root.querySelector('[data-qa-art-pause]'),reset=root.querySelector('[data-qa-art-reset]');
    assert.equal(stage.dataset.qaArtStatus,'idle');assert.equal(pause.disabled,true);play.click();assert.equal(stage.dataset.qaArtStatus,'playing');assert.equal(play.disabled,true);
    pause.click();assert.equal(stage.dataset.qaArtStatus,'paused');assert.equal(play.disabled,false);play.click();assert.equal(stage.dataset.qaArtStatus,'playing');
    reset.click();assert.equal(stage.dataset.qaArtStatus,'idle');assert.equal(reset.disabled,true);play.click();cleanup();assert.equal(stage.dataset.qaArtStatus,'idle');w.close();
  }
});

test('3D motion respects reduced-motion both at entry and when the preference changes during playback',()=>{
  const source=extras.documents.get('component-library/asset-intro-art-float/email'),dom=setup(source.body),w=dom.window;
  let quiet=true,onChange=null,removed=0;const preference={get matches(){return quiet;},addEventListener(type,fn){assert.equal(type,'change');onChange=fn;},removeEventListener(type,fn){assert.equal(fn,onChange);removed++;}};
  w.matchMedia=()=>preference;w.eval('('+getQaMvpRuntimeSource()+')()');
  const root=w.document.querySelector('#order-single'),dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='component-library').mount(root,source.row.state,{reduced:()=>quiet,select(){}});
  const play=root.querySelector('[data-qa-art-play]'),stage=root.querySelector('[data-qa-art-motion]');assert.equal(play.disabled,true);assert.equal(stage.dataset.qaArtStatus,'idle');assert.match(root.querySelector('[data-qa-art-status-text]').textContent,/모션 줄이기/);
  quiet=false;onChange();assert.equal(play.disabled,false);play.click();assert.equal(stage.dataset.qaArtStatus,'playing');
  quiet=true;onChange();assert.equal(stage.dataset.qaArtStatus,'idle');assert.equal(play.disabled,true);dispose();assert.equal(removed,1);w.close();
});

test('shipment dispatch validates shared fields and persists through the canonical service',async()=>{
  for(const screen of ['admin-shipments','supplier-shipments']){
    const lab=await createProductUiLab(),buyer=lab.adapter('buyer'),operator=lab.adapter('operator'),offer=(await buyer.request('/purchases')).offers[0];
    const quote=await buyer.request('/purchase-quote',{offerId:offer.id,quantity:10,expectedRevision:0,requestKey:crypto.randomUUID()});
    const order=(await buyer.request('/purchases',{action:'create',offerId:offer.id,quantity:10,paymentMethod:'cash',channel:'farm',acceptedQuoteId:quote.quoteId,expectedRevision:0,requestKey:crypto.randomUUID()})).item;
    const cashier=await mount('store-purchase/select/email',{adapter:operator});
    assert.equal(cashier.root.querySelector('[data-purchase-form]').hidden,true,'operator never edits a buyer price');
    const payment=cashier.root.querySelector('[data-order-action=confirm-cash]');assert.equal(payment.hidden,false);
    payment.click();await settled();assert.equal(cashier.root.querySelector('[name=cash-reference]').getAttribute('aria-invalid'),'true');
    cashier.root.querySelector('[name=cash-reference]').value='TEST-BANK-123';payment.click();await settled();assert.equal((await buyer.request('/purchases')).items[0].status,'PAID');cashier.cleanup();cashier.w.close();
    const adapter=lab.adapter(screen==='admin-shipments'?'operator':'supplier');adapter.selectedPurchaseId=order.id;
    const {w,root,cleanup}=await mount(screen+'/packing/email',{adapter}),method=root.querySelector('[name=shipment-method]'),tracking=root.querySelector('[name=tracking-number]'),apply=root.querySelector('[data-shipment-apply]'),status=root.querySelector('[name=shipment-status]');
    assert.equal(apply.disabled,true);status.value='dispatched';status.dispatchEvent(new w.Event('change'));method.value='parcel';method.dispatchEvent(new w.Event('change'));assert.equal(tracking.required,true);apply.click();await settled();assert.equal(tracking.getAttribute('aria-invalid'),'true');assert.equal((await buyer.request('/purchases')).items[0].status,'PAID');
    tracking.value='1234-5678';apply.click();await settled();const saved=(await buyer.request('/purchases')).items[0];assert.equal(saved.status,'DISPATCHED');assert.equal(saved.tracking,'1234-5678');assert.equal(apply.disabled,true,'a completed dispatch cannot be submitted again');cleanup();w.close();lab.close();
  }
});

test('library preserves field roots and mounts the source runtime instead of an inert inner control',async()=>{
  const a=await mount('component-library/asset-email/email',{sourceRuntime:true}),source=a.root.querySelector('[data-component-source]'),target=source.querySelector('[data-component-target]');
  assert.ok(target.closest('.field.is-floating'));assert.equal(source.closest('[inert]'),null);assert.ok(target.id);assert.ok(source.querySelector('label[for="'+target.id+'"]'));assert.match(a.root.querySelector('[data-component-runtime]').textContent,/원본 화면과 런타임이 연결/);
  target.focus();assert.equal(target.closest('.field').classList.contains('is-focused'),true);
  const password=source.querySelector('[data-action=password-visibility]');assert.ok(password);const input=password.parentElement.querySelector('input');assert.equal(input.type,'password');password.click();assert.equal(input.type,'text');
  const asset=extras.assets.find(asset=>asset.id==='select');assert.ok(asset.usages.some(use=>use.id==='store-purchase/select/email'&&use.supplemental));assert.ok(asset.variants.length>1);a.cleanup();a.w.close();
});

test('BLOUB repeated sequences reveal each result once without hiding the observed player or remounting the result every tick',async()=>{
  const source=extras.documents.get('component-library/bloub/email'),dom=setup(source.body),w=dom.window;
  const {bloubMontages}=await import('../src/server/r3-bloub.mjs'),{waitMontages}=await import('../src/server/r3-quote-wait.mjs');
  let time=0,duration=0,pulse;w.setInterval=fn=>{pulse=fn;return 1;};w.clearInterval=()=>{};
  w.BloubR4={async mountBloub(slot,definition){duration=definition.blocks.reduce((s,b)=>s+b.duration,0);return {getState:()=>({time,duration,blockedBy:[]}),pause(){},destroy(){}};}};
  w.eval('('+getQaMvpRuntimeSource()+')('+JSON.stringify({...bloubMontages,...waitMontages})+')');
  const root=w.document.querySelector('#order-single'),dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='component-library').mount(root,'bloub',{reduced:()=>false,select(){}});
  root.querySelector('[data-bloub-loop]').checked=true;root.querySelector('[data-bloub-play]').click();await tick();
  time=duration-1;pulse();const result=root.querySelector('[data-bloub-result-panel]');assert.equal(result.hidden,false);const first=result.firstElementChild;pulse();assert.equal(result.firstElementChild,first);
  assert.equal(root.querySelector('[data-bloub-player-slot]').hidden,false,'IntersectionObserver must keep the active montage running');
  time=.1;pulse();assert.equal(result.hidden,true);assert.equal(root.querySelector('[data-bloub-preview]').dataset.result,'false');dispose();w.close();
});
