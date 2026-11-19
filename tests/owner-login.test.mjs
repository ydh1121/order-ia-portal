import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,randomBytes} from 'node:crypto';
import {ownerConfigured,deriveVerifier,issueSession,handleOwnerAuthRequest} from '../src/server/owner-session.mjs';
import {handleIaRequest} from '../src/server/router.mjs';
import {onRequest} from '../functions/ia/[[path]].js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const authSql=new DatabaseSync(':memory:');authSql.exec(readFileSync(new URL('../migrations/0013_owner_session_revocations.sql',import.meta.url),'utf8'));
const authDb={prepare(sql){return {bind(...values){const stmt=authSql.prepare(sql);return {first:async()=>stmt.get(...values),run:async()=>stmt.run(...values)};}};}};
const origin='https://order-ia-portal.pages.dev';let env,pass;let requestCount=0;
const req=(path,opt={})=>new Request(origin+path,{method:opt.method||'GET',headers:{...(opt.origin?{Origin:opt.origin}:{}),...(opt.cookie?{Cookie:opt.cookie}:{}),...(opt.csrf?{'X-IA-CSRF':opt.csrf}:{}),...(opt.body?{'Content-Type':'application/json'}:{}),'CF-Connecting-IP':opt.ip||'198.51.100.'+(++requestCount%240+1)},body:opt.body?JSON.stringify(opt.body):undefined});
before(async()=>{pass=randomBytes(30).toString('base64url');env={ORDER_QA_DB:authDb,IA_OWNER_EMAIL:'one@sample.invalid',IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(pass),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url'),IA_GOOGLE_READ_ENABLED:'false'}});
const decode=x=>Buffer.from(x,'base64url');
async function clientProof(password,email,challenge){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(challenge.salt),iterations:challenge.iterations},key,256);
 const proofKey=await crypto.subtle.importKey('raw',bits,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Buffer.from(await crypto.subtle.sign('HMAC',proofKey,new TextEncoder().encode('ia.login.v1.'+challenge.nonce+'.'+email))).toString('base64url');
}
async function challenge(){
 const r=await handleOwnerAuthRequest(req('/api/ia/auth/challenge'),env);
 assert.equal(r.status,200);return {item:await r.json(),cookie:r.headers.get('Set-Cookie').split(';')[0],headers:r.headers};
}
const proofReq=(cookie,body)=>req('/api/ia/auth/login',{method:'POST',origin,cookie,body});
test('not configured login is unavailable',async()=>{assert.equal(ownerConfigured({}),false);assert.equal((await handleOwnerAuthRequest(req('/api/ia/auth/login',{method:'POST',origin,body:{email:'x',password:'y'}}),{})).status,503)});
test('legacy password body fails closed without Edge PBKDF2',async()=>{
 const missing=await handleOwnerAuthRequest(req('/api/ia/auth/login',{method:'POST',origin,body:{email:env.IA_OWNER_EMAIL}}),env);
 assert.equal(missing.status,401);
 const old=await handleOwnerAuthRequest(req('/api/ia/auth/login',{method:'POST',origin,body:{email:env.IA_OWNER_EMAIL,password:pass}}),env);
 assert.equal(old.status,409);assert.deepEqual(await old.json(),{error:'LOGIN_CLIENT_UPDATE_REQUIRED'});
});
test('cross-origin and missing Origin denied',async()=>{for(const o of ['https://evil.invalid',undefined])assert.equal((await handleOwnerAuthRequest(req('/api/ia/auth/login',{method:'POST',origin:o,body:{email:env.IA_OWNER_EMAIL,password:pass}}),env)).status,403)});
test('signed challenge and synthetic 310000-round proof issue secure session',async()=>{
 const {item,cookie,headers}=await challenge();assert.equal(item.iterations,310000);
 assert.match(headers.get('Set-Cookie'),/Path=\/;/);
 const proof=await clientProof(pass,env.IA_OWNER_EMAIL,item);
 const r=await handleOwnerAuthRequest(proofReq(cookie,{email:env.IA_OWNER_EMAIL,nonce:item.nonce,proof}),env);
 assert.equal(r.status,200);
 for(const part of ['Secure','HttpOnly','SameSite=Strict','Max-Age=1800'])assert.ok(r.headers.get('Set-Cookie').includes(part));
 assert.match(r.headers.get('Set-Cookie'),/__Host-ia_session=/);
});
test('anonymous and forged-cookie API denied',async()=>{assert.equal((await handleIaRequest(req('/api/ia/screens'),env)).status,403);assert.equal((await handleIaRequest(req('/api/ia/screens',{cookie:'__Host-ia_session=forged'}),env)).status,403)});
test('logout requires origin and CSRF, clears cookie',async()=>{const s=await issueSession(env),cookie=s.cookie.split(';')[0];assert.equal((await handleOwnerAuthRequest(req('/api/ia/auth/logout',{method:'POST',cookie,origin}),env)).status,403);const r=await handleOwnerAuthRequest(req('/api/ia/auth/logout',{method:'POST',cookie,origin,csrf:s.csrf}),env);assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/Max-Age=0/)});
test('private IA deep links are inaccessible without server session',async()=>{const r=await onRequest({request:req('/ia/screen/F17'),env});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/login')});
test('notes still deny writes',async()=>{const s=await issueSession(env);assert.equal((await handleIaRequest(req('/api/ia/notes',{method:'POST',cookie:s.cookie.split(';')[0]}),env)).status,405)});

test('synthetic incorrect proof is JSON 401 not platform HTML',async()=>{
 const {item,cookie}=await challenge();
 const proof=await clientProof('synthetic-invalid-password-with-entropy',env.IA_OWNER_EMAIL,item);
 const r=await handleOwnerAuthRequest(proofReq(cookie,{email:env.IA_OWNER_EMAIL,nonce:item.nonce,proof}),env);
 assert.equal(r.status,401);assert.match(r.headers.get('Content-Type'),/json/);
});
test('challenge tampering and expiration cannot authenticate',async()=>{
 const {item,cookie}=await challenge();
 const proof=await clientProof(pass,env.IA_OWNER_EMAIL,item);
 const forged=cookie.slice(0,-3)+'000';
 assert.equal((await handleOwnerAuthRequest(proofReq(forged,{email:env.IA_OWNER_EMAIL,nonce:item.nonce,proof}),env)).status,401);
 const now=Math.floor(Date.now()/1000);
 assert.equal((await handleOwnerAuthRequest(proofReq(cookie,{email:env.IA_OWNER_EMAIL,nonce:item.nonce,proof}),env,now+95)).status,401);
});
test('challenge proof replay rejected in same isolate',async()=>{
 const {item,cookie}=await challenge();const proof=await clientProof(pass,env.IA_OWNER_EMAIL,item);
 const body={email:env.IA_OWNER_EMAIL,nonce:item.nonce,proof};
 assert.equal((await handleOwnerAuthRequest(proofReq(cookie,body),env)).status,200);
 assert.equal((await handleOwnerAuthRequest(proofReq(cookie,body),env)).status,401);
});
test('configured challenge endpoint is GET-only and denies cross site',async()=>{
 assert.equal((await handleOwnerAuthRequest(req('/api/ia/auth/challenge',{method:'POST'}),env)).status,405);
 const r=await handleOwnerAuthRequest(new Request(origin+'/api/ia/auth/challenge',{headers:{'Sec-Fetch-Site':'cross-site'}}),env);
 assert.equal(r.status,403);
});
