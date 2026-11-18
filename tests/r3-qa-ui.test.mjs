import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {serveR3Artifact,isR3ReviewTarget,renderR3Qa} from '../src/server/r3-qa-page.mjs';
import {frameCode,hostCode,runtimes} from '../src/server/r3-ui/runtime.gen.mjs';
const url='https://private.invalid/api/ia/r3-qa/artifact';
const read=async(q='')=>await(await serveR3Artifact(new Request(url+q))).json();
const row=(id,width=390,version='current')=>read('?'+new URLSearchParams({id,width:String(width),version}));
test('the QA menu covers the complete pinned state inventory without copying review decisions',async()=>{
  const list=await read();assert.equal(list.items.length,498);assert.equal(new Set(list.items.map(r=>r.screen+'/'+r.state)).size,496);
  assert.equal(new Set(list.items.map(r=>r.screen)).size,97);
  for(const entry of list.items){assert.equal('approved' in entry,false);assert.equal(typeof entry.hashes['390'],'string');}
});
test('stable target is bound to width, variant, release and generated artifact',async()=>{
  const id='login/empty/email'; const target={screen:'login',state:'empty',variant:'email',viewport:390,artifactHash:(await row(id)).hash};
  assert.equal(await isR3ReviewTarget(target,'MSG0585-R3'),true);
  assert.equal(await isR3ReviewTarget({...target,viewport:1440},'MSG0585-R3'),false);
  assert.equal(await isR3ReviewTarget(target,'legacy'),false);
  assert.notEqual(target.artifactHash,(await row(id,390,'previous')).hash);
});
test('reviewed files include one selected screen, a SHA and no remote source or UI execution',async()=>{
  const result=await row('login/empty/email',1440);
  assert.equal(createHash('sha256').update(result.editable).digest('hex'),result.exportHash);
  assert.match(result.editable,/id="frame-meta"/);assert.doesNotMatch(result.editable,/<iframe\b|<script(?! type="application\/json")|example-only-pass|<form[^>]+ action=/i);
  assert.match(result.editable,/"viewport":1440/);assert.match(result.editable,new RegExp(result.hash));
  assert.equal((await serveR3Artifact(new Request(url+'?id=https://example.org&width=390&version=current'))).status,404);
});
test('new result artifacts project the locked presentation; customer data is requested only in the trusted parent',async()=>{
  const hidden=await row('quote-result/locked/email');const detail=await row('quote-result/new-detail/email');
  for(const doc of [hidden,detail]){assert.doesNotMatch(doc.editable,/12,540,000|11,940,000|600,000|data-price=|compareData=/);assert.equal(doc.mount,null);}
  assert.match(hostCode,/r3-price\/quote/);assert.doesNotMatch(frameCode,/r3-price|r3-role|X-IA-CSRF/);
});
test('selected source code parses under CSP; opaque content cannot call storage or reuse another target',()=>{
  for(const f of [frameCode,hostCode])new Script('('+f+')');
  for(const s of Object.values(runtimes)){new Script(s);assert.doesNotMatch(s,/example-only-pass|12540000|11940000|r3-qa\/records|__Host-ia_session/i);}
  const page=renderR3Qa('012345');assert.match(page,/sandbox="allow-scripts"/);assert.doesNotMatch(page,/allow-same-origin|13,140,000|<iframe[^>]*src="\/ia/);
});
