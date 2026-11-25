import {test} from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';
import {deliveryBuild,hasDeliveryBuild,deliverResearchAsset,readDeliveryShell,deliveryResearchRow,renderDeliveryApplication,deliveryResearchArtifact,deliveryArchivedResearchArtifact} from '../src/server/research-release-delivery.mjs';
import {researchArtifact,archivedResearchArtifact,renderResearchApplication} from '../src/server/research-app/page.mjs';
import {researchReviewIdentity} from '../src/server/research-app/release-store.mjs';
import {onRequest} from '../functions/ia/[[path]].js';

const origin='https://qa.example',nonce='a'.repeat(36);
const file=new URL('../public/ia/research-releases/'+deliveryBuild+'.json.gz',import.meta.url);
const original=JSON.parse(gunzipSync(await readFile(file)));
const previousBuild='9f7f83753ad7245b1e6a0f7dc55f905093c2a2dfa8d0aa8f057d9f18e125f092';
const previousBytes=await readFile(new URL('../public/ia/research-releases/'+previousBuild+'.json.gz',import.meta.url));
const previousOriginal=JSON.parse(gunzipSync(previousBytes));
const identity=(build,id,width,mode)=>createHash('sha256').update(JSON.stringify(researchReviewIdentity(build,id,width,mode))).digest('hex');
const staticAssets=createPrivateResearchAssets();
function fixture(change){
  const reads=[],transfers=[];
  const env={ASSETS:{async fetch(req){
    const name=new URL(req.url).pathname.split('/').pop();reads.push(name);
    const response=await (change?.(name,req)||staticAssets.fetch(req));
    const bytes=Buffer.from(await response.arrayBuffer());
    transfers.push({path:new URL(req.url).pathname,bytes:bytes.length,expanded:bytes.length>=18&&bytes[0]===31&&bytes[1]===139?bytes.readUInt32LE(bytes.length-4):0});
    return new Response(bytes,{status:response.status,headers:response.headers});
  }}};
  return {env,reads,transfers};
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

test('PR26 source pins and their original retired routes read only the selected checked shards',async t=>{
  assert.ok(hasDeliveryBuild(previousBuild));
  assert.equal(hasDeliveryBuild('0'.repeat(64)),false);
  const {env,reads,transfers}=fixture();
  const id='quote-review/normal/email';
  for(const mode of ['simple','detailed']){
    const hash=identity(previousBuild,id,390,mode);
    const delivered=await deliveryArchivedResearchArtifact(id,390,hash,env,origin,mode,previousBuild);
    assert.equal(delivered.source.build,previousBuild);
    assert.equal(delivered.version,'recorded');
    assert.equal(delivered.source.archived,true);
    assert.equal(reads.some(name=>name.endsWith('.json.gz')),false);
    assert.ok(transfers.some(value=>value.path.endsWith('/'+previousBuild+'/index.bin')));
    const config=JSON.parse(/id="order-app-config">([^<]+)<\/script>/.exec(delivered.html)[1]);
    assert.equal(config.initial.screen,'quote-review','the archived application keeps its own route');
    assert.equal(config.initial.mode,mode);
    const source={ASSETS:staticAssets};
    assert.deepEqual(delivered,await archivedResearchArtifact(id,390,hash,source,origin,mode));
    const parameters=new URLSearchParams({build:previousBuild,screen:'quote-review',state:'normal',variant:'email',mode,version:'recorded'});
    assert.equal(await renderDeliveryApplication(nonce,parameters,env,origin),await renderResearchApplication(nonce,parameters,source,origin));
  }
  const compressed=transfers.reduce((total,value)=>total+value.bytes,0),expanded=transfers.reduce((total,value)=>total+value.expanded,0);
  assert.ok(compressed<previousBytes.length/10,'the pin must not fetch the full pack');
  assert.ok(expanded<gunzipSync(previousBytes).length/10,'the pin must not inflate the full pack');
  assert.ok(transfers.every(value=>value.path.includes('/'+previousBuild+'/')&&value.path.endsWith('.bin')));
  t.diagnostic(JSON.stringify({previousBuild,sourcePins:2,compressed,expanded,fullPackCompressed:previousBytes.length,fullPackExpanded:gunzipSync(previousBytes).length}));
});

test('current and PR26 assets and headers stay separate in the same authorized binding',async t=>{
  const {env,reads,transfers}=fixture();
  for(const build of [previousBuild,deliveryBuild,previousBuild]){
    const sealed=build===previousBuild?previousOriginal:original;
    for(const path of ['research/application.mjs','research/application.css','bridge/contact-ui.mjs']){
      const response=await deliverResearchAsset(path,env,origin,build);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('X-Order-Research-Build'),build);
      assert.equal(response.headers.get('Content-Type'),sealed.assets[path].type);
      assert.equal(await response.text(),sealed.assets[path].body);
    }
    const shell=await readDeliveryShell(build,env,origin);
    assert.deepEqual(shell.build,sealed.build);
    assert.deepEqual(shell.shell,sealed.shell);
    assert.deepEqual(shell.rows,sealed.rows);
  }
  assert.equal(reads.some(name=>name.endsWith('.json.gz')),false);
  for(const build of new Set([deliveryBuild,previousBuild]))assert.equal(transfers.filter(value=>value.path.endsWith('/'+build+'/index.bin')).length,1);
  t.diagnostic(JSON.stringify({assetReads:9,onlyShards:reads.every(name=>name.endsWith('.bin')),indexBuilds:[...new Set([deliveryBuild,previousBuild])]}));
});

