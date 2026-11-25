import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleR3Review} from '../src/server/r3-review-store.mjs';

const release='MSG0585-R3',sourceSha='e27b3a1ea210fbdad4e1a7a8cf7537619820bad5db7e6ccac7cd1d5aaa09d144';
const currentHash='c'.repeat(64),oldHash='a'.repeat(64);
const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:currentHash};
function fixture(t,comments=[],{includeActiveTarget,legacyKey='login/empty/email/390'}={}){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(readFileSync(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));
  const payload=JSON.stringify({status:'fix',comments,note:'보존할 원래 화면 메모'});
  db.prepare('INSERT INTO qa_legacy_sources(sha256,original_bytes,chunk_count,record_count,normalization_version) VALUES(?,0,0,1,1)').run(sourceSha);
  db.prepare('INSERT INTO qa_legacy_records VALUES(?,?,?,?,?)').run(sourceSha,legacyKey,'/records/original',1,payload);
  db.prepare('UPDATE qa_legacy_sources SET complete=1 WHERE sha256=?').run(sourceSha);
  const binding={prepare(sql){return {bind(...args){const statement=db.prepare(sql);return {
    first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)}),run:async()=>({meta:statement.run(...args)})
  };}};}};
  let request=0;
  const seed=(kind,id,data,{action='save',revision=1}={})=>Number(db.prepare(`INSERT INTO qa_review_events
    (release,kind,id,revision,action,reason,data,actor,request_key,request_hash) VALUES(?,?,?,?,?,'fixture',?,'owner',?,?)`)
    .run(release,kind,id,revision,action,JSON.stringify(data),'request-'+(++request),'0'.repeat(64)).lastInsertRowid);
  const read=async suffix=>{
    const url=new URL('https://qa.invalid'+suffix);
    return handleR3Review({request:new Request(url),env:{ORDER_QA_DB:binding},actor:{id:'owner'},path:url.pathname,currentArtifactHash:async()=>currentHash,includeActiveTarget});
  };
  const records=extra=>read('/records?release='+release+(extra||'')).then(response=>response.json());
  const originalRows=()=>db.prepare('SELECT * FROM qa_review_events ORDER BY cursor').all();
  return {db,seed,read,records,originalRows,payload};
}

test('default feedback responses omit resolved and archived bodies, replies and drafts; explicit history remains intact',async t=>{
  const h=fixture(t),closed={target,body:'해결한 원댓글 원문',anchor:{id:'retained-anchor'}};
  h.seed('comment','closed',closed,{action:'resolve'});
  h.seed('reply','closed-reply',{target,parent:{origin:'current',id:'closed'},body:'해결한 의견의 답글'});
  h.seed('draft','closed',{target,body:'해결한 의견의 임시저장'});
  h.seed('feedback','closed-feedback',{target,parent:{origin:'current',id:'closed'},status:'resolved'});
  h.seed('comment','archived',{target,body:'아카이브 원문'},{action:'delete'});
  h.seed('comment','active',{target,body:'남은 원댓글'});
  h.seed('review','screen-verdict',{target,decision:'unreviewed'});
  const before=h.originalRows(),active=await h.records();
  assert.deepEqual(active.items.map(row=>row.id),['active','screen-verdict']);
  assert.equal(active.scope,'active');assert.equal(active.until,7);assert.equal(active.nextCursor,7);
  assert.doesNotMatch(JSON.stringify(active),/해결한 원댓글|해결한 의견|아카이브 원문|retained-anchor/);
  const all=await h.records('&scope=all');assert.equal(all.items.length,7);
  assert.deepEqual(all.items.find(row=>row.id==='closed'&&row.kind==='comment').data,closed);
  const events=await (await h.read('/events?release='+release+'&kind=comment&id=closed')).json();
  assert.deepEqual(events.items[0].data,closed);
  const backup=await (await h.read('/backup?release='+release)).json();assert.equal(backup.events.length,7);
  assert.deepEqual(h.originalRows(),before,'read projections do not alter source bytes, state or history');
  assert.equal((await h.read('/records?release='+release+'&scope=unknown')).status,400);
});

test('retired screens leave the default queue while their unresolved records and original legacy bytes remain in explicit history',async t=>{
  const original={id:'legacy-retired',status:'open',body:'이전 화면의 미해결 원문'},retired={...target,screen:'quote-review',state:'normal'};
  const h=fixture(t,[original],{legacyKey:'quote-review/normal/email/390',includeActiveTarget:row=>row.screen!=='quote-review'});
  h.seed('comment','retired',{target:retired,body:'폐기된 화면의 미해결 원문'});
  h.seed('reply','retired-reply',{target:retired,parent:{origin:'current',id:'retired'},body:'원문에 연결된 지시'});
  h.seed('review','retired-review',{target:retired,decision:'changes_requested'});
  h.seed('comment','held-q1',{target:{...target,screen:'q1',state:'before'},body:'하이파이 이후 검토할 미해결 원문'});
  const before=h.originalRows();assert.deepEqual((await h.records()).items.map(row=>row.id),['held-q1']);
  const activeLegacy=await (await h.read('/legacy?release='+release)).json();assert.equal(activeLegacy.items.length,0);assert.equal(activeLegacy.nextCursor,1);
  const all=await h.records('&scope=all');assert.equal(all.items.length,4);assert.equal(all.items.find(row=>row.id==='retired').action,'save');
  const legacy=await (await h.read('/legacy?release='+release+'&scope=all')).json();assert.deepEqual(legacy.items[0].data.comments,[original]);
  assert.equal(h.db.prepare('SELECT payload FROM qa_legacy_records').get().payload,h.payload);assert.deepEqual(h.originalRows(),before);
});

