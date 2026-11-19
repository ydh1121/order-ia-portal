import test from 'node:test';
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
import {registerQaMvp} from '../src/server/r3-ui/qa-mvp-runtime.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const extras=await getQaSupplemental();
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const artifact=async(id,options={})=>serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version:'current',...options})));
function setup(body){const dom=new JSDOM(body,{url:'https://order-ia-portal.pages.dev/ia?view=qa-lab',runScripts:'outside-only',pretendToBeVisual:true});dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});return dom;}
async function mount(id){const source=extras.documents.get(id);assert.ok(source,id);const dom=setup(source.body),w=dom.window,calls=[];w.eval('('+registerQaMvp.toString()+')()');const module=w.ORDER_DESIGN_MODULES.find(m=>m.id===source.row.screen);const cleanup=module.mount(w.document.querySelector('#order-single'),source.row.state,{screen:source.row.screen,reduced:()=>false,select(...args){calls.push(args);}});return {dom,w,root:w.document.querySelector('#order-single'),calls,cleanup};}

test('MVP classification reuses every original screen exactly once and leaves future expansion separate',()=>{
  const ids=[...new Set(catalog.map(r=>r.screen))],layout=defaultQaNavigation(ids);
  assert.deepEqual(layout.groups.map(g=>g.name),['1차 MVP','정식 - 향후 검토']);
  assert.equal(Object.keys(layout.assignments).length,97);
  for(const id of ['onboarding','q3','admin-orders','admin-payments','admin-shipments','receipt','account-settings','common'])assert.equal(layout.assignments[id],'mvp',id);
  for(const id of ['consumer-subscription','partner-storefront','admin-rights'])assert.equal(layout.assignments[id],'future',id);
  assert.throws(()=>normalizeQaNavigation({...layout,assignments:{...layout.assignments,invented:'mvp'}},ids));
  assert.throws(()=>normalizeQaNavigation({...layout,groups:[{id:'mvp',name:' '},{id:'future',name:'나중'}]},ids));
});

