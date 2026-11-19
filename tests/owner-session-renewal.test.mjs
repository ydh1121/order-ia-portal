import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {deriveVerifier,issueSession,readSession,handleOwnerAuthRequest,OWNER_SESSION_MAX_SECONDS} from '../src/server/owner-session.mjs';
const origin='https://order-ia-portal.pages.dev',now=1900000000;
let env;
function db(){
 const rows=new Map();
 return {rows,prepare(sql){return {bind(...params){return {
  async first(){assert.match(sql,/SELECT 1 revoked/);return (rows.get(params[0])?.expiresAt||0)>params[1]?{revoked:1}:null;},
  async run(){
   if(sql.startsWith('INSERT'))rows.set(params[0],{revokedAt:params[1],expiresAt:params[2]});
   else if(sql.startsWith('DELETE'))for(const [key,value] of rows)if(value.expiresAt<=params[0])rows.delete(key);
   else assert.fail('Unexpected revocation statement');
   return {success:true};
  }
 }}}}};
}
before(async()=>{env={IA_OWNER_LOGIN_ENABLED:'true',IA_OWNER_EMAIL:'owner@example.invalid',IA_OWNER_PASSWORD_VERIFIER:await deriveVerifier(randomBytes(28).toString('base64url')),IA_OWNER_SESSION_KEY:randomBytes(32).toString('base64url')};});
const request=(path,cookie,csrf,method='POST',site=origin)=>new Request(origin+path,{method,headers:{Origin:site,Cookie:cookie,...(csrf?{'X-IA-CSRF':csrf}:{})}});
const cookieOf=x=>x.cookie.split(';')[0];
async function refresh(e,s,at){return handleOwnerAuthRequest(request('/api/ia/auth/refresh',cookieOf(s),s.csrf),e,at);}
test('a fixed twelve-hour login survives idle time and keeps CSRF across tabs',async()=>{
 const config={...env,ORDER_QA_DB:db()},s=await issueSession(config,now);
 assert.equal(s.expiresIn,43200);
 assert.equal((await readSession(request('/ia',cookieOf(s)),config,now+43199)).role,'OWNER');
 assert.equal((await readSession(request('/ia',cookieOf(s)),config,now+601)).role,'OWNER');
 const a=await refresh(config,s,now+240),b=await refresh(config,s,now+241);
 assert.equal(a.status,200);assert.equal(b.status,200);
 const first=await a.json(),second=await b.json();
 assert.equal(first.csrf,s.csrf);assert.equal(second.csrf,s.csrf);
 assert.equal(first.expiresAt,now+43200);
 assert.equal(second.expiresAt,now+43200);
 assert.equal(first.serverNow,now+240);
 assert.equal(first.absoluteExpiresAt,now+OWNER_SESSION_MAX_SECONDS);
 assert.equal((await readSession(request('/ia',a.headers.get('Set-Cookie').split(';')[0]),config,now+1900)).csrf,s.csrf);
});
test('the twelve-hour deadline cannot be extended by reads, refreshes or continued activity',async()=>{
 const config={...env,ORDER_QA_DB:db()},s=await issueSession(config,now);
 assert.equal((await refresh(config,s,now+OWNER_SESSION_MAX_SECONDS)).status,401);
 const me=await handleOwnerAuthRequest(request('/api/ia/auth/me',cookieOf(s),null,'GET'),config,now+200);
 assert.equal(me.status,200);assert.equal(me.headers.get('Set-Cookie'),null);
 let current=s;
 for(let t=now+1500;t<now+OWNER_SESSION_MAX_SECONDS;t+=1500){
  const r=await refresh(config,current,t);assert.equal(r.status,200);
  const payload=await r.json();current={cookie:r.headers.get('Set-Cookie'),csrf:payload.csrf};
  assert.ok(payload.expiresAt<=now+OWNER_SESSION_MAX_SECONDS);
 }
 assert.equal((await refresh(config,current,now+OWNER_SESSION_MAX_SECONDS)).status,401);
});
test('refresh retains same-origin, CSRF and exact preview host checks',async()=>{
 const s=await issueSession(env,now);
 for(const args of [[null,origin],['bad',origin],[s.csrf,'https://evil.invalid']]){
  const r=await handleOwnerAuthRequest(request('/api/ia/auth/refresh',cookieOf(s),args[0],'POST',args[1]),env,now+10);
  assert.equal(r.status,403);assert.equal(r.headers.get('Set-Cookie'),null);
 }
 const r=await handleOwnerAuthRequest(request('/api/ia/auth/refresh',cookieOf(s),s.csrf,'GET'),env,now+10);
 assert.equal(r.status,405);
 const preview={...env,IA_OWNER_LOGIN_ENABLED:undefined,IA_PREVIEW_OWNER_ORIGIN:'https://qa-test.order-ia-portal.pages.dev'};
 assert.equal((await refresh(preview,s,now+10)).status,403);
});
test('logout revokes the original and already renewed token across requests and cannot be replayed',async()=>{
 const config={...env,ORDER_QA_DB:db()},s=await issueSession(config,now);
 const refreshed=await refresh(config,s,now+240),next={cookie:refreshed.headers.get('Set-Cookie'),csrf:s.csrf};
 const logout=await handleOwnerAuthRequest(request('/api/ia/auth/logout',cookieOf(next),s.csrf),config,now+300);
 assert.equal(logout.status,200);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal(config.ORDER_QA_DB.rows.size,1);
 for(const version of [s,next]){
  await assert.rejects(readSession(request('/ia',cookieOf(version)),config,now+301),/SESSION_DENIED/);
  assert.equal((await refresh(config,version,now+301)).status,401);
 }
 const fresh=await issueSession(config,now+302);assert.equal((await refresh(config,fresh,now+303)).status,200);
});
test('configured revocation database read failure fails closed',async()=>{
 const s=await issueSession(env,now),config={...env,ORDER_QA_DB:{prepare(){throw Error('DB_UNAVAILABLE');}}};
 assert.equal((await refresh(config,s,now+240)).status,503);
 await assert.rejects(readSession(request('/ia',cookieOf(s)),config,now+240),/SESSION_STORE_UNAVAILABLE/);
});
test('a valid legacy 10-minute cookie upgrades without losing CSRF; an expired legacy cookie stays denied',async()=>{
 const sid=randomBytes(24).toString('base64url'),body=Buffer.from(JSON.stringify({v:1,sid,iat:now,exp:now+600})).toString('base64url');
 const key=Buffer.from(env.IA_OWNER_SESSION_KEY,'base64url');
 const signature=createHmac('sha256',key).update('ia.session.v1.'+body).digest('base64url');
 const csrf=createHmac('sha256',key).update('ia.csrf.v1.'+sid).digest('base64url');
 const s={cookie:'__Host-ia_session='+body+'.'+signature,csrf};
 const upgraded=await refresh({...env,ORDER_QA_DB:db()},s,now+599);assert.equal(upgraded.status,200);assert.equal((await upgraded.json()).csrf,csrf);
 assert.equal((await refresh(env,s,now+600)).status,401);
});

