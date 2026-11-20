import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const archivedCommit='e8e12588f289a493b006c9272f2947eba34afb0b',currentCommit='b'.repeat(40);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check){for(let n=0;n<100;n++){if(check())return;await tick();}assert.ok(check(),'host request settled');}
async function harness(t,{oldEpoch=null,nextEpoch=null,oldRuntime='a'.repeat(64),nextRuntime=oldRuntime}={}){
  const dom=new JSDOM(approvedShellBody(),{url:'https://order-ia-portal.pages.dev/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=390',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  t.after(()=>w.close());
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  w.document.documentElement.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:webcrypto});
  const screens=['empty','closed'].map((state,i)=>({id:'login/'+state+'/email',screen:'login',state,variant:'email',label:'로그인',stateLabel:state,group:'로그인',defaultWidth:390,role:'customer',phase:'current',hashes:{390:String(i+1).repeat(64)}}));
  const messages=[],requests=[];
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);requests.push({url:url.href,method:options.method||'GET'});
    if(url.pathname==='/api/ia/auth/me')return Response.json({csrf:'fixture-csrf'});
    if(url.pathname==='/api/order/features')return Response.json({orderMenu:false});
    if(url.pathname.endsWith('/artifact')){
      if(!url.searchParams.has('id'))return Response.json({release:'MSG0585-R3',items:screens,publication:{iaCommit:currentCommit,productCommit:'c'.repeat(40),deploymentId:'current-deploy'}});
      const row=screens.find(row=>row.id===url.searchParams.get('id')),first=row.state==='empty',epoch=first?oldEpoch:nextEpoch;
      return Response.json({hash:row.hashes[390],version:'current',html:'<!doctype html><html><head><!--R3-POLICY--></head><body><main id="order-single">'+row.state+'</main><!--R3-FRAME--></body></html>',editable:'',file:'fixture.html',
        source:{mode:'controlled-qa',runtimeDigest:first?oldRuntime:nextRuntime,files:['scripts/r3/authored/account.js']},
        ...(epoch?{archivedSource:{epoch,commit:archivedCommit,tree:'d'.repeat(40)}}:{})});
    }
    if(url.pathname.endsWith('/legacy'))return Response.json({items:[],hasMore:false});
    if(url.pathname.endsWith('/records'))return Response.json({items:[],nextCursor:0,hasMore:false});
    throw Error('Unexpected request '+url);
  };
  const shell={render(){},focusForPoint(){},setTab(){},historyLinks(){},reviewWidths(){return[];},activeTab(){return'review';}};
  w.eval('('+browserFunction(bootQaHost)+')')('epoch-host','function fixtureFrame(){}',()=>shell,null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]});
  const frame=w.document.getElementById('frame');frame.contentWindow.postMessage=message=>messages.push(message);
  await until(()=>frame.srcdoc.includes('"channel"'));
  const params=JSON.parse(frame.srcdoc.match(/\)\((\{"channel"[\s\S]*?\})\)<\/script>/)[1]);
  const emit=(type,payload={})=>w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source:frame.contentWindow,data:{scope:'ORDER_R3_FRAME',channel:params.channel,artifact:params.artifact,type,payload}}));
  emit('ready');await tick();
  return {w,frame,emit,messages,requests};
}

test('archived review source links identify its captured commit instead of the latest publication',async t=>{
  const h=await harness(t,{oldEpoch:'r1-e8e12588-20261120'});
  h.w.document.getElementById('points').click();
  const links=[...h.w.document.querySelectorAll('#motion-sources a,#motion-build a')].map(link=>link.href);
  assert.ok(links.includes('https://github.com/ydh1121/order-ia-portal/commit/'+archivedCommit));
  assert.ok(links.includes('https://github.com/ydh1121/order-ia-portal/blob/'+archivedCommit+'/scripts/r3/authored/account.js'));
  assert.equal(links.some(link=>link.includes(currentCommit)),false);
  assert.match(h.w.document.getElementById('motion-sources').textContent,/보존된 화면 소스/);
  assert.doesNotMatch(h.w.document.getElementById('motion-build').textContent,/current-deploy/);
});

for(const [name,options] of [
  ['archive epoch to current epoch',{oldEpoch:'r1-e8e12588-20261120'}],
  ['changed shared runtime',{nextRuntime:'b'.repeat(64)}]
])test(name+' remounts the existing frame instead of applying new markup to the old runtime',async t=>{
  const h=await harness(t,options),before=h.frame.srcdoc;
  h.emit('localState',{screen:'login',state:'closed'});
  await until(()=>h.frame.srcdoc!==before);
  assert.equal(h.messages.some(message=>message.type==='componentState'),false);
  assert.match(h.frame.srcdoc,/>closed<\/main>/);
  assert.equal(h.requests.some(request=>request.method!=='GET'),false);
});

test('matching epoch and runtime retain the existing in-place component transition',async t=>{
  const h=await harness(t),before=h.frame.srcdoc;
  h.emit('localState',{screen:'login',state:'closed'});
  await until(()=>h.messages.some(message=>message.type==='componentState'));
  const message=h.messages.find(message=>message.type==='componentState');
  assert.equal(message.payload.state,'closed');assert.equal(h.frame.srcdoc,before);
});