test('account-owned navigation retains history, rejects stale tabs and isolates other owners',async()=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0016_r3_qa_navigation.sql',import.meta.url),'utf8'));
  const db={prepare(sql){return {bind(...args){const st=sqlite.prepare(sql);return {first:async()=>st.get(...args),run:async()=>({meta:st.run(...args)})};}};}};
  const send=(actorId,body)=>handleQaNavigation({env:{ORDER_QA_DB:db},actor:{id:actorId,role:'OWNER'},request:new Request('https://x/api/ia/r3-qa/navigation',body?{method:'POST',body:JSON.stringify(body)}:{})});
  const first=await(await send('owner-a')).json();assert.equal(first.revision,0);
  first.layout.groups[0].name='첫 매장';first.layout.assignments['admin-rights']='mvp';
  assert.equal((await send('owner-a',{expectedRevision:0,layout:first.layout})).status,200);
  const stale=await send('owner-a',{expectedRevision:0,layout:first.layout});assert.equal(stale.status,409);assert.equal((await stale.json()).current.layout.groups[0].name,'첫 매장');
  const second=await(await send('owner-b')).json();assert.equal(second.revision,0);assert.equal(second.layout.assignments['admin-rights'],'future');
  const reopened=await(await send('owner-a')).json();assert.equal(reopened.revision,1);assert.equal(reopened.layout.assignments['admin-rights'],'mvp');
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

test('new review assets have independent targets and prior delivery artifacts remain byte-identical',async()=>{
  const list=await(await serveR3Artifact(new Request('https://x/api/ia/r3-qa/artifact'))).json();
  const originals=list.items.filter(r=>!r.supplemental);assert.equal(originals.length,catalog.length);assert.equal(new Set(originals.map(r=>r.screen)).size,97);
  for(const source of extras.assets)for(const use of source.usages){const original=catalog.find(r=>r.id===use.id);assert.ok(original,use.id);assert.equal(original.current,use.source);assert.equal(original.label,use.label);}
  const item=list.items.find(r=>r.id==='component-library/asset-email/email');assert.ok(item);
  const doc=await(await artifact(item.id)).json();assert.equal(doc.hash,item.hashes[390]);assert.equal(await isR3ReviewTarget({screen:item.screen,state:item.state,variant:'email',viewport:390,artifactHash:doc.hash}),true);
  const original=catalog.find(r=>r.id==='delivery-request/ready/email');
  const old=await(await artifact(original.id,{version:'recorded',artifactHash:original.hashes[390]})).json();
  assert.equal(old.hash,original.hashes[390]);assert.ok(old.html.includes(gunzipSync(Buffer.from(frames[original.current],'base64')).toString()));
  const current=await(await artifact(original.id)).json();assert.notEqual(current.hash,old.hash);assert.match(current.html,/data-pass-card/);
  const allRows=[...catalog,...extras.rows];
  for(const [id,source] of extras.documents){
    const d=setup(source.body);for(const b of d.window.document.querySelectorAll('[data-qa-go]'))assert.ok(allRows.some(r=>r.screen===b.dataset.qaGo&&r.state===b.dataset.qaState),id+' → '+b.dataset.qaGo+'/'+b.dataset.qaState);d.window.close();
  }
});

test('large Order Pass flips in place and withdrawal requires reason, exact phrase and final confirmation',async()=>{
  const pass=await mount('delivery-request/ready/email'),card=pass.root.querySelector('[data-pass-card]');
  pass.root.querySelector('[data-qa-flip]').click();assert.equal(card.dataset.face,'back');assert.equal(pass.calls.length,0);
  card.querySelector('.mvp-pass-back button').click();assert.equal(card.dataset.face,'front');assert.equal(pass.root.querySelector('[data-pass-card]'),card);pass.w.close();
  const {w,root,calls}=await mount('account-settings/withdraw/email'),button=root.querySelector('[data-withdraw-start]');
  const fill=(name,value)=>{const el=root.querySelector('[name='+name+']');el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
  fill('withdraw-phrase','회원탈퇴');assert.equal(button.disabled,true);fill('withdraw-reason','other');assert.equal(button.disabled,true);
  fill('withdraw-note','필요할 때 다시 가입할게요');assert.equal(button.disabled,false);fill('withdraw-phrase','회원탈퇴 ');assert.equal(button.disabled,true);fill('withdraw-phrase','회원탈퇴');
  button.click();assert.equal(root.querySelector('[data-withdraw-dialog]').hasAttribute('open'),true);assert.equal(calls.length,0);
  root.querySelector('[data-withdraw-cancel]').click();assert.equal(calls.length,0);button.click();root.querySelector('[data-withdraw-confirm]').click();assert.deepEqual(calls,[['account-settings','closed']]);w.close();
});

test('purchase preserves equal cash/card totals and revenue preview validates the allocation before applying',async()=>{
  const a=await mount('store-purchase/select/email');
  const confirm=a.root.querySelector('[data-purchase-confirm]');assert.equal(confirm.type,'button');confirm.click();assert.deepEqual(a.calls,[],'missing price must not advance');
  a.root.querySelector('[name=unit-price]').value='6000';a.root.querySelector('[name=quantity]').value='0';confirm.click();assert.deepEqual(a.calls,[],'zero quantity must not advance');
  a.root.querySelector('[name=unit-price]').value='6000';a.root.querySelector('[name=quantity]').value='12';a.root.querySelector('form').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  assert.deepEqual([...a.root.querySelectorAll('[data-same-price]')].map(el=>el.textContent),['72,000원','72,000원']);
  a.root.querySelector('[value=card]').checked=true;confirm.click();assert.deepEqual(a.calls,[['store-purchase','card']]);
  a.root.querySelector('[value=cash]').checked=true;a.root.querySelector('[name=quantity]').dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.deepEqual(a.calls.at(-1),['store-purchase','cash']);a.w.close();
  const b=await mount('admin-revenue-rules/settings/email'),apply=b.root.querySelector('[data-revenue-apply]');assert.equal(apply.disabled,true);
  assert.equal(apply.type,'button');apply.click();assert.equal(b.root.querySelector('[data-revenue-note]').textContent,'');
  b.root.querySelector('[name=gross]').value='100000';b.root.querySelector('[name=cost]').value='40000';b.root.querySelector('[data-rate]').value='100';b.root.querySelector('form').dispatchEvent(new b.w.Event('input',{bubbles:true}));
  assert.equal(apply.disabled,false);apply.click();assert.equal(b.root.querySelector('[data-revenue-note]').textContent,'','contributor name is required');
  b.root.querySelector('[data-name]').value='첫 기여자';b.root.querySelector('[name=cost]').value='';apply.click();assert.equal(b.root.querySelector('[data-revenue-note]').textContent,'','cost is required even when allocation totals 100%');
  b.root.querySelector('[name=cost]').value='40000';assert.equal(b.root.querySelector('[data-contributors] output').textContent,'60,000원');apply.click();assert.match(b.root.querySelector('[data-revenue-note]').textContent,/이 검토 화면에 설정을 반영/);
  b.root.querySelector('[data-revenue-note]').textContent='';b.root.querySelector('[data-name]').dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.match(b.root.querySelector('[data-revenue-note]').textContent,/이 검토 화면에 설정을 반영/);
  b.root.querySelector('[data-contributor-add]').click();assert.equal(b.root.querySelector('[data-contributors]').children.length,2);
  b.root.querySelectorAll('[data-rate]')[1].value='10';b.root.querySelector('form').dispatchEvent(new b.w.Event('input',{bubbles:true}));assert.equal(apply.disabled,true);b.w.close();
});

test('BLOUB composes original upper-to-result blocks and reduced-motion shows the selected result in one view',async()=>{
  const source=extras.documents.get('component-library/bloub/email'),dom=setup(source.body),w=dom.window,definitions=[];
  const {bloubMontages}=await import('../src/server/r3-bloub.mjs'),{waitMontages}=await import('../src/server/r3-quote-wait.mjs');
  let destroyed=0;w.BloubR4={async mountBloub(slot,definition,options){definitions.push({definition,options});let time=0;const duration=definition.blocks.reduce((s,b)=>s+b.duration,0);return {seek(value){time=value;},pause(){},getState(){return {time,duration,blockedBy:[]};},destroy(){destroyed++;}};}};
  w.eval('('+registerQaMvp.toString()+')('+JSON.stringify({...bloubMontages,...waitMontages})+')');
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
    assert.equal(stage.dataset.qaArtMotion,motion);assert.match(root.querySelector('[data-qa-motion-provenance]').textContent,/모션을 적용한 변형/);
    const play=root.querySelector('[data-qa-art-play]'),pause=root.querySelector('[data-qa-art-pause]'),reset=root.querySelector('[data-qa-art-reset]');
    assert.equal(stage.dataset.qaArtStatus,'idle');assert.equal(pause.disabled,true);play.click();assert.equal(stage.dataset.qaArtStatus,'playing');assert.equal(play.disabled,true);
    pause.click();assert.equal(stage.dataset.qaArtStatus,'paused');assert.equal(play.disabled,false);play.click();assert.equal(stage.dataset.qaArtStatus,'playing');
    reset.click();assert.equal(stage.dataset.qaArtStatus,'idle');assert.equal(reset.disabled,true);play.click();cleanup();assert.equal(stage.dataset.qaArtStatus,'idle');w.close();
  }
});

test('3D motion respects reduced-motion both at entry and when the preference changes during playback',()=>{
  const source=extras.documents.get('component-library/asset-intro-art-float/email'),dom=setup(source.body),w=dom.window;
  let quiet=true,onChange=null,removed=0;const preference={get matches(){return quiet;},addEventListener(type,fn){assert.equal(type,'change');onChange=fn;},removeEventListener(type,fn){assert.equal(fn,onChange);removed++;}};
  w.matchMedia=()=>preference;w.eval('('+registerQaMvp.toString()+')()');
  const root=w.document.querySelector('#order-single'),dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='component-library').mount(root,source.row.state,{reduced:()=>quiet,select(){}});
  const play=root.querySelector('[data-qa-art-play]'),stage=root.querySelector('[data-qa-art-motion]');assert.equal(play.disabled,true);assert.equal(stage.dataset.qaArtStatus,'idle');assert.match(root.querySelector('[data-qa-art-status-text]').textContent,/모션 줄이기/);
  quiet=false;onChange();assert.equal(play.disabled,false);play.click();assert.equal(stage.dataset.qaArtStatus,'playing');
  quiet=true;onChange();assert.equal(stage.dataset.qaArtStatus,'idle');assert.equal(play.disabled,true);dispose();assert.equal(removed,1);w.close();
});

