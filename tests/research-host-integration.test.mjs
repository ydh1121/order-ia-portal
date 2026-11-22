import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';
import {bootApprovedShell} from '../src/server/r3-ui/approved-controller.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {installResearchInspector} from '../src/server/research-app/review-inspector.mjs';
import {getResearchInspectorPanelsModule} from '../src/server/research-app/inspector-panels-source.mjs';
import {installPinProjection} from '../src/server/r3-ui/pin-projection.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev',release='MSG0585-R3',build='test-research-build';
const bridge=readFileSync(new URL('../src/server/research-app/review-bridge.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function attachResearchReview','async function attachResearchReview');
const tick=()=>new Promise(resolve=>setTimeout(resolve,2));
async function until(check,message='host and app inspection settled'){
  for(let i=0;i<180;i++){if(check())return;await tick();}
  assert.ok(check(),message);
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

// The real host, inspector and bridge run in separate DOM realms. Only the
// browser's navigation/MessagePort scheduling and the artifact API are fixtures.
// Product-owned DOM is deliberately persistent so a reload or second mount is
// visible; these tests do not substitute a second QA implementation of the app.
async function harness(t,{recorded=false,mode='simple',initialScreen='onboarding',actualShell=false,legacyPreview=null}={}){
  const rows=['onboarding','q1','q2','q3'].map((screen,i)=>({id:screen+'/empty/email',screen,state:'empty',variant:'email',label:screen,stateLabel:'빈 입력',group:'견적',role:'customer',phase:'current',application:true,defaultWidth:390,hashes:{390:String(i+1).repeat(64)}}));
  const navigationDefaults={groups:[{id:'mvp',name:'1차 MVP'},{id:'future',name:'향후 검토'}],assignments:{}};
  const detailedRows=rows.map((row,i)=>({...row,hashes:{390:String(i+5).repeat(64)}})),initialRow=rows.find(row=>row.screen===initialScreen),hashFor=(row,selectedMode)=>selectedMode==='detailed'?detailedRows.find(item=>item.id===row.id).hashes[390]:row.hashes[390];
  const host=new JSDOM(approvedShellBody(),{url:origin+'/ia?view=qa-lab&screen='+encodeURIComponent(initialRow.id)+'&width=390'+(mode==='detailed'?'&mode=detailed':legacyPreview?'&mode='+legacyPreview:'')+(recorded?'&version=recorded&artifactHash='+hashFor(initialRow,mode):''),runScripts:'outside-only',pretendToBeVisual:true}),w=host.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.ResizeObserver=class {observe(){}disconnect(){}};
  const frame=w.document.getElementById('frame'),children=[],toApp=[],toHost=[],requests=[],stored=[],reads=new Map(),errors=new Map(),held=[],activeModes=[];
  let currentChild=null,context,loads=0,srcdocWrites=0,src='',srcdoc='',holdReady=false;
  const transitionTimers=new Map(),setTimer=w.setTimeout.bind(w),clearTimer=w.clearTimeout.bind(w);
  w.setTimeout=(callback,ms,...args)=>{const id=setTimer(callback,ms,...args);if(ms===15000)transitionTimers.set(id,()=>{clearTimer(id);callback();});return id;};
  w.clearTimeout=id=>{transitionTimers.delete(id);clearTimer(id);};
  const artifact=(row,selectedMode)=>({release,hash:hashFor(row,selectedMode),version:'current',...(selectedMode==='detailed'?{mode:'detailed'}:{}),html:'<!doctype html><html><body><main id="order-single"></main><script type="module">/* app owns mounting */</script></body></html>',file:'research.html',editable:'',application:{url:'/ia?view=research-r3&build='+build+'&screen='+row.screen+'&state=empty&variant=email'+(selectedMode==='detailed'?'&mode=detailed':''),build}});
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);requests.push({url:url.href,method:options.method||'GET',...(options.body?{body:JSON.parse(options.body)}:{})});
    if(url.pathname==='/api/ia/auth/me')return Response.json({csrf:'read-only-fixture',email:'integration@example.invalid'});
    if(url.pathname==='/api/order/features')return Response.json({orderMenu:false});
    if(url.pathname.endsWith('/navigation'))return Response.json({revision:0,layout:navigationDefaults});
    if(url.pathname.endsWith('/artifact')){
      const selectedMode=url.searchParams.get('mode')==='detailed'?'detailed':'simple';
      if(!url.searchParams.has('id'))return Response.json({release,items:selectedMode==='detailed'?detailedRows:rows,navigationDefaults,...(selectedMode==='detailed'?{mode:'detailed'}:{})});
      const id=url.searchParams.get('id'),row=rows.find(row=>row.id===id);
      if(reads.has(id))await reads.get(id).promise;
      if(errors.has(id))return Response.json({error:errors.get(id)},{status:503});
      return Response.json({...artifact(row,selectedMode),version:url.searchParams.get('version')==='recorded'?'recorded':'current'});
    }
    if(url.pathname.endsWith('/legacy'))return Response.json({items:[],hasMore:false});
    if(url.pathname.endsWith('/records')){
      if(options.method==='POST'){const packet=JSON.parse(options.body),record={...packet,revision:packet.expectedRevision+1,sequence:stored.length+1};stored.push(record);return Response.json(record);}
      return Response.json({items:stored,nextCursor:stored.length,hasMore:false});
    }
    throw Error('Unexpected integration read '+url);
  };
  function load(url){
    loads++;const parsed=new URL(url),p=parsed.searchParams;
    const dom=new JSDOM('<main id="order-single"><input name="phone" value=""><div id="route">'+p.get('screen')+'</div></main>',{url,runScripts:'outside-only',pretendToBeVisual:true}),iw=dom.window;
    const child={dom,w:iw,route:{screen:p.get('screen'),state:p.get('state'),variant:p.get('variant'),mode:p.get('mode')||'simple'},inspectCalls:[],activities:[],holds:new Map(),failures:new Map(),errors:[]};
    currentChild=child;children.push(child);
    const parent={postMessage(message,targetOrigin){
      toHost.push({message,targetOrigin,child});
      const deliver=()=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:iw,data:message}));
      if(holdReady&&message.type==='ready')held.push(deliver);else queueMicrotask(deliver);
    }};
    Object.defineProperty(iw,'parent',{value:parent});Object.defineProperty(iw,'innerWidth',{value:390});Object.defineProperty(iw,'innerHeight',{value:844});
    Object.defineProperty(iw.document,'scrollingElement',{value:iw.document.documentElement});
    iw.HTMLElement.prototype.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,width:390,height:50,right:390,bottom:50});
    iw.HTMLElement.prototype.getClientRects=function(){return this.hidden?[]:[this.getBoundingClientRect()];};
    iw.HTMLElement.prototype.scrollTo=()=>{};
    iw.document.elementFromPoint=()=>iw.document.querySelector('input');
    iw.console.error=error=>child.errors.push(error);
    const add=iw.addEventListener.bind(iw);
    iw.addEventListener=(type,listener,options)=>{if(['pointerdown','keydown','input','wheel'].includes(type))child.activities.push({type,listener});return add(type,listener,options);};
    iw.postMessage=(message,targetOrigin)=>{
      toApp.push({message,targetOrigin,child});
      queueMicrotask(()=>iw.dispatchEvent(new iw.MessageEvent('message',{origin,source:parent,data:message})));
    };
    iw.eval('var installPinProjection='+browserFunction(installPinProjection)+';');
    iw.eval(getResearchInspectorPanelsModule().replace('export const installResearchReviewPanels =','var installResearchReviewPanels ='));
    iw.eval('var installResearchInspector='+browserFunction(installResearchInspector)+';');
    iw.eval(bridge+'\nwindow.attachResearchReview=attachResearchReview;');
    child.emitRoute=(route,routeOrigin='application')=>{
      child.route={...child.route,...route};iw.document.getElementById('route').textContent=child.route.screen;
      iw.dispatchEvent(new iw.CustomEvent('order:research-route',{detail:{...child.route,origin:routeOrigin,build}}));
    };
    const app={async inspectRoute(next){
      child.inspectCalls.push(next);
      if(child.failures.has(next.screen))throw child.failures.get(next.screen);
      if(child.holds.has(next.screen))await child.holds.get(next.screen).promise;
      child.emitRoute(next,'review');
    },snapshot:()=>({route:{...child.route},instance:'single-instance'})};
    iw.ORDER_RESEARCH_APP=app;
    child.attached=iw.attachResearchReview(app,{inspection:{channel:p.get('channel'),artifact:p.get('artifact'),screen:p.get('screen'),state:p.get('state'),variant:p.get('variant'),viewport:390,version:p.get('version')||'current',...(p.get('mode')==='detailed'?{mode:'detailed'}:{})}});
    child.inspector=()=>iw.document.getElementById('order-single').__orderResearchInspector;
    return child;
  }
  Object.defineProperty(frame,'contentWindow',{get:()=>currentChild?.w||null});
  Object.defineProperty(frame,'contentDocument',{get:()=>currentChild?.w.document||null});
  Object.defineProperty(frame,'src',{get:()=>src,set:value=>{src=String(value);load(src);}});
  Object.defineProperty(frame,'srcdoc',{get:()=>srcdoc,set:value=>{srcdocWrites++;srcdoc=String(value);}});
  const shell={render(){},focusForPoint(){},setTab(){},setActiveMode(mode){activeModes.push(mode);},historyLinks(){},reviewWidths(){return[];},activeTab(){return'review';}};
  w.eval('('+browserFunction(bootQaHost)+')')('integration-nonce','function legacyFrame(){}',value=>{context=value;return actualShell?w.eval('('+browserFunction(bootApprovedShell)+')')(value):shell;},null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]});
  t.after(()=>{w.close();for(const child of children){child.inspector()?.dispose();child.w.close();}});
  await until(()=>currentChild&&frame.inert===false);
  const latestReady=()=>toHost.filter(entry=>entry.message.type==='ready').at(-1)?.message;
  const selected=()=>context.snapshot().current;
  return {w,frame,rows,detailedRows,requests,stored,toApp,toHost,reads,errors,held,latestReady,selected,children,activeModes,
    child:()=>currentChild,loads:()=>loads,srcdocWrites:()=>srcdocWrites,transitionTimers,select:(screen,selectedMode)=>context.select({...rows.find(row=>row.screen===screen),...(selectedMode?{mode:selectedMode}:{})}),
    holdReady(value){holdReady=value;},flushReady(){while(held.length)held.shift()();},
    async preview(screen){const unit=w.document.createElement('iframe');w.document.body.append(unit);await context.loadPreview(rows.find(row=>row.screen===screen),390,unit,true);return unit;},
    settled:(screen,selectedMode='simple')=>frame.inert===false&&selected()?.screen===screen&&currentChild.inspector()?.inspect().session.artifact===hashFor(rows.find(row=>row.screen===screen),selectedMode)};
}

