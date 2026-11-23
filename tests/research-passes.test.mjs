import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {researchScene} from '../src/server/research-app/page.mjs';
import {researchPassRows,installResearchPasses} from '../src/server/research-app/passes.mjs';
import {installQaFixtureAdapter} from '../src/server/r3-ui/qa-fixture-adapter.mjs';
import {installProductAdapter} from '../src/server/product-app-adapter.mjs';
import {mountAsyncMotion} from '../src/server/r3-async-motion.mjs';
const {JSDOM,VirtualConsole}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check,label='response'){const end=Date.now()+3000;while(!check()&&Date.now()<end)await tick();assert.ok(check(),label);}
async function setup(t,screen='passes',state='grid'){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>{if(error.type!=='css parsing')errors.push(error.message);});const dom=new JSDOM('<main id="app"></main>',{url:'https://research.test/ia',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,root=w.document.querySelector('main');
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});w.fetch=()=>assert.fail('no network');
  w.eval('window.__adapter=('+installQaFixtureAdapter.toString()+')({screen:'+JSON.stringify(screen)+',state:'+JSON.stringify(state)+',fixture:{persona:"buyer"}},'+installProductAdapter.toString()+')');const adapter=w.__adapter;await adapter.ready;const installed=installResearchPasses(w),source=await researchScene(screen,state,'email');w.ORDER_DESIGN_MODULES=[];w.eval(source.mount);const module=w.ORDER_DESIGN_MODULES.find(row=>row.id===screen);root.innerHTML=source.html;
  const writes=[],request=adapter.request;adapter.request=(path,body,signal)=>{if(body)writes.push({path,body:JSON.parse(JSON.stringify(body))});return request(path,body,signal);};
  w.__root=root;w.eval('window.__motion=('+mountAsyncMotion.toString()+')(__root)');const motion=w.__motion,controller=new w.AbortController(),notices=[],disposers=[];
  const mount=()=>{const dispose=module.mount(root,state,{mode:'product',screen,adapter,motion,signal:controller.signal,reduced:()=>true,select(){},toast:message=>notices.push(message)});disposers.push(dispose);return dispose;};
  t.after(()=>{controller.abort();for(const dispose of disposers)dispose?.();installed.destroy();motion.destroy();adapter.fixture.dispose();w.dispatchEvent(new w.Event('pagehide'));w.close();assert.deepEqual(errors,[]);});
  return {w,root,adapter,motion,mount,notices,controller,writes};
}
test('pass projection keeps compound rows and escaping inputs, deduplicates issued purchases and only trusts server receipt actions',()=>{
  const rows=researchPassRows({items:[{id:'p',revision:3,status:'DISPATCHED',product:'대란',quantity:3,date:'2026-11-20',target:'<img src=x onerror=alert(1)>',quoteId:'ordered',actions:[]}]},{quotes:[{id:'ordered'},{id:'multi',site_id:'s',org_id:'o',expires_at:'2027-01-01',lines:[{productName:'특란',quantity:10,unit:'tray',serviceDate:'2026-12-01'},{productName:'대란',quantity:5,unit:'box',serviceDate:'2026-12-02'}]}],businesses:[{org_id:'o',site_id:'s',businessName:'테스트'}]},Date.parse('2026-11-23'));
  assert.equal(rows.length,2);assert.equal(rows[0].canReceive,false);assert.equal(rows[1].lines.length,2);assert.equal(rows[1].lines[1][1],'5상자');assert.equal(rows[1].canReceive,false);
});
test('purchase display names require a unique authorized business for a local site key',()=>{
  const item={id:'p',targetId:'main',target:'main',revision:1,status:'DISPATCHED',actions:['receive'],quantity:1,product:'특란'},alpha={org_id:'alpha',site_id:'main',businessName:'알파 사업장'},beta={org_id:'beta',site_id:'main',businessName:'베타 사업장'};
  assert.equal(researchPassRows({items:[item]},{businesses:[alpha]})[0].site,'알파 사업장');
  for(const businesses of [[alpha,beta],[beta,alpha]]){
    const rows=researchPassRows({items:[item,{...item,id:'p2'}]},{businesses});
    assert.deepEqual(rows.map(row=>row.site),['main','main'],'ambiguous organization names are not inferred from a local site key');
    assert.ok(rows.every(row=>row.canReceive),'display fallback does not alter the server-provided receipt capability');
  }
});
test('actual research pass runtime loads the current adapter, retains cards across deck/grid, and receives only after server acknowledgement',async t=>{
  const v=await setup(t);const mount=v.mount();await mount.ready;assert.equal(v.root.dataset.passDataState,'ready');assert.equal(v.root.querySelectorAll('[data-pass-id]').length,6);assert.equal(v.root.querySelector('[data-pass-id=b17]'),null);assert.equal(v.root.querySelector('.nav-sample'),null);
  const stage=v.root.querySelector('.pass-stage'),cards=[...stage.children];v.root.querySelector('[data-view=deck]').click();assert.equal(stage.classList.contains('is-deck'),true);assert.deepEqual([...stage.children],cards);assert.equal(cards[0].style.getPropertyValue('--deck-turn'),'0deg');v.root.querySelector('[data-view=grid]').click();
  v.root.querySelector('[data-pass-id="qa-order-shipped"]').click();v.root.querySelector('[data-action=tear-ticket]').click();const confirm=v.root.querySelector('[data-action=confirm-tear]');
  v.adapter.fixture.configure({requests:{'product POST /purchases':{scenario:'error',status:503}}});confirm.click();await until(()=>/다시|실패|UNAVAILABLE/.test(v.root.querySelector('[data-receipt-message]').textContent));assert.equal(v.root.querySelectorAll('.ticket-received').length,0);assert.equal(v.adapter.fixture.inspect().data.purchases.find(row=>row.id==='qa-order-shipped').status,'DISPATCHED');
  v.adapter.fixture.configure({requests:{'product POST /purchases':{scenario:'loading'}}});confirm.click();await until(()=>v.adapter.fixture.inspect().pending===1);assert.equal(confirm.disabled,true);assert.equal(v.root.querySelectorAll('.ticket-received').length,0);v.adapter.fixture.releasePending({requests:{}});await until(()=>v.root.querySelector('.ticket-received'));assert.equal(v.adapter.fixture.inspect().data.purchases.find(row=>row.id==='qa-order-shipped').status,'RECEIVED');assert.equal(stage.lastElementChild.dataset.passId,'qa-order-shipped');
  const writes=v.writes.filter(call=>call.path==='/purchases');assert.equal(writes.length,2);assert.equal(writes[0].body.action,'receive');assert.equal(writes[0].body.id,'qa-order-shipped');assert.equal(writes[0].body.expectedRevision,1);assert.ok(writes[0].body.requestKey);assert.deepEqual(writes[0].body,writes[1].body);mount();v.mount();await until(()=>v.root.dataset.passDataState==='ready'&&v.root.querySelector('.ticket-received'));assert.equal(v.root.querySelector('[data-pass-id="qa-order-shipped"] .pass-state').textContent,'수령 확인');
});
test('malformed receipt responses fail inside the motion task before any success or received state',async t=>{
  const expected={id:'qa-order-shipped',status:'RECEIVED',revision:2},cases=[['missing revision',{id:expected.id,status:expected.status}],['string revision',{...expected,revision:'2'}],['future revision',{...expected,revision:99}],['stale revision',{...expected,revision:1}],['fractional revision',{...expected,revision:2.5}],['wrong id',{...expected,id:'another-purchase'}],['wrong status',{...expected,status:'DISPATCHED'}]];
  for(const [label,item] of cases){
    const v=await setup(t);await v.mount().ready;const send=v.adapter.request,commands=[],phases=[];
    v.adapter.request=async(path,body,signal)=>{if(path==='/purchases'&&body?.action==='receive'){commands.push(JSON.parse(JSON.stringify(body)));return {item};}return send(path,body,signal);};
    v.root.addEventListener('r3:async-state',event=>phases.push(event.detail.phase));
    v.root.querySelector('[data-pass-id="qa-order-shipped"]').click();v.root.querySelector('[data-action=tear-ticket]').click();const confirm=v.root.querySelector('[data-action=confirm-tear]');confirm.click();
    await until(()=>/수령 결과를 확인하지 못했어요/.test(v.root.querySelector('[data-receipt-message]')?.textContent||''),label);
    assert.deepEqual(phases,['pending','error'],label+' must never announce success');assert.equal(v.root.querySelector('.ticket-received'),null,label);assert.deepEqual(v.notices,[],label);assert.equal(v.adapter.fixture.inspect().data.purchases.find(row=>row.id===expected.id).status,'DISPATCHED');assert.equal(commands[0].expectedRevision,1);
    if(label==='missing revision'){
      v.adapter.request=send;confirm.click();await until(()=>v.root.querySelector('.ticket-received'));
      assert.deepEqual(v.writes.find(call=>call.path==='/purchases').body,commands[0],'a failed response keeps the same idempotent receive command for retry');
      assert.deepEqual(phases,['pending','error','pending','success']);
    }
  }
});
test('actual search uses only retrieved tag values, escapes data, and displays a multi-line issued quote',async t=>{
  const v=await setup(t,'search','empty'),send=v.adapter.roleRequest;v.adapter.roleRequest=async(...args)=>{const response=await send(...args);if(args[0]==='/workspace')return {...response,quotes:[{id:'safe',org_id:'o',site_id:'s',issued_at:'2026-11-23',expires_at:'2027-01-01',lines:[{productName:'<img src=x onerror=alert(1)>',quantity:4,unit:'tray',serviceDate:'2026-12-01'},{productName:'특란',quantity:7,unit:'box',serviceDate:'2026-12-02'}]}],businesses:[{org_id:'o',site_id:'s',businessName:'복합 사업장'}]};return response;};
  await v.mount().ready;const input=v.root.querySelector('.tag-field input');input.value='복합';input.dispatchEvent(new v.w.Event('input',{bubbles:true}));const option=v.root.querySelector('[data-suggestion="복합 사업장"]');assert.ok(option);assert.equal(option.querySelector('svg'),null);option.click();assert.equal(input.placeholder,'');assert.equal(v.root.querySelectorAll('.search-tag').length,1);v.root.querySelector('[data-detail="quote:safe"]').click();assert.equal(v.root.querySelectorAll('.ticket-item').length,2);assert.match(v.root.querySelector('[data-search-detail]').textContent,/7상자/);assert.equal(v.root.querySelector('img'),null);assert.match(v.root.querySelector('[data-search-detail]').textContent,/<img src=x/);
});
test('closing a pending pass load aborts the adapter request and cannot paint late rows',async t=>{
  const v=await setup(t);v.adapter.fixture.configure({requests:{'product GET /purchases':{scenario:'loading'}}});const dispose=v.mount();await until(()=>v.adapter.fixture.inspect().pending===1);dispose();await until(()=>v.adapter.fixture.inspect().pending===0);v.adapter.fixture.releasePending({requests:{}});await tick();assert.notEqual(v.root.dataset.passDataState,'ready');
});
