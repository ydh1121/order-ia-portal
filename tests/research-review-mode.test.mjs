import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import {handleR3Review} from '../src/server/r3-review-store.mjs';

const origin='https://order-ia-portal.pages.dev',rowId='q1/before/email',release='MSG0585-R3';
const readArtifact=parameters=>serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id:rowId,width:'390',version:'current',...parameters})));
const simple=await (await readArtifact({})).json(),detailed=await (await readArtifact({mode:'detailed'})).json();
const targetFor=artifact=>({screen:'q1',state:'before',variant:'email',viewport:390,artifactHash:artifact.hash,...(artifact.mode==='detailed'?{mode:'detailed'}:{})});
const anchorFor=target=>({id:'quantity',instance:target.screen,x:.3,y:.4,viewport:{width:390,height:844},scale:1,scroll:[],layers:[],artifactHash:target.artifactHash,...(target.mode==='detailed'?{mode:'detailed'}:{})});
const simpleTarget=targetFor(simple),detailedTarget=targetFor(detailed);
function store(t){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  const env={ORDER_QA_DB:{prepare(sql){return {bind(...args){const statement=db.prepare(sql);return {first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)}),run:async()=>({meta:statement.run(...args)})};}};}}};
  const invoke=(request,path)=>handleR3Review({request,path,env,actor:{id:'mode-reviewer'},checkTarget:isR3ReviewTarget});
  const post=body=>invoke(new Request(origin+'/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),'/records');
  const get=path=>invoke(new Request(origin+path),path.split('?')[0]);
  const event=(id,target,extra={},kind='comment')=>({release,kind,id,idempotencyKey:id,expectedRevision:0,data:{target,body:'모드별 위치 의견',anchor:anchorFor(target),...extra}});
  return {db,post,get,event};
}

test('artifact mode is explicit only for detailed, binds the hash and cannot relabel a simple or historical identity',async()=>{
  const explicit=await (await readArtifact({mode:'simple'})).json();
  assert.deepEqual(explicit,simple,'simple retains the default response bytes and object shape');
  assert.equal(Object.hasOwn(simple,'mode'),false);assert.equal(Object.hasOwn(simpleTarget,'mode'),false);
  const tuple=['order-research-application/v1',simple.application.build,rowId,390];
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(simple.hash,hash(tuple));assert.equal(detailed.hash,hash([...tuple,'detailed']));assert.notEqual(detailed.hash,simple.hash);
  assert.equal(detailed.mode,'detailed');assert.equal(new URL(detailed.application.url,origin).searchParams.get('mode'),'detailed');
  const config=JSON.parse(detailed.html.match(/id="order-app-config">([\s\S]*?)<\/script>/)[1]);assert.equal(config.initial.mode,'detailed');
  assert.equal(await isR3ReviewTarget(simpleTarget),true);assert.equal(await isR3ReviewTarget(detailedTarget),true);
  for(const target of [{...simpleTarget,mode:'detailed'},{...detailedTarget,mode:'simple'},{...detailedTarget,mode:undefined},{...simpleTarget,mode:null},{...simpleTarget,mode:'unknown'}])assert.equal(await isR3ReviewTarget(target),false);
  for(const mode of ['','unknown','Detailed'])assert.equal((await readArtifact({mode})).status,400);
  assert.equal((await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?id='+rowId+'&width=390&version=current&mode=simple&mode=detailed'))).status,400);
  for(const parameters of [{mode:'detailed',artifactHash:simple.hash},{artifactHash:detailed.hash},{mode:'simple',artifactHash:detailed.hash},{version:'recorded',artifactHash:detailed.hash}])assert.equal((await readArtifact(parameters)).status,404);
  const replay=await (await readArtifact({mode:'detailed',version:'recorded',artifactHash:detailed.hash})).json();
  assert.equal(replay.mode,'detailed');assert.equal(replay.hash,detailed.hash);
});

test('the detailed hash catalogue is separate and leaves the default simple catalogue unchanged',async()=>{
  const catalogue=async search=>{
    const response=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact'+search));assert.equal(response.status,200);return response.json();
  };
  const normal=await catalogue(''),explicit=await catalogue('?mode=simple'),detail=await catalogue('?mode=detailed');
  assert.deepEqual(explicit,normal);assert.equal(Object.hasOwn(normal,'mode'),false);assert.equal(detail.mode,'detailed');
  assert.ok(detail.items.length>0);assert.ok(detail.items.every(row=>row.application));
  assert.equal(normal.items.find(row=>row.id===rowId).hashes[390],simple.hash);
  assert.equal(detail.items.find(row=>row.id===rowId).hashes[390],detailed.hash);
  assert.ok(normal.items.filter(row=>row.application).every(row=>detail.items.some(item=>item.id===row.id)));
});

test('the native notification page is addressable and reviewable in the same catalogue as application navigation',async()=>{
  for(const mode of ['simple','detailed']){
    const list=await (await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact'+(mode==='detailed'?'?mode=detailed':'')))).json();
    const native=list.items.filter(row=>row.id==='notifications/list/email');
    assert.equal(native.length,1,'an app-owned notification route must be acknowledged by the QA host');
    const row=native[0];assert.equal(row.application,true);assert.equal(list.navigationDefaults.assignments.notifications,'mvp');
    for(const width of [390,1440]){
      const response=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id:row.id,width:String(width),version:'current',mode})));
      assert.equal(response.status,200);const artifact=await response.json();
      assert.equal(artifact.hash,row.hashes[width]);assert.equal(new URL(artifact.application.url,origin).searchParams.get('screen'),'notifications');
      const target={screen:'notifications',state:'list',variant:'email',viewport:width,artifactHash:artifact.hash,...(mode==='detailed'?{mode}:{})};
      assert.equal(await isR3ReviewTarget(target),true);
      assert.equal(await isR3ReviewTarget({...target,mode:mode==='simple'?'detailed':'simple'}),false);
    }
  }
});

