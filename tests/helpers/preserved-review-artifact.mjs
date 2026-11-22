import assert from 'node:assert/strict';
import {catalog} from '../../src/server/r3-ui/catalog.gen.mjs';
import {approvedHash} from '../../src/server/r3-ui/approved-width.mjs';
import {getQaSupplemental} from '../../src/server/r3-qa-assets.mjs';
import {qaReviewHash} from '../../src/server/r3-qa-review-runtime.mjs';
import {serveR3Artifact} from '../../src/server/r3-qa-page.mjs';

// R1 authored-document unit tests intentionally exercise the retained HTML/mount
// contract. Pin that source identity explicitly; an unpinned current request must
// keep testing the standalone research application, never this compatibility path.
export async function preservedReviewArtifact(id,{width=390}={}){
  const supplement=(await getQaSupplemental()).documents.get(id);
  const row=supplement?.row||catalog.find(row=>row.id===id);
  assert.ok(row,'A preserved authored document must exist: '+id);
  const contentHash=supplement?.hashes[width]||await approvedHash(row,width,'current');
  assert.ok(contentHash,'The preserved document must support viewport '+width);
  const hash=await qaReviewHash(row,contentHash);
  const query=new URLSearchParams({id,width:String(width),version:'recorded',artifactHash:hash});
  const response=await serveR3Artifact(new Request('https://order-ia-portal.pages.dev/api/ia/r3-qa/artifact?'+query));
  assert.equal(response.status,200,id+' must resolve its explicit R1 source identity');
  const artifact=await response.json();
  assert.equal(artifact.hash,hash);
  assert.equal(artifact.source.contentHash,contentHash);
  assert.equal(Object.hasOwn(artifact,'application'),false,'A preserved-document test cannot silently select the current app');
  return artifact;
}
