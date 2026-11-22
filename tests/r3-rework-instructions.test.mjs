import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';

const db=new DatabaseSync(':memory:');
for(const name of ['0001_r3_qa.sql','0013_owner_session_revocations.sql'])db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const binding={prepare(sql){return {bind(...args){const s=db.prepare(sql);return {
  first:async()=>s.get(...args),all:async()=>({results:s.all(...args)}),run:async()=>({meta:s.run(...args)})};}};}};
const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',
  IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(18).toString('hex')),
  IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),ORDER_QA_DB:binding,ASSETS:createPrivateResearchAssets()};
const origin='https://order-ia-portal.pages.dev',base=origin+'/api/ia/r3-qa',release='MSG0585-R3';
const session=await issueSession(env),cookie=session.cookie.split(';')[0];
const read=path=>handleIaRequest(new Request(base+path,{headers:{Cookie:cookie}}),env);
const send=(body,extra={})=>handleIaRequest(new Request(base+'/records',{method:'POST',headers:{
  Origin:origin,'Content-Type':'application/json','X-IA-CSRF':session.csrf,Cookie:cookie},body:JSON.stringify(body)}),{...env,...extra});
const artifact=await (await read('/artifact?id=login%2Fempty%2Femail&version=current&width=390')).json();
const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:artifact.hash};
const entry=(kind,id,data,revision=0,key=id)=>({release,kind,id,data,expectedRevision:revision,idempotencyKey:key});
const instruction=(id,parent,sourceArtifactHash=target.artifactHash)=>entry('reply',id,{target,body:'위치와 간격을 다시 수정해 주세요.',
  parent,purpose:'rework',...(parent.origin==='current'?{sourceArtifactHash}:{})});
const latest=(kind,id)=>db.prepare('SELECT * FROM qa_review_events WHERE kind=? AND id=? ORDER BY revision DESC LIMIT 1').get(kind,id);