test('current-artifact decisions retain precedence and an explicit recheck restores the original comment',async t=>{
  const h=fixture(t),source={target:{...target,artifactHash:oldHash},body:'이전 판 원문'},parent={origin:'current',id:'prior'};
  h.seed('comment','prior',source);
  h.seed('feedback','current-state',{target,parent,status:'unresolved'});
  h.seed('feedback','prior-state',{target:source.target,parent,status:'resolved'});
  h.seed('comment','prior',source,{action:'resolve',revision:2});
  assert((await h.records('&unresolved=1')).items.some(row=>row.id==='prior'),'an explicit current-artifact open state wins over a later old-artifact resolution');
  h.seed('feedback','current-state',{target,parent,status:'resolved'},{revision:2});
  assert(!(await h.records()).items.some(row=>row.id==='prior'));
  h.seed('feedback','current-state',{target,parent,status:'recheck'},{revision:3});
  assert.deepEqual((await h.records()).items.find(row=>row.id==='prior').data,source);
  h.seed('comment','prior',source,{action:'delete',revision:3});
  assert(!(await h.records()).items.some(row=>row.id==='prior'),'an archive remains out of the active queue until the original is explicitly reopened');
  h.seed('comment','prior',source,{action:'reopen',revision:4});
  assert.deepEqual((await h.records()).items.find(row=>row.id==='prior').data,source);
});

test('bounded pages advance across omitted rows and never mix a later resolution into an earlier snapshot',async t=>{
  const h=fixture(t),source={target,body:'스냅샷의 활성 원문'};
  h.seed('comment','already-resolved',{target,body:'과거 해결 원문'},{action:'resolve'});
  h.seed('comment','open',source);
  const first=await h.records('&limit=1');
  assert.equal(first.items.length,0);assert.equal(first.nextCursor,1);assert.equal(first.hasMore,true);assert.equal(first.until,2);
  h.seed('comment','open',source,{action:'resolve',revision:2});
  const frozen=await h.records('&limit=1&since='+first.nextCursor+'&until='+first.until);
  assert.equal(frozen.items[0].id,'open');assert.equal(frozen.items[0].revision,1);assert.equal(frozen.until,2);
  assert.equal((await h.records()).items.length,0,'a fresh snapshot removes both terminal comments');
  assert.equal((await h.read('/records?release='+release+'&until=99999')).status,400);
  assert.equal((await h.read('/records?release='+release+'&since=3&until=2')).status,400);
});

test('legacy active projection excludes resolved threads while retaining original payload and explicit archive retrieval',async t=>{
  const comments=[
    {id:'legacy-resolved',body:'이전 해결 원문',status:'resolved',anchor:{path:'input',x:.2,y:.5},replies:[{body:'이전 답글'}]},
    {id:'legacy-accepted',body:'추가 승인 원문',status:'open'},
    {id:'legacy-open',body:'남은 이전 의견',status:'open'},
    {id:'legacy-deleted',body:'이전 삭제 원문',deleted:true}
  ];
  const h=fixture(t,comments),parent={origin:'legacy',id:'legacy-accepted'};
  h.seed('feedback','accepted',{target,parent,status:'resolved'});
  h.seed('reply','legacy-reply',{target,parent,body:'승인 의견의 재작업 답글'});
  h.seed('change','legacy-change',{target,sourceCommentId:'legacy-accepted',status:'verified',evidenceRef:'fixture'});
  const before=h.originalRows(),response=await (await h.read('/legacy?release='+release)).json();
  assert.deepEqual(response.items[0].data.comments,[comments[2]]);assert.equal(response.items[0].data.inactiveCommentsOmitted,true);
  assert.equal(response.items[0].data.note,'보존할 원래 화면 메모');
  assert.equal((await h.records()).items.length,0);
  const all=await (await h.read('/legacy?release='+release+'&scope=all')).json();
  assert.equal(JSON.stringify(all.items[0].data),h.payload);
  assert.equal(h.db.prepare('SELECT payload FROM qa_legacy_records').get().payload,h.payload);
  assert.deepEqual(h.originalRows(),before);
  h.seed('feedback','accepted',{target,parent,status:'recheck'},{revision:2});
  const reopened=await (await h.read('/legacy?release='+release)).json();
  assert.deepEqual(reopened.items[0].data.comments,[comments[1],comments[2]]);
});
