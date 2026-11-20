import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolveR3HistoricalBody,serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {approvedHash} from '../src/server/r3-ui/approved-width.mjs';
import * as logoHistory from '../src/server/r3-ui/logo-correction-history.gen.mjs';
import * as brandHistory from '../src/server/r3-ui/brand-history.gen.mjs';

// The immutable archive modules retain every original byte for provenance.
// Production can resolve bodies retired from the current frame inventory via
// the shared reviewed-epoch fragment pack. Compare exact uncompressed bytes,
// independent of that storage layout or the gzip compressor's output.
for(const [name,history] of [['logo correction',logoHistory],['shared brand',brandHistory]]){
 test(name+' history retains all 498 review identities and exact original bodies through the production resolver',async()=>{
  assert.equal(Object.keys(history.archivedRows).length,498,'the full preserved review inventory remains present');
  for(const [id,row] of Object.entries(history.archivedRows)){
   assert.ok(Object.hasOwn(history.archivedBodies,row.body),id+' has its immutable historical body');
  }
  for(const [digest,body] of Object.entries(history.archivedBodies)){
   const original=gunzipSync(Buffer.from(body,'base64')).toString('utf8');
   const restored=await resolveR3HistoricalBody(digest);
   assert.equal(restored,original,digest+' retains the exact original body bytes');
   assert.equal(createHash('sha256').update(restored).digest('hex'),digest,digest+' keeps its original content identity');
  }
  const id='login/empty/email',row=history.archivedRows[id],hash=await approvedHash(row,390,'current');
  const response=await serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+new URLSearchParams({id,width:'390',version:'prior-r3',artifactHash:hash})),{});
  assert.equal(response.status,200,'the historical endpoint resolves an old login body after regeneration');
  const document=await response.json();
  assert.equal(document.version,'prior-r3','the reviewed epoch does not change an explicitly requested historical version');
  assert.equal(document.hash,hash);
  assert.ok(document.html.includes(gunzipSync(Buffer.from(history.archivedBodies[row.body],'base64')).toString('utf8')),'the actual historical route contains the exact original body');
 });
}