test('authenticated asset URLs use their own projection and keep owner and private-file gates',async t=>{
  const {env,reads}=fixture(),domain='https://delivery-test.cloudflareaccess.com',audience='DELIVERY_TEST_AUDIENCE';
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),key={...publicKey.export({format:'jwk'}),kid:'delivery-test',alg:'RS256'};
  Object.assign(env,{IA_ACCESS_TEAM_DOMAIN:domain,IA_ACCESS_AUD:audience,IA_ROLE_BINDINGS_JSON:JSON.stringify({'owner@example.invalid':'OWNER','reviewer@example.invalid':'REVIEWER'})});
  t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,domain+'/cdn-cgi/access/certs');return Response.json({keys:[key]});});
  const token=email=>{
    const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000);
    const payload=encode({alg:'RS256',kid:key.kid})+'.'+encode({sub:email,email,iss:domain,aud:[audience],iat:now-1,exp:now+300});
    return payload+'.'+sign('RSA-SHA256',Buffer.from(payload),privateKey).toString('base64url');
  };
  const owner=token('owner@example.invalid'),reviewer=token('reviewer@example.invalid');
  for(const build of new Set([previousBuild,deliveryBuild])){
    const path='/ia/research-assets/'+build+'/research/application.mjs',sealed=build===previousBuild?previousOriginal:original;
    for(const assertion of [null,reviewer]){
      const before=reads.length;
      const response=await onRequest({request:new Request(origin+path,{headers:assertion?{'Cf-Access-Jwt-Assertion':assertion}:{}}),env});
      assert.equal(response.status,403);assert.equal(reads.length,before);
    }
    const response=await onRequest({request:new Request(origin+path,{headers:{'Cf-Access-Jwt-Assertion':owner}}),env});
    assert.equal(response.status,200);assert.equal(response.headers.get('X-Order-Research-Build'),build);
    assert.equal(await response.text(),sealed.assets['research/application.mjs'].body);
    for(const name of ['index.bin','shell.bin','0.bin']){
      const before=reads.length;
      assert.equal((await onRequest({request:new Request(origin+'/ia/research-releases/'+build+'/'+name,{headers:{'Cf-Access-Jwt-Assertion':owner}}),env})).status,404);
      assert.equal(reads.length,before);
    }
  }
  assert.equal(reads.some(name=>name.endsWith('.json.gz')),false);
});

test('a damaged PR26 shard fails closed without falling back to the full release pack',async()=>{
  const id='login/empty/email',hash=identity(previousBuild,id,390,'simple');
  for(const stage of ['index.bin','shell.bin','row']){
    const {env,reads}=fixture((name,request)=>{
      if(stage==='row'?!/^\d+\.bin$/.test(name):name!==stage)return;
      return staticAssets.fetch(request).then(async response=>{const bytes=new Uint8Array(await response.arrayBuffer());bytes[5]^=1;return new Response(bytes);});
    });
    await assert.rejects(deliveryArchivedResearchArtifact(id,390,hash,env,origin,'simple',previousBuild),/RESEARCH_DELIVERY_UNAVAILABLE/);
    assert.equal(reads.some(name=>name.endsWith('.json.gz')),false);
  }
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
