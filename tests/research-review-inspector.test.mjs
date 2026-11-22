import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {installResearchInspector} from '../src/server/research-app/review-inspector.mjs';
import {getResearchInspectorPanelsModule} from '../src/server/research-app/inspector-panels-source.mjs';
import {installPinProjection} from '../src/server/r3-ui/pin-projection.mjs';
const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const hash='c'.repeat(64),oldHash='a'.repeat(64),origin='https://order-ia-portal.pages.dev';
const initial={channel:'11111111-1111-4111-8111-111111111111',artifact:hash,screen:'onboarding',state:'guest-1',variant:'email',viewport:390};
const frame=w=>new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
async function until(check,w){for(let i=0;i<12&&!check();i++)await frame(w);assert.ok(check(),'inspection work settled');}
function harness(t,{panels=false,animationFrames=true,markup='<main id="order-single"><header><button class="obm-brand">오더</button></header><form id="business"><label>전화<input name="phone" value="01012345678"></label><button id="continue" type="button">다음</button></form></main>'}={}){
  const dom=new JSDOM(markup,{url:origin+'/ia/research?inspect=1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,root=w.document.getElementById('order-single'),sent=[],parent={postMessage(message,targetOrigin){sent.push({message,targetOrigin});}};
  Object.defineProperty(w,'parent',{value:parent});Object.defineProperty(w,'innerWidth',{value:390,configurable:true});Object.defineProperty(w,'innerHeight',{value:844,configurable:true});
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  if(!animationFrames){w.requestAnimationFrame=()=>1;w.cancelAnimationFrame=()=>{};}
  w.HTMLElement.prototype.getBoundingClientRect=function(){return {x:20,y:40,left:20,top:40,right:120,bottom:90,width:100,height:50};};
  w.HTMLElement.prototype.getClientRects=function(){return this.hidden||this.closest('[hidden]')?[]:[this.getBoundingClientRect()];};
  w.HTMLElement.prototype.scrollTo=function(x,y){this.scrollLeft=x;this.scrollTop=y;};
  let hit=root.querySelector('#continue')||root.querySelector('button')||root;
  w.document.elementFromPoint=()=>hit;
  w.eval('var installPinProjection = '+browserFunction(installPinProjection)+';');
  w.eval(getResearchInspectorPanelsModule().replace('export const installResearchReviewPanels =','window.installResearchReviewPanels ='));
  const install=w.eval('('+browserFunction(installResearchInspector)+')');
  const api=install(initial,{root,...panels?{installPanels:w.installResearchReviewPanels}:{}});
  assert.ok(api);
  t.after(()=>{api.dispose();w.close();});
  const session=()=>api.inspect().session;
  const send=(type,payload,overrides={})=>{
    const s=session(),event=new w.MessageEvent('message',{origin:overrides.origin??origin,source:overrides.source??parent,data:{scope:'ORDER_R3_HOST',channel:s.channel,artifact:s.artifact,type,payload,...overrides.data}});
    w.dispatchEvent(event);return event;
  };
  const messages=type=>sent.filter(item=>item.message.type===type).map(item=>item.message);
  const point=()=>{send('mode',true);w.document.getElementById('r3-veil').dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,clientX:57,clientY:70}));send('mode',false);return messages('point').at(-1)?.payload;};
  return {w,root,api,send,messages,sent,point,hit:node=>{hit=node;}};
}

test('inspection observes the running app without mounting, blocking forms or intercepting navigation',async t=>{
  const h=harness(t),{w,root,api,messages}=h;let submitted=0,navigated=0;
  const form=root.querySelector('form'),input=root.querySelector('input'),button=root.querySelector('#continue'),before=root.innerHTML;
  w.ORDER_DESIGN_MODULES=[{mount(){throw Error('inspection must never mount authored UI');}}];
  w.ORDER_RESEARCH_APP={navigate(){navigated++;},snapshot:()=>({screen:'onboarding',state:'guest-1'})};
  form.addEventListener('submit',()=>submitted++);button.addEventListener('click',()=>w.ORDER_RESEARCH_APP.navigate('q1'));
  assert.equal(form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),true);button.click();
  input.value='0311234567';input.dispatchEvent(new w.Event('input',{bubbles:true}));
  await until(()=>messages('ready').length===1,w);
  assert.equal(submitted,1);assert.equal(navigated,1);assert.equal(input.value,'0311234567');assert.equal(root.querySelector('input'),input);
  assert.equal(root.innerHTML,before);assert.equal(messages('navigate').length,0);assert.equal(messages('ready')[0].artifact,hash);
  assert.ok(h.sent.every(item=>item.targetOrigin===origin));assert.equal(api.inspect().active,true);
});

