import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import {runtimes,frameCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {archivedRows,archivedScripts} from '../src/server/r3-ui/interaction-history.gen.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const row=(state,variant='email')=>catalog.find(r=>r.id==='login/'+state+'/'+variant);
const html=r=>gunzipSync(Buffer.from(frames[r.current],'base64')).toString();
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check){for(let n=0;n<60;n++){if(check())return;await tick();}assert.ok(check(),'async operation settled');}
function setup(markup,url='https://order-ia-portal.pages.dev/ia?view=qa-lab'){
  const dom=new JSDOM(markup,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement,configurable:true});
  w.document.documentElement.scrollTo=()=>{};
  w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:webcrypto});
  return {dom,w};
}

test('login drag, backdrop and state selection close the same sheet and preserve typed fields and frame identity',async()=>{
  const {w}=setup(html(row('empty'))),messages=[],parent={postMessage(message){messages.push(message);}};
  Object.defineProperty(w,'parent',{value:parent});
  w.eval(runtimes[row('empty').runtimeFamily]);
  const session={channel:'11111111-1111-4111-8111-111111111111',artifact:row('empty').hashes[390],screen:'login',state:'empty',variant:'email',version:'current'};
  w.eval('('+frameCode+')('+JSON.stringify(session)+')');
  const root=w.document.querySelector('#order-single'),sheet=root.querySelector('.auth-sheet'),input=root.querySelector('[name=email]');
  input.value='typing@example.invalid';
  assert.equal(root.querySelector('.sheet-close'),null);
  const grip=root.querySelector('.sheet-handle');sheet.getBoundingClientRect=()=>({height:500});
  for(const [type,y] of [['pointerdown',10],['pointermove',240],['pointerup',240]]){
    const event=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,clientY:y,button:0,isPrimary:true});grip.dispatchEvent(event);
  }
  assert.ok(sheet.hidden);assert.equal(messages.at(-1).type,'localState');assert.equal(messages.at(-1).payload.state,'closed');
  const transition=(state,channel,applied)=>{
    const identity=messages.filter(m=>m.type==='ready').at(-1);
    w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{scope:'ORDER_R3_HOST',channel:identity.channel,artifact:identity.artifact,type:'componentState',payload:{state,channel,hash:row(state).hashes[390],markup:html(row(state)),applied}}}));
  };
  transition('closed','22222222-2222-4222-8222-222222222222',true);await tick();
  assert.equal(messages.at(-1).type,'ready');assert.equal(messages.at(-1).artifact,row('closed').hashes[390]);
  transition('empty','33333333-3333-4333-8333-333333333333',false);await tick();
  assert.equal(root.querySelector('.auth-sheet'),sheet);assert.equal(root.querySelector('[name=email]'),input);assert.equal(input.value,'typing@example.invalid');assert.equal(sheet.hidden,false);
  root.querySelector('.sheet-dim').click();assert.equal(sheet.hidden,true);
  transition('closed','44444444-4444-4444-8444-444444444444',true);await tick();
  root.querySelector('[data-action=open-login]').click();assert.equal(sheet.hidden,false);assert.equal(input.value,'typing@example.invalid');
  assert.equal(messages.filter(m=>m.type==='navigate').length,0);
  assert.equal(messages.filter(m=>m.type==='userActivity').length,0,'synthetic events and animation messages cannot renew idle sessions');
  w.dispatchEvent(new w.Event('pagehide'));w.close();
});

