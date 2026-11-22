import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Script} from 'node:vm';
import {runtimes} from '../src/server/product-ui/runtime.gen.mjs';
import {researchSceneSource} from '../src/server/research-app/scene-source-adapter.mjs';

const entry=';(function consultationDate(env, root, source) {';
const call='})(new AbortController().signal,document.querySelector("#order-single"),';

test('consultation adaptation preserves the exact released date function and holiday data',()=>{
 const original=runtimes.consultation,adapted=researchSceneSource('consultation',original);
 const body=original.slice(original.indexOf(entry)+2,original.indexOf(call)+1);
 const data=original.slice(original.indexOf(call)+call.length);
 assert.ok(adapted.includes(body),'calendar validation, keyboard and date selection body stays identical');
 assert.ok(adapted.endsWith(data),'released coverage and holiday records stay identical');
 assert.equal(adapted.includes(call),false,'no eager binding to an unrelated document root remains');
 assert.match(adapted,/mountDate\(controller\.signal,root,source\)/);
 assert.doesNotThrow(()=>new Script(adapted));
});

test('consultation date adaptation rejects drift or duplicate lifecycle markers',()=>{
 for(const changed of [runtimes.consultation.replace(entry,';/* changed initializer */'),runtimes.consultation.replace(call,'})(differentRoot,'),runtimes.consultation+entry]){
  assert.throws(()=>researchSceneSource('consultation',changed),/RESEARCH_SCENE_SOURCE_CHANGED/);
 }
});