test('existing shipment detail accepts a tracking number and status while direct farm delivery may omit a waybill',async()=>{
  for(const screen of ['admin-shipments','supplier-shipments']){
    const {w,root}=await mount(screen+'/packing/email'),form=root.querySelector('[data-shipment-form]'),method=root.querySelector('[name=shipment-method]'),tracking=root.querySelector('[name=tracking-number]'),apply=root.querySelector('[data-shipment-apply]'),summary=root.querySelector('[data-shipment-summary]');
    assert.equal(apply.type,'button');assert.equal(tracking.required,false);apply.click();assert.match(summary.textContent,/합천 농장.*송장 미사용/);
    summary.textContent='';method.value='parcel';method.dispatchEvent(new w.Event('change'));assert.equal(tracking.required,true);assert.equal(form.checkValidity(),false);apply.click();assert.equal(summary.textContent,'');
    tracking.value='1234-5678';root.querySelector('[name=shipment-status]').value='dispatched';apply.click();assert.match(summary.textContent,/배송 중.*1234-5678/);
    tracking.value='ENTER-1234';const enter=new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});tracking.dispatchEvent(enter);assert.equal(enter.defaultPrevented,true);assert.match(summary.textContent,/ENTER-1234/);
    summary.textContent='';tracking.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));assert.equal(summary.textContent,'');root.querySelector('[name=shipment-note]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(summary.textContent,'','textarea Enter keeps its newline behavior');w.close();
  }
});

