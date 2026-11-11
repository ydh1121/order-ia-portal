import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {handleQaRequest} from '../src/server/qa-api.mjs';
import {resolveArtifactTuple,QA_MENUS} from '../src/server/qa-registry.mjs';
import {issueResearchPermit,requireResearchPermit,RESEARCH_COOKIE,researchPolicy} from '../src/server/qa-research-permit.mjs';
import {R3_DOCUMENT_PROFILES} from '../src/server/qa-r3-document-profile.mjs';
import {ownerEnv,ownerSession,policy,browserRequest,origin,selection} from './helpers/qa-contract-fixtures.mjs';
const [p,c]=R3_DOCUMENT_PROFILES,[record,copy]=[p,c].map(x=>resolveArtifactTuple(x.artifact_id,x.version));
async function setup(){const now=Math.floor(Date.now()/1000),env=policy(ownerEnv(),now),session=await ownerSession(env,now),request=browserRequest('research-permit',p,session.cookie,{'X-IA-QA-Intent':'FIRST_NATIVE_REVIEW','X-IA-CSRF':session.csrf}),grant=await issueResearchPermit(request,env,record,now);return {now,env,session,grant,cookie:session.cookie+'; '+grant.cookie.split(';')[0],request}}
const h=(request,headers)=>new Request(request.url,{headers:{...Object.fromEntries(request.headers),...headers}});
test('disabled research policy returns 409 and no original read/permit/preview promotion',async()=>{const env=ownerEnv(),s=await ownerSession(env);let reads=0;const dep={readPrivateArtifact:()=>{reads++;throw Error('unexpected')}};for(const op of ['research-permit','document']){const q=browserRequest(op,p,s.cookie,{'X-IA-QA-Intent':'FIRST_NATIVE_REVIEW','X-IA-CSRF':s.csrf});const r=await handleQaRequest(q,env,dep);assert.equal(r.status,409);assert.equal((await r.json()).error,'RESEARCH_PERMIT_DISABLED');assert.equal(r.headers.get('Set-Cookie'),null)}assert.equal(reads,0)});
test('correct synthetic OWNER can receive a short-lived identity-bound first-review cookie, never ready',async()=>{const {grant}=await setup();assert.match(grant.cookie,/^__Host-ia_qa_research=/);assert.match(grant.cookie,/Path=\/; Max-Age=300; Secure; HttpOnly; SameSite=Strict$/);const x=grant.receipt;assert.equal(x.preview_allowed,false);assert.equal(x.native,'NOT_RUN');assert.equal(x.selected,null);assert.equal(x.integrated,null);assert.equal(x.real_boot_verified,undefined);assert.equal(x.security_verified,undefined);assert.ok(!JSON.stringify(x).includes('cookie'));assert.equal(x.document_url,'/api/ia/qa/document?'+selection(p))});
test('permit validation matches signed session, tuple, publication and generation',async()=>{const {env,grant,cookie,now}=await setup();const r=await requireResearchPermit(browserRequest('document',p,cookie),env,record,now);assert.equal(r.generation,grant.receipt.generation);assert.equal(r.purpose,'FIRST_NATIVE_REVIEW')});
for(const headers of [{'Sec-Fetch-Dest':'document'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Site':'none'},{'Sec-Fetch-Mode':'cors'},{Origin:'null'},{Origin:'https://evil.invalid'}])test('document navigation rejects '+JSON.stringify(headers)+' before source read',async()=>{const {env,cookie}=await setup();let reads=0;const r=await handleQaRequest(h(browserRequest('document',p,cookie),headers),env,{readPrivateArtifact:()=>{reads++}});assert.equal(r.status,403);assert.equal(reads,0)});
test('missing fetch metadata is denied rather than guessed to be same-origin iframe',async()=>{const {env,cookie}=await setup();const r=await handleQaRequest(new Request(origin+'/api/ia/qa/document?'+selection(p),{headers:{Cookie:cookie}}),env);assert.equal(r.status,403)});
for(const kind of ['no session','forged session','expired session','no permit','duplicate permit','modified permit','tampered signature','tampered signed body','other session','wrong tuple','expired permit','changed publication','disabled policy'])test('reject '+kind+' before provider invocation',async()=>{
 const x=await setup();let {env,cookie,now}=x,r=p;
 if(kind==='no session')cookie=x.grant.cookie.split(';')[0];
 if(kind==='forged session')cookie='__Host-ia_session=forged; '+x.grant.cookie.split(';')[0];
 if(kind==='expired session')cookie=(await ownerSession(env,now-700)).cookie+'; '+x.grant.cookie.split(';')[0];
 if(kind==='no permit')cookie=x.session.cookie;
 if(kind==='duplicate permit')cookie+='; '+x.grant.cookie.split(';')[0];
 if(kind==='modified permit')cookie=cookie.replace(RESEARCH_COOKIE+'=',RESEARCH_COOKIE+'a=');
 if(kind==='tampered signature'){const [name,val]=x.grant.cookie.split(';')[0].split('=');const [payload,sig]=val.split('.');cookie=x.session.cookie+'; '+name+'='+payload+'.'+(sig[0]==='A'?'B':'A')+sig.slice(1)}
 if(kind==='tampered signed body'){const [name,val]=x.grant.cookie.split(';')[0].split('=');const [payload,sig]=val.split('.');const claims=JSON.parse(Buffer.from(payload,'base64url').toString());claims.exp+=1;cookie=x.session.cookie+'; '+name+'='+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.'+sig}
 if(kind==='other session')cookie=(await ownerSession(env,now)).cookie+'; '+x.grant.cookie.split(';')[0];
 if(kind==='wrong tuple')r=c;
 if(kind==='expired permit')now+=301;
 if(kind==='changed publication'){const cfg=JSON.parse(env.IA_QA_RESEARCH_POLICY_JSON);cfg.publication_id='DIFFERENT_UNIT_PUBLICATION';env={...env,IA_QA_RESEARCH_POLICY_JSON:JSON.stringify(cfg)}}
 if(kind==='disabled policy')env={...env,IA_QA_RESEARCH_POLICY_JSON:''};
 let reads=0;const res=await handleQaRequest(browserRequest('document',r,cookie),env,{now,readPrivateArtifact:()=>{reads++}});assert.ok([403,409].includes(res.status));assert.equal(reads,0);assert.equal(res.headers.get('Location'),null);
});
test('valid permit with no provider returns unavailable, not an executable shell',async()=>{const {env,cookie}=await setup();const r=await handleQaRequest(browserRequest('document',p,cookie),env);assert.equal(r.status,503);assert.equal((await r.json()).error,'PRIVATE_SOURCE_UNAVAILABLE')});
test('valid permit cannot pass malformed original bytes',async()=>{const {env,cookie}=await setup();const r=await handleQaRequest(browserRequest('document',p,cookie),env,{readPrivateArtifact:()=>({packageBytes:new Uint8Array(1),entryBytes:new Uint8Array(1),baseline:p.baseline_commit})});assert.equal(r.status,409);assert.equal((await r.json()).error,'HASH_MISMATCH')});
test('permit issuance requires actual session CSRF plus intent and same-origin browser fetch',async()=>{const {env,request}=await setup();for(const headers of [{'X-IA-CSRF':'wrong'},{'X-IA-QA-Intent':'wrong'},{'Sec-Fetch-Site':'cross-site'},{'Sec-Fetch-Dest':'iframe'},{'Sec-Fetch-Mode':'cors'}]){const r=await handleQaRequest(h(request,headers),env);assert.equal(r.status,403);assert.equal(r.headers.get('Set-Cookie'),null)}});
test('unapproved flags, broad policy, duplicate/altered tuples and expiry are refused',async()=>{const {env,now}=await setup(),base=JSON.parse(env.IA_QA_RESEARCH_POLICY_JSON);for(const change of [{parent_origin:'https://preview.invalid'},{expires_at:now-1},{expires_at:now+4000},{real_boot_verified:true},{tuples:[base.tuples[0],base.tuples[0]]},{tuples:[{...base.tuples[0],entrypoint_sha256:'0'.repeat(64)}]}])assert.throws(()=>researchPolicy(record,{...env,IA_QA_RESEARCH_POLICY_JSON:JSON.stringify({...base,...change})},now),/RESEARCH_POLICY_INVALID/)});
for(const op of ['document','research-permit','verify'])test(op+' accepts only two exact selectors and GET',async()=>{const {env,cookie}=await setup();for(const extra of ['&url=https://evil.invalid','&drive_file_id=other','&menu=qa-lab','&baseline='+p.baseline_commit,'&version=R3','&preview_allowed=true']){const r=await handleQaRequest(new Request(browserRequest(op,p,cookie).url+extra,{headers:browserRequest(op,p,cookie).headers}),env);assert.equal(r.status,400)}for(const method of ['POST','PUT','DELETE','HEAD']){const r=await handleQaRequest(new Request(browserRequest(op,p,cookie),{method}),env);assert.equal(r.status,405)}});
test('COPY permit has no design observer contract or fake ready',async()=>{const {env,session,now}=await setup();const g=await issueResearchPermit(browserRequest('research-permit',c,session.cookie,{'X-IA-QA-Intent':'FIRST_NATIVE_REVIEW','X-IA-CSRF':session.csrf}),env,copy,now);assert.equal(g.receipt.native,'NOT_RUN');assert.equal(g.receipt.ready,undefined);assert.equal(g.receipt.artifact_id,c.artifact_id)});
test('ordinary preview remains disabled even with valid research permit',async()=>{const {env,cookie}=await setup();let calls=0;const r=await handleQaRequest(new Request(origin+'/api/ia/qa/preview?menu=design-tokens&'+selection(p),{headers:{Cookie:cookie}}),env,{readPrivateArtifact:()=>{calls++}});assert.equal(r.status,409);assert.equal((await r.json()).preview_allowed,false);assert.equal(calls,0)});
test('all error responses are private, no-store, no CORS and never contain session tokens',async()=>{const {env,cookie}=await setup();const r=await handleQaRequest(browserRequest('document',p,cookie),env,{readPrivateArtifact:()=>{throw Error('DO_NOT_LEAK upstream token')}});assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'NETWORK_ERROR'});assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.equal(r.headers.get('Authorization'),null)});

test('cryptographically signed non-OWNER cannot reach document or permit, source reads stay zero',async()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048}),jwk=pair.publicKey.export({format:'jwk'});jwk.kid='test-qa';jwk.alg='RS256';
 const now=Math.floor(Date.now()/1000),domain='https://qa.cloudflareaccess.com',aud='qa-audience-contract',enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const head=enc({alg:'RS256',kid:jwk.kid}),body=enc({iss:domain,aud:[aud],sub:'synthetic-reviewer',email:'reviewer@example.invalid',iat:now-1,exp:now+60});
 const key=await crypto.subtle.importKey('pkcs8',pair.privateKey.export({format:'der',type:'pkcs8'}),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(head+'.'+body))).toString('base64url');
 const env={IA_ACCESS_TEAM_DOMAIN:domain,IA_ACCESS_AUD:aud,IA_ROLE_BINDINGS_JSON:JSON.stringify({'reviewer@example.invalid':'REVIEWER'})};let reads=0,certs=0;
 for(const op of ['document','research-permit']){
  const response=await handleQaRequest(new Request(origin+'/api/ia/qa/'+op+'?'+selection(p),{headers:{'Cf-Access-Jwt-Assertion':head+'.'+body+'.'+signature}}),env,{authFetcher:async()=>{certs++;return Response.json({keys:[jwk]})},readPrivateArtifact:()=>{reads++}});
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'DENIED'});assert.equal(response.headers.get('Set-Cookie'),null);
 }
 assert.equal(reads,0);assert.equal(certs,2);
});