test('an already mounted hidden app reports ready once even if the browser pauses animation frames',async t=>{
  const h=harness(t,{animationFrames:false});
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(h.messages('ready').length,1);assert.equal(h.messages('ready')[0].artifact,hash);
  h.api.updateSession({...initial,channel:'hidden-next-session',artifact:'d'.repeat(64)});
  h.api.dispose();await new Promise(resolve=>setTimeout(resolve,80));
  assert.equal(h.messages('ready').length,1,'dispose cancels the pending timer as well as RAF');
});

test('only the picking veil consumes pointer input and recorded coordinates preserve product input and anchor identity',async t=>{
  const h=harness(t),{w,root,send,messages}=h;const input=root.querySelector('input'),button=root.querySelector('#continue');
  input.value='작성 중인 전화번호';let clicks=0;button.addEventListener('click',()=>clicks++);button.click();assert.equal(clicks,1);
  const a=h.point();assert.ok(a);assert.match(a.id,/^a-/);assert.equal(a.instance,'onboarding');assert.equal(a.artifactHash,hash);assert.equal(a.x,.37);assert.equal(a.y,.6);
  assert.equal(clicks,1);assert.equal(input.value,'작성 중인 전화번호');assert.deepEqual(JSON.parse(JSON.stringify(a.viewport)),{width:390,height:844});
  send('mode',true);const form=root.querySelector('form');assert.equal(form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),true,'inspection never installs a form submission blocker');
  w.document.getElementById('r3-veil').dispatchEvent(new w.KeyboardEvent('keydown',{bubbles:true,key:'Escape'}));
  assert.equal(messages('cancelPick').length,1);assert.equal(w.document.getElementById('r3-veil').hidden,true);
  assert.equal(h.point().id,a.id);assert.equal(input.value,'작성 중인 전화번호');
});

test('same-origin pins use the released projection, preserve original anchors and show stable historical numbering',async t=>{
  const h=harness(t),{w,root,send,messages}=h,anchor=h.point();
  const original={...anchor,artifactHash:oldHash},frozen=JSON.stringify(original);
  send('pin-sources',[{artifactHash:oldHash,sourceHash:oldHash,html:root.outerHTML}]);
  const pin={id:'historical-thread',ordinal:7,previous:true,resolved:true,sourceArtifactHash:oldHash,anchor:{...original,artifactHash:hash}};
  const packet=JSON.stringify(pin);send('pins',[pin]);await until(()=>w.document.querySelector('.r3-pin'),w);
  const marker=w.document.querySelector('.r3-pin');assert.equal(marker.textContent,'7');assert.equal(marker.classList.contains('is-previous'),true);assert.equal(marker.classList.contains('is-resolved'),true);
  marker.click();assert.deepEqual(Array.from(messages('openPins').at(-1).payload.ids),[pin.id]);
  send('pin-view',{draft:anchor,selected:[pin.id]});await frame(w);assert.equal(w.document.querySelector('.approval-draft-pin').hidden,false);
  assert.equal(w.document.querySelector('.r3-pin').classList.contains('is-selected'),true);
  send('restore',{...anchor,scroll:[{id:'document',x:11,y:29}]});assert.equal(w.document.documentElement.scrollTop,29);assert.equal(w.document.activeElement,root.querySelector('#continue'));
  assert.equal(JSON.stringify(original),frozen);assert.equal(JSON.stringify(pin),packet);
});

test('foreign windows, origins, channels and artifacts cannot control inspection or reach the reused projection',async t=>{
  const h=harness(t),{w,send}=h;
  for(const overrides of [{source:{}},{origin:'null'},{origin:'https://untrusted.invalid'},{data:{channel:'wrong'}},{data:{artifact:oldHash}}]){
    send('mode',true,overrides);assert.equal(w.document.getElementById('r3-veil').hidden,true);
    send('pins',[{id:'forged',anchor:{id:'screen',instance:'onboarding',artifactHash:hash,x:.5,y:.5}}],overrides);
  }
  send('componentState',{state:'other',channel:'other',hash:oldHash});await frame(w);
  assert.equal(w.document.querySelector('.r3-pin'),null);assert.equal(h.api.inspect().session.state,'guest-1');
  send('mode',true);assert.equal(w.document.getElementById('r3-veil').hidden,false);
});