test('QA selects a new scenario in the same app frame and accepts only the acknowledged hash for review',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input');input.value='01012345678';
  const initial=h.latestReady();await h.select('q1');await until(()=>h.settled('q1'));
  assert.equal(h.loads(),1);assert.equal(h.child(),child);assert.equal(child.w.document.querySelector('input'),input);assert.equal(input.value,'01012345678');
  assert.deepEqual(child.inspectCalls.map(route=>route.screen),['q1']);
  const command=h.toApp.find(entry=>entry.message.type==='researchSelect');assert.equal(command.message.channel,initial.channel);assert.equal(command.message.artifact,initial.artifact);
  assert.equal(command.targetOrigin,origin);assert.equal(h.latestReady().artifact,h.rows[1].hashes[390]);
  assert.equal(new URL(h.w.location.href).searchParams.get('screen'),h.rows[1].id);
  h.w.dispatchEvent(new h.w.MessageEvent('message',{origin:'null',source:child.w,data:{...h.latestReady(),type:'researchRoute',payload:{route:{screen:'q2',state:'empty',variant:'email'},routeRevision:1}}}));
  await tick();assert.equal(h.selected().screen,'q1','opaque or foreign frames cannot route the live app');
  assert.equal(h.requests.some(request=>request.method!=='GET'),false);
});