test('missing D1 cannot accept the fixed twelve-hour session or renew a bootstrap cookie',async()=>{
 const s=await issueSession(env,now);assert.equal(s.expiresIn,600);
 assert.equal((await refresh(env,s,now+240)).status,503);
 const longer=await issueSession({...env,ORDER_QA_DB:db()},now);
 await assert.rejects(readSession(request('/ia',cookieOf(longer)),env,now+240),/SESSION_STORE_UNAVAILABLE/);
});
test('a session-store outage returns unavailable without sending an authenticated reviewer to login',async()=>{
 const configured={...env,ORDER_QA_DB:db()},s=await issueSession(configured);
 const broken={...configured,ORDER_QA_DB:{prepare(){throw Error('DATABASE_DOWN');}}};
 const [{onRequest:root},{onRequest:page},{handlePreview}]=await Promise.all([import('../functions/index.js'),import('../functions/ia/[[path]].js'),import('../functions/_middleware.js')]);
 for(const [handler,path] of [[root,'/'],[page,'/ia?view=qa-lab']]){
  const response=await handler({request:request(path,cookieOf(s),null,'GET'),env:broken});
  assert.equal(response.status,503);assert.equal(response.headers.get('Location'),null);
 }
 const previewOrigin='https://qa-test.order-ia-portal.pages.dev';
 const preview={...configured,IA_OWNER_LOGIN_ENABLED:undefined,IA_PREVIEW_OWNER_ORIGIN:previewOrigin};
 const previewCookie=cookieOf(await issueSession(preview));
 const out=await handlePreview({request:new Request(previewOrigin+'/ia?view=qa-lab',{headers:{Cookie:previewCookie}}),env:{...preview,ORDER_QA_DB:broken.ORDER_QA_DB},next(){assert.fail('Unavailable revocation store must not reach document');}},()=>{assert.fail('Outage must not start a new SSO session');});
 assert.equal(out.status,503);assert.equal(out.headers.get('Set-Cookie'),null);
});

// Valid old cookies migrate once while retaining their original login and revocation identity.
test('the identity read upgrades old 30-minute cookies without resetting the login clock',async()=>{
 const sid=randomBytes(24).toString('base64url'),key=Buffer.from(env.IA_OWNER_SESSION_KEY,'base64url');
 const packed=Buffer.from(JSON.stringify({v:2,sid,iat:now,renewedAt:now+600,exp:now+2400})).toString('base64url');
 const signature=createHmac('sha256',key).update('ia.session.v1.'+packed).digest('base64url');
 const cookie='__Host-ia_session='+packed+'.'+signature,config={...env,ORDER_QA_DB:db()};
 const me=await handleOwnerAuthRequest(request('/api/ia/auth/me',cookie,null,'GET'),config,now+1200);
 assert.equal(me.status,200);const data=await me.json();
 assert.equal(data.expiresAt,now+43200);assert.equal(data.serverNow,now+1200);
 assert.match(me.headers.get('Set-Cookie'),/Max-Age=42000/);
 const upgraded=me.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await readSession(request('/ia',upgraded),config,now+43199)).csrf,data.csrf);
 await assert.rejects(readSession(request('/ia',upgraded),config,now+43200),/SESSION_DENIED/);
 const expired=await handleOwnerAuthRequest(request('/api/ia/auth/me',cookie,null,'GET'),config,now+2400);
 assert.equal(expired.status,401);assert.equal(expired.headers.get('Set-Cookie'),null);
});
