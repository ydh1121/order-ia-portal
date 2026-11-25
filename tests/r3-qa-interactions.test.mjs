import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {catalog,frames} from '../src/server/r3-ui/catalog.gen.mjs';
import {runtimes,frameCode,hostCode} from '../src/server/r3-ui/runtime.gen.mjs';
import {archivedRows,archivedScripts} from '../src/server/r3-ui/interaction-history.gen.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {bootApprovedShell} from '../src/server/r3-ui/approved-controller.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
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
  w.ResizeObserver=class{observe(){}disconnect(){}};
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

async function hostHarness({initialRecords=[],legacyItems=[],recordPage=null,legacyPage=null,viewHash=null,viewVersion='current',initialDrafts=[],historicalArtifacts=null,canonicalHost=false,withShell=false,screenRows=null}={}){
  const {w}=setup(approvedShellBody(),'https://order-ia-portal.pages.dev/ia?view=qa-lab&archive=1&screen=login%2Fempty%2Femail&width=390'+(viewVersion==='current'?'':'&version=recorded&artifactHash='+viewHash));
  const screens=(screenRows||['empty','closed'].map(state=>row(state))).map(entry=>({...entry,hashes:{390:entry.state==='empty'&&viewHash||entry.hashes[390]}})),screen=screens[0];
  const artifact={hash:screen.hashes[390],version:viewVersion,html:'<!doctype html><html><head><!--R3-POLICY--></head><body><main id="order-single"></main><!--R3-FRAME--></body></html>',editable:'',file:'test.html'};
  const writes=[],records=[...initialRecords],messages=[];let failure=null;
  const close=w.close.bind(w);w.close=()=>{w.dispatchEvent(new w.Event('pagehide'));close();};
  if(initialDrafts.length){
    const owner=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode('test@example.invalid'))).toString('hex');
    w.sessionStorage.setItem('order.qa.unsent.v1.MSG0585-R3.'+owner,JSON.stringify(initialDrafts));
  }
  const response=(value,status=200)=>Response.json(value,{status});
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);
    if(url.pathname==='/api/ia/auth/me')return response({csrf:'qa-session-csrf',email:'test@example.invalid'});
    if(url.pathname==='/api/order/features')return response({orderMenu:false});
    if(url.pathname.endsWith('/artifact')){
      const pinned=url.searchParams.get('artifactHash');
      if(pinned&&historicalArtifacts)return historicalArtifacts[pinned]?response({...artifact,...historicalArtifacts[pinned],hash:pinned}):response({error:'UNKNOWN_REVIEW_TARGET'},404);
      return response(url.searchParams.has('id')?{...artifact,hash:screens.find(r=>r.id===url.searchParams.get('id')).hashes[390]}:{release:'MSG0585-R3',items:screens});
    }
    if(url.pathname.endsWith('/legacy'))return response(legacyPage?await legacyPage(url.searchParams.get('scope')):{items:legacyItems,hasMore:false});
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
      return response(recordPage?await recordPage({since:Number(url.searchParams.get('since')||0),limit:Number(url.searchParams.get('limit')||150),scope:url.searchParams.get('scope'),records}):{items:records,nextCursor:records.length,hasMore:false});
    }
    throw Error('Unmocked '+url);
  };
  const shell={render(){},focusForPoint(){},setTab(){},historyLinks(){},reviewWidths(){return[];},activeTab(){return'review';}};
  let hostContext,approvedShell;
  const bootShell=context=>{hostContext=context;approvedShell=withShell?w.eval('('+browserFunction(bootApprovedShell)+')')(context):shell;return approvedShell;};
  w.eval('('+(canonicalHost?browserFunction(bootQaHost):hostCode)+')')('qa-nonce','function fixtureFrame(){}',bootShell,null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]});
  const frame=w.document.getElementById('frame');frame.contentWindow.postMessage=message=>messages.push(message);
  await until(()=>frame.srcdoc.includes('"channel"'));
  const params=JSON.parse(frame.srcdoc.match(/\)\((\{"channel"[\s\S]*?\})\)<\/script>/)[1]);
  const emit=(type,payload={})=>w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source:frame.contentWindow,data:{scope:'ORDER_R3_FRAME',channel:params.channel,artifact:params.artifact,type,payload}}));
  emit('ready');await tick();
  return {w,writes,records,messages,params,emit,hostContext,approvedShell,setFailure(value){failure=value;}};
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
    assert.equal($('live').textContent,'저장됨 · 다음 위치를 선택하세요.');
  }
  assert.notEqual(writes[0].body.id,writes[1].body.id);assert.deepEqual(writes.map(r=>r.body.data.body),['첫 번째 위치','두 번째 위치']);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal($('new').getAttribute('aria-pressed'),'false');
  assert.equal(messages.filter(m=>m.type==='mode').at(-1).payload,false);w.close();
});

function pauseNextRecordResponse(h){
  const fetch=h.w.fetch;let release,reached,paused=false;
  const ready=new Promise(resolve=>reached=resolve),wait=new Promise(resolve=>release=resolve);
  h.w.fetch=async(raw,options={})=>{
    const response=await fetch(raw,options);
    if(!paused&&options.method==='POST'&&new URL(raw,h.w.location.href).pathname.endsWith('/records')){
      paused=true;reached();await wait;
    }
    return response;
  };
  return {ready,release};
}