test('back-to-back QA selections retain the iframe and resend the latest selection after a delayed earlier ready',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input');input.value='보존할 입력';h.holdReady(true);
  await h.select('q1');await until(()=>h.held.length===1);
  await h.select('q2');await tick();
  assert.equal(h.loads(),1,'a missing ready must not cause a second app mount');
  h.holdReady(false);h.flushReady();await until(()=>h.settled('q2'));
  assert.equal(h.loads(),1);assert.equal(input.value,'보존할 입력');assert.equal(h.child(),child);
  assert.deepEqual(child.inspectCalls.map(route=>route.screen),['q1','q2']);
  const commands=h.toApp.filter(entry=>entry.message.type==='researchSelect');
  assert.equal(commands.at(-1).message.channel,h.toHost.find(entry=>entry.message.type==='ready'&&entry.message.artifact===h.rows[1].hashes[390]).message.channel);
});

test('rapid app-owned routes during artifact lookup acknowledge the newest route without remounting it',async t=>{
  const h=await harness(t),child=h.child(),first=deferred();h.reads.set(h.rows[1].id,first);
  child.emitRoute({screen:'q1'});await until(()=>h.selected().screen==='q1');
  child.emitRoute({screen:'q2'});await until(()=>h.selected().screen==='q2');
  first.resolve();await until(()=>h.settled('q2'));
  assert.equal(h.loads(),1);assert.equal(child.inspectCalls.length,0,'app-owned navigation is acknowledged without repeating a product action');
  const command=h.toApp.filter(entry=>entry.message.type==='researchSelect').at(-1).message;
  assert.equal(command.payload.acknowledgeOnly,true);assert.equal(command.payload.routeRevision,2);
  assert.equal(command.payload.screen,'q2');assert.equal(child.inspector().inspect().routeRevision,2);
});

