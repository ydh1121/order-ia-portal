import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';
import {deliveryBuild,deliverResearchAsset,readDeliveryShell,deliveryResearchRow,renderDeliveryApplication,deliveryResearchArtifact,deliveryArchivedResearchArtifact} from '../src/server/research-release-delivery.mjs';
import {researchArtifact,archivedResearchArtifact,renderResearchApplication} from '../src/server/research-app/page.mjs';
import {onRequest} from '../functions/ia/[[path]].js';

const origin='https://qa.example',nonce='a'.repeat(36);
const file=new URL('../public/ia/research-releases/'+deliveryBuild+'.json.gz',import.meta.url);
const original=JSON.parse(gunzipSync(await readFile(file)));
const staticAssets=createPrivateResearchAssets();
function fixture(change){
  const reads=[];
  const env={ASSETS:{async fetch(req){
    const name=new URL(req.url).pathname.split('/').pop();reads.push(name);
    return change?.(name,req)||staticAssets.fetch(req);
  }}};
  return {env,reads};
}

test('the checked-in delivery bytes can be reproduced from the original C7 pack',async()=>{
  const script=fileURLToPath(new URL('../scripts/build-research-delivery.mjs',import.meta.url));
  await promisify(execFile)(process.execPath,[script,'--check']);
});

test('private delivery reproduces all sealed asset bytes, media types, metadata and body digests',async()=>{
  const {env,reads}=fixture();
  for(const [path,asset] of Object.entries(original.assets)){
    const response=await deliverResearchAsset(path,env,origin);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('Content-Type'),asset.type,path);
    assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.equal(response.headers.get('X-Order-Research-Build'),deliveryBuild);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(asset.body),path);
  }
  const shell=await readDeliveryShell(deliveryBuild,env,origin);
  assert.deepEqual(shell.build,original.build);
  assert.deepEqual(shell.shell,original.shell);
  assert.deepEqual(shell.rows,original.rows);
  assert.equal(reads.filter(name=>name==='index.bin').length,1);
  assert.equal(reads.some(name=>name.endsWith('.json.gz')),false);
});

test('private current HTML and both current/recorded artifact envelopes equal their sealed versions',async()=>{
  const {env,reads}=fixture();
  const row=await deliveryResearchRow('login/empty/email',env,origin);
  const source={ASSETS:staticAssets};
  for(const mode of ['simple','detailed']){
    const params=new URLSearchParams({view:'research-r3',screen:'login',state:'empty',variant:'email',mode});
    assert.equal(await renderDeliveryApplication(nonce,params,env,origin),await renderResearchApplication(nonce,params,source,origin));
    const current=await deliveryResearchArtifact(row,375,env,origin,mode);
    assert.deepEqual(current,await researchArtifact(row,375,source,origin,mode));
    assert.deepEqual(await deliveryArchivedResearchArtifact(row.id,375,current.hash,env,origin,mode),await archivedResearchArtifact(row.id,375,current.hash,source,origin,mode));
  }
  assert.equal(reads.some(name=>name.endsWith('.json.gz')),false);
});

test('private delivery fails closed on malformed, missing or redirected data and retains authorization',async()=>{
  for(const stage of ['index','part'])for(const failure of ['missing','redirect','corrupt','truncated']){
    const {env}=fixture((name,req)=>{
      if((name==='index.bin')!==(stage==='index'))return;
      if(failure==='missing')return new Response(null,{status:404});
      if(failure==='redirect')return Response.redirect('https://other.example/',302);
      return staticAssets.fetch(req).then(async response=>{
        const bytes=new Uint8Array(await response.arrayBuffer());
        if(failure==='corrupt')bytes[5]^=1;
        return new Response(failure==='truncated'?bytes.slice(1):bytes);
      });
    });
    assert.equal((await deliverResearchAsset('web/address-service.mjs',env,origin)).status,503,stage+' '+failure);
  }
  const {env,reads}=fixture();
  for(const path of ['../outside.mjs','%2e%2e/private','__proto__','missing.mjs']){
    assert.equal((await deliverResearchAsset(path,env,origin)).status,404,path);
  }
  for(const url of ['/ia/research-releases/'+deliveryBuild+'/index.bin','/ia/research-releases/'+deliveryBuild+'/0.bin','/ia/research-releases/'+deliveryBuild+'/shell.bin','/ia/research-releases/qa-catalog/unknown.json','/ia/research-releases/r1-recorded/unknown.json.gz']){
    assert.equal((await onRequest({request:new Request(origin+url),env})).status,404);
  }
  const before=reads.length;
  assert.equal((await onRequest({request:new Request(origin+'/ia/research-assets/'+deliveryBuild+'/web/address-service.mjs'),env})).status,403);
  assert.equal(reads.length,before);
  const invalid=await deliveryResearchRow('missing/route/email',env,origin);assert.equal(invalid,null);
});