test('delayed comment saves preserve a closed panel, a new editor and a changed screen',async()=>{
  for(const next of ['closed','new','screen']){
    const h=await hostHarness(),{w,emit,records,messages}=h,$=id=>w.document.getElementById(id);
    try{
      $('general').click();$('body-text').value='이미 전송한 의견';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
      const delay=pauseNextRecordResponse(h),saving=$('save').onclick();await delay.ready;
      $('close-drawer').click();
      if(next==='screen'){
        emit('localState',{screen:'login',state:'closed'});
        await until(()=>messages.some(m=>m.type==='componentState'));
        const request=messages.find(m=>m.type==='componentState');
        w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source:$('frame').contentWindow,data:{scope:'ORDER_R3_FRAME',channel:request.payload.channel,artifact:request.payload.hash,type:'ready',payload:{}}}));
      }
      if(next!=='closed'){
        $('general').click();$('body-text').value='계속 쓰는 새 의견';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
      }
      delay.release();await saving;
      assert.equal(records[0].data.body,'이미 전송한 의견');assert.equal(records[0].data.target.state,'empty');
      assert.equal($('drawer').hidden,next==='closed');
      if(next!=='closed'){assert.equal($('authoring').hidden,false);assert.equal($('body-text').value,'계속 쓰는 새 의견');}
      if(next==='screen')assert.equal(new URL(w.location.href).searchParams.get('screen'),'login/closed/email');
      const retained=Object.keys(w.sessionStorage).filter(k=>k.startsWith('order.qa.unsent.')).flatMap(k=>JSON.parse(w.sessionStorage.getItem(k)));
      assert.equal(retained.some(([,draft])=>draft.body==='이미 전송한 의견'),false);
      assert.equal(retained.some(([,draft])=>draft.body==='계속 쓰는 새 의견'),next!=='closed');
    }finally{w.close();}
  }
});

