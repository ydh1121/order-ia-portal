import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync,gzipSync} from 'node:zlib';
import * as base from '../src/server/r3-ui/r3-af5ece3e-history.gen.mjs';
import * as legacy from '../src/server/r3-ui/r3-e5f97029-history.gen.mjs';
import * as release11 from '../src/server/r3-ui/r3-a36b41e2-history.gen.mjs';
import {readReviewedFragmentAdditions} from '../src/server/r3-qa-epoch-history.mjs';

const format='order-reviewed-fragment-slices/v1';
const sha=value=>createHash('sha256').update(value).digest('hex');
const unzip=value=>gunzipSync(Buffer.from(value,'base64')).toString('utf8');
const baseParts=JSON.parse(unzip(base.epochFragmentsGzip));
const require=createRequire(new URL('./build-tools/package.json',import.meta.url));
const {build}=require('esbuild');
function fixture(recipes,expected,extra={}){
  const text=JSON.stringify({format,recipes,...extra});
  return {packed:gzipSync(text,{level:9,mtime:0}).toString('base64'),metadata:{addedFragments:expected.length,
    fragmentsSha256:sha(JSON.stringify(expected)),fragmentPack:{format,sha256:sha(text)}}};
}

test('the packed release11 representation retains its original index and all 273 exact fragment strings',async()=>{
  assert.equal(release11.epochMetadata.delta.indexSha256,'7f465533742ddc3c518765921db5027c316962ad6db1523b0aeae9e64e558ca0');
  assert.equal(sha(unzip(release11.epochIndexGzip)),release11.epochMetadata.delta.indexSha256);
  assert.equal(release11.epochMetadata.delta.fragmentsSha256,'373000f7331b3fc68098881c6dd7b256dbe5776474ee171ab7f9ca0b7f7efc53');
  const pack=JSON.parse(unzip(release11.epochFragmentsGzip));
  assert.equal(pack.format,format);
  assert.equal(sha(unzip(release11.epochFragmentsGzip)),release11.epochMetadata.delta.fragmentPack.sha256);
  const added=await readReviewedFragmentAdditions(release11.epochFragmentsGzip,release11.epochMetadata.delta,baseParts);
  assert.equal(added.length,273);
  // This digest was recorded before packing; it covers every original string,
  // its ordering and exact JSON/UTF-8 serialization, not a sampled response.
  assert.equal(sha(JSON.stringify(added)),'373000f7331b3fc68098881c6dd7b256dbe5776474ee171ab7f9ca0b7f7efc53');
});

test('the existing plain fragment format remains byte-identical',async()=>{
  assert.equal(legacy.epochMetadata.delta.fragmentPack,undefined);
  const added=await readReviewedFragmentAdditions(legacy.epochFragmentsGzip,legacy.epochMetadata.delta,baseParts);
  assert.deepEqual(added,JSON.parse(unzip(legacy.epochFragmentsGzip)));
  assert.equal(sha(JSON.stringify(added)),legacy.epochMetadata.delta.fragmentsSha256);
});

test('packed release11 responses retain captured bytes after deployment bundling',async()=>{
  const capture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/reviewed-a36b41e2.capture.json.gz',import.meta.url))));
  const directory=await mkdtemp(join(tmpdir(),'reviewed-fragment-bundle-'));
  try{
    const output=join(directory,'worker.mjs');
    await build({stdin:{contents:"export {readReviewedEpochArtifact,isReviewedEpochTarget} from './src/server/r3-qa-epoch-history.mjs';",resolveDir:process.cwd()},outfile:output,bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,keepNames:true,logLevel:'silent'});
    const worker=await import(pathToFileURL(output));
    for(const id of ['onboarding/guest-1/email','onboarding/company/email','price-workspace/consumer-products/email']){
      const row=capture.inventory.find(row=>row.id===id),digest=row.hashes[390],key=[id,390,digest].join('|');
      const restored=await worker.readReviewedEpochArtifact(id,390,digest);
      assert.equal(sha(JSON.stringify(restored.artifact)),capture.captures[key],key);
      assert.equal(restored.archivedSource.commit,release11.epochMetadata.commit);
      assert.equal(await worker.isReviewedEpochTarget({screen:row.screen,state:row.state,variant:row.variant,viewport:390,artifactHash:digest},capture.release),true);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('literal text and UTF-16 slices reconstruct without normalization',async()=>{
  const expected=['pre😀post','shared',''];
  const value=fixture([['pre',[0,1,2],'\ude00post'],[[1,0,6]],[]],expected);
  assert.deepEqual(await readReviewedFragmentAdditions(value.packed,value.metadata,['A😀BC','shared']),expected);
});

test('unknown formats, bad packed hashes, fragment counts and reconstructed hashes are rejected',async()=>{
  const value=fixture([[[0,0,3]]],['one']);
  await assert.rejects(readReviewedFragmentAdditions(value.packed,{...value.metadata,fragmentPack:{...value.metadata.fragmentPack,format:'unknown'}},['one']),/Unsupported reviewed fragment pack/);
  await assert.rejects(readReviewedFragmentAdditions(value.packed,{...value.metadata,fragmentPack:{...value.metadata.fragmentPack,sha256:'0'.repeat(64)}},['one']),/Reviewed epoch integrity mismatch/);
  const wrongFormat=fixture([[[0,0,3]]],['one'],{format:'unknown'});
  await assert.rejects(readReviewedFragmentAdditions(wrongFormat.packed,wrongFormat.metadata,['one']),/Invalid reviewed fragment pack/);
  await assert.rejects(readReviewedFragmentAdditions(value.packed,{...value.metadata,addedFragments:2},['one']),/Invalid reviewed fragment pack/);
  await assert.rejects(readReviewedFragmentAdditions(value.packed,{...value.metadata,fragmentsSha256:'0'.repeat(64)},['one']),/Reviewed fragment integrity mismatch/);
});

test('malformed recipes and out-of-bounds or noninteger slices cannot reach replay',async()=>{
  const invalid=[
    {recipes:[null],error:/Invalid reviewed fragment recipe/},
    {recipes:[[{index:0}]]},
    {recipes:[[[0,0]]]},
    {recipes:[[[0,0,1,2]]]},
    {recipes:[[[-1,0,1]]]},
    {recipes:[[[2,0,1]]]},
    {recipes:[[[0.5,0,1]]]},
    {recipes:[[['0',0,1]]]},
    {recipes:[[[0,-1,1]]]},
    {recipes:[[[0,0.5,1]]]},
    {recipes:[[[0,2,1]]]},
    {recipes:[[[0,0,4]]]},
    {recipes:[[[0,0,1.5]]]},
    {recipes:[[[1,0,1]]],parts:['one',42]}
  ];
  for(const item of invalid){
    const value=fixture(item.recipes,['x']);
    await assert.rejects(readReviewedFragmentAdditions(value.packed,value.metadata,item.parts||['one','two']),item.error||/Invalid reviewed fragment slice/);
  }
});
