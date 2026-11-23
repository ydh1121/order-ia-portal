import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {onRequest as page} from '../functions/ia/[[path]].js';
import {v03OwnerHtml} from '../src/server/v03-owner-template.mjs';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';

const origin='https://order-ia-portal.pages.dev';
const base=origin+'/api/ia/r3-qa';
const db=new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0013_owner_session_revocations.sql',import.meta.url),'utf8'));
const binding={prepare(sql){return {bind(...args){const st=db.prepare(sql);return {
  first:async()=>st.get(...args),all:async()=>({results:st.all(...args)}),run:async()=>({meta:st.run(...args)})};}};}};
const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(18).toString('hex')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),ORDER_QA_DB:binding,ASSETS:createPrivateResearchAssets()};
const session=await issueSession(env),cookie=session.cookie.split(';')[0];
const artifact=await handleIaRequest(new Request(base+'/artifact?id=login%2Fempty%2Femail&version=current&width=390',{headers:{Cookie:cookie}}),env);
const verified=await artifact.json();
const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:verified.hash};
const data=body=>({body,target});
const event=(name,body,rev=0)=>({release:'MSG0585-R3',kind:'comment',id:'fixture',expectedRevision:rev,idempotencyKey:name,data:data(body)});
const read=(path,settings={})=>handleIaRequest(new Request(base+path,{headers:{Cookie:cookie}}),{...env,...settings});
const send=(b,headers={},settings={})=>handleIaRequest(new Request(base+'/records',{method:'POST',
  headers:{Origin:origin,'Content-Type':'application/json','X-IA-CSRF':session.csrf,Cookie:cookie,...headers},body:JSON.stringify(b)}),{...env,...settings});

