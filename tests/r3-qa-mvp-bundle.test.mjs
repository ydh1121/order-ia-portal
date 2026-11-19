import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {getQaSupplemental} from '../src/server/r3-qa-assets.mjs';
import {publicationIdentity} from '../src/server/r3-qa-publication.mjs';
import {registerQaMvp} from '../src/server/r3-ui/qa-mvp-runtime.mjs';
import {qaMvpRuntimeCode} from '../src/server/r3-ui/qa-assets.gen.mjs';
import {browserFunction} from '../src/server/browser-source.mjs';
const {build}=createRequire(new URL('./build-tools/package.json',import.meta.url))('esbuild');

test('supplemental review hashes and publication receipt are invariant under the deployment bundler',async()=>{
  assert.equal(qaMvpRuntimeCode,browserFunction(registerQaMvp),'regenerate the frozen runtime after changing its source');
  const directory=await mkdtemp(join(tmpdir(),'qa-mvp-bundle-'));
  try{
    const output=join(directory,'worker.mjs');
    await build({stdin:{contents:"export {getQaSupplemental} from './src/server/r3-qa-assets.mjs'; export {publicationIdentity} from './src/server/r3-qa-publication.mjs';",resolveDir:process.cwd()},outfile:output,bundle:true,platform:'browser',format:'esm',target:'es2022',keepNames:true,minify:true,logLevel:'silent'});
    const worker=await import(pathToFileURL(output)),[native,bundled]=await Promise.all([getQaSupplemental(),worker.getQaSupplemental()]);
    assert.deepEqual(bundled.rows,native.rows,'every component review and override retains its hash after deployment');
    assert.deepEqual(await worker.publicationIdentity(),await publicationIdentity(),'local receipt identity must attest the shipped Worker');
    for(const [id,document] of native.documents)assert.equal(bundled.documents.get(id).mount,document.mount,id);
  }finally{await rm(directory,{recursive:true,force:true});}
});
