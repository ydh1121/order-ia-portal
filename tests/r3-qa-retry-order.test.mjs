import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import {bootQaHost} from '../src/server/r3-ui/host.mjs';
import {approvedShellBody} from '../src/server/r3-ui/approved-shell.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
import {handleR3Review} from '../src/server/r3-review-store.mjs';

const {JSDOM}=createRequire(new URL('./build-tools/package.json',import.meta.url))('jsdom');
const origin='https://order-ia-portal.pages.dev',base=origin+'/api/ia/r3-qa',release='MSG0585-R3';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function until(check){
  for(let i=0;i<120;i++){if(check())return;await tick();}
  assert.ok(check(),'the requested UI operation settled');
}

// Only authentication and artifact rendering are fixture responses. Records,
// immutable revisions and idempotency replay use the actual store and schema
// against a fresh in-memory SQLite database. No network or production DB access.
async function retryHarness(){
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));
  const binding={prepare(sql){return {bind(...args){const statement=db.prepare(sql);return {
    first:async()=>statement.get(...args),
    all:async()=>({results:statement.all(...args)}),
    run:async()=>({meta:statement.run(...args)})
  };}};}};
  const actor={id:'retry-order-fixture@example.invalid'};
  const screen={id:'login/empty/email',screen:'login',state:'empty',variant:'email',label:'로그인',stateLabel:'빈 입력',defaultWidth:390,runtimeFamily:'snapshot',hashes:{390:'b'.repeat(64)}};
  const currentTarget={screen:screen.screen,state:screen.state,variant:screen.variant,viewport:390,artifactHash:screen.hashes[390]};
  const originalTarget={...currentTarget,artifactHash:'a'.repeat(64)},reviewTarget={...currentTarget,artifactHash:'c'.repeat(64)};
  const allowedTargets=[currentTarget,originalTarget,reviewTarget];
  const store=request=>handleR3Review({request,env:{ORDER_QA_DB:binding},actor,
    path:new URL(request.url).pathname.slice(new URL(base).pathname.length),
    checkTarget:(target,requestedRelease)=>requestedRelease===release&&allowedTargets.some(allowed=>
      Object.keys(allowed).every(key=>target[key]===allowed[key]))});
  const send=async packet=>{
    const response=await store(new Request(base+'/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)}));
    assert.equal(response.status,200,'the real store accepts the seed revision');
    return response.json();
  };
  const parent=await send({release,kind:'comment',id:'retry-order-parent',expectedRevision:0,idempotencyKey:'seed-retry-parent',data:{target:originalTarget,body:'원댓글과 사용자 상태는 그대로 유지한다.'}});
  const data={target:reviewTarget,body:'응답을 잃었지만 같은 요청으로 이미 저장된 지시',parent:{origin:'current',id:parent.id},purpose:'rework',sourceArtifactHash:originalTarget.artifactHash};
  const packet={release,id:'retry-order-instruction',kind:'reply',expectedRevision:0,data,action:'save',reason:''};
  const originalKey='lost-response-request-key';
  const first=await send({...packet,idempotencyKey:originalKey});
  const newer=await send({...packet,expectedRevision:1,data:{...data,body:'다른 탭에서 확인한 더 최신의 지시'},idempotencyKey:'other-tab-newer-request'});
  assert.equal(first.revision,1);assert.equal(newer.revision,2);
  const beforeRows=db.prepare('SELECT * FROM qa_review_events ORDER BY cursor').all();
  const draft={id:packet.id,body:data.body,revision:0,parent:data.parent,purpose:data.purpose,sourceArtifactHash:data.sourceArtifactHash,dirty:true,retry:{sig:JSON.stringify(packet),key:originalKey}};
  const draftKey=screen.id+'/390/'+reviewTarget.artifactHash+'|'+draft.id;
  const owner=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(actor.id))).toString('hex');
  const storageKey='order.qa.unsent.v1.'+release+'.'+owner;
  const dom=new JSDOM(approvedShellBody(),{url:origin+'/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=390',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  Object.defineProperty(w.document,'scrollingElement',{value:w.document.documentElement,configurable:true});
  w.document.documentElement.scrollTo=()=>{};w.HTMLElement.prototype.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.TextEncoder=TextEncoder;Object.defineProperty(w,'crypto',{value:webcrypto});
  w.sessionStorage.setItem(storageKey,JSON.stringify([[draftKey,draft]]));
  const posts=[],reads=[];
  w.fetch=async(raw,options={})=>{
    const url=new URL(raw,w.location.href);
    if(url.pathname==='/api/ia/auth/me')return Response.json({csrf:'retry-order-csrf',email:actor.id});
    if(url.pathname==='/api/order/features')return Response.json({orderMenu:false});
    if(url.pathname===new URL(base).pathname+'/navigation')return Response.json({revision:0,layout:{}});
    if(url.pathname.endsWith('/artifact')){
      if(!url.searchParams.has('id'))return Response.json({release,items:[screen]});
      const hash=url.searchParams.get('artifactHash')||currentTarget.artifactHash;
      if(url.searchParams.get('id')!==screen.id||url.searchParams.get('width')!=='390'||![currentTarget.artifactHash,reviewTarget.artifactHash].includes(hash))return Response.json({error:'UNKNOWN_REVIEW_TARGET'},{status:404});
      return Response.json({hash,version:'current',html:'<!doctype html><html><head><!--R3-POLICY--></head><body><main id="order-single"></main><!--R3-FRAME--></body></html>',file:'retry-order.html',editable:'',
        ...(hash===reviewTarget.artifactHash?{archivedSource:{epoch:'retry-order-original'}}:{})});
    }
    if(url.pathname.endsWith('/legacy'))return Response.json({items:[],nextCursor:0,hasMore:false});
    if(['/records','/events'].some(path=>url.pathname===new URL(base).pathname+path)){
      if(options.method==='POST')assert.equal(options.headers['X-IA-CSRF'],'retry-order-csrf');
      const response=await store(new Request(url,options));
      const result=await response.clone().json();
      if(options.method==='POST')posts.push({packet:JSON.parse(options.body),status:response.status,result});
      else reads.push({path:url.pathname,since:Number(url.searchParams.get('since')||0),result});
      return response;
    }
    throw Error('Unexpected fixture request: '+url.pathname);
  };
  const shell={render(){},focusForPoint(){},setTab(){},historyLinks(){},reviewWidths(){return[];},activeTab(){return 'review';}};
  w.eval('('+browserFunction(bootQaHost)+')')('retry-nonce','function fixtureFrame(){}',()=>shell,null,()=>({clear(){},show(){},gate(){}}),()=>{},{requirements:[]});
  const $=id=>w.document.getElementById(id),frame=$('frame');
  frame.contentWindow.postMessage=()=>{};
  const ready=()=>{
    const params=JSON.parse(frame.srcdoc.match(/\)\((\{"channel"[\s\S]*?\})\)<\/script>/)[1]);
    w.dispatchEvent(new w.MessageEvent('message',{origin:'null',source:frame.contentWindow,data:{scope:'ORDER_R3_FRAME',channel:params.channel,artifact:params.artifact,type:'ready',payload:{}}}));
  };
  await until(()=>frame.srcdoc.includes('"channel"')&&reads.some(read=>read.result.items?.some(item=>item.id===newer.id&&item.revision===2)));
  ready();await tick();
  return {w,$,db,posts,reads,ready,parent,first,newer,packet,originalKey,draftKey,storageKey,beforeRows,
    localDrafts:()=>JSON.parse(w.sessionStorage.getItem(storageKey)||'[]'),
    rows:()=>db.prepare('SELECT * FROM qa_review_events ORDER BY cursor').all(),
    close(){w.close();db.close();}};
}

