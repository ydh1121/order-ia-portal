import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {catalog} from '../src/server/r3-ui/catalog.gen.mjs';
import {archivedRows,stageRows} from '../src/server/r3-ui/motion-history.gen.mjs';
import {approvedHash} from '../src/server/r3-ui/approved-width.mjs';
const url='https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact';
async function artifact(row,version='current',hash,width=390){
  const query=new URLSearchParams({id:row.id,width:String(width),version});
  if(hash)query.set('artifactHash',hash);
  const result=await serveR3Artifact(new Request(url+'?'+query));
  assert.equal(result.status,200,row.id);return result.json();
}
test('materialized service resolves all 171 admin and 5 common states to isolated executable controls',async()=>{
  const subjects=catalog.filter(r=>r.role==='admin'||r.screen==='common');
  assert.equal(subjects.length,176);
  for(const row of subjects){
    const result=await artifact(row);
    assert.ok(['adminCommon','adminLoading'].includes(row.runtimeFamily));
    assert.match(result.mount,/function mountReviewControls/);
    assert.doesNotMatch(result.mount,/1,284,000|1,119,000|12,540,000|\/api\/|\bfetch\s*\(/);
    assert.doesNotMatch(result.editable,/<iframe|<script(?! type="application\/json")/);
    assert.equal(result.replayFrame,undefined);
  }
});
test('the preceding direct loading URLs still replay their own reviewed control',async()=>{
  assert.equal(Object.keys(stageRows).length,4);
  for(const [id,entry] of Object.entries(stageRows)){
    const row=catalog.find(r=>r.id===id),previous=await artifact(row,'recorded',entry.hashes[390]);
    assert.equal(previous.hash,entry.hashes[390]);assert.match(previous.mount,/mountReviewControls/);
    assert.doesNotMatch(previous.mount,/function mountSelectedLoading/);
    assert.match((await artifact(row)).mount,/function mountSelectedLoading/);
  }
});
test('pins from deployed 0624ca1 replay the original common and quote frames',async()=>{
  const digest=text=>createHash('sha256').update(text).digest('hex');
  // Captured from the signed release at 390px and the approved Figma width.
  const examples=[
    ['common/default/email',390,'bf63e07135ea9377c6bf94050f27d543b7b0a52ae58fb4806d96c9277d4cdbe7','86a443836f694fb5b37aad1ca705003e00391a4f9c83f9374a75ecba22b91b9a','bcc7580454464867790f85f751e039e667fd5827bdaa42977512cbc2c44bfe24'],
    ['quote-result/new-detail/email',375,'ba7ce59d573855bdfba22fc95b54b3bd3c32b36c7e39328dac36ca7b0587fa9f','89e3bf2b8fb05f2296e859b2f1031489507e8d9e3313584d7ff953fec523cfe4','c60c88fc2c6201a3d0ae1ede0835baf10615a305bac1daca79f4e91dc2cc9fe4']
  ];
  for(const [id,width,hash,html,mount] of examples){
    const snapshot=await artifact(catalog.find(row=>row.id===id),'recorded',hash,width);
    assert.equal(snapshot.hash,hash);assert.equal(snapshot.version,'prior-r3');
    assert.equal(digest(snapshot.html),html);assert.equal(digest(snapshot.mount),mount);
    assert.equal(digest(snapshot.replayFrame),'5cded9efd5ab80635ae1cd5af677be5c3272a8fe124bd197815bc2903b84aa61');
  }
});
test('pre-motion recorded viewport and prior comparison replay its original frame and mount',async()=>{
  for(const id of ['admin-overview/normal/email','common/error/email','quote-result/current-detail/email','signup/empty/email']){
    const row=catalog.find(r=>r.id===id);
    for(const width of [375,1440]){
      const historical=await approvedHash(archivedRows[id],width,'current');
      const result=await artifact(row,'recorded',historical,width);
      assert.equal(result.hash,historical);
      assert.equal(result.version,'prior-r3');
      assert.match(result.replayFrame,/demoSuccess:\(_button,done\)=>done\?\.\(\)/);
      if(row.role==='admin'||row.screen==='common')assert.equal(result.mount,null);
      assert.notEqual((await artifact(row,'current',undefined,width)).hash,historical);
    }
  }
});