test('dismiss animation finishes before reporting closed, and original circular provider artwork and visible-password eye survive',async()=>{
  const {w}=setup(html(row('empty','compact')));w.eval(runtimes[row('empty','compact').runtimeFamily]);
  const root=w.document.querySelector('#order-single'),sheet=root.querySelector('.auth-sheet'),changes=[],flights=[];
  w.Element.prototype.animate=function(keyframes,options){let finish;const finished=new Promise(resolve=>finish=resolve);const animation={finished,cancel(){},finish};flights.push({element:this,keyframes,options,animation});return animation;};
  const api={interactive:true,screen:'login',reduced:()=>false,select(...args){changes.push(['navigate',args]);},localState(state){changes.push(['local',state]);}};
  const shared=w.QAUI.sharedMount(root,api),dispose=w.ORDER_DESIGN_MODULES.find(m=>m.id==='login').mount(root,'empty',api);
  const eye=root.querySelector('[data-action=password-visibility]'),password=root.querySelector('[name=password]');
  eye.click();await tick();assert.equal(password.type,'text');assert.ok(eye.classList.contains('is-visible'));assert.ok(eye.querySelector('.eye-closed'));
  const providers=root.querySelectorAll('.integrated-provider');assert.equal(providers.length,3);
  assert.ok([...providers].every(button=>button.querySelector('img')?.src.startsWith('data:image/png;base64,')));
  assert.match(root.querySelector('#r3-qa-interaction-auth').textContent,/border-radius:50%/);
  root.querySelector('.sheet-dim').click();assert.equal(sheet.hidden,false);assert.equal(changes.length,0);
  const close=flights.find(f=>f.element===sheet&&f.options.duration===350);assert.ok(close);assert.equal(close.keyframes.at(-1).transform,'translateY(105%)');
  close.animation.finish();await tick();assert.equal(sheet.hidden,true);assert.deepEqual(changes,[['local','closed']]);
  shared?.();dispose();w.close();
});

test('the immediately preceding artifact hashes keep their exact body and executable mount',async()=>{
  for(const id of ['login/empty/email','login/closed/email','onboarding/company/email','admin-overview/normal/email']){
    const archived=archivedRows[id];assert.ok(archived,id);
    const hash=archived.hashes[390];
    const response=await serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version:'recorded',artifactHash:hash})),{});
    assert.equal(response.status,200,id);const value=await response.json();assert.equal(value.hash,hash);assert.equal(value.version,'prior-r3');
    assert.equal(value.mount,archived.script?gunzipSync(Buffer.from(archivedScripts[archived.script],'base64')).toString():null);
    assert.ok(value.replayFrame.includes('function presentReviewFrame'));assert.match(value.editable,new RegExp(archived.body));
  }
});

async function hostHarness({initialRecords=[],legacyItems=[]}={}){
  const {w}=setup(approvedShellBody(),'https://order-ia-portal.pages.dev/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=390');
  const screens=['empty','closed'].map(state=>({...row(state),hashes:{390:row(state).hashes[390]}})),screen=screens[0];
  const artifact={hash:screen.hashes[390],version:'current',html:'<!doctype html><html><head><!--R3-POLICY--></head><body><main id="order-single"></main><!--R3-FRAME--></body></html>',editable:'',file:'test.html'};
  const writes=[],records=[...initialRecords],messages=[];let failure=null;
  const response=(value,status=200)=>Response.json(value,{status});
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);
    if(url.pathname==='/api/ia/auth/me')return response({csrf:'qa-session-csrf',email:'test@example.invalid'});
    if(url.pathname==='/api/order/features')return response({orderMenu:false});
    if(url.pathname.endsWith('/artifact'))return response(url.searchParams.has('id')?{...artifact,hash:screens.find(r=>r.id===url.searchParams.get('id')).hashes[390]}:{release:'MSG0585-R3',items:screens});
    if(url.pathname.endsWith('/legacy'))return response({items:legacyItems,hasMore:false});
    if(url.pathname.endsWith('/events'))return response({items:records.filter(r=>r.kind===url.searchParams.get('kind')&&r.id===url.searchParams.get('id'))});
    if(url.pathname.endsWith('/records')){
      if(options.method==='POST'){
        const body=JSON.parse(options.body);writes.push({body,headers:options.headers});
        const denied=typeof failure==='function'?failure(body):failure;if(denied)return response({error:denied.error},denied.status);
        const old=records.filter(r=>r.kind===body.kind&&r.id===body.id).at(-1);
        if(body.expectedRevision!==(old?.revision||0))return response({error:'REVISION_CONFLICT',current:old},409);
        const record={...body,revision:(old?.revision||0)+1,cursor:records.length+1,updatedAt:new Date().toISOString(),action:body.action||'save'};
        records.push(record);return response(record);
      }
      return response({items:records,nextCursor:records.length,hasMore:false});
    }
    throw Error('Unmocked '+url);
  };
  const shell={render(){},focusForPoint(){},setTab(){},historyLinks(){},reviewWidths(){return[];},activeTab(){return'review';}};
  w.eval('('+bootQaHost.toString()+')')('qa-nonce','function fixtureFrame(){}',()=>shell,null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]});
  const frame=w.document.getElementById('frame');frame.contentWindow.postMessage=message=>messages.push(message);
  await until(()=>frame.srcdoc.includes('"channel"'));
  const params=JSON.parse(frame.srcdoc.match(/\)\((\{"channel"[\s\S]*?\})\)<\/script>/)[1]);
  const emit=(type,payload={})=>w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source:frame.contentWindow,data:{scope:'ORDER_R3_FRAME',channel:params.channel,artifact:params.artifact,type,payload}}));
  emit('ready');await tick();
  return {w,writes,records,messages,params,emit,setFailure(value){failure=value;}};
}

