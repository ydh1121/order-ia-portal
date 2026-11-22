import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {handleIaRequest} from '../src/server/router.mjs';
import {deriveVerifier,issueSession} from '../src/server/owner-session.mjs';
import {isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import {productBuild} from '../src/server/product-build.gen.mjs';

const origin='https://order-ia-portal.pages.dev',release='MSG0585-R3';
const base=origin+'/api/ia/r3-qa',oldHash='a'.repeat(64);
const verifier=deriveVerifier(randomBytes(24).toString('hex'));
const target={screen:'live-store-purchase',state:'running',variant:'buyer',viewport:390,artifactHash:oldHash};

// Use the same real SQLite/D1-shaped binding and signed router as the review
// store suite. Only the previously issued event is seeded: its old application
// digest is deliberately absent from today's product-build target allowlist.
async function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const file of ['0001_r3_qa.sql','0013_owner_session_revocations.sql'])
    db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const binding={prepare(query){return {bind(...args){const statement=db.prepare(query);return {
    first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)}),
    run:async()=>({meta:statement.run(...args)})};}};}};
  const env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'feedback-owner@example.invalid',
    IA_OWNER_PASSWORD_VERIFIER:await verifier,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),ORDER_QA_DB:binding};
  const session=await issueSession(env),cookie=session.cookie.split(';')[0];
  const send=body=>handleIaRequest(new Request(base+'/records',{method:'POST',
    headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-IA-CSRF':session.csrf},body:JSON.stringify(body)}),env);
  const history=async(kind,id)=>{
    const response=await handleIaRequest(new Request(base+'/events?'+new URLSearchParams({release,kind,id}),{headers:{Cookie:cookie}}),env);
    assert.equal(response.status,200);return (await response.json()).items;
  };
  const original={target,body:'원문: 다음 빌드에서도 이 위치 의견과 판정을 보존해 주세요.',
    sourceKey:'lab/'+'1'.repeat(32)+'/store-purchase',anchor:{id:'live-price',instance:'product',x:.4,y:.6,
      viewport:{width:390,height:844},scale:1,scroll:[{id:'document',x:0,y:180}],layers:[],artifactHash:oldHash}};
  const savedBytes=JSON.stringify(original),id='previous-build-comment';
  db.prepare(`INSERT INTO qa_review_events(release,kind,id,revision,data,action,reason,actor,request_key,request_hash)
    VALUES (?,'comment',?,1,?,'save','','owner','previous-build-import',?)`).run(release,id,savedBytes,'0'.repeat(64));
  assert.notEqual(oldHash,productBuild.digest);
  assert.equal(await isR3ReviewTarget(target,release),false,'the current build no longer accepts this old target as a new review');
  assert.equal(await isR3ReviewTarget({...target,artifactHash:productBuild.digest},release),true);
  const record=(kind,recordId,data,expectedRevision=0)=>({release,kind,id:recordId,data,expectedRevision,idempotencyKey:crypto.randomUUID()});
  const comment=(action,revision)=>({...record('comment',id,original,revision),action,reason:'다음 빌드에서 '+action});
  const feedback=(status,revision=0)=>record('feedback','previous-build-feedback',{target,parent:{origin:'current',id},status},revision);
  const reply=(body='이전 원문에 대한 답글',revision=0)=>record('reply','previous-build-reply',{target,parent:{origin:'current',id},body},revision);
  const count=()=>db.prepare('SELECT count(*) n FROM qa_review_events').get().n;
  const assertOriginal=()=>assert.equal(db.prepare("SELECT data FROM qa_review_events WHERE kind='comment' AND id=? AND revision=1").get(id).data,savedBytes);
  return {db,send,history,id,original,record,comment,feedback,reply,count,assertOriginal};
}

async function accepted(f,body){
  const response=await f.send(body);assert.equal(response.status,200,await response.clone().text());return response.json();
}
async function rejectedWithoutWrite(f,body,status,error){
  const before=f.count(),response=await f.send(body);assert.equal(response.status,status,await response.clone().text());
  if(error)assert.equal((await response.json()).error,error);
  assert.equal(f.count(),before,'rejected historical writes must not append any event');f.assertOriginal();
}

test('a stored live comment survives a new build with append-only resolve/reopen, replies and feedback revisions',async t=>{
  const f=await fixture(t),resolve=f.comment('resolve',1);
  const resolved=await accepted(f,resolve);assert.equal(resolved.revision,2);assert.deepEqual(resolved.data,f.original);
  const retry=await accepted(f,resolve);assert.equal(retry.replayed,true);assert.equal(retry.cursor,resolved.cursor);
  await accepted(f,f.feedback('resolved'));
  await accepted(f,f.comment('reopen',2));
  await accepted(f,f.feedback('recheck',1));
  await accepted(f,f.reply());
  await accepted(f,f.reply('새 빌드에서 확인한 답글 정정',1));
  const comments=await f.history('comment',f.id);
  assert.deepEqual(comments.map(row=>[row.revision,row.action]),[[1,'save'],[2,'resolve'],[3,'reopen']]);
  assert.ok(comments.every(row=>JSON.stringify(row.data)===JSON.stringify(f.original)),'all state changes retain the source body, point and old build digest');
  assert.deepEqual((await f.history('feedback','previous-build-feedback')).map(row=>[row.revision,row.data.status]),[[1,'resolved'],[2,'recheck']]);
  assert.deepEqual((await f.history('reply','previous-build-reply')).map(row=>[row.revision,row.data.body]),[[1,'이전 원문에 대한 답글'],[2,'새 빌드에서 확인한 답글 정정']]);
  assert.equal(f.db.prepare("SELECT count(*) n FROM qa_review_events WHERE kind='review'").get().n,0,'feedback must not create a screen approval');
  f.assertOriginal();
});

test('an existing old digest does not authorize new comments, arbitrary old hashes or altered source identities',async t=>{
  const f=await fixture(t),invalid='REVIEW_TARGET_UNAVAILABLE';
  // Even a known old digest belongs to its existing event, not to a new comment.
  await rejectedWithoutWrite(f,f.record('comment','new-on-old',{target,body:'새 의견'}),400,invalid);
  await rejectedWithoutWrite(f,f.record('comment','unknown-old',{target:{...target,artifactHash:'b'.repeat(64)},body:'임의 과거 해시'}),400,invalid);
  await rejectedWithoutWrite(f,f.record('review','old-approval',{target,decision:'approved'}),400,invalid);
  for(const altered of [
    {artifactHash:'b'.repeat(64)},{screen:'live-delivery-request'},{state:'other'},
    {variant:'operator'},{viewport:375}
  ]){
    const row=f.reply();row.id=crypto.randomUUID();row.data.target={...target,...altered};
    await rejectedWithoutWrite(f,row,400,invalid);
  }
  const missing=f.feedback('unresolved');missing.data.parent.id='missing-comment';
  await rejectedWithoutWrite(f,missing,400,invalid);
  const foreignRelease=f.reply();foreignRelease.release='OTHER-RELEASE';
  await rejectedWithoutWrite(f,foreignRelease,400,invalid);
  // The real current build remains writable; this is not an all-requests-denied test.
  const current=await accepted(f,f.record('comment','new-current',{target:{...target,artifactHash:productBuild.digest},body:'현재 빌드의 새 의견'}));
  assert.equal(current.revision,1);f.assertOriginal();
});

test('historical fallback retains optimistic revisions and cannot conceal a concurrent source status change',async t=>{
  const f=await fixture(t);
  await accepted(f,f.feedback('unresolved'));
  await accepted(f,f.comment('resolve',1));
  await rejectedWithoutWrite(f,f.feedback('recheck',1),409,'REVISION_CONFLICT');
  await accepted(f,f.feedback('resolved',1));
  await accepted(f,f.comment('reopen',2));
  await rejectedWithoutWrite(f,f.feedback('resolved',2),409,'REVISION_CONFLICT');
  await accepted(f,f.feedback('unresolved',2));
  await rejectedWithoutWrite(f,f.comment('resolve',1),409,'REVISION_CONFLICT');
  await rejectedWithoutWrite(f,f.feedback('recheck',1),409,'REVISION_CONFLICT');
  const comments=await f.history('comment',f.id),feedback=await f.history('feedback','previous-build-feedback');
  assert.equal(comments.at(-1).action,'reopen');assert.equal(comments.at(-1).revision,3);
  assert.equal(feedback.at(-1).data.status,'unresolved');assert.equal(feedback.at(-1).revision,3);
  // A valid current hash cannot silently rewrite the old source identity either.
  const changed=f.record('comment',f.id,{...f.original,target:{...target,artifactHash:productBuild.digest},anchor:{...f.original.anchor,artifactHash:productBuild.digest}},3);
  await rejectedWithoutWrite(f,changed,400,'INVALID_REVIEW_REQUEST');
});

test('old-hash replies and feedback still require a live parent and immutable parent attachment',async t=>{
  const f=await fixture(t);
  await accepted(f,f.reply());
  const reparent=f.reply('부모를 바꾸려는 정정',1);reparent.data.parent.id='different-comment';
  await rejectedWithoutWrite(f,reparent,400,'INVALID_REVIEW_REQUEST');
  await accepted(f,f.comment('resolve',1));
  const resolvedReply=f.reply();resolvedReply.id='reply-after-resolve';
  await rejectedWithoutWrite(f,resolvedReply,409,'REPLY_PARENT_UNAVAILABLE');
  await accepted(f,f.comment('delete',2));
  const deletedReply=f.reply();deletedReply.id='reply-after-delete';
  await rejectedWithoutWrite(f,deletedReply,409,'REPLY_PARENT_UNAVAILABLE');
  await rejectedWithoutWrite(f,f.feedback('resolved'),409,'FEEDBACK_SOURCE_UNAVAILABLE');
  assert.equal((await f.history('reply','previous-build-reply'))[0].data.body,'이전 원문에 대한 답글');
  assert.deepEqual((await f.history('comment',f.id)).map(row=>row.action),['save','resolve','delete']);
  f.assertOriginal();
});
