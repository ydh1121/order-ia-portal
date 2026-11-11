/** Disabled-by-default first-review permit; not registry promotion or browser/security acceptance. */
import {readSession} from './owner-session.mjs';
import {QaError} from './qa-registry.mjs';
import {DOCUMENT_PROFILES,documentIdentityKeys,documentSelection,exactDocumentProfile} from './qa-document-profile.mjs';
import {digest} from './qa-integrity.mjs';
export const RESEARCH_ORIGIN='https://order-ia-portal.pages.dev';
export const RESEARCH_COOKIE='__Host-ia_qa_research';
const PATH='/api/ia/qa/document',TTL=300,PREFIX='ia.qa.first-review.v1.',enc=new TextEncoder();
// R3 claims retain their original five fields; R5 also binds role and entry path.
const identityKeys=documentIdentityKeys;
const exactKeys=(x,allowed)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===allowed.length&&allowed.every(k=>Object.hasOwn(x,k));
const fail=(code='RESEARCH_PERMIT_DENIED',status=403)=>{throw new QaError(code,status)};
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(s){if(typeof s!=='string'||s.length>3000||!/^[A-Za-z0-9_-]+$/.test(s))fail();try{return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0))}catch{fail()}}
async function keyFor(env){let raw;try{raw=decode(env.IA_OWNER_SESSION_KEY)}catch{fail()};if(raw.length!==32)fail();return crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export function researchPolicy(record,env={},now=Math.floor(Date.now()/1000)){
 if(!env.IA_QA_RESEARCH_POLICY_JSON)fail('RESEARCH_PERMIT_DISABLED',409);
 let p;try{p=JSON.parse(env.IA_QA_RESEARCH_POLICY_JSON)}catch{fail('RESEARCH_POLICY_INVALID',503)}
 if(p?.enabled!==true)fail('RESEARCH_PERMIT_DISABLED',409);
 if(!exactKeys(p,['enabled','purpose','publication_id','parent_origin','expires_at','tuples'])||p.enabled!==true||p.purpose!=='FIRST_NATIVE_REVIEW'||p.parent_origin!==RESEARCH_ORIGIN||typeof p.publication_id!=='string'||!/^[A-Za-z0-9_-]{8,120}$/.test(p.publication_id)||!Number.isSafeInteger(p.expires_at)||p.expires_at<=now||p.expires_at>now+3600||!Array.isArray(p.tuples)||p.tuples.length<1||p.tuples.length>2)fail('RESEARCH_POLICY_INVALID',503);
 const keys=identityKeys(record);exactDocumentProfile(record);
 const seen=new Set();
 for(const tuple of p.tuples){
  const tupleKeys=identityKeys(tuple);
  if(!exactKeys(tuple,tupleKeys))fail('RESEARCH_POLICY_INVALID',503);
  const fixed=DOCUMENT_PROFILES.find(x=>tupleKeys.every(k=>x[k]===tuple[k]));
  const id=tuple.artifact_id+'@'+tuple.version+'#'+(tuple.entry_role||'legacy');
  if(!fixed||seen.has(id))fail('RESEARCH_POLICY_INVALID',503);seen.add(id);
 }
 if(!p.tuples.some(t=>keys.every(k=>t[k]===record[k])))fail();
 return p;
}
export function researchPolicyState(record,env,now){try{const p=researchPolicy(record,env,now);return {enabled:true,publication_id:p.publication_id,expires_at:p.expires_at,purpose:p.purpose}}catch(e){return {enabled:false,code:e.code,purpose:'FIRST_NATIVE_REVIEW'}}}
export function exactDocumentUrl(record){return PATH+'?'+new URLSearchParams(documentSelection(record))}
function validateBrowserRequest(request,kind){
 const u=new URL(request.url),h=request.headers;
 if(request.method!=='GET'||u.origin!==RESEARCH_ORIGIN||h.get('Sec-Fetch-Site')!=='same-origin')fail();
 if(h.has('Origin')&&h.get('Origin')!==RESEARCH_ORIGIN)fail();
 if(kind==='document'){
  if(u.pathname!==PATH||h.get('Sec-Fetch-Dest')!=='iframe'||h.get('Sec-Fetch-Mode')!=='navigate')fail();
 }else if(u.pathname!=='/api/ia/qa/research-permit'||h.get('Sec-Fetch-Dest')!=='empty'||h.get('Sec-Fetch-Mode')!=='same-origin'||h.get('X-IA-QA-Intent')!=='FIRST_NATIVE_REVIEW')fail();
}
async function sessionFor(request,env,now){try{return await readSession(request,env,now)}catch{fail()}}
async function binding(session){return digest(enc.encode('ia.qa.owner-session.v1.'+session.email+'.'+session.csrf))}
export async function issueResearchPermit(request,env,record,now=Math.floor(Date.now()/1000)){
 validateBrowserRequest(request,'permit');const session=await sessionFor(request,env,now);
 if(request.headers.get('X-IA-CSRF')!==session.csrf)fail();
 const keys=identityKeys(record),policy=researchPolicy(record,env,now),identity=Object.fromEntries(keys.map(k=>[k,record[k]]));
 const claims={v:1,...identity,publication_id:policy.publication_id,origin:RESEARCH_ORIGIN,session_binding:await binding(session),generation:crypto.randomUUID(),iat:now,exp:Math.min(now+TTL,session.expiresAt,policy.expires_at)};
 const packed=b64(enc.encode(JSON.stringify(claims))),mac=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await keyFor(env),enc.encode(PREFIX+packed))));
 return {cookie:RESEARCH_COOKIE+'='+packed+'.'+mac+'; Path=/; Max-Age='+(claims.exp-now)+'; Secure; HttpOnly; SameSite=Strict',receipt:{schema:'order.ia.research-permit/1',purpose:'FIRST_NATIVE_REVIEW',...identity,generation:claims.generation,expires_at:claims.exp,document_url:exactDocumentUrl(record),preview_allowed:false,native:'NOT_RUN',selected:null,integrated:null}};
}
export async function requireResearchPermit(request,env,record,now=Math.floor(Date.now()/1000)){
 const keys=identityKeys(record);
 validateBrowserRequest(request,'document');const session=await sessionFor(request,env,now),policy=researchPolicy(record,env,now);
 const cookies=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(RESEARCH_COOKIE+'='));
 if(cookies.length!==1)fail();const token=cookies[0].slice(RESEARCH_COOKIE.length+1);
 if(token.length>3000||token.split('.').length!==2)fail();const [packed,signature]=token.split('.'),sig=decode(signature);
 if(sig.length!==32||!await crypto.subtle.verify('HMAC',await keyFor(env),sig,enc.encode(PREFIX+packed)))fail();
 let c;try{c=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(packed)))}catch{fail()}
 if(!exactKeys(c,['v',...keys,'publication_id','origin','session_binding','generation','iat','exp'])||c.v!==1||!keys.every(k=>c[k]===record[k])||c.publication_id!==policy.publication_id||c.origin!==RESEARCH_ORIGIN||c.session_binding!==await binding(session)||typeof c.generation!=='string'||!/^[0-9a-f-]{36}$/.test(c.generation)||!Number.isSafeInteger(c.iat)||!Number.isSafeInteger(c.exp)||c.iat>now||c.exp<=now||c.exp-c.iat>TTL||c.exp>session.expiresAt||c.exp>policy.expires_at)fail();
 return Object.freeze({generation:c.generation,expires_at:c.exp,purpose:'FIRST_NATIVE_REVIEW'});
}