test('a newer app route after session update but before ready is accepted on its known in-flight identity',async t=>{
  const h=await harness(t),child=h.child();h.holdReady(true);
  await h.select('q1');await until(()=>h.held.length===1);
  child.emitRoute({screen:'q2'});await until(()=>h.selected().screen==='q2');
  h.holdReady(false);h.flushReady();await until(()=>h.settled('q2'));
  assert.equal(h.loads(),1);assert.deepEqual(child.inspectCalls.map(route=>route.screen),['q1']);
  assert.equal(child.inspector().inspect().active,true);
});

test('a failed artifact lookup preserves the running app input and a later route can recover',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input');input.value='0311234567';
  h.errors.set(h.rows[1].id,'TEMPORARY_UNAVAILABLE');child.emitRoute({screen:'q1'});
  await until(()=>h.w.document.getElementById('live').textContent.includes('불러오지 못했습니다'));
  assert.equal(h.srcdocWrites(),0,'an artifact lookup failure never assigns a blank replacement document');assert.equal(h.loads(),1);assert.equal(input.isConnected,true);assert.equal(input.value,'0311234567');
  child.emitRoute({screen:'q2'});await until(()=>h.settled('q2'));
  assert.equal(h.child(),child);assert.equal(input.value,'0311234567');assert.equal(child.inspectCalls.length,0);
});

test('an unacknowledged scenario reports failure without reloading the app or accepting the wrong review target',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input');input.value='입력 보존';
  const blocked=deferred();child.holds.set('q1',blocked);await h.select('q1');await until(()=>h.transitionTimers.size===1);
  [...h.transitionTimers.values()][0]();
  assert.equal(h.loads(),1);assert.equal(h.srcdocWrites(),0);assert.equal(input.value,'입력 보존');assert.equal(h.frame.inert,false);
  assert.match(h.w.document.getElementById('live').textContent,/입력은 유지됩니다/);
  h.w.document.getElementById('general').click();assert.equal(h.w.document.getElementById('drawer').hidden,true,'the unconfirmed target cannot receive a comment');
  blocked.resolve();await until(()=>child.inspector().inspect().session.screen==='q1');
  await h.select('q2');await until(()=>h.settled('q2'));assert.equal(h.loads(),1);
});

test('a bridge scenario failure immediately releases the UI without fabricating ready or discarding app input',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input');input.value='오류 후 보존';
  child.failures.set('q1',Error('SCENE_MISSING'));await h.select('q1');
  await until(()=>h.frame.inert===false&&h.w.document.getElementById('live').textContent.includes('입력은 유지됩니다'));
  assert.equal(h.latestReady().artifact,h.rows[0].hashes[390]);assert.equal(h.loads(),1);assert.equal(input.value,'오류 후 보존');
  assert.equal(h.toHost.filter(entry=>entry.message.type==='researchError').length,1);
  await h.select('q2');await until(()=>h.settled('q2'));assert.equal(h.child(),child);
});