test('typing while a save response is delayed keeps the extra text and uses the confirmed revision next time',async()=>{
  const h=await hostHarness(),{w,records,writes}=h,$=id=>w.document.getElementById(id);
  try{
    $('general').click();$('body-text').value='먼저 전송한 본문';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
    const delay=pauseNextRecordResponse(h),saving=$('save').onclick();await delay.ready;
    $('body-text').value='먼저 전송한 본문과 뒤에 추가한 내용';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
    delay.release();await saving;
    assert.equal(records[0].data.body,'먼저 전송한 본문');assert.equal($('authoring').hidden,false);
    assert.equal($('body-text').value,'먼저 전송한 본문과 뒤에 추가한 내용');
    const retained=Object.keys(w.sessionStorage).filter(k=>k.startsWith('order.qa.unsent.')).flatMap(k=>JSON.parse(w.sessionStorage.getItem(k)));
    assert.equal(retained.length,1);assert.equal(retained[0][1].body,$('body-text').value);assert.equal(retained[0][1].revision,1);
    await $('save').onclick();assert.equal(writes.at(-1).body.expectedRevision,1);assert.equal(records.at(-1).revision,2);
    assert.equal(records.at(-1).data.body,'먼저 전송한 본문과 뒤에 추가한 내용');assert.equal($('authoring').hidden,true);
  }finally{w.close();}
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

test('the host restores both imported and prior-version pin sources without rewriting anchors or review states',async()=>{
  const priorTarget={...feedbackTarget(),artifactHash:'a'.repeat(64)},old=seedComment('prior-pin',priorTarget),current=seedComment('current-pin');
  old.data.anchor.id='a-original';old.data.anchor.scroll=[{id:'host-surface',x:17,y:31}];
  const removed={...seedComment('deleted-pin',priorTarget),action:'delete'};
  const otherWidth=seedComment('other-width',{...priorTarget,viewport:1280});
  const otherState=seedComment('other-state',{...priorTarget,state:'closed'});
  const closed={...seedComment('resolved-pin',priorTarget),action:'resolve'};
  const legacyComment={id:'imported-pin',body:'가져온 위치 원문',status:'open',anchor:{path:'section:nth-of-type(1) > button:nth-of-type(1)',tag:'button',label:'로그인 / 버튼',x:.25,y:.75,pageX:.3,pageY:.4,height:44,contentHeight:844,scrollTop:12,nestedScroll:[]}};
  const imported={sourceKey:'login/empty/email/390',data:{status:'fix',comments:[legacyComment]}};
  const original=JSON.stringify([old,current,removed,otherWidth,otherState,closed,imported]);
  const h=await hostHarness({initialRecords:[old,current,removed,otherWidth,otherState,closed],legacyItems:[imported]}),{w,messages,emit,writes}=h;
  try{
    await until(()=>messages.filter(m=>m.type==='pins').at(-1)?.payload.some(p=>p.id==='legacy:imported-pin'));
    const displayed=()=>messages.filter(m=>m.type==='pins').at(-1).payload;
    assert.deepEqual(Array.from(displayed(),p=>p.id),['legacy:imported-pin','prior-pin','current-pin']);
    const prior=displayed().find(p=>p.id==='prior-pin');
    assert.equal(prior.previous,true);assert.equal(prior.sourceArtifactHash,priorTarget.artifactHash);
    assert.equal(prior.anchor.artifactHash,feedbackTarget().artifactHash);
    assert.equal(prior.anchor.id,old.data.anchor.id);assert.equal(prior.anchor.x,old.data.anchor.x);assert.equal(prior.anchor.y,old.data.anchor.y);
    assert.deepEqual(prior.anchor.scroll,old.data.anchor.scroll);
    assert.equal(displayed().find(p=>p.id==='current-pin').previous,false);
    assert.equal(displayed()[0].sourceArtifactHash,'legacy');assert.deepEqual(displayed()[0].legacyAnchor,legacyComment.anchor);
    emit('openPins',{ids:['legacy:imported-pin']});
    assert.equal(w.document.querySelectorAll('#notes article.comment-card').length,1);
    assert.equal(feedbackCard(w,'imported-pin')?.dataset.feedbackOrigin,'legacy');
    assert.ok(w.document.querySelector('#notes').textContent.includes(legacyComment.body));
    const importedLink=[...w.document.querySelectorAll('#notes a')].find(a=>a.textContent==='의견을 남긴 화면 열기');
    assert.equal(new URL(importedLink.href).searchParams.get('version'),'previous');
    emit('openPins',{ids:['prior-pin']});
    const oldCard=feedbackCard(w,'prior-pin'),link=[...oldCard.querySelectorAll('a')].find(a=>a.textContent==='의견을 남긴 화면 열기');
    assert.equal(new URL(link.href).searchParams.get('artifactHash'),priorTarget.artifactHash);
    [...oldCard.querySelectorAll('button')].find(b=>b.textContent==='위치 보기').click();
    const restored=messages.filter(m=>m.type==='restore').at(-1).payload;
    assert.equal(restored.sourceArtifactHash,priorTarget.artifactHash);assert.equal(restored.id,old.data.anchor.id);
    w.document.querySelector('#show-resolved-pins').checked=true;await w.document.querySelector('#show-resolved-pins').onchange();
    assert.equal(displayed().find(p=>p.id==='resolved-pin').resolved,true);
    assert.equal(displayed().some(p=>p.id==='deleted-pin'),false);
    assert.equal(JSON.stringify([old,current,removed,otherWidth,otherState,closed,imported]),original);
    assert.equal(writes.length,0,'restoration is display-only and never writes comments or review decisions');
  }finally{w.close();}
});

test('one three-state control preserves current comment lifecycle reasons, content, pins and independent approval',async()=>{
  const original=seedComment(),h=await hostHarness({initialRecords:[original]}),{w,records,writes,messages}=h;
  const originalBytes=JSON.stringify(original),reasonQueue=['수정 결과를 확인함','추가 검토가 필요함'];w.prompt=()=>reasonQueue.shift();
  await w.document.querySelector('[data-comment-filter=all]').onclick();
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
  await w.document.querySelector('[data-comment-filter=all]').onclick();assert.equal(feedbackCard(w,original.id).dataset.feedbackStatus,'resolved');
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
  await w.document.querySelector('[data-comment-filter=all]').onclick();
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

test('a full reload never reintroduces resolved pins while later record pages are still loading',async()=>{
  const priorTarget={...feedbackTarget(),artifactHash:'a'.repeat(64)};
  const originals=Array.from({length:3},(_,i)=>({...seedComment('resolved-before-reload-'+i,priorTarget),cursor:i+1}));
  const open={...seedComment('leave-unresolved'),cursor:4};
  const padding=Array.from({length:146},(_,i)=>({release:'MSG0585-R3',kind:'artifact',id:'other-screen-record-'+i,revision:1,cursor:i+5,action:'save',data:{target:{...feedbackTarget(),state:'closed'},evidenceRef:'pagination fixture'}}));
  const sourceRecords=[...originals,open,...padding],sourceBytes=JSON.stringify(sourceRecords),resolvedIds=originals.map(r=>r.id);
  const first=await hostHarness({initialRecords:sourceRecords});let saved;
  try{
    first.w.document.getElementById('points').click();await first.w.document.querySelector('[data-comment-filter=all]').onclick();
    for(const id of resolvedIds){
      feedbackCard(first.w,id).querySelector('[data-feedback-state=resolved]').click();
      await until(()=>feedbackCard(first.w,id)?.dataset.feedbackStatus==='resolved');
    }
    assert.deepEqual(first.records.slice(150).map(r=>[r.kind,r.data.status]),[['feedback','resolved'],['feedback','resolved'],['feedback','resolved']]);
    assert.deepEqual(Array.from(first.messages.filter(m=>m.type==='pins').at(-1).payload,p=>p.id),[open.id]);
    saved=[...first.records];
  }finally{first.w.close();}
  let releaseLastPage;const lastPage=new Promise(resolve=>releaseLastPage=resolve),reads=[];
  const restored=await hostHarness({initialRecords:saved,recordPage:async({since,limit,records})=>{
    reads.push({since,limit});
    if(since===0)return {items:records.slice(0,150),nextCursor:150,hasMore:true};
    assert.equal(since,150);await lastPage;
    return {items:records.slice(150),nextCursor:153,hasMore:false};
  }});
  try{
    await until(()=>reads.length===2);await tick();await tick();
    const shownDuringReload=[...new Set(restored.messages.filter(m=>m.type==='pins').flatMap(m=>Array.from(m.payload,p=>p.id)).filter(id=>resolvedIds.includes(id)))];
    releaseLastPage();
    await until(()=>restored.messages.filter(m=>m.type==='pins').at(-1)?.payload.length===1&&restored.messages.filter(m=>m.type==='pins').at(-1).payload[0].id===open.id);
    assert.deepEqual(shownDuringReload,[],'saved resolved pins must not flash as unresolved while the remaining 150-row pages load');
    restored.w.document.getElementById('points').click();await restored.w.document.querySelector('[data-comment-filter=all]').onclick();
    for(const id of resolvedIds)assert.equal(feedbackCard(restored.w,id).dataset.feedbackStatus,'resolved');
    assert.equal(feedbackCard(restored.w,open.id).dataset.feedbackStatus,'unresolved');
    assert.equal(restored.writes.length,0,'reload restores stored decisions without writing new status events');
    assert.equal(JSON.stringify(sourceRecords),sourceBytes,'original bodies, source hashes and anchors stay unchanged');
  }finally{releaseLastPage();await tick();restored.w.close();}
});

test('a new artifact projects prior resolution consistently without writing a new review state, while explicit recheck and source reopening remain visible',async()=>{
  const sourceTarget={...feedbackTarget(),artifactHash:'a'.repeat(64)},resolvedTarget={...feedbackTarget(),artifactHash:'b'.repeat(64)};
  const originals=Array.from({length:3},(_,i)=>({...seedComment('previously-resolved-'+i,sourceTarget),cursor:i+1}));
  const statuses=originals.map((source,i)=>({release:'MSG0585-R3',kind:'feedback',id:'previous-resolution-'+i,revision:1,cursor:i+4,action:'save',data:{target:resolvedTarget,parent:{origin:'current',id:source.id},status:'resolved'}}));
  const verdict={release:'MSG0585-R3',kind:'review',id:'new-version-review',revision:1,cursor:7,action:'save',data:{target:feedbackTarget(),decision:'changes_requested'}};
  const sourceBytes=JSON.stringify([originals,statuses,verdict]);
  const explicit=status=>({...statuses[0],id:'current-'+status,cursor:8,data:{...statuses[0].data,target:feedbackTarget(),status}});
  const cases=[
    {name:'new artifact',extra:[],expected:[],previous:true},
    {name:'recorded resolution artifact',extra:[],expected:[],viewHash:resolvedTarget.artifactHash,viewVersion:'prior-r3'},
    {name:'current recheck beats a newer previous-artifact resolution',extra:[explicit('recheck'),{...statuses[0],revision:2,cursor:9}],expected:[originals[0].id],previous:true},
    {name:'current unresolved',extra:[explicit('unresolved')],expected:[originals[0].id],previous:true},
    {name:'later source reopen',extra:[{...originals[0],revision:2,cursor:8,action:'reopen',reason:'원댓글 재검토'}],expected:[originals[0].id],previous:true}
  ];
  for(const entry of cases){
    const initialRecords=[...originals,...statuses,verdict,...entry.extra],before=JSON.stringify(initialRecords);
    const h=await hostHarness({...entry,initialRecords,canonicalHost:true}),{w,messages,writes}=h;
    try{
      w.document.getElementById('points').click();await w.document.querySelector('[data-comment-filter=all]').onclick();
      await until(()=>originals.every(source=>feedbackCard(w,source.id)));
      const displayed=()=>messages.filter(message=>message.type==='pins').at(-1).payload;
      assert.deepEqual(Array.from(displayed(),pin=>pin.id),entry.expected,entry.name);
      const card=feedbackCard(w,originals[1].id);
      assert.equal(card.dataset.feedbackStatus,'resolved','the list uses the same inherited resolution as the pins, without writing a current-version decision');
      assert.equal(Boolean(card.querySelector('[data-pin-previous-resolution]')),Boolean(entry.previous),entry.name);
      if(entry.previous){
        assert.match(card.querySelector('[data-pin-previous-resolution]').textContent,/이전 판에서 해결/);
        assert.equal(new URL(card.querySelector('[data-pin-resolved-artifact]').href).searchParams.get('artifactHash'),resolvedTarget.artifactHash);
      }
      if(entry.viewHash)assert.ok([...card.querySelectorAll('[data-feedback-state]')].every(button=>button.disabled));
      w.document.getElementById('show-resolved-pins').checked=true;await w.document.getElementById('show-resolved-pins').onchange();
      const shown=Array.from(displayed());assert.deepEqual(shown.map(pin=>pin.id),originals.map(source=>source.id));
      for(const pin of shown){
        const source=originals.find(value=>value.id===pin.id);
        assert.equal(pin.resolved,!entry.expected.includes(pin.id),entry.name);
        assert.equal(pin.sourceArtifactHash,sourceTarget.artifactHash);
        assert.deepEqual({...pin.anchor,artifactHash:sourceTarget.artifactHash},source.data.anchor);
      }
      assert.equal(writes.length,0,'pin visibility and historical explanation never write comments, statuses or approvals');
      assert.equal(JSON.stringify(initialRecords),before);assert.equal(JSON.stringify([originals,statuses,verdict]),sourceBytes);
      assert.deepEqual(h.records.filter(record=>record.kind==='review'),[verdict]);
    }finally{w.close();}
  }
});

test('resolved history stays out of the default list, counts and next-unresolved path while its records remain intact',async()=>{
  const source=seedComment('previously-done',{...feedbackTarget(),artifactHash:'a'.repeat(64)});
  const legacy={sourceKey:'login/empty/email/390',data:{status:'fix',comments:[{id:'imported-done',body:'해결한 이전 의견',status:'open',anchor:{path:'button:nth-of-type(1)',tag:'button',x:.3,y:.4}}]}};
  const resolution=(origin,id,cursor)=>({release:'MSG0585-R3',kind:'feedback',id:'resolved-'+id,revision:1,cursor,action:'save',data:{target:{...feedbackTarget(),artifactHash:'b'.repeat(64)},parent:{origin,id},status:'resolved'}});
  const open=seedComment('still-open',{...feedbackTarget(),state:'closed',artifactHash:row('closed').hashes[390]});open.cursor=4;
  const original=[source,resolution('current',source.id,2),resolution('legacy','imported-done',3),open],bytes=JSON.stringify([original,legacy]);
  const h=await hostHarness({initialRecords:original,canonicalHost:true,withShell:true,
    recordPage:({scope})=>({items:scope==='all'?original:[open],nextCursor:4,until:4,hasMore:false}),
    legacyPage:scope=>({items:[scope==='all'?legacy:{...legacy,data:{...legacy.data,comments:[],inactiveCommentsOmitted:true}}],until:4,hasMore:false})}),{w,writes,messages}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();
    assert.equal(feedbackCard(w,source.id),null);assert.equal(feedbackCard(w,'imported-done'),null);
    assert.equal($('comment-count').textContent,'미해결 0개 · 전체 0개');
    assert.equal($('open-total').textContent,'1');
    assert.equal(w.document.querySelector('[data-module=login] .nav-comment-count').textContent,'1');
    assert.equal(w.document.querySelector('#state-buttons [data-state=empty] small'),null);
    assert.equal(w.document.querySelector('#state-buttons [data-state=closed] small').textContent,'1');
    assert.equal(messages.filter(m=>m.type==='pins').at(-1).payload.length,0);
    assert.equal($('review-records').textContent,'');
    await w.document.querySelector('[data-comment-filter=resolved]').onclick();
    assert.equal(feedbackCard(w,source.id).dataset.feedbackStatus,'resolved');
    assert.equal(feedbackCard(w,'imported-done').dataset.feedbackStatus,'resolved');
    await w.document.querySelector('[data-comment-filter=all]').onclick();
    assert.ok(feedbackCard(w,source.id).textContent.includes(source.data.body));
    assert.ok(feedbackCard(w,'imported-done').textContent.includes(legacy.data.comments[0].body));
    await $('next').onclick();assert.equal(new URL(w.location.href).searchParams.get('screen'),'login/closed/email');
    assert.equal(writes.length,0,'reading, counting and navigating never persist a processing state');
    assert.equal(JSON.stringify([original,legacy]),bytes);
  }finally{w.close();}
});

test('explicit current reopen restores the same thread in the list, pins and badges despite a newer historical resolution',async()=>{
  const source=seedComment('reopened-actionable',{...feedbackTarget(),artifactHash:'a'.repeat(64)});
  const current={release:'MSG0585-R3',kind:'feedback',id:'explicit-recheck',revision:1,cursor:2,action:'save',data:{target:feedbackTarget(),parent:{origin:'current',id:source.id},status:'recheck'}};
  const historical={...current,id:'later-history',cursor:3,data:{...current.data,target:{...feedbackTarget(),artifactHash:'b'.repeat(64)},status:'resolved'}};
  const input=[source,current,historical],bytes=JSON.stringify(input),h=await hostHarness({initialRecords:input,canonicalHost:true,withShell:true}),{w,messages,writes}=h;
  try{
    w.document.getElementById('points').click();
    assert.equal(feedbackCard(w,source.id).dataset.feedbackStatus,'recheck');
    assert.equal(w.document.getElementById('open-total').textContent,'1');
    assert.equal(w.document.querySelector('#state-buttons [data-state=empty] small').textContent,'1');
    assert.deepEqual(Array.from(messages.filter(m=>m.type==='pins').at(-1).payload,p=>p.id),[source.id]);
    assert.equal(writes.length,0);assert.equal(JSON.stringify(input),bytes);
  }finally{w.close();}
});

test('drawer location actions preserve the same draft body and return to its composer after selecting or cancelling',async()=>{
  const h=await hostHarness({canonicalHost:true,withShell:true}),{w,emit,writes,params}=h,$=id=>w.document.getElementById(id);
  const point={id:'screen',instance:'login',x:.3,y:.5,viewport:{width:390,height:844},scale:1,scroll:[],layers:[],artifactHash:params.artifact};
  try{
    $('points').click();assert.equal($('drawer').hidden,false);$('drawer-new-location').click();assert.equal($('drawer').hidden,true);
    emit('point',point);assert.equal($('drawer').hidden,false);assert.equal($('authoring').hidden,false);
    $('body-text').value='위치를 바꿔도 유지할 본문';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
    const drafts=()=>Object.keys(w.sessionStorage).filter(k=>k.startsWith('order.qa.unsent.')).flatMap(k=>JSON.parse(w.sessionStorage.getItem(k)));
    const id=drafts()[0][1].id;
    $('reposition').click();assert.equal($('drawer').hidden,true);$('pick-cancel').click();
    assert.equal($('drawer').hidden,false);assert.equal($('authoring').hidden,false);assert.equal($('body-text').value,'위치를 바꿔도 유지할 본문');
    assert.equal(drafts()[0][1].id,id);assert.equal(drafts()[0][1].anchor.x,.3);
    $('reposition').click();emit('point',{...point,x:.7});
    assert.equal($('drawer').hidden,false);assert.equal($('body-text').value,'위치를 바꿔도 유지할 본문');assert.equal(w.document.activeElement,$('body-text'));
    assert.equal(drafts()[0][1].id,id);assert.equal(drafts()[0][1].anchor.x,.7);assert.equal(writes.length,0);
    await $('save').onclick();assert.equal(writes.length,1);assert.equal(writes[0].body.id,id);assert.equal(writes[0].body.data.body,'위치를 바꿔도 유지할 본문');assert.equal(writes[0].body.data.anchor.x,.7);
    assert.equal($('drawer').hidden,false);assert.equal($('authoring').hidden,true,'drawer action is a single location comment, not an automatic next-pick loop');
  }finally{w.close();}
});

test('rework composers cannot enter location editing or replace the original comment anchor',async()=>{
  const original=seedComment('immutable-rework-anchor'),bytes=JSON.stringify(original);
  const h=await hostHarness({initialRecords:[original],canonicalHost:true}),{w,messages,writes}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();feedbackCard(w,original.id).querySelector('.rework-action').click();
    $('body-text').value='원래 위치에 대한 재작업';$('body-text').dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal($('reposition').hidden,true);const before=messages.filter(m=>m.type==='mode').length;
    $('reposition').click();assert.equal(messages.filter(m=>m.type==='mode').length,before);assert.equal($('drawer').hidden,false);
    assert.equal($('body-text').value,'원래 위치에 대한 재작업');assert.equal(JSON.stringify(original),bytes);assert.equal(writes.length,0);
  }finally{w.close();}
});

test('Q2 keeps its explicit review hold and original-product links without creating a completion verdict',async()=>{
  const q2=catalog.find(r=>r.screen==='q2'&&r.state==='empty');assert.ok(q2);
  const h=await hostHarness({canonicalHost:true,withShell:true,screenRows:[{...q2,reviewHold:'hi-fi-simple-and-detailed'}]}),{w,approvedShell}=h;
  try{
    assert.equal(w.document.querySelector('[data-module=q2] .nav-label').textContent,'Q2 구매량·현재 가격');
    assert.equal(w.document.getElementById('caption').textContent,'Q2 구매량·현재 가격');
    assert.equal(w.document.getElementById('stage-hint').textContent,'간편·상세 하이파이 완료 후 검토');assert.equal(h.writes.length,0);
    const comparisons=w.document.getElementById('quote-candidates');assert.equal(comparisons.tagName,'DETAILS');assert.equal(comparisons.open,false);assert.match(comparisons.querySelector('summary').textContent,/정규 원본 비교/);
    assert.ok([...comparisons.querySelectorAll('a')].every(a=>a.target==='_blank'&&a.textContent.includes('원본')&&a.textContent.includes('새 창')));
    assert.equal(w.document.getElementById('version').closest('details').open,false);
    w.document.querySelector('.lab-topbar').getBoundingClientRect=()=>({bottom:83});approvedShell.render();
    assert.equal(w.document.getElementById('drawer').style.top,'83px','drawer stays below the toolbar that contains the location action');
  }finally{w.close();}
});

test('rework instructions attach to current, historical and imported unresolved opinions without changing originals, pins or verdicts',async()=>{
  const prior=seedComment('prior-rework',{...feedbackTarget(),artifactHash:'a'.repeat(64)}),current=seedComment('current-rework');
  const resolved={...seedComment('resolved-rework'),action:'resolve'},deleted={...seedComment('deleted-rework'),action:'delete'};
  const recheck={release:'MSG0585-R3',kind:'feedback',id:'prior-recheck',revision:1,cursor:5,action:'save',data:{target:feedbackTarget(),parent:{origin:'current',id:prior.id},status:'recheck'}};
  const verdict={release:'MSG0585-R3',kind:'review',id:'independent-review',revision:1,cursor:6,action:'save',data:{target:feedbackTarget(),decision:'changes_requested'}};
  const imported={sourceKey:'login/empty/email/390',data:{status:'fix',comments:[{id:'legacy-rework',body:'가져온 원문',status:'open',anchor:{tag:'button',label:'원래 버튼',x:.3,y:.4}}]}};
  const originals=[prior,current,resolved,deleted,recheck,verdict,imported],before=JSON.stringify(originals);
  const h=await hostHarness({initialRecords:originals.slice(0,-1),legacyItems:[imported]}),{w,records,writes,messages}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();await w.document.querySelector('[data-comment-filter=all]').onclick();
    const action=id=>[...feedbackCard(w,id).querySelectorAll('button')].find(b=>b.textContent==='재작업 지시');
    assert.ok(action(current.id));assert.ok(action(prior.id));assert.ok(action('legacy-rework'));assert.equal(action(resolved.id),undefined);
    assert.equal([...w.document.querySelectorAll('#notes article')].find(card=>card.textContent.includes('삭제된 의견')).querySelector('.rework-action'),null);
    const pinsBefore=JSON.stringify(messages.filter(m=>m.type==='pins').at(-1).payload);
    for(const [id,body,origin] of [[prior.id,'이전 의견의 간격을 다시 맞춰 주세요.','current'],[current.id,'이번 판의 원문을 유지해 주세요.','current'],['legacy-rework','가져온 의견도 같은 기준으로 다시 확인해 주세요.','legacy']]){
      action(id).click();assert.equal($('editor-label').textContent,'재작업 지시사항');assert.equal($('save').textContent,'재작업 지시 저장');assert.equal($('reposition').hidden,true);
      $('body-text').value=body;$('body-text').dispatchEvent(new w.Event('input'));const count=records.length;$('save').click();
      await until(()=>records.length===count+1&&feedbackCard(w,id)?.textContent.includes(body));
      const saved=records.at(-1);assert.equal(saved.kind,'reply');assert.equal(saved.data.purpose,'rework');assert.deepEqual(saved.data.parent,{origin,id});
      assert.equal(saved.data.target.artifactHash,feedbackTarget().artifactHash);assert.equal(Object.hasOwn(saved.data,'anchor'),false);
      assert.equal(saved.data.sourceArtifactHash,origin==='legacy'?undefined:(id===prior.id?prior.data.target.artifactHash:current.data.target.artifactHash));
      assert.equal(feedbackCard(w,id).dataset.feedbackStatus,id===prior.id?'recheck':'unresolved');
    }
    const oldInstruction=records.find(r=>r.kind==='reply'&&r.data.parent.id===prior.id);
    [...feedbackCard(w,prior.id).querySelectorAll('button')].find(b=>b.textContent==='재작업 지시 수정').click();
    $('body-text').value='간격과 정렬을 함께 확인해 주세요.';$('body-text').dispatchEvent(new w.Event('input'));$('save').click();
    await until(()=>records.at(-1).id===oldInstruction.id&&records.at(-1).revision===2&&feedbackCard(w,prior.id)?.textContent.includes('간격과 정렬'));
    assert.equal(records.at(-1).data.sourceArtifactHash,prior.data.target.artifactHash);assert.equal(records.at(-1).data.purpose,'rework');
    const history=feedbackCard(w,prior.id).querySelector('.rework-instruction details');history.open=true;history.dispatchEvent(new w.Event('toggle'));
    await until(()=>history.textContent.includes('이전 의견의 간격을 다시 맞춰 주세요.')&&history.textContent.includes('간격과 정렬을 함께 확인해 주세요.'));
    assert.equal(writes.every(r=>r.body.kind==='reply'),true);assert.equal(JSON.stringify(originals),before);
    assert.equal(JSON.stringify(messages.filter(m=>m.type==='pins').at(-1).payload),pinsBefore);
    assert.deepEqual(records.filter(r=>r.kind==='feedback'),[recheck]);assert.deepEqual(records.filter(r=>r.kind==='review'),[verdict]);
  }finally{w.close();}
});

test('a historical rework draft survives server reload and rejected save with its purpose and source identity intact',async()=>{
  const original=seedComment('draft-rework',{...feedbackTarget(),artifactHash:'b'.repeat(64)}),before=JSON.stringify(original);
  const first=await hostHarness({initialRecords:[original]});let saved;
  try{
    const w=first.w,$=id=>w.document.getElementById(id);$('points').click();feedbackCard(w,original.id).querySelector('.rework-action').click();
    $('body-text').value='원래 위치에서 문구를 다시 확인해 주세요.';$('body-text').dispatchEvent(new w.Event('input'));$('draft').click();
    await until(()=>first.records.some(r=>r.kind==='draft')&&$('live').textContent==='저장됨 · r1');
    saved=first.records.at(-1);assert.equal(saved.data.purpose,'rework');assert.equal(saved.data.sourceArtifactHash,original.data.target.artifactHash);
  }finally{first.w.close();}
  const h=await hostHarness({initialRecords:[original,saved]}),{w,records,writes}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();[...$('notes').querySelectorAll('button')].find(b=>b.textContent==='임시 재작업 지시 이어쓰기').click();
    assert.equal($('body-text').value,saved.data.body);assert.equal($('save').textContent,'재작업 지시 저장');
    h.setFailure({error:'REPLY_PARENT_UNAVAILABLE',status:409});$('save').click();
    await until(()=>$('live').textContent.includes('재작업 지시는 초안으로'));
    assert.equal(records.length,2);assert.equal($('body-text').value,saved.data.body);
    const storageKey=Object.keys(w.sessionStorage).find(k=>k.startsWith('order.qa.unsent.v1.'));
    const unsent=JSON.parse(w.sessionStorage.getItem(storageKey))[0][1];assert.equal(unsent.purpose,'rework');assert.equal(unsent.sourceArtifactHash,original.data.target.artifactHash);
    const attempt=writes.at(-1).body;h.setFailure(null);$('save').click();
    await until(()=>records.length===3&&feedbackCard(w,original.id)?.textContent.includes(saved.data.body));
    assert.equal(writes.at(-1).body.idempotencyKey,attempt.idempotencyKey);assert.deepEqual(writes.at(-1).body.data,attempt.data);
    assert.equal(records.at(-1).kind,'reply');assert.equal(records.at(-1).data.purpose,'rework');assert.equal(records.at(-1).data.sourceArtifactHash,original.data.target.artifactHash);
    assert.equal(feedbackCard(w,original.id).dataset.feedbackStatus,'unresolved');assert.equal(JSON.stringify(original),before);
    assert.ok(writes.every(r=>r.body.kind==='reply'));
  }finally{w.close();}
});

