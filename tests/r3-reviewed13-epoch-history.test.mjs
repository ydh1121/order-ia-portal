import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as r1 from '../src/server/r3-ui/r1-e8e12588-history.gen.mjs';
import * as af5 from '../src/server/r3-ui/r3-af5ece3e-history.gen.mjs';
import * as e5 from '../src/server/r3-ui/r3-e5f97029-history.gen.mjs';
import * as a36 from '../src/server/r3-ui/r3-a36b41e2-history.gen.mjs';
import * as successor from '../src/server/r3-ui/r3-7da1ad50-history.gen.mjs';
import {createReviewedEpochReader,readReviewedEpochArtifact,readReviewedEpochBody,isReviewedEpochTarget,reviewedEpochsMetadata} from '../src/server/r3-qa-epoch-history.mjs';
import {serveR3Artifact,isR3ReviewTarget} from '../src/server/r3-qa-page.mjs';

const readFixture=async name=>JSON.parse(gunzipSync(await readFile(new URL('./fixtures/'+name,import.meta.url))));
const capture=await readFixture('reviewed-7da1ad50.capture.json.gz'),structures=await readFixture('reviewed-7da1ad50.structures.json.gz');
const sha=value=>createHash('sha256').update(value).digest('hex');
const base=createReviewedEpochReader(af5),previous=createReviewedEpochReader(a36,base),current=createReviewedEpochReader(successor,previous);
const commit='7da1ad50ca25971741600befbae3f9753301dec5',tree='d92443c57cd14c2a69298a352fe65c455ad9077e';
const targetFor=(row,width)=>({screen:row.screen,state:row.state,variant:row.variant,viewport:width,artifactHash:row.hashes[width]});

test('the actual successor decoder restores all 11000 captured record structures and every original fragment',async()=>{
 const metadata=reviewedEpochsMetadata.find(value=>value.commit===commit);
 assert.equal(metadata.tree,tree);assert.equal(metadata.indexSha256,capture.indexSha256);assert.equal(metadata.fragmentsSha256,capture.fragmentsSha256);assert.deepEqual(metadata.sourceFiles,capture.sourceFiles);
 assert.equal(structures.indexSha256,capture.indexSha256);assert.equal(structures.fragmentsSha256,capture.fragmentsSha256);
 assert.equal(Object.keys(structures.records).length,11000);assert.deepEqual(Object.keys(structures.records),Object.keys(capture.captures));
 const parts=await current.parts(),fingerprints=parts.map(part=>sha(JSON.stringify(part))),byDigest=new Map(parts.map(part=>[sha(part),part]));
 const originalParts=capture.fragmentHashes.map(digest=>{assert.ok(byDigest.has(digest),digest);return byDigest.get(digest);});
 assert.equal(originalParts.length,4356);assert.equal(sha(JSON.stringify(originalParts)),capture.fragmentsSha256,'complete original fragment array, including order and escapes');
 for(const [key,expected]of Object.entries(structures.records)){
  const record=await current.rawRecordKey(key);assert.ok(record,key);
  const normalized={...record,fields:Object.fromEntries(Object.entries(record.fields).map(([name,recipe])=>[name,recipe.map(part=>typeof part==='number'?{fragmentSha256:fingerprints[part]}:part)]))};
  assert.equal(sha(JSON.stringify(normalized)),expected,key+' metadata, recipe and property insertion order');
 }
 for(const [digest,value]of Object.entries(capture.bodyHashes)){const body=await readReviewedEpochBody(digest);assert.equal(sha(body),digest);assert.equal(Buffer.byteLength(body),value.utf8Bytes);}
});

test('all 5500 issued release13 QA targets remain accepted after current product regeneration',async()=>{
 assert.equal(capture.rowCount,550);assert.equal(capture.widths.length,10);
 for(const row of capture.inventory)for(const width of capture.widths){const target=targetFor(row,width);assert.equal(await isReviewedEpochTarget(target,capture.release),true,row.id+' '+width);assert.equal(await isR3ReviewTarget(target,capture.release),true,row.id+' '+width+' public validation');}
 const row=capture.inventory.find(row=>row.id==='onboarding/guest-4/email'),target=targetFor(row,390);
 assert.equal(await isR3ReviewTarget({...target,artifactHash:'f'.repeat(64)},capture.release),false);
 assert.equal(await isR3ReviewTarget({...target,viewport:391},capture.release),false);
 assert.equal(await isR3ReviewTarget(target,'another-release'),false);
});