test('authentication, original CSRF and direct login return view',async()=>{
  const unauth=await handleIaRequest(new Request(base+'/records?release=r3'),env);
  assert.equal(unauth.status,403);assert.match(unauth.headers.get('Cache-Control'),/no-store/);
  assert.equal((await send(event('bad','x'),{Origin:'https://different.invalid'})).status,403);
  assert.equal((await send(event('bad','x'),{'X-IA-CSRF':''})).status,403);
  assert.equal((await page({request:new Request(origin+'/ia?view=qa-lab'),env})).headers.get('location'),'/login?returnView=qa-lab');
  const deep=await page({request:new Request(origin+'/ia?view=qa-lab&screen=login%2Fempty%2Femail&width=390&ignored=1'),env});
  assert.equal(deep.headers.get('location'),'/login?returnView=qa-lab&screen=login%2Fempty%2Femail&width=390');
  const asset=await page({request:new Request(origin+'/ia/r3-product/unknown.mjs'),env});
  assert.equal(asset.status,403);assert.equal(await asset.text(),'');
  const sidebar=v03OwnerHtml('nonce-qa').match(/<aside\b[^>]*class="sidebar"[^>]*>([\s\S]*?)<\/aside>/)?.[1];
  assert.ok(sidebar,'QA uses the original IA sidebar');
  const qaLink=sidebar.match(/<a\b[^>]*href="\/ia\?view=qa-lab"[^>]*>/)?.[0];
  assert.ok(qaLink,'the QA new-window link is present');
  assert.match(qaLink,/\btarget="_blank"/);
  const rel=new Set((qaLink.match(/\brel="([^"]*)"/)?.[1]||'').split(/\s+/));
  assert.ok(rel.has('noopener'),'new QA windows cannot control their opener');
  assert.ok(rel.has('noreferrer'),'navigation does not forward private IA referrers');
  assert.equal(db.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,0);
});
test('server-generated revision, atomic contention, conflict payload and retry',async()=>{
  const a=await (await send(event('first-request','first'))).json();assert.equal(a.revision,1);assert.equal(a.replayed,false);
  const dup=await (await send(event('first-request','first'))).json();assert.equal(dup.replayed,true);assert.equal(dup.cursor,a.cursor);
  assert.equal((await send(event('first-request','different'))).status,409);
  const [x,y]=await Promise.all([send(event('left','left edit',1)),send(event('right','right edit',1))]);
  assert.deepEqual([x.status,y.status].sort(),[200,409]);
  const loser=await (x.status===409?x:y).json();assert.equal(loser.current.revision,2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,2);
  const b=await (await read('/records?release=MSG0585-R3')).json();assert.equal(b.items.length,1);assert.equal(b.items[0].data.body,loser.current.data.body);
  const h=await (await read('/events?release=MSG0585-R3&kind=comment&id=fixture')).json();assert.deepEqual(h.items.map(r=>r.revision),[1,2]);
  const change=await (await read('/records?release=MSG0585-R3&since='+a.cursor)).json();assert.equal(change.items.length,1);assert.ok(change.items[0].cursor>a.cursor);
  const resolve={...event('resolution',loser.current.data.body,2),action:'resolve',reason:'검토 완료'};
  assert.equal((await send(resolve)).status,200);assert.equal((await (await read('/records?release=MSG0585-R3&unresolved=1')).json()).items.length,0);
  assert.equal((await send(event('silent-reopen','edit',3))).status,400);
  const reopened={...event('reopen',loser.current.data.body,3),action:'reopen',reason:'사용자 재검토'};assert.equal((await send(reopened)).status,200);
  assert.equal((await (await read('/records?release=MSG0585-R3&unresolved=1')).json()).items.length,1);
});
test('a resolved comment can be archived with its reason, and restored with a separate event',async()=>{
  const note={...event('archive-comment','처리한 의견'),id:'archive-comment'};
  assert.equal((await send(note)).status,200);
  const stateChange=(action,rev,reason)=>({...note,expectedRevision:rev,action,reason,idempotencyKey:'archival-'+action+rev});
  assert.equal((await send(stateChange('resolve',1,'확인 완료'))).status,200);
  assert.equal((await send(stateChange('delete',2,''))).status,400);
  const archived=await (await send(stateChange('delete',2,'목록 정리'))).json();
  assert.equal(archived.action,'delete');
  assert.equal(archived.revision,3);
  assert.equal((await send({...note,expectedRevision:3,idempotencyKey:'archived-save'})).status,400);
  assert.equal((await send(stateChange('reopen',3,'원래 의견 복원'))).status,200);
  const history=await (await read('/events?release=MSG0585-R3&kind=comment&id=archive-comment')).json();
  assert.deepEqual(history.items.map(item=>item.action),['save','resolve','delete','reopen']);
});
test('anchor telemetry, role, approval and artifact remain distinct',async()=>{
  const anchor={id:'panel',instance:'second',x:.12,y:.34,viewport:{width:320,height:640},scale:1,scroll:[{id:'parent',x:121,y:145}],layers:['dialog','list'],artifactHash:target.artifactHash};
  const c={...event('point','pin'),id:'p',data:{...data('pin'),anchor}};
  assert.equal((await send({...c,data:{...c.data,anchor:{...anchor,fieldValue:'not permitted'}}})).status,400);
  assert.equal((await send(c)).status,200);
  const bad={...c,idempotencyKey:'price',kind:'review',data:{target,decision:'approved',price:1200}};assert.equal((await send(bad)).status,400);
  assert.equal((await send({...bad,data:{target:{...target,artifactHash:null},decision:'approved'}})).status,400);
  assert.equal((await send({...c,kind:'review',idempotencyKey:'review',data:{target,decision:'approved'}})).status,200);
  assert.equal((await read('/records?limit=-1&release=MSG0585-R3')).status,400);
});
test('unavailable database and missing legacy import are explicit; same draft may be retried',async()=>{
  const req={...event('offline-retry','kept draft'),id:'offline'};
  assert.equal((await send(req,{},{ORDER_QA_DB:null})).status,503);
  assert.equal((await send(req)).status,200);
  assert.equal((await read('/legacy?limit=40')).status,503);
});

test('backup is bounded to a frozen cursor while subsequent events continue',async()=>{
  const first=await (await read('/backup?release=MSG0585-R3&limit=1')).json();
  assert.equal(first.events.length,1);assert.ok(first.hasMore);
  const late={...event('later-backup','late'),id:'after-export'};
  assert.equal((await send(late)).status,200);
  const continuation=await (await read('/backup?release=MSG0585-R3&since='+first.nextCursor+'&until='+first.until)).json();
  assert.equal(continuation.hasMore,false);assert.equal(continuation.events.at(-1).cursor,first.until);
  assert.ok(continuation.events.every(x=>x.id!=='after-export'&&x.requestHash.length===64));
  const forged=await read('/backup?release=MSG0585-R3&until=999999999');assert.equal(forged.status,400);
});

test('verified role mutation receives the same signed session as the router',async()=>{
  db.exec(readFileSync(new URL('../migrations/0003_r3_roles.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0017_product_operations.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO r3_membership VALUES ('owner','BUYER','test-store','test-site',1)");
  const rolePost=async(token)=>handleIaRequest(new Request(origin+'/api/ia/r3-role',{method:'POST',
    headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-IA-CSRF':token},body:'{}'}),env);
  assert.equal((await rolePost('invalid')).status,403);
  const valid=await rolePost(session.csrf);
  assert.equal(valid.status,400);
  assert.equal((await valid.json()).error,'INVALID_INPUT');
});

test('replies attach to an existing comment at the same target and retain independent history',async()=>{
  const note={...event('thread-parent','부모 의견'),id:'thread-parent'};
  assert.equal((await send(note)).status,200);
  const reply={...event('thread-reply','답글'),id:'thread-reply',kind:'reply',
    data:{...data('답글'),parent:{origin:'current',id:note.id}}};
  const first=await (await send(reply)).json();
  assert.equal(first.revision,1);
  assert.equal((await (await send(reply)).json()).replayed,true);
  const edit={...reply,expectedRevision:1,idempotencyKey:'thread-edit',data:{...reply.data,body:'답글 정정'}};
  assert.equal((await send(edit)).status,200);
  assert.equal((await send({...edit,idempotencyKey:'stale-reply'})).status,409);
  assert.equal((await send({...edit,idempotencyKey:'wrong-parent',expectedRevision:2,data:{...reply.data,parent:{origin:'current',id:'fixture'}}})).status,400);
  const history=await (await read('/events?release=MSG0585-R3&kind=reply&id=thread-reply')).json();
  assert.deepEqual(history.items.map(row=>row.data.body),['답글','답글 정정']);
  const closed={...note,expectedRevision:1,idempotencyKey:'close-thread',action:'delete',reason:'QA 종료'};
  assert.equal((await send(closed)).status,200);
  const afterDelete=await send({...reply,id:'late',idempotencyKey:'reply-after-delete'});
  assert.equal(afterDelete.status,409);assert.equal((await afterDelete.json()).error,'REPLY_PARENT_UNAVAILABLE');
  const stillHere=await (await read('/records?release=MSG0585-R3&kind=reply&id=thread-reply')).json();
  assert.equal(stillHere.items[0].data.body,'답글 정정');
});
test('historical replies match the imported comment ID, screen and viewport',async()=>{
  const src='e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
  db.prepare('INSERT INTO qa_legacy_sources(sha256,original_bytes,chunk_count,record_count,normalization_version) VALUES(?,0,0,1,1)').run(src);
  db.prepare('INSERT INTO qa_legacy_records VALUES (?,?,?,?,?)').run(src,'login/empty/email/390','/records/fixture',1,JSON.stringify({comments:[{id:'legacy-1',body:'이전 의견',deleted:false},{id:'legacy-2',body:'삭제',deleted:true}]}));
  db.prepare('UPDATE qa_legacy_sources SET complete=1 WHERE sha256=?').run(src);
  const reply={...event('legacy-thread','답글'),id:'legacy-reply',kind:'reply',data:{...data('답글'),parent:{origin:'legacy',id:'legacy-1'}}};
  assert.equal((await send(reply)).status,200);
  const missing=await send({...reply,id:'legacy-other',idempotencyKey:'legacy-deleted',data:{...reply.data,parent:{origin:'legacy',id:'legacy-2'}}});
  assert.equal(missing.status,409);
});

test('screen memo is independently versioned, clearable and does not change the review verdict',async()=>{
  const memo=(body,rev,key)=>({...event(key,body,rev),kind:'screen',id:'memo-fixture'});
  assert.equal((await send(memo('매장별 확인 사항',0,'memo-first'))).status,200);
  const next=await send(memo('수정한 메모',1,'memo-current'));
  assert.equal((await next.json()).revision,2);
  const stale=await send(memo('먼저 읽은 탭의 메모',1,'memo-old-tab'));
  assert.equal(stale.status,409);assert.equal((await stale.json()).current.data.body,'수정한 메모');
  assert.equal((await send(memo('',2,'memo-clear'))).status,200);
  assert.equal((await send(memo('a'.repeat(8001),3,'memo-over-limit'))).status,400);
  const history=await (await read('/events?release=MSG0585-R3&kind=screen&id=memo-fixture')).json();
  assert.deepEqual(history.items.map(r=>r.data.body),['매장별 확인 사항','수정한 메모','']);
  assert.equal(db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind='review' AND id='memo-fixture'").get().n,0);
});

test('each earlier feedback item has independent unresolved, recheck and resolved revisions without changing original feedback or approval',async()=>{
  const original=db.prepare('SELECT payload FROM qa_legacy_records WHERE source_key=?').get('login/empty/email/390').payload;
  const approvals=db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind='review'").get().n;
  const feedback=(status,revision,key)=>({release:'MSG0585-R3',kind:'feedback',id:'legacy-feedback-state',expectedRevision:revision,idempotencyKey:key,
    data:{target,parent:{origin:'legacy',id:'legacy-1'},status}});
  assert.equal((await send(feedback('unresolved',0,'feedback-initial'))).status,200);
  assert.equal((await send(feedback('recheck',1,'feedback-recheck'))).status,200);
  assert.equal((await send(feedback('resolved',2,'feedback-resolved'))).status,200);
  const conflict=await send(feedback('unresolved',2,'feedback-stale'));
  assert.equal(conflict.status,409);assert.equal((await conflict.json()).current.data.status,'resolved');
  assert.equal((await send(feedback('unresolved',3,'feedback-reopen'))).status,200);
  const history=await (await read('/events?release=MSG0585-R3&kind=feedback&id=legacy-feedback-state')).json();
  assert.deepEqual(history.items.map(row=>[row.revision,row.data.status]),[[1,'unresolved'],[2,'recheck'],[3,'resolved'],[4,'unresolved']]);
  assert.equal(db.prepare('SELECT payload FROM qa_legacy_records WHERE source_key=?').get('login/empty/email/390').payload,original);
  assert.equal(db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind='review'").get().n,approvals);
  const missing=feedback('resolved',0,'feedback-wrong-source');missing.id='wrong-feedback';missing.data.parent.id='legacy-2';
  assert.equal((await send(missing)).status,409);
  assert.equal((await send({...missing,idempotencyKey:'feedback-invalid-status',data:{...missing.data,status:'approved'}})).status,400);
});

test('a prior artifact comment can be reviewed against the current screen without editing its old source or granting access to another screen',async()=>{
  const oldTarget={...target,artifactHash:'1'.repeat(64)};
  const oldBody=JSON.stringify({body:'이전 판에서 남긴 위치 의견',target:oldTarget});
  db.prepare(`INSERT INTO qa_review_events (release,kind,id,revision,data,action,reason,actor,request_key,request_hash) VALUES (?,?,?,?,?,'save','','owner',?,?)`)
    .run('MSG0585-R3','comment','old-artifact-comment',1,oldBody,'old-artifact-seed','0'.repeat(64));
  const row={release:'MSG0585-R3',kind:'feedback',id:'old-artifact-status',expectedRevision:0,idempotencyKey:'old-artifact-state',
    data:{target,parent:{origin:'current',id:'old-artifact-comment'},status:'resolved'}};
  assert.equal((await send(row)).status,200);
  const comment=db.prepare("SELECT data,revision FROM qa_review_events WHERE kind='comment' AND id='old-artifact-comment'").get();
  assert.equal(comment.data,oldBody);assert.equal(comment.revision,1);
  const other=await (await read('/artifact?id=login%2Ferror%2Femail&version=current&width=390')).json();
  const denied=await send({...row,id:'other-screen-status',idempotencyKey:'other-screen-status',data:{...row.data,target:{...target,state:'error',artifactHash:other.hash}}});
  assert.equal(denied.status,409);assert.equal((await denied.json()).error,'FEEDBACK_SOURCE_UNAVAILABLE');
  const changedParent=await send({...row,expectedRevision:1,idempotencyKey:'immutable-parent',data:{...row.data,parent:{origin:'current',id:'fixture'}}});
  assert.equal(changedParent.status,400);
});

test('late feedback cannot conceal a concurrent source reopen or resolve on the same artifact',async()=>{
  const source={...event('status-race-create','두 탭에서 검토한 의견'),id:'status-race-comment'};
  const change=(action,revision,key)=>send({...source,action,reason:'다른 탭에서 확인',expectedRevision:revision,idempotencyKey:key});
  const feedback=(status,revision,key)=>send({release:'MSG0585-R3',kind:'feedback',id:'status-race-feedback',
    expectedRevision:revision,idempotencyKey:key,data:{target,parent:{origin:'current',id:source.id},status}});
  assert.equal((await send(source)).status,200);
  assert.equal((await change('resolve',1,'status-race-a-resolve')).status,200);
  assert.equal((await change('reopen',2,'status-race-b-reopen')).status,200);
  assert.equal((await feedback('resolved',0,'status-race-a-late-feedback')).status,409);
  assert.equal(db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind='feedback' AND id='status-race-feedback'").get().n,0);
  let current=db.prepare("SELECT action,revision FROM qa_review_events WHERE kind='comment' AND id=? ORDER BY revision DESC LIMIT 1").get(source.id);
  assert.equal(current.action,'reopen');assert.equal(current.revision,3);
  assert((await (await read('/records?release=MSG0585-R3&unresolved=1')).json()).items.some(r=>r.id===source.id));

  assert.equal((await feedback('unresolved',0,'status-race-current-feedback')).status,200);
  assert.equal((await change('resolve',3,'status-race-c-resolve')).status,200);
  assert.equal((await feedback('recheck',1,'status-race-b-late-feedback')).status,409);
  const retained=db.prepare("SELECT revision,data FROM qa_review_events WHERE kind='feedback' AND id='status-race-feedback' ORDER BY revision DESC LIMIT 1").get();
  assert.equal(retained.revision,1);assert.equal(JSON.parse(retained.data).status,'unresolved');
  assert(!(await (await read('/records?release=MSG0585-R3&unresolved=1')).json()).items.some(r=>r.id===source.id));
  assert.equal((await feedback('resolved',1,'status-race-final-feedback')).status,200);
  current=db.prepare("SELECT action,revision FROM qa_review_events WHERE kind='comment' AND id=? ORDER BY revision DESC LIMIT 1").get(source.id);
  assert.equal(current.action,'resolve');assert.equal(current.revision,4);
});
