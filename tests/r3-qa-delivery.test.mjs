import test from 'node:test';
import assert from 'node:assert/strict';
import {serveDeliveredQaArtifact,isDeliveredReviewTarget} from '../src/server/r3-qa-delivery.mjs';
import {serveR3Artifact} from '../src/server/r3-qa-page.mjs';
import {createPrivateResearchAssets} from './helpers/private-research-assets.mjs';
import {handleIaRequest} from '../src/server/router.mjs';
import {qaCatalogIdentity} from '../src/server/r3-qa-catalog-identity.gen.mjs';

const origin='https://order-ia-portal.pages.dev';
const url=params=>new Request(origin+'/api/ia/r3-qa/artifact?'+new URLSearchParams(params));
const fixture=()=>{
  const binding=createPrivateResearchAssets(),reads=[];
  return {env:{ASSETS:{fetch:r=>{reads.push(new URL(r.url).pathname);return binding.fetch(r);}}},reads};
};

test('sealed simple and detailed catalogs reproduce the full JSON wire and read this host’s current D1 receipt',async()=>{
  const {env,reads}=fixture();
  let receipt;
  const bindings=[];
  env.ORDER_QA_DB={prepare:()=>({bind:(...values)=>({first:async()=>{bindings.push(values);return receipt;}})})};
  for(const mode of ['simple','detailed']){
    for(const published of [false,true]){
      receipt=published?{iaCommit:'c'.repeat(40),productCommit:qaCatalogIdentity.publication.productCommit,deploymentId:'12345678-dead-beef-1234-56789abcdef0'}:null;
      const request=url({mode}),fast=await serveDeliveredQaArtifact(request,env),legacy=await serveR3Artifact(request,env);
      assert.equal(await fast.text(),await legacy.text());
      assert.deepEqual([...fast.headers],[...legacy.headers]);
      assert.equal(bindings.at(-2)[0],qaCatalogIdentity.publication.candidateId+':main');
    }
  }
  assert.equal(reads.length,4);
  assert.ok(reads.every(path=>path.includes('/qa-catalog/')));
});

test('current research artifacts keep shell, source, exports, mode, fixtures and identity byte-exact without reading a release pack',async()=>{
  const {env,reads}=fixture(),oldEnv={ASSETS:createPrivateResearchAssets()};
  for(const id of ['login/empty/email','q3/open/email','profile/menu/email','notifications/list/email','store-purchase/qa-error/email']){
    for(const mode of ['simple','detailed']){
      const params={id,width:'390',version:'current',mode};
      const expected=await (await serveR3Artifact(url(params),oldEnv)).text();
      const fast=await serveDeliveredQaArtifact(url(params),env);
      assert.equal(fast.status,200,id);
      assert.equal(await fast.text(),expected,id+' '+mode);
      const pinned=JSON.parse(expected).hash;
      assert.equal(await (await serveDeliveredQaArtifact(url({...params,version:'recorded',artifactHash:pinned}),env)).text(),expected);
      const [screen,state,variant]=id.split('/');
      assert.equal(await isDeliveredReviewTarget({screen,state,variant,viewport:390,artifactHash:pinned,mode},'MSG0585-R3',env,origin),true);
    }
  }
  assert.ok(reads.every(path=>path.endsWith('.bin')));
});

test('the owner gate precedes asset reads and a corrupt authenticated catalog fails closed',async()=>{
  const {env,reads}=fixture(),request=url({});
  assert.equal((await handleIaRequest(request,env)).status,403);
  assert.deepEqual(reads,[]);
  const badEnv={ASSETS:{fetch:async()=>new Response('{"items":[]}')}};
  await assert.rejects(serveDeliveredQaArtifact(request,badEnv),/QA_CATALOG_INTEGRITY/);
  assert.equal((await serveDeliveredQaArtifact(url({mode:'other'}),badEnv)).status,400);
});

test('an original R1 login pin and a prior research pin keep their recorded response bytes',async()=>{
  const {env,reads}=fixture(),legacyEnv={ASSETS:createPrivateResearchAssets()};
  for(const [width,artifactHash] of [
    ['320','bf83c284c019ab7306cb6ca2c75f7344e50e3dae825b414f26d776b02c5de68c'],
    ['390','1f93abd7582c2fda5a0a19b41ea7a38e2632121df843f14f38546b06245c12ae']
  ]){
    const request=url({id:'login/empty/email',width,version:'recorded',artifactHash});
    const legacy=await serveR3Artifact(request,legacyEnv),delivered=await serveDeliveredQaArtifact(request,env);
    assert.equal(delivered.status,200);
    assert.equal(await delivered.text(),await legacy.text());
    if(width==='320'){
      const reload=url({id:'login/empty/email',width,version:'prior-r3',artifactHash});
      assert.equal(await (await serveDeliveredQaArtifact(reload,env)).text(),await (await serveR3Artifact(reload,legacyEnv)).text());
      assert.ok(reads.every(path=>path.includes('/r1-recorded/')));
    }
  }
});