test('an old idempotency replay preserves newer state and the original draft until explicit continuation creates r3',async()=>{
  const h=await retryHarness(),{w,$,posts,reads,packet,originalKey}=h;
  try{
    $('points').click();
    assert.match($('notes').querySelector('[data-reply-id="'+packet.id+'"]').textContent,/r2/,'initial records contain the newer server revision');
    const resume=[...$('notes').querySelectorAll('button')].find(button=>button.textContent.startsWith('이전 판의 미저장 재작업 지시 이어쓰기'));
    assert.ok(resume);resume.click();
    await until(()=>!$('authoring').hidden&&$('body-text').value===packet.data.body);
    h.ready();
    assert.equal(posts.length,0,'opening the exact old source never submits or migrates the draft');
    await $('save').onclick();

    assert.equal(posts.length,1);assert.equal(posts[0].status,200);
    assert.equal(posts[0].result.replayed,true,'the real store replays the original committed request');
    assert.equal(posts[0].result.revision,1);assert.equal(posts[0].result.cursor,h.first.cursor);
    assert.deepEqual(posts[0].packet,{...packet,idempotencyKey:originalKey});
    assert.deepEqual(h.rows(),h.beforeRows,'retry adds no event and leaves r2 and the original parent unchanged');
    assert.equal($('authoring').hidden,false,'an older replay must not close and discard the unsent editor');
    assert.equal($('body-text').value,packet.data.body);
    assert.equal($('conflict').hidden,false);assert.match($('conflict').textContent,/더 최신의 지시/);
    let retained=h.localDrafts();assert.equal(retained.length,1);assert.equal(retained[0][0],h.draftKey);
    assert.equal(retained[0][1].revision,0);assert.equal(retained[0][1].saveFailure.code,'NEWER_REVIEW_AVAILABLE');
    assert.equal(retained[0][1].saveFailure.status,409);assert.equal(retained[0][1].retry.key,originalKey);
    assert.deepEqual(JSON.parse(retained[0][1].retry.sig),packet);

    $('points').click();
    assert.match($('notes').querySelector('[data-reply-id="'+packet.id+'"]').textContent,/r2/,'replay cannot downgrade the already loaded record');
    const readCount=reads.length;await $('sync').onclick();
    const incremental=reads.slice(readCount).find(read=>read.path.endsWith('/records'));
    assert.equal(incremental.since,h.newer.cursor);assert.equal(incremental.result.items.length,0);
    assert.match($('notes').querySelector('[data-reply-id="'+packet.id+'"]').textContent,/r2/,'an empty incremental sync still retains r2');
    [...$('notes').querySelectorAll('button')].find(button=>button.textContent.startsWith('저장하지 않은 재작업 지시 이어쓰기')).click();
    assert.equal($('save-error').hidden,false);assert.equal($('body-text').value,packet.data.body);
    await $('save').onclick();
    assert.equal(posts.length,2);assert.equal(posts[1].packet.idempotencyKey,originalKey);
    assert.equal(posts[1].packet.expectedRevision,0);assert.equal(posts[1].result.replayed,true);
    assert.deepEqual(h.rows(),h.beforeRows,'another retry before confirmation cannot silently append r3');

    const continueButton=[...$('conflict').querySelectorAll('button')].find(button=>button.textContent==='다른 탭의 내용을 확인하고 계속 수정');
    assert.ok(continueButton);continueButton.click();
    retained=h.localDrafts();assert.equal(retained[0][1].revision,2,'only explicit continuation adopts the newer expected revision');
    $('body-text').value='최신 지시를 확인한 뒤 명시적으로 이어 쓴 지시';$('body-text').dispatchEvent(new w.Event('input'));
    await $('save').onclick();
    assert.equal(posts.length,3);const final=posts[2];
    assert.equal(final.status,200);assert.equal(final.result.revision,3);assert.equal(final.result.replayed,false);
    assert.equal(final.packet.expectedRevision,2);assert.notEqual(final.packet.idempotencyKey,originalKey);
    assert.equal(final.packet.id,packet.id);assert.equal(final.packet.kind,'reply');
    assert.deepEqual(final.packet.data.target,packet.data.target);assert.deepEqual(final.packet.data.parent,packet.data.parent);
    assert.equal(final.packet.data.sourceArtifactHash,packet.data.sourceArtifactHash);assert.equal(final.packet.data.purpose,'rework');
    assert.equal(h.localDrafts().length,0);assert.equal($('authoring').hidden,true);
    assert.match($('notes').querySelector('[data-reply-id="'+packet.id+'"]').textContent,/r3/);
    const after=h.rows();assert.equal(after.length,h.beforeRows.length+1);assert.deepEqual(after.slice(0,h.beforeRows.length),h.beforeRows);
    assert.equal(after.filter(row=>row.kind==='feedback'||row.kind==='review').length,0,'saving instructions never creates a user verdict');
  }finally{h.close();}
});