test('an unsent rework from an earlier review hash remains discoverable and resumes its exact target and retry identity',async()=>{
  const original=seedComment('unsent-source',{...feedbackTarget(),artifactHash:'a'.repeat(64)}),oldTarget={...feedbackTarget(),artifactHash:'c'.repeat(64)};
  const data={target:oldTarget,body:'Order, 점, 로고 간격을 다시 확인해 주세요.',parent:{origin:'current',id:original.id},purpose:'rework',sourceArtifactHash:original.data.target.artifactHash};
  const packet={release:'MSG0585-R3',id:'unsent-historical-instruction',kind:'reply',expectedRevision:0,data,action:'save',reason:''};
  const draft={id:packet.id,body:data.body,revision:0,parent:data.parent,purpose:data.purpose,sourceArtifactHash:data.sourceArtifactHash,dirty:true,retry:{sig:JSON.stringify(packet),key:'same-unsent-request'}};
  const key='login/empty/email/390/'+oldTarget.artifactHash+'|'+draft.id;
  const h=await hostHarness({initialRecords:[original],initialDrafts:[[key,draft]],historicalArtifacts:{[oldTarget.artifactHash]:{archivedSource:{epoch:'exact-reviewed-source'}}},canonicalHost:true}),{w,writes,records}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();
    const resume=[...$('notes').querySelectorAll('button')].find(button=>button.textContent.startsWith('이전 판의 미저장 재작업 지시 이어쓰기'));
    assert.ok(resume,'a new release must not hide the previous hash-keyed draft');resume.click();
    await until(()=>!$('authoring').hidden&&$('body-text').value===data.body);
    assert.equal($('editor-source').hidden,false);assert.match($('editor-source').textContent,/작성 당시 화면/);
    assert.equal(writes.length,0,'resuming only reads the exact source');$('save').click();
    await until(()=>records.some(record=>record.id===draft.id&&record.kind==='reply')&&$('authoring').hidden);
    assert.deepEqual(writes.at(-1).body,{...packet,idempotencyKey:'same-unsent-request'});
    assert.equal(records.filter(record=>record.kind==='feedback'||record.kind==='review').length,0);
    assert.deepEqual(records[0],original);
  }finally{w.close();}
});

