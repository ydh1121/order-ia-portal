import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readReviewedEpochArtifact,readReviewedEpochBody,isReviewedEpochTarget,reviewedEpochsMetadata} from '../src/server/r3-qa-epoch-history.mjs';
import {epochIndexGzip} from '../src/server/r3-ui/r3-e5f97029-history.gen.mjs';
import {archivedBodies} from '../src/server/r3-ui/interaction-history.gen.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
const capture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/reviewed-e5f97029.capture.json.gz',import.meta.url))));
const delta=JSON.parse(gunzipSync(Buffer.from(epochIndexGzip,'base64')));
const hash=value=>createHash('sha256').update(value).digest('hex');

test('release10 delta preserves every patch shape, both document forms and original complete response digests',async()=>{
 const metadata=reviewedEpochsMetadata.find(x=>x.commit==='e5f97029b58d1f1d90bb910bebfed7237e84e2bb');assert.ok(metadata);assert.equal(metadata.indexSha256,capture.indexSha256);assert.equal(metadata.recordCount,11000);
 const representatives=new Map();for(const [key,[,patch]] of Object.entries(delta.records))if(!representatives.has(patch))representatives.set(patch,key);
 assert.equal(representatives.size,delta.patches.length);
 for(const key of representatives.values()){
  const [id,width,digest]=key.split('|'),saved=await readReviewedEpochArtifact(id,Number(width),digest);assert.ok(saved,key);
  assert.equal(hash(JSON.stringify(saved.artifact)),capture.captures[key],key+' full response');assert.equal(hash(saved.artifact.editable),saved.artifact.exportHash);
 }
 for(const [key] of Object.entries(delta.records)){
  const [id,width,artifactHash]=key.split('|'),[screen,state,variant]=id.split('/');
  assert.equal(await isReviewedEpochTarget({screen,state,variant,viewport:Number(width),artifactHash},capture.release),true,key);
 }
});
test('the release10 current company and transaction screens resolve pinned identities at every width without current runtime substitution',async()=>{
 for(const id of ['onboarding/company/email','business/empty/email','signature/empty/email','receipt/before/email','admin-billing/draft/email']){
  const row=capture.inventory.find(x=>x.id===id);assert.ok(row,id);
  for(const width of capture.widths){
   const digest=row.hashes[width],saved=await readReviewedEpochArtifact(id,width,digest);assert.ok(saved);
   const response=await serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:String(width),version:'recorded',artifactHash:digest})),{});assert.equal(response.status,200);
   const value=await response.json(),original=Object.fromEntries(Object.keys(saved.artifact).map(k=>[k,value[k]]));
   assert.equal(hash(JSON.stringify(original)),hash(JSON.stringify(saved.artifact)));assert.equal(value.hash,digest);
  }
 }
});
test('all original interaction body bytes and new release10 bodies survive storage deduplication',async()=>{
 for(const [digest,packed] of Object.entries(archivedBodies))assert.equal(await readReviewedEpochBody(digest),gunzipSync(Buffer.from(packed,'base64')).toString(),digest);
 for(const digest of Object.keys(delta.bodies))assert.equal(hash(await readReviewedEpochBody(digest)),digest);
 assert.equal(await readReviewedEpochBody('f'.repeat(64)),null);
});
