import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync,sign} from 'node:crypto';
import {handlePreview} from '../functions/_middleware.js';
import {onRequest as iaPage} from '../functions/ia/[[path]].js';
import {handleIaRequest} from '../src/server/router.mjs';
import {sameOrigin} from '../src/server/owner-session.mjs';

const origin='https://qa-test.order-ia-portal.pages.dev';
const team='https://qa-test.cloudflareaccess.com';
const owner='owner@example.invalid', reviewer='reviewer@example.invalid';
const audience='preview_test_1234567890';
const env={IA_PREVIEW_OWNER_ORIGIN:origin,IA_OWNER_EMAIL:owner,IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),
  IA_ACCESS_TEAM_DOMAIN:team,IA_ACCESS_AUD:audience,IA_ROLE_BINDINGS_JSON:JSON.stringify({[owner]:'OWNER',[reviewer]:'REVIEWER'})};
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...keys.publicKey.export({format:'jwk'}),kid:'preview-key',alg:'RS256'};
const getKeys=async url=>{
  assert.equal(url,team+'/cdn-cgi/access/certs');
  return Response.json({keys:[jwk]});
};
function token(email) {
  const now=Math.floor(Date.now()/1000);
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const content=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:team,aud:[audience],sub:'owner-fixture',email,iat:now,exp:now+300});
  return content+'.'+sign('RSA-SHA256',Buffer.from(content),keys.privateKey).toString('base64url');
}
function visit(request,config=env){
  return handlePreview({request,env:config,next:(forwarded=request)=>iaPage({request:forwarded,env:config})},getKeys);
}
const entry=(email)=>new Request(origin+'/ia/',{headers:email?{'Cf-Access-Jwt-Assertion':token(email)}:{}});
test('preview document verifies assigned owner, creates host session, serves independent IA menu and QA desk',async()=>{
  const page=await visit(entry(owner));assert.equal(page.status,200);
  assert.match(page.headers.get('Set-Cookie'),/^__Host-ia_session=.*; Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Strict$/);
  assert.match(page.headers.get('X-Robots-Tag'),/noindex/);
  assert.match(await page.text(),/href="\/ia\?view=qa-lab" target="_blank"/);
  const cookie=page.headers.get('Set-Cookie').split(';')[0];
  const desk=await visit(new Request(origin+'/ia?view=qa-lab',{headers:{Cookie:cookie}}));
  assert.equal(desk.status,200);assert.equal(desk.headers.get('Set-Cookie'),null);
  const me=await handleIaRequest(new Request(origin+'/api/ia/auth/me',{headers:{Cookie:cookie}}),env);
  const identity=await me.json();assert.equal(identity.role,'OWNER');assert.ok(identity.csrf);
  const endpoint=origin+'/api/ia/auth/logout';
  const authenticated={Origin:origin,Cookie:cookie,'X-IA-CSRF':identity.csrf};
  assert.equal((await handleIaRequest(new Request(endpoint,{method:'POST',headers:{...authenticated,'X-IA-CSRF':''}}),env)).status,403);
  assert.equal((await handleIaRequest(new Request(endpoint,{method:'POST',headers:authenticated}),env)).status,200);
});
test('new session requires the configured Access owner on the exact alias',async()=>{
  for(const request of [entry(),entry(reviewer),entry('unregistered@example.invalid')]){
    const response=await visit(request);assert.equal(response.status,403);assert.equal(response.headers.get('Set-Cookie'),null);
  }
  const different=new Request('https://another.order-ia-portal.pages.dev/ia/',{headers:{'Cf-Access-Jwt-Assertion':token(owner)}});
  assert.equal((await visit(different)).status,404);
  assert.equal((await visit(entry(owner),{...env,IA_PREVIEW_OWNER_ORIGIN:'https://order-ia-portal.pages.dev'})).status,404);
  const me=await handleIaRequest(new Request(origin+'/api/ia/auth/me',{headers:{'Cf-Access-Jwt-Assertion':token(owner)}}),env);
  assert.equal(me.status,401);
});
test('preview writes require exact origin, production origin is independently pinned',()=>{
  const req=site=>new Request(site+'/api/ia/auth/logout',{method:'POST',headers:{Origin:site}});
  assert.equal(sameOrigin(req(origin),env),true);
  assert.equal(sameOrigin(req(origin),{}),false);
  assert.equal(sameOrigin(req('https://order-ia-portal.pages.dev'),env),false);
  const foreign=new Request(origin+'/api/ia/auth/logout',{method:'POST',headers:{Origin:'https://other.example'}});
  assert.equal(sameOrigin(foreign,env),false);
});
