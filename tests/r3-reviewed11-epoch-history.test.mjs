import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readReviewedEpochArtifact,isReviewedEpochTarget,reviewedEpochsMetadata} from '../src/server/r3-qa-epoch-history.mjs';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';
import {handleR3Review} from '../src/server/r3-review-store.mjs';

const capture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/reviewed-a36b41e2.capture.json.gz',import.meta.url))));
const commit='a36b41e24f9c0b22672b61bab59b2ec39354a613';
const tree='ec135534b72c36c6db7a147b318207e65b5c043d';
const oldRuntime='1b0eee5bfc0766dc6ab7b016e87fb91d66c0429cf629e3083593a160da56a049';
const hash=value=>createHash('sha256').update(value).digest('hex');
const origin='https://order-ia-portal.pages.dev';
const targetFor=(row,width)=>({screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:row.hashes[width]});

test('all release11 QA targets retain their exact issued identity after the shared runtime changes',async()=>{
    const metadata=reviewedEpochsMetadata.find(epoch=>epoch.commit===commit);
    assert.ok(metadata);
    assert.equal(metadata.tree,tree);
    assert.equal(metadata.indexSha256,capture.indexSha256);
    assert.equal(metadata.fragmentsSha256,capture.fragmentsSha256);
    assert.deepEqual(metadata.sourceFiles,capture.sourceFiles);
    assert.equal(capture.rowCount,550);
    assert.equal(capture.recordCount,11000);
    assert.deepEqual(capture.widths,[320,360,375,390,430,768,1024,1280,1440,1920]);
    for(const row of capture.inventory)for(const width of capture.widths){
        const target=targetFor(row,width);
        assert.equal(await isReviewedEpochTarget(target,capture.release),true,row.id+' '+width);
        assert.equal(await isR3ReviewTarget(target,capture.release),true,row.id+' '+width+' public write validation');
    }
    const row=capture.inventory.find(row=>row.id==='onboarding/guest-1/email'),target=targetFor(row,390);
    assert.equal(target.artifactHash,'0efd04c10052280a58f175bfbd23603c63b80ed93515f617fdc7e69746119b0b');
    for(const change of [{screen:'login'},{state:'guest-2'},{variant:'compact'},{viewport:320},{artifactHash:'f'.repeat(64)}]){
        assert.equal(await isR3ReviewTarget({...target,...change},capture.release),false,JSON.stringify(change));
    }
    assert.equal(await isR3ReviewTarget(target,'another-release'),false);
});

test('recorded release11 routes return captured response bytes and their old runtime at every approved width',async()=>{
    const ids=['login/empty/email','onboarding/guest-1/email','onboarding/company/email','business/empty/email','receipt/before/email','admin-billing/draft/email','price-workspace/consumer-products/email'];
    for(const id of ids){
        const row=capture.inventory.find(row=>row.id===id);assert.ok(row,id);
        for(const width of capture.widths){
            const digest=row.hashes[width],key=[id,width,digest].join('|');
            const saved=await readReviewedEpochArtifact(id,width,digest);assert.ok(saved,key);
            assert.equal(saved.archivedSource.commit,commit);
            assert.equal(saved.archivedSource.tree,tree);
            assert.equal(hash(JSON.stringify(saved.artifact)),capture.captures[key],key+' captured response');
            assert.equal(hash(saved.artifact.editable),saved.artifact.exportHash);
            const response=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:String(width),version:'recorded',artifactHash:digest})),{});
            assert.equal(response.status,200,key);
            const value=await response.json();
            const original=Object.fromEntries(Object.keys(saved.artifact).map(name=>[name,value[name]]));
            assert.equal(hash(JSON.stringify(original)),capture.captures[key],key+' served response');
            assert.equal(value.replayFrame,saved.replayFrame);
            assert.deepEqual(value.archivedSource,saved.archivedSource);
            assert.equal(value.source.runtimeDigest,oldRuntime);
        }
    }
    const row=capture.inventory.find(row=>row.id==='onboarding/guest-1/email');
    const missing=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id:row.id,width:'390',version:'recorded',artifactHash:'f'.repeat(64)})),{});
    assert.equal(missing.status,404,'unknown hashes are never remapped to a current frame');
});

test('an already open release11 screen can save rework without changing its source or accepting unknown targets',async t=>{
    const db=new DatabaseSync(':memory:');t.after(()=>db.close());
    db.exec(await readFile(new URL('../migrations/0001_r3_qa.sql',import.meta.url),'utf8'));
    const binding={prepare(sql){return{bind(...args){const statement=db.prepare(sql);return{
        first:async()=>statement.get(...args),all:async()=>({results:statement.all(...args)}),run:async()=>({meta:statement.run(...args)})
    };}};}};
    const send=body=>handleR3Review({request:new Request(origin+'/api/ia/r3-qa/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),env:{ORDER_QA_DB:binding},actor:{id:'archive-regression'},path:'/records',checkTarget:isR3ReviewTarget});
    const row=capture.inventory.find(row=>row.id==='onboarding/guest-1/email'),target=targetFor(row,390);
    const original={release:capture.release,kind:'comment',id:'release11-original',expectedRevision:0,idempotencyKey:'release11-original',data:{target,body:'원래 화면의 의견'}};
    assert.equal((await send(original)).status,200);
    const before=db.prepare("SELECT * FROM qa_review_events WHERE kind='comment'").get();
    const instruction={release:capture.release,kind:'reply',id:'release11-rework',expectedRevision:0,idempotencyKey:'release11-rework',data:{target,body:'이 화면의 원문을 유지하고 다시 확인해 주세요.',parent:{origin:'current',id:original.id},purpose:'rework',sourceArtifactHash:target.artifactHash}};
    const saved=await send(instruction);assert.equal(saved.status,200);
    const receipt=await saved.json();assert.equal(receipt.revision,1);assert.deepEqual(receipt.data,instruction.data);
    const repeated=await (await send(instruction)).json();assert.equal(repeated.replayed,true);assert.equal(repeated.cursor,receipt.cursor);
    assert.deepEqual(db.prepare("SELECT * FROM qa_review_events WHERE kind='comment'").get(),before);
    assert.equal(db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind IN ('review','feedback')").get().n,0);
    const unknown=await send({...instruction,id:'unknown-source',idempotencyKey:'unknown-source',data:{...instruction.data,target:{...target,artifactHash:'f'.repeat(64)}}});
    assert.equal(unknown.status,400);assert.equal((await unknown.json()).error,'REVIEW_TARGET_UNAVAILABLE');
    const malformed=await send({...instruction,id:'invalid-target',idempotencyKey:'invalid-target',data:{...instruction.data,target:{...target,viewport:'390'}}});
    assert.equal(malformed.status,400);assert.equal((await malformed.json()).error,'INVALID_REVIEW_REQUEST');
    const currentResponse=await serveR3Artifact(new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams({id:row.id,width:'390',version:'current'})),{});
    const current=await currentResponse.json();assert.notEqual(current.hash,target.artifactHash);
    const moved=await send({...instruction,expectedRevision:1,idempotencyKey:'rewrite-stored-target',data:{...instruction.data,target:{...target,artifactHash:current.hash}}});
    assert.equal(moved.status,400);assert.equal((await moved.json()).error,'INVALID_REVIEW_REQUEST','saved rework targets remain immutable');
    assert.equal(db.prepare("SELECT count(*) AS n FROM qa_review_events WHERE kind='reply'").get().n,1);
});