test('a cancelled app inspection keeps its prior identity and input instead of acknowledging the requested hash',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input'),app=child.w.ORDER_RESEARCH_APP;
  input.value='취소한 사업장 입력';
  const inspectRoute=app.inspectRoute;app.inspectRoute=async next=>{child.inspectCalls.push(next);return false;};
  await h.select('q1');
  await until(()=>h.frame.inert===false&&h.w.document.getElementById('live').textContent.includes('입력은 유지됩니다'));
  assert.equal(child.route.screen,'onboarding');assert.equal(child.inspector().inspect().session.artifact,h.rows[0].hashes[390]);
  assert.equal(h.latestReady().artifact,h.rows[0].hashes[390]);assert.equal(h.toHost.some(entry=>entry.message.type==='ready'&&entry.message.artifact===h.rows[1].hashes[390]),false);
  const failure=h.toHost.filter(entry=>entry.message.type==='researchError').at(-1).message;
  assert.equal(failure.payload.code,'SCENE_UNAVAILABLE');assert.equal(failure.artifact,h.rows[0].hashes[390]);
  assert.equal(input.value,'취소한 사업장 입력');assert.equal(input.isConnected,true);assert.equal(h.loads(),1);assert.equal(h.srcdocWrites(),0);
  h.w.document.getElementById('general').click();assert.equal(h.w.document.getElementById('drawer').hidden,true,'a rejected transition cannot receive a comment under the requested hash');
  app.inspectRoute=inspectRoute;await h.select('q2');await until(()=>h.settled('q2'));assert.equal(h.child(),child);assert.equal(input.value,'취소한 사업장 입력');
});

test('an uncatalogued app state never falls back to a different state or annotates under its hash',async t=>{
  const h=await harness(t),child=h.child();child.emitRoute({screen:'q1',state:'uncatalogued'});
  await until(()=>h.w.document.getElementById('live').textContent.includes('입력은 유지됩니다'));
  assert.equal(h.toApp.some(entry=>entry.message.type==='researchSelect'),false);assert.equal(child.inspector().inspect().active,false);
  child.emitRoute({screen:'q2',state:'empty'});await until(()=>h.settled('q2'));assert.equal(h.loads(),1);
});

test('only trusted app activity extends the host session and inspection messages or synthetic input do not',async t=>{
  const h=await harness(t),child=h.child();let count=0;h.w.document.addEventListener('ia-session-activity',()=>count++);
  const input=child.w.document.querySelector('input');input.dispatchEvent(new child.w.Event('input',{bubbles:true}));await tick();assert.equal(count,0);
  const observers=child.activities.filter(entry=>entry.type==='input');assert.equal(observers.length,1,'the inspector observes input without consuming it');
  observers[0].listener({type:'input',isTrusted:true,target:input});await until(()=>count===1);
  observers[0].listener({type:'input',isTrusted:true,target:input});await tick();assert.equal(count,1,'trusted activity notifications are throttled');
  await h.select('q1');await until(()=>h.settled('q1'));assert.equal(count,1,'ready and programmatic scenario selection are not user activity');
});

test('a recorded app keeps its recorded identity and never promotes an internal route to the current build',async t=>{
  const h=await harness(t,{recorded:true}),child=h.child();
  assert.equal(child.inspector().inspect().session.version,'recorded');assert.equal(h.latestReady().payload.version,'recorded');
  const initialReads=h.requests.filter(request=>new URL(request.url).pathname.endsWith('/artifact')).length;
  child.emitRoute({screen:'q1'});await until(()=>h.w.document.getElementById('live').textContent.includes('이력 원화면 다시 열기'));
  assert.equal(h.selected().screen,'onboarding');assert.equal(h.loads(),1);assert.equal(h.toApp.some(entry=>entry.message.type==='researchSelect'),false);
  assert.equal(h.requests.filter(request=>new URL(request.url).pathname.endsWith('/artifact')).length,initialReads,'history movement performs no current-artifact lookup');
  h.w.document.getElementById('general').click();assert.equal(h.w.document.getElementById('drawer').hidden,true);
  h.w.document.getElementById('live').querySelector('button').click();await until(()=>h.loads()===2&&h.frame.inert===false);
  assert.equal(h.child().inspector().inspect().session.version,'recorded');assert.equal(h.child().route.screen,'onboarding');
  const last=new URL(h.requests.filter(request=>new URL(request.url).pathname.endsWith('/artifact')).at(-1).url);
  assert.equal(last.searchParams.get('version'),'recorded');assert.equal(last.searchParams.get('artifactHash'),h.rows[0].hashes[390]);
});