test('detailed comments preserve mode in target and anchor through save and backup without rewriting old simple JSON',async t=>{
  const s=store(t),old=s.event('original-simple',simpleTarget),next=s.event('new-detailed',detailedTarget);
  assert.equal((await s.post(old)).status,200);const oldBytes=s.db.prepare('SELECT data FROM qa_review_events WHERE id=?').get(old.id).data;
  const saved=await (await s.post(next)).json();assert.deepEqual(saved.data,next.data);
  const backup=await (await s.get('/backup?release='+release)).json();
  assert.deepEqual(backup.events.find(row=>row.id===next.id).data,next.data);
  assert.deepEqual(backup.events.find(row=>row.id===old.id).data,old.data);
  assert.equal(s.db.prepare('SELECT data FROM qa_review_events WHERE id=?').get(old.id).data,oldBytes);
  assert.equal(Object.hasOwn(backup.events.find(row=>row.id===old.id).data.target,'mode'),false);
  const bad=[
    {...next.data,target:{...detailedTarget,mode:'simple'}},
    {...next.data,target:{...simpleTarget,mode:'detailed'}},
    {...next.data,target:{...detailedTarget,mode:null}},
    {...next.data,anchor:{...next.data.anchor,mode:'simple'}},
    {...next.data,anchor:{...next.data.anchor,mode:undefined}},
    {...old.data,anchor:{...old.data.anchor,mode:'detailed'}}
  ];
  for(const [index,data]of bad.entries())assert.equal((await s.post({...next,id:'invalid-'+index,idempotencyKey:'invalid-'+index,data})).status,400);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,2);
});

test('feedback, replies and rework cannot cross quote modes while same-mode processing remains available',async t=>{
  const s=store(t);assert.equal((await s.post(s.event('simple-comment',simpleTarget))).status,200);assert.equal((await s.post(s.event('detailed-comment',detailedTarget))).status,200);
  const follow=(id,kind,target,parent,extra={})=>({release,kind,id,idempotencyKey:id,expectedRevision:0,data:{target,parent:{origin:'current',id:parent},...(kind==='feedback'?{status:'recheck'}:{body:'이 모드에서 다시 검토'}),...extra}});
  const crossed=[
    follow('cross-detail-feedback','feedback',detailedTarget,'simple-comment'),
    follow('cross-simple-feedback','feedback',simpleTarget,'detailed-comment'),
    follow('cross-reply','reply',detailedTarget,'simple-comment'),
    follow('cross-rework','reply',detailedTarget,'simple-comment',{purpose:'rework',sourceArtifactHash:simple.hash})
  ];
  for(const event of crossed)assert.equal((await s.post(event)).status,409,event.id);
  for(const event of [follow('detail-feedback','feedback',detailedTarget,'detailed-comment'),follow('detail-reply','reply',detailedTarget,'detailed-comment'),follow('detail-rework','reply',detailedTarget,'detailed-comment',{purpose:'rework',sourceArtifactHash:detailed.hash}),follow('simple-feedback','feedback',simpleTarget,'simple-comment')])assert.equal((await s.post(event)).status,200,event.id);
  const legacy=follow('legacy-relabel','feedback',detailedTarget,'old-comment');legacy.data.parent.origin='legacy';assert.equal((await s.post(legacy)).status,400);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM qa_review_events').get().n,6);
});
