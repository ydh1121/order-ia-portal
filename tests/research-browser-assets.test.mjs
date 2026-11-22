import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';
import {onRequest} from '../functions/ia/[[path]].js';

const origin='https://order-ia-portal.pages.dev',hash='a'.repeat(64),path='/ia/research-releases/'+hash+'.json.gz';
test('browser-host ASSETS returns only a regular exact-hash private pack and keeps its bytes intact',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'order-private-assets-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const bytes=gzipSync(Buffer.from('{"immutable":"test-only"}'));await writeFile(join(directory,hash+'.json.gz'),bytes);
  const binding=createPrivateResearchAssets(directory),response=await binding.fetch(new Request(origin+path));
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/gzip');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  for(const suffix of ['/login.js','/ia/research-releases/'+hash+'.json','/ia/research-releases/'+hash.toUpperCase()+'.json.gz','/ia/research-releases/../login.js','/ia/research-releases/%2e%2e%2flogin.js',path+'?alternate=1','/ia/research-releases/'+'b'.repeat(64)+'.json.gz'])assert.equal((await binding.fetch(new Request(origin+suffix))).status,404,suffix);
  assert.equal((await binding.fetch(new Request(origin+path,{method:'POST'}))).status,404);
  await mkdir(join(directory,'c'.repeat(64)+'.json.gz'));assert.equal((await binding.fetch(new Request(origin+'/ia/research-releases/'+'c'.repeat(64)+'.json.gz'))).status,404);
  await symlink(join(directory,hash+'.json.gz'),join(directory,'d'.repeat(64)+'.json.gz'));assert.equal((await binding.fetch(new Request(origin+'/ia/research-releases/'+'d'.repeat(64)+'.json.gz'))).status,404);
});

test('the actual HTTP page handler returns 404 for private packs without calling its ASSETS binding',async()=>{
  let reads=0;const env={ASSETS:{fetch(){reads++;throw Error('Private binding must not be exposed by HTTP');}}};
  for(const method of ['GET','HEAD']){
    const response=await onRequest({request:new Request(origin+path,{method}),env});assert.equal(response.status,404);assert.equal(await response.text(),'');
  }
  assert.equal(reads,0);
});