test('recorded release13 responses retain exact capture bytes at every approved width',async()=>{
 const ids=['login/empty/email','onboarding/guest-4/email','onboarding/member-1/email','onboarding/company/email','business/empty/email','receipt/before/email','price-workspace/consumer-products/email'];
 for(const id of ids){const row=capture.inventory.find(row=>row.id===id);assert.ok(row,id);for(const width of capture.widths){
  const digest=row.hashes[width],key=[id,width,digest].join('|'),saved=await readReviewedEpochArtifact(id,width,digest);assert.ok(saved,key);
  assert.equal(saved.archivedSource.commit,commit);assert.equal(saved.archivedSource.tree,tree);assert.equal(sha(JSON.stringify(saved.artifact)),capture.captures[key],key+' full response');assert.equal(sha(saved.artifact.editable),saved.artifact.exportHash);
  const response=await serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:String(width),version:'recorded',artifactHash:digest})),{});assert.equal(response.status,200);
  const served=await response.json(),original=Object.fromEntries(Object.keys(saved.artifact).map(name=>[name,served[name]]));assert.equal(sha(JSON.stringify(original)),capture.captures[key],key+' served response');assert.deepEqual(served.archivedSource,saved.archivedSource);
 }}
});

test('overlapping changed records are preserved internally without rebinding earlier public identities',async()=>{
 const key='login/empty/email|320|1a1cba6b69dc64cba9748f3bfa570ebc9eb3c312d1403a65438cd6ce74b5da23',before=await previous.rawRecordKey(key),after=await current.rawRecordKey(key);
 assert.notEqual(JSON.stringify(before),JSON.stringify(after),'the full capture difference must not be silently skipped');
 const [id,width,hash]=key.split('|'),oldReaders=[createReviewedEpochReader(r1),base,createReviewedEpochReader(e5,base),previous];let original;
 for(const reader of oldReaders){original=await reader.artifact(id,Number(width),hash);if(original)break;}
 assert.ok(original);assert.deepEqual(await readReviewedEpochArtifact(id,Number(width),hash),original);
 const snapshot=await current.artifact(id,Number(width),hash);assert.equal(sha(JSON.stringify(snapshot.artifact)),capture.captures[key]);assert.equal(snapshot.archivedSource.commit,commit);
 for(const [file,digest]of Object.entries({'r1-e8e12588-history.gen.mjs':'33a036099f2c36b5c3ec50f4b309cd35036aecc38c344e6f3c094bde942c1c3c','r3-af5ece3e-history.gen.mjs':'40533c74587280d4c5edeb7f657e9cbaae1df2275eb20f738525437f96f20373','r3-e5f97029-history.gen.mjs':'e982717a831fce006ddd8fe7c2e57262da2d9bf79f23a33b76f2be5fdf9de721','r3-a36b41e2-history.gen.mjs':'33a024cc0f822c2f23ec168124012e7ac7b54e2363ff63dffa5df0e2cf9afc22'}))assert.equal(sha(await readFile(new URL('../src/server/r3-ui/'+file,import.meta.url))),digest,file+' immutable bytes');
});

const oldKey='onboarding/guest-1/email|390|'+'a'.repeat(64),otherKey='login/empty/email|390|'+'b'.repeat(64),newKey='onboarding/guest-1/email|390|'+'c'.repeat(64);
const oldRecord={metadata:{hash:'a'.repeat(64)},fields:{editable:[0]},propertyOrder:['hash','editable','exportHash']},baseParts=['<p>original</p>'];
const fakeBase={metadata:{epoch:'test-base',indexSha256:sha('base index')},keys:async()=>[oldKey,otherKey],parts:async()=>baseParts,rawRecordKey:async key=>key===oldKey?oldRecord:key===otherKey?{...oldRecord,metadata:{hash:'b'.repeat(64)}}:null};
function moduleFor({records=[[newKey,0,0]],patches=[['o',[['metadata',['o',[['hash',['v',{__orderCurrentHash:1}]]]]]]]],mutateIndex,mutatePack,metadata={}}={}){
 const index={format:'order-reviewed-epoch-key-delta/v1',recordReference:'previous-key-table/v1',records,patches,bodies:{},replayRecipe:[0]};mutateIndex?.(index);
 const text=JSON.stringify(index),digests=[],known=new Map(),tokens=text.split(/([a-f0-9]{64})/g).map((value,i)=>{if(i%2===0)return value;if(!known.has(value)){known.set(value,digests.length);digests.push(value);}return known.get(value);});
 const pack={format:'order-reviewed-index-digests/v1',digestCount:digests.length,digests:Buffer.from(digests.join(''),'hex').toString('base64'),tokens};mutatePack?.(pack);
 const packed=JSON.stringify(pack),delta={format:index.format,recordReference:index.recordReference,baseEpoch:fakeBase.metadata.epoch,baseIndexSha256:fakeBase.metadata.indexSha256,baseRecordKeysSha256:sha(JSON.stringify([oldKey,otherKey])),basePartsSha256:sha(JSON.stringify(baseParts)),indexSha256:sha(text),indexPack:{format:pack.format,sha256:sha(packed)},fragmentsSha256:sha('[]'),recordCount:records.length,addedFragments:0,...metadata};
 return {epochMetadata:{epoch:'test-successor',release:'MSG0585-R3',widths:[390],commit:'test',tree:'test',delta},epochIndexGzip:gzipSync(packed).toString('base64'),epochFragmentsGzip:gzipSync('[]').toString('base64')};
}

