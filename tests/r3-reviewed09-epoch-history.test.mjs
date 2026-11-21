import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readReviewedEpochArtifact,readReviewedEpochBody,isReviewedEpochTarget,reviewedEpochsMetadata} from '../src/server/r3-qa-epoch-history.mjs';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';

const capture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/reviewed-af5ece3e.capture.json.gz',import.meta.url))));
const targets=JSON.parse(await readFile(new URL('./fixtures/review-targets-09-through450.json',import.meta.url),'utf8'));
const digest=value=>createHash('sha256').update(value).digest('hex');
const request=target=>new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({
  id:[target.screen,target.state,target.variant].join('/'),width:String(target.viewport),version:'recorded',artifactHash:target.artifactHash
}));

test('release09 guest/company source and fixtures remain byte-identical at every approved width',async()=>{
  const metadata=reviewedEpochsMetadata.find(epoch=>epoch.commit==='af5ece3e75bfb3cf723a5cab80a3f486aa9e8c11');
  assert.ok(metadata);assert.equal(metadata.tree,'e0ce7b6bfb18e351727230111f89030906c75baa');
  assert.equal(metadata.indexSha256,capture.indexSha256);
  for(const id of ['onboarding/guest-1/email','onboarding/company/email']){
    const row=capture.inventory.find(row=>row.id===id);assert.ok(row);
    for(const width of capture.widths){
      const hash=row.hashes[width],saved=await readReviewedEpochArtifact(id,width,hash);
      assert.ok(saved,id+' '+width);
      assert.equal(digest(JSON.stringify(saved.artifact)),capture.captures[[id,width,hash].join('|')]);
      assert.equal(saved.archivedSource.commit,metadata.commit);
      assert.equal(saved.artifact.fixture.authenticated,false);
      assert.ok(saved.replayFrame);
    }
  }
});

test('actual450-cutoff reviewed identities remain pinned without mutating target input or borrowing a new hash',async()=>{
  assert.equal(targets.cutoff,450);assert.equal(targets.targets.length,2);
  const before=JSON.stringify(targets);
  for(const item of targets.targets){
    const target=item.target,id=[target.screen,target.state,target.variant].join('/');
    assert.equal(await isReviewedEpochTarget(target,item.release),true);
    assert.equal(await isR3ReviewTarget(target,item.release),true);
    const response=await serveR3Artifact(request(target),{});assert.equal(response.status,200);
    const value=await response.json(),saved=await readReviewedEpochArtifact(id,target.viewport,target.artifactHash);
    assert.equal(value.hash,target.artifactHash);
    assert.equal(value.archivedSource.commit,'af5ece3e75bfb3cf723a5cab80a3f486aa9e8c11');
    const original=Object.fromEntries(Object.keys(saved.artifact).map(name=>[name,value[name]]));
    const expected=capture.targetChecks.find(row=>JSON.stringify(row.target)===JSON.stringify(target));
    assert.ok(expected);assert.equal(digest(JSON.stringify(original)),expected.sha256);
    assert.equal(await isReviewedEpochTarget({...target,artifactHash:'f'.repeat(64)},item.release),false);
  }
  assert.equal(JSON.stringify(targets),before);
});

test('release09 library source and return routes survive regeneration of current asset usages',async()=>{
  const assets=['dialog','header-logo','footer-logo','logo-menu','pass-floating','footer','brand-motion','intro-art'];
  for(const asset of assets){
    const id='component-library/asset-'+asset+'/email',row=capture.inventory.find(row=>row.id===id);
    assert.ok(row,id);
    for(const width of [390,1280]){
      const hash=row.hashes[width],saved=await readReviewedEpochArtifact(id,width,hash);
      assert.ok(saved,id+' '+width);
      const response=await serveR3Artifact(request({screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:hash}),{});
      assert.equal(response.status,200);
      const value=await response.json(),original=Object.fromEntries(Object.keys(saved.artifact).map(name=>[name,value[name]]));
      assert.equal(digest(JSON.stringify(original)),capture.captures[[id,width,hash].join('|')],id+' preserves the entire recorded response');
      assert.equal(value.hash,hash);
      const context=JSON.parse(value.mount.match(/window\.ORDER_LIBRARY_SOURCE=(\{[^\n]+\});\n/)[1]);
      const body=await readReviewedEpochBody(context.source);
      assert.ok(body,context.source);assert.equal(digest(body),context.source);
      assert.ok(value.html.includes(body.replace('id="order-single"','id="order-component-source" data-component-source')),id+' keeps its original source frame');
      assert.match(value.html,/data-qa-go="component-library" data-qa-state="[^"]+"/,id+' keeps the board return route');
      assert.match(value.html,/data-qa-go="onboarding" data-qa-state="[^"]+" data-source-usage="onboarding\/[^"]+\/email"/,id+' keeps source-use routes');
      if(asset==='intro-art')assert.equal(context.source,'3db29129868e9b35c01967e85b0ae3be6c5af43f54d955a05046fe1e68332d2e');
    }
  }
});