test('the host acknowledges a component state change without resetting iframe srcdoc or navigating to a second page',async()=>{
  const {w,emit,messages}=await hostHarness(),frame=w.document.getElementById('frame'),before=frame.srcdoc,document=frame.contentDocument;
  emit('localState',{screen:'login',state:'closed'});
  await until(()=>messages.some(m=>m.type==='componentState'));
  const request=messages.find(m=>m.type==='componentState');assert.equal(request.payload.applied,true);assert.equal(request.payload.state,'closed');
  w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source:frame.contentWindow,data:{scope:'ORDER_R3_FRAME',channel:request.payload.channel,artifact:request.payload.hash,type:'ready',payload:{}}}));
  assert.equal(frame.srcdoc,before);assert.equal(frame.contentDocument,document);assert.equal(frame.inert,false);
  assert.equal(new URL(w.location.href).searchParams.get('screen'),'login/closed/email');assert.match(w.document.getElementById('caption').textContent,/닫힘/);
  await tick();w.close();
});

test('position comment mode stays active for consecutive saved pins and Escape explicitly returns to interaction',async()=>{
  const h=await hostHarness(),{w,emit,writes,messages,params}=h,$=id=>w.document.getElementById(id);
  const point={id:'screen',instance:'login',x:.4,y:.5,viewport:{width:390,height:844},scale:1,scroll:[],layers:[],artifactHash:params.artifact};
  $('new').click();
  for(const [index,text] of ['첫 번째 위치','두 번째 위치'].entries()){
    emit('point',{...point,x:.4+index*.1});$('body-text').value=text;$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));$('save').click();
    await until(()=>writes.length===index+1&&$('drawer').hidden);
    assert.equal($('new').getAttribute('aria-pressed'),'true');assert.equal(messages.filter(m=>m.type==='mode').at(-1).payload,true);
  }
  assert.notEqual(writes[0].body.id,writes[1].body.id);assert.deepEqual(writes.map(r=>r.body.data.body),['첫 번째 위치','두 번째 위치']);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('new').getAttribute('aria-pressed'),'false');
  assert.equal(messages.filter(m=>m.type==='mode').at(-1).payload,false);w.close();
});