test('key references restore through the previous reader and same-key overrides never recurse',async()=>{
 const decoder=createReviewedEpochReader(moduleFor(),fakeBase),record=await decoder.rawRecordKey(newKey);
 assert.deepEqual(record,{...oldRecord,metadata:{hash:'c'.repeat(64)}});assert.deepEqual(await decoder.rawRecordKey(oldKey),oldRecord);assert.equal(await decoder.rawRecordKey('missing'),null);assert.deepEqual(await decoder.parts(),baseParts);
 assert.equal(await decoder.target({screen:'onboarding',state:'guest-1',variant:'email',viewport:390,artifactHash:'c'.repeat(64)},'MSG0585-R3'),true);
 const same=createReviewedEpochReader(moduleFor({records:[[0,0,0]],patches:[['o',[['propertyOrder',['v',['editable','hash','exportHash']]]]]]}),fakeBase);
 assert.deepEqual((await same.rawRecordKey(oldKey)).propertyOrder,['editable','hash','exportHash']);assert.deepEqual(oldRecord.propertyOrder,['hash','editable','exportHash']);
});

test('a key delta rejects mismatched bases, out-of-range references, cross-target keys and invalid patch indices',async()=>{
 for(const metadata of [{baseEpoch:'wrong'},{baseIndexSha256:'f'.repeat(64)},{recordReference:'node'}])assert.throws(()=>createReviewedEpochReader(moduleFor({metadata}),fakeBase),/base mismatch/);
 for(const metadata of [{baseRecordKeysSha256:'f'.repeat(64)}])await assert.rejects(createReviewedEpochReader(moduleFor({metadata}),fakeBase).rawRecordKey(newKey),/key table mismatch/);
 await assert.rejects(createReviewedEpochReader(moduleFor({metadata:{basePartsSha256:'f'.repeat(64)}}),fakeBase).parts(),/fragment base mismatch/);
 for(const records of [[[newKey,-1,0]],[[newKey,2,0]],[[newKey,0.5,0]],[[newKey,oldKey,0]],[[-1,0,0]],[[newKey,1,0]],[[newKey,0,999]],[[newKey,0,'0']],[[newKey,0,0],[newKey,0,0]]])await assert.rejects(createReviewedEpochReader(moduleFor({records}),fakeBase).rawRecordKey(newKey),/Invalid reviewed/);
 await assert.rejects(createReviewedEpochReader(moduleFor(),{...fakeBase,rawRecordKey:async()=>null}).rawRecordKey(newKey),/Missing reviewed record key reference/);
});

test('packed index hashes, digest table bounds and literal positions are checked before records can resolve',async()=>{
 const badPacks=[pack=>{pack.digestCount++;},pack=>{pack.tokens[0]=0;},pack=>{pack.tokens[1]=-1;},pack=>{pack.tokens[1]=pack.digestCount;},pack=>{pack.tokens[1]=0.5;},pack=>{pack.tokens.push('extra');},pack=>{pack.tokens[0]+=' ';}];
 for(const mutatePack of badPacks)await assert.rejects(createReviewedEpochReader(moduleFor({mutatePack}),fakeBase).rawRecordKey(newKey),/Invalid reviewed|integrity mismatch/);
 await assert.rejects(createReviewedEpochReader(moduleFor({metadata:{indexSha256:'f'.repeat(64)}}),fakeBase).rawRecordKey(newKey),/integrity mismatch/);
 const bad=moduleFor();bad.epochMetadata.delta.indexPack.sha256='f'.repeat(64);await assert.rejects(createReviewedEpochReader(bad,fakeBase).rawRecordKey(newKey),/integrity mismatch/);
});