test('an unavailable earlier draft source stays preserved without moving its target or submitting it',async()=>{
  const hash='d'.repeat(64),draft={id:'missing-source-draft',body:'원래 화면에 남긴 재작업 내용',revision:0,parent:{origin:'current',id:'source'},purpose:'rework',sourceArtifactHash:'a'.repeat(64),dirty:true};
  const key='login/empty/email/390/'+hash+'|'+draft.id,h=await hostHarness({initialDrafts:[[key,draft]],historicalArtifacts:{},canonicalHost:true}),{w,writes}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();const resume=[...$('notes').querySelectorAll('button')].find(button=>button.textContent.startsWith('이전 판의 미저장 재작업 지시 이어쓰기'));
    assert.ok(resume);resume.click();await until(()=>$('live').textContent.includes('작성 당시 화면'));
    const storageKey=Object.keys(w.sessionStorage).find(value=>value.startsWith('order.qa.unsent.v1.'));
    assert.deepEqual(JSON.parse(w.sessionStorage.getItem(storageKey)),[[key,draft]]);assert.equal(writes.length,0);assert.equal($('authoring').hidden,true);
  }finally{w.close();}
});

test('rejected saves retain a specific visible failure and exact request until an idempotent retry succeeds',async()=>{
  const original=seedComment('failure-detail-source'),h=await hostHarness({initialRecords:[original],canonicalHost:true}),{w,writes,records}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();feedbackCard(w,original.id).querySelector('.rework-action').click();
    $('body-text').value='실패해도 그대로 남아야 하는 지시';$('body-text').dispatchEvent(new w.Event('input'));
    h.setFailure({error:'REVIEW_TARGET_UNAVAILABLE',status:400});$('save').click();
    await until(()=>$('save-error')?.hidden===false);
    assert.match($('save-error').textContent,/화면 버전/);const attempt=writes.at(-1).body;
    const storageKey=Object.keys(w.sessionStorage).find(value=>value.startsWith('order.qa.unsent.v1.'));
    const retained=JSON.parse(w.sessionStorage.getItem(storageKey))[0][1];
    assert.equal(retained.body,attempt.data.body);assert.equal(retained.saveFailure.code,'REVIEW_TARGET_UNAVAILABLE');assert.equal(retained.saveFailure.status,400);
    assert.deepEqual(JSON.parse(retained.retry.sig),Object.fromEntries(Object.entries(attempt).filter(([key])=>key!=='idempotencyKey')));
    $('points').click();[...$('notes').querySelectorAll('button')].find(button=>button.textContent.startsWith('저장하지 않은 재작업 지시 이어쓰기')).click();
    assert.equal($('save-error').hidden,false);assert.equal($('body-text').value,attempt.data.body);
    h.setFailure(null);$('save').click();await until(()=>records.length===2&&$('authoring').hidden);
    assert.equal(writes.at(-1).body.idempotencyKey,attempt.idempotencyKey);assert.deepEqual(writes.at(-1).body.data,attempt.data);
    assert.deepEqual(records[0],original);
  }finally{w.close();}
});

test('blank rework content is explained before any request or failed retry draft is created',async()=>{
  const original=seedComment('blank-rework-source'),h=await hostHarness({initialRecords:[original],canonicalHost:true}),{w,writes}=h,$=id=>w.document.getElementById(id);
  try{
    $('points').click();feedbackCard(w,original.id).querySelector('.rework-action').click();$('save').click();await tick();
    assert.equal(writes.length,0);assert.match($('live').textContent,/재작업 지시 내용을 입력/);
    assert.equal(w.document.activeElement,$('body-text'));
    const storageKey=Object.keys(w.sessionStorage).find(value=>value.startsWith('order.qa.unsent.v1.'));
    assert.equal(storageKey,undefined,'an untouched empty editor must not become a phantom failed draft');
  }finally{w.close();}
});
