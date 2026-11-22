import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const release='MSG0585-R3',currentHash='f'.repeat(64),oldHash='a'.repeat(64);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check,message='reference work settled'){
  for(let n=0;n<200;n++){if(check())return;await tick();}
  assert.ok(check(),message);
}
const html=label=>'<!doctype html><html><head><!--R3-POLICY--></head><body><main id="order-single"><button data-action="original">'+label+'</button></main><!--R3-FRAME--></body></html>';
function identity(frame){
  const dom=new JSDOM(frame.srcdoc),text=dom.window.document.querySelector('script').textContent;dom.window.close();
  return JSON.parse(text.slice(text.lastIndexOf(')(')+2,-1));
}
async function harness(t,{hashes=[oldHash],unknown=false}={}){
  const dom=new JSDOM(approvedShellBody(),{url:'https://order-ia-portal.pages.dev/ia?view=qa-lab&screen=onboarding%2Fguest-1%2Femail&width=390',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  t.after(()=>w.close());
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement});
  w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  const timers=new Map(),set=w.setTimeout.bind(w),clear=w.clearTimeout.bind(w);
  w.setTimeout=(fn,ms,...args)=>{const id=set(fn,ms,...args);if(ms===8000)timers.set(id,()=>{clear(id);fn();});return id;};
  w.clearTimeout=id=>{timers.delete(id);clear(id);};
  const rows=['guest-1','company'].map((state,i)=>({id:'onboarding/'+state+'/email',screen:'onboarding',state,variant:'email',label:'소개',stateLabel:state,group:'소개',defaultWidth:390,role:'customer',phase:'current',hashes:{390:i?'e'.repeat(64):currentHash}}));
  const events=hashes.map((hash,i)=>({release,kind:'comment',id:'source-pin-'+i,revision:1,cursor:i+1,action:'create',at:'2026-11-20T00:00:00Z',data:{
    target:{screen:'onboarding',state:'guest-1',variant:'email',viewport:390,artifactHash:hash},body:'위치 검증용',
    anchor:{id:'source-anchor-'+i,instance:'onboarding',artifactHash:hash,x:.37,y:.61,viewport:{width:390,height:901},scale:1,scroll:[],layers:[]}
  }}));
  const original=JSON.stringify(events),requests=[],messages=[],signals=[];
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);requests.push({url:url.href,method:options.method||'GET'});
    if(url.pathname==='/api/ia/auth/me')return Response.json({csrf:'fixture-csrf'});
    if(url.pathname==='/api/order/features')return Response.json({orderMenu:false});
    if(url.pathname.endsWith('/artifact')){
      if(!url.searchParams.has('id'))return Response.json({release,items:rows});
      const hash=url.searchParams.get('artifactHash'),row=rows.find(item=>item.id===url.searchParams.get('id'));
      if(hash){
        signals.push(options.signal);
        if(unknown)return Response.json({error:'UNKNOWN_REVIEW_TARGET'},{status:404});
        return Response.json({release,hash,version:'current',html:html('원본'),editable:'',file:'source.html'});
      }
      return Response.json({release,hash:row.hashes[390],version:'current',html:html(row.state),editable:'',file:'current.html'});
    }
    if(url.pathname.endsWith('/legacy'))return Response.json({items:[],hasMore:false});
    if(url.pathname.endsWith('/records'))return Response.json({items:events,nextCursor:events.length,hasMore:false});
    throw Error('Unexpected read '+url);
  };
  let context;
  const shell={render(){},focusForPoint(){},setTab(){},historyLinks(){},reviewWidths(){return[];},activeTab(){return'review';}};
  const frame=w.document.getElementById('frame');frame.contentWindow.postMessage=message=>messages.push(message);
  w.eval('('+browserFunction(bootQaHost)+')')('pin-source','function fixtureFrame(){}',value=>{context=value;return shell;},null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]});
  await until(()=>frame.srcdoc.includes('"channel"'));
  const main=()=>JSON.parse(frame.srcdoc.match(/\)\((\{"channel"[\s\S]*?\})\)<\/script>/)[1]);
  function emit(reference,data,source=reference.contentWindow,origin='null'){
    w.dispatchEvent(new w.MessageEvent('message',{source,origin,data}));
  }
  const mainReady=()=>{const id=main();emit(frame,{scope:'ORDER_R3_FRAME',type:'ready',channel:id.channel,artifact:id.artifact});};
  mainReady();await tick();
  const refs=()=>[...w.document.querySelectorAll('iframe[data-pin-source-reference]')];
  function ready(reference,overrides={}){
    const id=identity(reference),sent=[];reference.contentWindow.postMessage=message=>sent.push(message);
    emit(reference,{scope:'ORDER_R3_FRAME',type:'ready',channel:id.channel,artifact:id.artifact,...overrides});return {id,sent};
  }
  function snapshot(reference,markup='<main id="order-single"><button data-action="original">mounted</button></main>',overrides={},source=reference.contentWindow){
    const id=identity(reference);emit(reference,{scope:'ORDER_R3_PIN_SOURCE_FRAME',type:'snapshot',channel:id.channel,artifact:id.artifact,target:id.target,html:markup,...overrides},source);
  }
  const reads=()=>requests.filter(request=>new URL(request.url).searchParams.has('artifactHash'));
  return {w,dom,rows,events,original,requests,messages,signals,timers,refs,ready,snapshot,emit,reads,mainReady,select:(...args)=>context.select(...args)};
}