test('session expiry preserves the unsent opinion while a CSRF error never masquerades as logout',async()=>{
  const h=await hostHarness(),{w,writes}=h,$=id=>w.document.getElementById(id);let checks=0;
  w.document.addEventListener('ia-session-check',()=>checks++);
  $('general').click();$('body-text').value='연결이 끊겨도 남아야 하는 의견';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
  h.setFailure({error:'CSRF_DENIED',status:403});$('save').click();await until(()=>checks===1);assert.equal($('qa-session-notice'),null);
  h.setFailure({error:'SESSION_DENIED',status:401});$('save').click();await until(()=>writes.length===2);
  await tick();assert.equal($('body-text').value,'연결이 끊겨도 남아야 하는 의견');
  w.document.dispatchEvent(new w.CustomEvent('ia-session-expired',{detail:{reason:'SESSION_DENIED'}}));
  assert.equal($('qa-session-notice').hidden,false);assert.equal($('qa-session-notice').querySelector('a').target,'_blank');
  h.setFailure(null);w.document.dispatchEvent(new w.CustomEvent('ia-session-restored',{detail:{csrf:'renewed-csrf'}}));await tick();
  assert.equal($('qa-session-notice').hidden,true);$('save').click();await until(()=>h.records.length===1);
  assert.equal(writes.at(-1).headers['X-IA-CSRF'],'renewed-csrf');assert.equal(h.records[0].data.body,'연결이 끊겨도 남아야 하는 의견');
  await tick();await tick();
  w.close();
});

const feedbackTarget=()=>({screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:row('empty').hashes[390]});
const seedComment=(id='current-feedback',target=feedbackTarget())=>({release:'MSG0585-R3',kind:'comment',id,revision:1,cursor:1,action:'save',reason:'',data:{target,body:'보존할 원문 의견',anchor:{id:'screen',instance:'login',x:.4,y:.5,viewport:{width:390,height:844},scale:1,scroll:[],layers:[],artifactHash:target.artifactHash}}});
const feedbackCard=(w,id)=>w.document.querySelector('[data-feedback-id="'+id+'"]');

test('one three-state control preserves current comment lifecycle reasons, content, pins and independent approval',async()=>{
  const original=seedComment(),h=await hostHarness({initialRecords:[original]}),{w,records,writes,messages}=h;
  const originalBytes=JSON.stringify(original),reasonQueue=['수정 결과를 확인함','추가 검토가 필요함'];w.prompt=()=>reasonQueue.shift();
  w.document.querySelector('[data-comment-filter=all]').click();
  let card=feedbackCard(w,original.id);
  assert.equal(card.querySelectorAll('[data-feedback-state]').length,3);
  assert.equal([...card.querySelectorAll('button')].filter(b=>b.textContent==='해결').length,1,'no competing lifecycle control');
  card.querySelector('[data-feedback-state=recheck]').click();
  await until(()=>feedbackCard(w,original.id)?.dataset.feedbackStatus==='recheck');
  feedbackCard(w,original.id).querySelector('[data-feedback-state=resolved]').click();
  await until(()=>records.length===4&&feedbackCard(w,original.id)?.dataset.feedbackStatus==='resolved');
  card=feedbackCard(w,original.id);assert.equal([...card.querySelectorAll('button')].some(b=>['수정','답글 작성','다시 열기'].includes(b.textContent)),false);
  assert.equal(messages.filter(m=>m.type==='pins').at(-1).payload.length,0);
  card.querySelector('[data-feedback-state=recheck]').click();
  await until(()=>records.length===6&&feedbackCard(w,original.id)?.dataset.feedbackStatus==='recheck');
  card=feedbackCard(w,original.id);assert.ok([...card.querySelectorAll('button')].some(b=>b.textContent==='답글 작성'));
  assert.equal(messages.filter(m=>m.type==='pins').at(-1).payload[0].id,original.id);
  card.querySelector('[data-feedback-state=unresolved]').click();
  await until(()=>records.length===7&&feedbackCard(w,original.id)?.dataset.feedbackStatus==='unresolved');
  assert.deepEqual(records.filter(r=>r.kind==='comment').map(r=>[r.action,r.reason]),[['save',''],['resolve','수정 결과를 확인함'],['reopen','추가 검토가 필요함']]);
  assert.ok(records.filter(r=>r.kind==='comment').every(r=>JSON.stringify(r.data)===JSON.stringify(original.data)));
  assert.deepEqual(records.filter(r=>r.kind==='feedback').map(r=>[r.revision,r.data.status]),[[1,'recheck'],[2,'resolved'],[3,'recheck'],[4,'unresolved']]);
  assert.equal(JSON.stringify(original),originalBytes);assert.equal(writes.filter(r=>r.body.kind==='review').length,0);w.close();
});