test('app routes suspend inspection until a current matching host acknowledgement and never accept a stale ready',async t=>{
  const h=harness(t),{w,api,send,messages}=h;await until(()=>messages('ready').length===1,w);
  const route={origin:'application',screen:'q1',state:'empty',variant:'email',mode:'simple',kind:'page',parent:'onboarding',build:'candidate-1'};
  const event=new w.CustomEvent('order:research-route',{detail:route,cancelable:true});assert.equal(w.dispatchEvent(event),true);
  assert.equal(api.inspect().active,false);assert.equal(messages('researchRoute').length,1);assert.equal(messages('researchRoute')[0].payload.routeRevision,1);
  send('mode',true);assert.equal(w.document.getElementById('r3-veil').hidden,true);
  const next={channel:'22222222-2222-4222-8222-222222222222',hash:'d'.repeat(64),screen:'q1',state:'empty',variant:'email',width:390,routeRevision:1};
  assert.equal(api.updateSession({...next,routeRevision:0}),false);assert.equal(api.updateSession({...next,screen:'q2'}),false);
  assert.equal(api.updateSession(next),true);await until(()=>messages('ready').length===2,w);assert.equal(messages('ready').at(-1).artifact,next.hash);
  send('mode',true,{data:{channel:initial.channel,artifact:hash}});assert.equal(w.document.getElementById('r3-veil').hidden,true);
  const point=h.point();assert.equal(point.instance,'q1');assert.equal(point.artifactHash,next.hash);
});

test('the independent review bridge receives authenticated researchSelect even while inspection awaits its route acknowledgement',async t=>{
  const h=harness(t),{w,api,send}=h,received=[];
  w.addEventListener('message',event=>{if(event.data?.type==='researchSelect')received.push(event.data.payload);});
  send('researchSelect',{next:{...initial,hash:'d'.repeat(64)}});assert.equal(received.length,1);
  assert.equal(api.inspect().session.artifact,hash,'inspection does not process the bridge-owned command itself');
  w.dispatchEvent(new w.CustomEvent('order:research-route',{detail:{origin:'application',screen:'q1',state:'empty',variant:'email'}}));
  assert.equal(api.inspect().active,false);
  send('researchSelect',{next:{screen:'q1'},acknowledgeOnly:true,routeRevision:1});assert.equal(received.length,2);
  for(const overrides of [{source:{}},{origin:'https://untrusted.invalid'},{data:{channel:'old-channel'}},{data:{artifact:oldHash}}])send('researchSelect',{next:{screen:'q1'}},overrides);
  assert.equal(received.length,2,'pending inspection does not weaken the bridge envelope checks');
  send('mode',true);assert.equal(w.document.getElementById('r3-veil').hidden,true);
});

test('review-origin selection waits for explicit updateSession without forwarding a second navigation request',async t=>{
  const h=harness(t),{w,api,messages}=h;await until(()=>messages('ready').length===1,w);
  w.dispatchEvent(new w.CustomEvent('order:research-route',{detail:{origin:'review',screen:'login',state:'empty',variant:'compact',kind:'sheet'}}));
  assert.equal(messages('researchRoute').length,0);assert.equal(api.inspect().active,false);assert.equal(api.inspect().routeRevision,0);
  assert.equal(api.updateSession({...initial,channel:'review-selection-0001',hash:undefined,artifact:'e'.repeat(64),screen:'login',state:'empty',variant:'compact'}),true);
  await until(()=>messages('ready').length===2,w);assert.equal(messages('ready').at(-1).artifact,'e'.repeat(64));
});

test('same-origin panel restoration reuses its real controller and teardown leaves no inspection listeners or markers',async t=>{
  const h=harness(t,{panels:true}),{w,root,api,send,messages}=h;
  const panel=w.document.createElement('section');panel.dataset.orderAccountPanel='';panel.innerHTML='<button id="profile-edit">프로필 수정</button>';root.append(panel);let phase='open',page='profile',opens=0;
  const menu={panel,inspect:()=>({phase,page}),open(next){opens++;phase='open';page=next||'root';panel.hidden=false;return true;},close(){phase='closed';panel.hidden=true;}};
  root.querySelector('.obm-brand').__orderAccountMenu=menu;
  await frame(w);h.hit(panel.querySelector('button'));const anchor=h.point();assert.ok(anchor.layers.length);
  menu.close();await frame(w);send('restore',anchor);await until(()=>opens===1&&w.document.activeElement===panel.querySelector('button'),w);
  assert.equal(phase,'open');assert.equal(page,'profile');assert.equal(root.querySelectorAll('#profile-edit').length,1);
  const original=JSON.stringify(anchor);api.dispose();assert.equal(w.document.getElementById('r3-veil'),null);assert.equal(root.querySelectorAll('.r3-panel-state').length,0);
  const count=messages('point').length;send('mode',true);root.querySelector('button').click();await frame(w);assert.equal(messages('point').length,count);
  assert.equal(JSON.stringify(anchor),original);assert.equal(root.querySelector('#profile-edit').isConnected,true);
});

test('the research panel source adaptation does not change the released helper file',()=>{
  const path=new URL('../src/server/r3-ui/review-panels.mjs',import.meta.url),before=readFileSync(path);
  const output=getResearchInspectorPanelsModule();assert.match(output,/export const installResearchReviewPanels/);assert.match(output,/return \{dispose\(\)\{dispose\(\)/);
  assert.deepEqual(readFileSync(path),before);
});
