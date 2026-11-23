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
  // Fixed-nonce output of the pre-split canonical renderer at aa2d478.
  assert.equal(createHash('sha256').update(html).digest('hex'),'9acba3f90ebe305440ae0125434f6d6582f078dca6593825e5d77037c2d0ca61');
  const {renderR3Qa:legacyEntry}=await import('../src/server/r3-qa-page.mjs');
  assert.equal(legacyEntry(nonce),html);
});
