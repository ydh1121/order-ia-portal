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
  // The host embeds the new shared quote styles and permission handling.
  // Its navigation, feedback controls and rendered shell markup stay byte-pinned.
  const markup=html.slice(0,html.indexOf('<script')).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  assert.equal(createHash('sha256').update(markup).digest('hex'),'bf9c766942613c855231dd7d14016a033fc13b28aec0c8759faaae06677e0515');
  assert.equal(createHash('sha256').update(html).digest('hex'),'85c92fbe0b25e6a812de72ff3a71f57d3d117ef3946b095de9df8d8f524b7c65');
  const {renderR3Qa:legacyEntry}=await import('../src/server/r3-qa-page.mjs');
  assert.equal(legacyEntry(nonce),html);
});