test('BLOUB repeated sequences reveal each result once without hiding the observed player or remounting the result every tick',async()=>{
  const source=extras.documents.get('component-library/bloub/email'),dom=setup(source.body),w=dom.window;
  const {bloubMontages}=await import('../src/server/r3-bloub.mjs'),{waitMontages}=await import('../src/server/r3-quote-wait.mjs');
  let time=0,duration=0,pulse;w.setInterval=fn=>{pulse=fn;return 1;};w.clearInterval=()=>{};
  w.BloubR4={async mountBloub(slot,definition){duration=definition.blocks.reduce((s,b)=>s+b.duration,0);return {getState:()=>({time,duration,blockedBy:[]}),pause(){},destroy(){}};}};
  w.eval('('+registerQaMvp.toString()+')('+JSON.stringify({...bloubMontages,...waitMontages})+')');
  const root=w.document.querySelector('#order-single'),dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='component-library').mount(root,'bloub',{reduced:()=>false,select(){}});
  root.querySelector('[data-bloub-loop]').checked=true;root.querySelector('[data-bloub-play]').click();await tick();
  time=duration-1;pulse();const result=root.querySelector('[data-bloub-result-panel]');assert.equal(result.hidden,false);const first=result.firstElementChild;pulse();assert.equal(result.firstElementChild,first);
  assert.equal(root.querySelector('[data-bloub-player-slot]').hidden,false,'IntersectionObserver must keep the active montage running');
  time=.1;pulse();assert.equal(result.hidden,true);assert.equal(root.querySelector('[data-bloub-preview]').dataset.result,'false');dispose();w.close();
});