test('reference frames require their exact window, opaque origin, channel, source hash and target before caching a mounted snapshot',async t=>{
  const h=await harness(t);await until(()=>h.refs().length===1);const ref=h.refs()[0];
  assert.equal(ref.getAttribute('sandbox'),'allow-scripts');assert.equal(ref.getAttribute('aria-hidden'),'true');assert.equal(ref.inert,true);
  assert.equal(ref.style.display,'');assert.equal(ref.style.visibility,'hidden');assert.equal(ref.style.width,'390px');assert.equal(ref.style.height,'901px');
  assert.match(ref.srcdoc,/connect-src 'none'/);assert.doesNotMatch(ref.getAttribute('sandbox'),/same-origin|forms|popups/);
  const {id,sent}=h.ready(ref,{channel:'wrong'});assert.equal(sent.length,0);
  h.emit(ref,{scope:'ORDER_R3_FRAME',type:'ready',channel:id.channel,artifact:id.artifact},ref.contentWindow,'https://forged.invalid');assert.equal(sent.length,0);
  h.snapshot(ref);assert.equal(h.refs().length,1,'a snapshot cannot precede ready');
  h.emit(ref,{scope:'ORDER_R3_FRAME',type:'ready',channel:id.channel,artifact:id.artifact});assert.equal(sent.length,1);
  for(const overrides of [{channel:'wrong'},{artifact:'b'.repeat(64)},{target:{...id.target,state:'company'}},{target:{...id.target,height:844}}])h.snapshot(ref,undefined,overrides);
  h.snapshot(ref,undefined,{},{});assert.equal(h.refs().length,1,'forged source/identity messages are ignored');
  const before=h.events.map(row=>JSON.stringify(row));h.snapshot(ref);await until(()=>h.refs().length===0);
  const source=h.messages.filter(message=>message.type==='pin-sources').at(-1).payload[0];
  assert.equal(source.artifactHash,oldHash);assert.equal(source.sourceHash,oldHash);assert.match(source.html,/>원본</);assert.match(source.mountedHtml,/>mounted</);
  assert.equal(h.signals[0].aborted,true);assert.equal(h.timers.size,0);assert.deepEqual(h.events.map(row=>JSON.stringify(row)),before);
  h.mainReady();await tick();assert.equal(h.reads().length,1,'the immutable source cache prevents another iframe/read');
  h.snapshot(ref,'<main id="order-single">replacement</main>',{},ref.contentWindow);
  h.mainReady();await tick();assert.match(h.messages.filter(message=>message.type==='pin-sources').at(-1).payload[0].mountedHtml,/>mounted</,'late invalid payloads cannot replace cached evidence');
  assert.equal(h.requests.some(request=>request.method!=='GET'),false);
});