test('rework instructions persist, retry, edit and draft independently of the original comment and pin',async()=>{
  const parent={origin:'current',id:'rework-source'},anchor={id:'email',instance:'email',x:.2,y:.3,scale:1,
    viewport:{width:390,height:844},scroll:[],layers:[],artifactHash:target.artifactHash};
  const source=entry('comment',parent.id,{target,body:'원문과 위치를 보존할 의견',anchor});
  assert.equal((await send(source)).status,200);
  const original=latest('comment',parent.id),request=instruction('rework-instruction',parent);
  const saved=await (await send(request)).json();assert.equal(saved.revision,1);assert.equal(saved.data.purpose,'rework');
  assert.equal((await (await send(request)).json()).replayed,true);
  const revised={...request,expectedRevision:1,idempotencyKey:'rework-edit',data:{...request.data,body:'두 번째 지시 원문'}};
  assert.equal((await send(revised)).status,200);
  const history=await (await read('/events?release='+release+'&kind=reply&id='+request.id)).json();
  assert.deepEqual(history.items.map(x=>x.data.body),[request.data.body,'두 번째 지시 원문']);
  assert(history.items.every(x=>x.data.purpose==='rework'&&x.data.sourceArtifactHash===target.artifactHash));
  assert.equal((await send({...revised,idempotencyKey:'stale-rework-edit'})).status,409);
  const stripped={...revised,expectedRevision:2,idempotencyKey:'strip-rework-type',data:{target,parent,body:'일반 답글로 바꾸기'}};
  assert.equal((await send(stripped)).status,400);
  const draft=entry('draft','rework-draft',{...request.data,body:'작성 중인 재작업 지시'});
  assert.equal((await send(draft)).status,200);
  const restored=await (await read('/records?release='+release+'&kind=draft&id=rework-draft')).json();
  assert.equal(restored.items[0].data.sourceArtifactHash,target.artifactHash);
  assert.equal(restored.items[0].data.purpose,'rework');
  assert.deepEqual(latest('comment',parent.id),original);
  assert.equal(db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind='feedback'").get().n,0);
});

test('previous-artifact rework follows current review state without granting ordinary replies or changing the source',async()=>{
  const oldTarget={...target,artifactHash:'1'.repeat(64)},parent={origin:'current',id:'rework-old-source'};
  const raw=JSON.stringify({target:oldTarget,body:'이전 판에서 해결한 원문'});
  db.prepare(`INSERT INTO qa_review_events(release,kind,id,revision,data,action,reason,actor,request_key,request_hash)
    VALUES(?,'comment',?,1,?,'resolve','이전 판 확인','fixture',?,'seed')`).run(release,parent.id,raw,'rework-old-seed');
  const original=latest('comment',parent.id),request=instruction('rework-old-current',parent,oldTarget.artifactHash);
  assert.equal((await send(request)).status,409);
  const state=entry('feedback','rework-old-status',{target,parent,status:'unresolved'});
  assert.equal((await send(state)).status,200);
  assert.equal((await send(request)).status,200);
  assert.equal((await send(entry('reply','ordinary-old-reply',{target,parent,body:'일반 답글'}))).status,409);
  assert.equal((await send({...request,id:'forged-rework-source',idempotencyKey:'forged-rework-source',
    data:{...request.data,sourceArtifactHash:'2'.repeat(64)}})).status,409);
  assert.equal((await send({...request,id:'missing-rework-source',idempotencyKey:'missing-rework-source',
    data:{target,parent,body:'원본 식별자 없음',purpose:'rework'}})).status,400);
  assert.equal((await send({...request,id:'forged-rework-target',idempotencyKey:'forged-rework-target',
    data:{...request.data,target:{...target,artifactHash:'f'.repeat(64)}}})).status,400);
  const other=await (await read('/artifact?id=login%2Ferror%2Femail&version=current&width=390')).json();
  assert.equal((await send({...request,id:'wrong-rework-screen',idempotencyKey:'wrong-rework-screen',
    data:{...request.data,target:{...target,state:'error',artifactHash:other.hash}}})).status,409);
  assert.equal((await send({...state,expectedRevision:1,idempotencyKey:'resolve-old-rework',data:{...state.data,status:'resolved'}})).status,200);
  const blocked=await send({...request,expectedRevision:1,idempotencyKey:'edit-after-resolve',data:{...request.data,body:'해결 뒤 수정'}});
  assert.equal(blocked.status,409);assert.equal((await blocked.json()).error,'REPLY_PARENT_UNAVAILABLE');
  assert.deepEqual(latest('comment',parent.id),original);
  assert.equal(latest('reply',request.id).revision,1);
});

test('legacy rework preserves imported originals and obeys the current feedback state',async()=>{
  const source='e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
  const payload=JSON.stringify({comments:[{id:'rework-legacy',body:'이전 원문',status:'resolved',deleted:false}]});
  db.prepare('INSERT INTO qa_legacy_sources(sha256,original_bytes,chunk_count,record_count,normalization_version,complete) VALUES(?,0,0,1,1,1)').run(source);
  db.prepare('INSERT INTO qa_legacy_records VALUES(?,?,?,?,?)').run(source,'login/empty/email/390','/fixture',1,payload);
  const parent={origin:'legacy',id:'rework-legacy'},request=instruction('rework-legacy-instruction',parent);
  assert.equal((await send(request)).status,409);
  const feedback=entry('feedback','rework-legacy-status',{target,parent,status:'recheck'});
  assert.equal((await send(feedback)).status,200);
  assert.equal((await send(request)).status,200);
  assert.equal((await send({...request,id:'legacy-fake-hash',idempotencyKey:'legacy-fake-hash',
    data:{...request.data,sourceArtifactHash:target.artifactHash}})).status,400);
  assert.equal((await send({...feedback,expectedRevision:1,idempotencyKey:'close-legacy-rework',data:{...feedback.data,status:'resolved'}})).status,200);
  assert.equal((await send({...request,id:'legacy-after-resolve',idempotencyKey:'legacy-after-resolve'})).status,409);
  assert.equal(db.prepare('SELECT payload FROM qa_legacy_records WHERE source_sha=?').get(source).payload,payload);
});

test('a resolve or delete immediately before insertion prevents a stale rework instruction',async()=>{
  for(const action of ['resolve','delete']){
    const parent={origin:'current',id:'rework-race-'+action};
    const source=entry('comment',parent.id,{target,body:'동시 변경 대상'});
    assert.equal((await send(source)).status,200);
    const request=instruction('rework-race-instruction-'+action,parent);
    let injected=false;
    const racing={prepare(sql){const statement=binding.prepare(sql);return {bind(...args){const command=statement.bind(...args);return {...command,
      run:async()=>{
        if(!injected&&sql.startsWith('INSERT OR IGNORE INTO qa_review_events')&&args[2]===request.id){
          injected=true;
          db.prepare(`INSERT INTO qa_review_events(release,kind,id,revision,data,action,reason,actor,request_key,request_hash)
            VALUES(?,'comment',?,2,?,?,'다른 탭에서 변경','fixture',?,'race')`).run(release,parent.id,JSON.stringify(source.data),action,'source-race-'+action);
        }
        return command.run();
      }};}};}};
    const result=await send(request,{ORDER_QA_DB:racing});
    assert(injected);assert.equal(result.status,409);assert.equal((await result.json()).error,'REPLY_PARENT_UNAVAILABLE');
    assert.equal(latest('reply',request.id),undefined);
    assert.equal(latest('comment',parent.id).action,action);
  }
});
