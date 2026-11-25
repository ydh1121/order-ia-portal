import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';

test('the approved QA shell renders its original HTML without loading the catalog or historical artifacts',async()=>{
  const loaded=[];
  const observer=registerHooks({load(url,context,nextLoad){
    loaded.push(url);
    return nextLoad(url,context);
  }});
  const nonce='a'.repeat(36);
  let html;
  try{
    const {renderR3Qa}=await import('../src/server/r3-qa-shell.mjs');
    html=renderR3Qa(nonce);
  }finally{observer.deregister();}
  const heavy=loaded.filter(url=>url.endsWith('/r3-qa-page.mjs')||url.includes('-history.gen.mjs')||/\/product-ui\/(catalog|runtime)\.gen\.mjs$/.test(url));
  assert.deepEqual(heavy,[]);
  // Fixed-nonce canonical chrome plus the Nov 25 active feedback snapshot
  // host, including the explicit Q1/Q2 review hold. No catalogue is loaded.
  assert.equal(createHash('sha256').update(html).digest('hex'),'943d4b1d5d8392992d409f671caebf75567df4df3c45707a8951bf53a134e04c');
  const {renderR3Qa:legacyEntry}=await import('../src/server/r3-qa-page.mjs');
  assert.equal(legacyEntry(nonce),html);
});