test('a current comparison preview route opens the exact catalog state in focus without leaving inspection suspended',async t=>{
  const h=await harness(t),preview=await h.preview('q1'),p=new URL(preview.src).searchParams;
  const data={scope:'ORDER_R3_FRAME',channel:p.get('channel'),artifact:p.get('artifact'),type:'researchRoute',payload:{route:{screen:'q2',state:'empty',variant:'email',build},routeRevision:1}};
  h.w.dispatchEvent(new h.w.MessageEvent('message',{source:preview.contentWindow,origin,data}));
  await until(()=>h.settled('q2'));assert.equal(h.activeModes.at(-1),'focus');assert.equal(preview.inert,true);assert.equal(h.loads(),1);
});

test('app-owned detailed navigation, location comment storage and simple return preserve separate review identities',async t=>{
  const h=await harness(t),child=h.child(),input=child.w.document.querySelector('input');input.value='기존 견적 입력';
  child.emitRoute({screen:'q2',mode:'detailed'});await until(()=>h.settled('q2','detailed'));
  assert.equal(h.loads(),1);assert.equal(input.value,'기존 견적 입력');assert.equal(child.inspectCalls.length,0);
  assert.equal(h.latestReady().payload.mode,'detailed');assert.equal(child.inspector().inspect().session.mode,'detailed');
  assert.equal(new URL(h.w.location.href).searchParams.get('mode'),'detailed');
  const writePoint=async text=>{
    h.w.document.getElementById('general').click();const body=h.w.document.getElementById('body-text');body.value=text;body.dispatchEvent(new h.w.Event('input',{bubbles:true}));
    h.w.document.getElementById('reposition').click();await until(()=>!child.w.document.getElementById('r3-veil').hidden);
    child.w.document.getElementById('r3-veil').dispatchEvent(new child.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,clientX:80,clientY:20}));
    await until(()=>!h.w.document.getElementById('drawer').hidden&&h.w.document.getElementById('point-state').textContent==='위치 지정됨');
    const count=h.stored.length;h.w.document.getElementById('save').click();await until(()=>h.stored.length===count+1);return h.stored.at(-1);
  };
  const detailed=await writePoint('상세 견적만의 위치 의견');
  assert.equal(detailed.data.target.mode,'detailed');assert.equal(detailed.data.anchor.mode,'detailed');
  assert.equal(detailed.data.target.artifactHash,h.detailedRows[2].hashes[390]);assert.equal(detailed.data.anchor.artifactHash,detailed.data.target.artifactHash);
  const original=JSON.stringify(detailed);await h.select('q2','simple');await until(()=>h.settled('q2'));
  assert.equal(Object.hasOwn(child.inspector().inspect().session,'mode'),false);assert.equal(Object.hasOwn(h.latestReady().payload,'mode'),false);
  assert.equal(new URL(h.w.location.href).searchParams.has('mode'),false);
  h.w.document.getElementById('points').click();assert.equal(h.w.document.getElementById('notes').textContent.includes('상세 견적만의 위치 의견'),false);
  const simple=await writePoint('간편 견적 위치 의견');assert.equal(Object.hasOwn(simple.data.target,'mode'),false);assert.equal(Object.hasOwn(simple.data.anchor,'mode'),false);
  assert.equal(simple.data.target.artifactHash,h.rows[2].hashes[390]);assert.equal(JSON.stringify(detailed),original,'switching modes never rewrites the detailed record');
  await h.select('q2','detailed');await until(()=>h.settled('q2','detailed'));h.w.document.getElementById('points').click();
  assert.equal(h.w.document.getElementById('notes').textContent.includes('상세 견적만의 위치 의견'),true);assert.equal(h.w.document.getElementById('notes').textContent.includes('간편 견적 위치 의견'),false);
  assert.equal(h.requests.filter(request=>{const u=new URL(request.url);return u.pathname.endsWith('/artifact')&&!u.searchParams.has('id')&&u.searchParams.get('mode')==='detailed';}).length,1,'the separate detailed hash catalogue is loaded once');
});