test('reference concurrency is bounded and changing page cancels active and queued work without accepting late snapshots',async t=>{
  const h=await harness(t,{hashes:['a','b','c','d'].map(value=>value.repeat(64))});await until(()=>h.refs().length===2);
  assert.equal(h.reads().length,2);const refs=h.refs(),oldIdentity=identity(refs[0]),oldWindow=refs[0].contentWindow;
  await h.select(h.rows[1]);await tick();assert.equal(h.refs().length,0);assert.equal(h.timers.size,0);
  assert.equal(h.signals.every(signal=>signal.aborted),true);assert.equal(h.reads().length,2,'queued sources never begin after navigation');
  h.emit(refs[0],{scope:'ORDER_R3_PIN_SOURCE_FRAME',type:'snapshot',channel:oldIdentity.channel,artifact:oldIdentity.artifact,target:oldIdentity.target,html:'<main id="order-single">late</main>'},oldWindow);
  assert.equal(h.messages.some(message=>message.type==='pin-sources'&&message.payload.some(source=>source.mountedHtml?.includes('late'))),false);
  await h.select(h.rows[0]);h.mainReady();await until(()=>h.refs().length===2);assert.equal(h.reads().length,4,'cancelled entries are retriable, not failure-cached');
  h.w.dispatchEvent(new h.w.Event('pagehide'));assert.equal(h.refs().length,0);assert.equal(h.timers.size,0);
  assert.equal(h.signals.every(signal=>signal.aborted),true);
});

test('reference timeout disposes its frame and preserves only static evidence until an explicit refresh',async t=>{
  const h=await harness(t);await until(()=>h.refs().length===1);const timeout=[...h.timers.values()][0];timeout();
  await until(()=>h.refs().length===0);assert.equal(h.timers.size,0);assert.equal(h.signals[0].aborted,true);
  const source=h.messages.filter(message=>message.type==='pin-sources').at(-1).payload[0];assert.equal(source.mountedUnavailable,true);assert.equal(source.mountedHtml,undefined);
  h.mainReady();await tick();assert.equal(h.reads().length,1,'timeout does not start an automatic retry loop');
  h.w.document.getElementById('sync').click();await until(()=>h.refs().length===1);assert.equal(h.reads().length,2);
});

test('eviction beyond the source cache capacity cannot requeue completed sources in the same view',async t=>{
  const hashes=Array.from({length:34},(_,i)=>(i+1).toString(16).padStart(64,'0')),h=await harness(t,{hashes});
  let completed=0;
  while(completed<hashes.length){
    await until(()=>h.refs().length>0);
    for(const ref of h.refs()){h.ready(ref);h.snapshot(ref);completed++;}
    await tick();assert.ok(h.refs().length<=2,'at most two reference frames may run');
  }
  await until(()=>h.refs().length===0);assert.equal(h.reads().length,hashes.length);assert.equal(h.timers.size,0);
  for(let i=0;i<4;i++){h.mainReady();await tick();}
  assert.equal(h.reads().length,hashes.length,'evicted evidence is not immediately fetched again by pin resynchronization');
  assert.equal(h.refs().length,0);
});

test('the byte-budget eviction boundary also cannot create an automatic reference retry loop',async t=>{
  const hashes=['1','2','3','4','5'].map(value=>value.repeat(64)),h=await harness(t,{hashes});
  const markup='<main id="order-single"><p>'+'x'.repeat(7*1024*1024)+'</p></main>';
  let completed=0;
  while(completed<hashes.length){
    await until(()=>h.refs().length>0);
    for(const ref of h.refs()){h.ready(ref);h.snapshot(ref,markup);completed++;}
    await tick();
  }
  await until(()=>h.refs().length===0);assert.equal(h.reads().length,5);assert.equal(h.timers.size,0);
  h.mainReady();await tick();h.mainReady();await tick();
  assert.equal(h.reads().length,5,'more than 32 MiB of completed evidence may be evicted but not automatically refetched');
  assert.equal(h.refs().length,0);
});