test('a newer source event wins over an older feedback state, including after a failed status append',async()=>{
  const original=seedComment(),feedback={release:'MSG0585-R3',kind:'feedback',id:'existing-status',revision:1,cursor:2,action:'save',data:{target:original.data.target,parent:{origin:'current',id:original.id},status:'recheck'}};
  const resolved={...original,revision:2,cursor:3,action:'resolve',reason:'기존 해결 사유'};
  const h=await hostHarness({initialRecords:[original,feedback,resolved]}),{w,records,writes}=h;
  w.document.querySelector('[data-comment-filter=all]').click();assert.equal(feedbackCard(w,original.id).dataset.feedbackStatus,'resolved');
  w.prompt=()=>null;feedbackCard(w,original.id).querySelector('[data-feedback-state=unresolved]').click();await tick();assert.equal(writes.length,0,'canceling the reason preserves both histories');
  w.prompt=()=>'원문을 다시 검토함';h.setFailure(body=>body.kind==='feedback'?{error:'STORE_UNAVAILABLE',status:503}:null);
  feedbackCard(w,original.id).querySelector('[data-feedback-state=unresolved]').click();
  await until(()=>writes.length===2&&feedbackCard(w,original.id)?.dataset.feedbackStatus==='unresolved');
  assert.equal(records.at(-1).action,'reopen');assert.equal(records.at(-1).reason,'원문을 다시 검토함');assert.equal(records.filter(r=>r.kind==='feedback').length,1);
  h.setFailure(null);feedbackCard(w,original.id).querySelector('[data-feedback-state=recheck]').click();
  await until(()=>feedbackCard(w,original.id)?.dataset.feedbackStatus==='recheck');
  assert.equal(records.at(-1).revision,2);assert.equal(records.filter(r=>r.kind==='comment').length,3);
  assert.equal(records[2].reason,'기존 해결 사유');assert.equal(writes.filter(r=>r.body.kind==='review').length,0);w.close();
});

test('historical and imported opinions change status individually without mutating original records or review verdicts',async()=>{
  const original=seedComment('earlier-feedback',{...feedbackTarget(),artifactHash:'1'.repeat(64)});
  const verdict={release:'MSG0585-R3',kind:'review',id:'independent-review',revision:1,cursor:2,action:'save',data:{target:feedbackTarget(),decision:'changes_requested'}};
  const legacy={sourceKey:'login/empty/email/390',data:{status:'fix',comments:[{id:'imported-feedback',body:'가져온 원문 의견',status:'resolved',history:[{body:'이전 원문',updatedAt:'2026-11-01'}]}]}};
  const originalBytes=JSON.stringify([original,verdict,legacy]),h=await hostHarness({initialRecords:[original,verdict],legacyItems:[legacy]}),{w,writes,records}=h;
  w.prompt=()=>{throw Error('Historical source must not request a lifecycle reason');};
  w.document.querySelector('[data-comment-filter=all]').click();
  for(const id of ['earlier-feedback','imported-feedback']){
    for(const status of ['unresolved','recheck','resolved']){
      const before=records.length;feedbackCard(w,id).querySelector('[data-feedback-state='+status+']').click();
      await until(()=>records.length===before+1&&feedbackCard(w,id)?.dataset.feedbackStatus===status);
    }
  }
  assert.ok(writes.every(r=>r.body.kind==='feedback'));
  assert.deepEqual(records.filter(r=>r.kind==='comment'),[original]);assert.deepEqual(records.filter(r=>r.kind==='review'),[verdict]);
  assert.equal(JSON.stringify([original,verdict,legacy]),originalBytes);
  for(const id of ['earlier-feedback','imported-feedback'])assert.deepEqual(records.filter(r=>r.kind==='feedback'&&r.data.parent.id===id).map(r=>r.data.status),['unresolved','recheck','resolved']);
  w.close();
});