test('a detailed recorded URL and its history recovery request the same mode and exact hash',async t=>{
  const h=await harness(t,{recorded:true,mode:'detailed',initialScreen:'q2'}),child=h.child();
  assert.equal(child.route.mode,'detailed');assert.equal(child.inspector().inspect().session.mode,'detailed');assert.equal(h.latestReady().payload.version,'recorded');
  child.emitRoute({screen:'q3'});await until(()=>h.w.document.getElementById('live').textContent.includes('이력 원화면 다시 열기'));
  h.w.document.getElementById('live').querySelector('button').click();await until(()=>h.loads()===2&&h.frame.inert===false);
  const read=new URL(h.requests.filter(request=>new URL(request.url).searchParams.has('artifactHash')).at(-1).url);
  assert.equal(read.searchParams.get('mode'),'detailed');assert.equal(read.searchParams.get('artifactHash'),h.detailedRows[2].hashes[390]);
  assert.equal(read.searchParams.get('version'),'recorded');assert.equal(h.child().route.mode,'detailed');assert.equal(h.child().route.screen,'q2');
  assert.equal(new URL(h.frame.src).searchParams.get('mode'),'detailed');assert.equal(h.toApp.some(entry=>entry.message.type==='researchSelect'),false);
});

test('detailed comparison previews preserve mode, and a ready without that mode cannot acknowledge the target',async t=>{
  const h=await harness(t,{mode:'detailed'}),preview=await h.preview('q1'),p=new URL(preview.src).searchParams;
  assert.equal(p.get('mode'),'detailed');assert.equal(p.get('artifact'),h.detailedRows[1].hashes[390]);
  h.holdReady(true);
  h.w.dispatchEvent(new h.w.MessageEvent('message',{source:preview.contentWindow,origin,data:{scope:'ORDER_R3_FRAME',channel:p.get('channel'),artifact:p.get('artifact'),type:'researchRoute',payload:{route:{screen:'q2',state:'empty',variant:'email',mode:'detailed',build},routeRevision:1}}}));
  await until(()=>h.held.length===1);const ready=h.latestReady(),payload={...ready.payload};delete payload.mode;
  h.w.dispatchEvent(new h.w.MessageEvent('message',{origin,source:h.child().w,data:{...ready,payload}}));
  assert.equal(h.frame.inert,true,'hash alone does not acknowledge a detailed route under a simple ready');
  h.holdReady(false);h.flushReady();await until(()=>h.settled('q2','detailed'));
  assert.equal(h.loads(),1);assert.equal(h.latestReady().payload.mode,'detailed');assert.equal(h.activeModes.at(-1),'focus');
});

test('QA preview layout uses its own URL field and refreshes comparison frames when product mode changes',async t=>{
  const h=await harness(t,{mode:'detailed',initialScreen:'q2',actualShell:true});
  h.w.document.querySelector('.lab-mode [data-mode="dual"]').click();
  const secondary=()=>h.w.document.querySelector('.preview-unit:not(#focus-unit) iframe');
  await until(()=>secondary()?.getAttribute('src'));
  const first=secondary(),url=new URL(h.w.location.href);
  assert.equal(url.searchParams.get('mode'),'detailed');assert.equal(url.searchParams.get('preview'),'dual');
  assert.equal(new URL(first.src).searchParams.get('mode'),'detailed');
  await h.select('q2','simple');await until(()=>h.settled('q2')&&secondary()!==first&&secondary()?.getAttribute('src'));
  assert.equal(h.w.document.querySelector('.lab-stage').dataset.mode,'dual');assert.equal(new URL(h.w.location.href).searchParams.has('mode'),false);
  assert.equal(new URL(h.w.location.href).searchParams.get('preview'),'dual');assert.equal(new URL(secondary().src).searchParams.get('mode'),'simple');
});

test('an existing mode=board bookmark keeps the QA layout while its mode-less product review remains simple',async t=>{
  const h=await harness(t,{actualShell:true,legacyPreview:'board'});
  assert.equal(h.w.document.querySelector('.lab-stage').dataset.mode,'board');assert.equal(h.child().route.mode,'simple');
  assert.equal(new URL(h.w.location.href).searchParams.has('mode'),false);assert.equal(new URL(h.w.location.href).searchParams.get('preview'),'board');
  assert.equal(Object.hasOwn(h.child().inspector().inspect().session,'mode'),false);
});