test('a reference removed before its reply cannot publish a snapshot or leave active work behind',async t=>{
  const h=await harness(t);await until(()=>h.refs().length===1);const ref=h.refs()[0],id=identity(ref),source=ref.contentWindow;h.ready(ref);ref.remove();
  h.emit(ref,{scope:'ORDER_R3_PIN_SOURCE_FRAME',type:'snapshot',channel:id.channel,artifact:id.artifact,target:id.target,html:'<main id="order-single">detached</main>'},source);
  assert.equal(h.timers.size,0);assert.equal(h.signals[0].aborted,true);
  const cached=h.messages.filter(message=>message.type==='pin-sources').at(-1).payload[0];assert.equal(cached.mountedHtml,undefined);assert.equal(cached.mountedUnavailable,true);
});

test('unknown hashes and malformed or oversized snapshots cannot introduce mounted evidence',async t=>{
  const unknown=await harness(t,{unknown:true});await until(()=>unknown.reads().length===1&&unknown.timers.size===0);assert.equal(unknown.refs().length,0);
  assert.equal(unknown.messages.some(message=>message.type==='pin-sources'&&message.payload.length),false);
  for(const markup of ['<main id="order-single"></main><main id="order-single"></main>','<main id="order-single">'+'x'.repeat(8*1024*1024)+'</main>']){
    const h=await harness(t);await until(()=>h.refs().length===1);const ref=h.refs()[0];h.ready(ref);h.snapshot(ref,markup);await until(()=>h.refs().length===0);
    const source=h.messages.filter(message=>message.type==='pin-sources').at(-1).payload[0];assert.equal(source.mountedHtml,undefined);assert.equal(source.mountedUnavailable,true);
  }
});

test('the isolated collector uses bounded DOM quiet timers without RAF, rejects foreign requests and cleans up on completion/pagehide',async t=>{
  const h=await harness(t);await until(()=>h.refs().length===1);const ref=h.refs()[0],id=identity(ref);
  const parsed=new JSDOM(ref.srcdoc),code=parsed.window.document.querySelector('script').textContent;parsed.window.close();
  const child=new JSDOM('<main id="order-single"><span class="mounted">source</span></main>',{runScripts:'outside-only'}),w=child.window;t.after(()=>w.close());
  const sent=[],parent={postMessage:message=>sent.push(message)},timers=new Map();let next=0;
  Object.defineProperty(w,'parent',{value:parent});w.requestAnimationFrame=()=>{throw Error('An offscreen reference must not depend on RAF');};
  w.setTimeout=(callback,delay)=>{timers.set(++next,{callback,delay});return next;};w.clearTimeout=key=>timers.delete(key);
  const fire=delay=>{const [id,timer]=[...timers].find(([,timer])=>timer.delay===delay);timers.delete(id);timer.callback();};
  const emit=(overrides={},source=parent)=>w.dispatchEvent(new w.MessageEvent('message',{source,data:{scope:'ORDER_R3_PIN_SOURCE_HOST',type:'snapshot',channel:id.channel,artifact:id.artifact,target:id.target,...overrides}}));
  w.eval(code);emit({},{});emit({channel:'wrong'});emit({artifact:'b'.repeat(64)});emit({target:{...id.target,viewport:1440}});assert.equal(timers.size,0);
  emit();emit();assert.equal(timers.size,2);const previousQuiet=[...timers].find(([,timer])=>timer.delay===40)[0];
  w.document.querySelector('.mounted').textContent='settled source';await tick();assert.equal(timers.has(previousQuiet),false,'a mounting mutation restarts only the quiet timer');assert.equal(timers.size,2);
  fire(40);assert.equal(sent.length,1);assert.equal(sent[0].artifact,id.artifact);assert.deepEqual(JSON.parse(JSON.stringify(sent[0].target)),id.target);assert.match(sent[0].html,/settled source/);emit();assert.equal(timers.size,0);
  w.eval(code);emit();assert.equal(timers.size,2);w.dispatchEvent(new w.Event('pagehide'));assert.equal(timers.size,0);emit();assert.equal(sent.length,1);
  w.eval(code);emit();fire(1500);assert.equal(sent.length,2);assert.equal(sent[1].html,null,'a source that never settles publishes no mounted evidence');assert.equal(timers.size,0);
});
