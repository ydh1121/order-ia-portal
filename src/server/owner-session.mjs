/** Existing Pages only: single OWNER password verifier and stateless, short-lived cookie.
 * All secrets are injected by Pages as encrypted bindings; none are stored in Git.
 * Per-isolate throttling is defense-in-depth only, NOT a distributed rate limit.
 */
const enc=new TextEncoder();
const COOKIE='__Host-ia_session';
const TTL=600; // ten minutes. No silent sliding renewal.
const MAX_BODY=2048;
const attempts=new Map();
const bytes=x=>enc.encode(x);
const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=x=>{
  if(typeof x!=='string'||x.length>4096||!/^[A-Za-z0-9_-]+$/.test(x))throw Error('INVALID_B64');
  return Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-x.length%4)%4)),v=>v.charCodeAt(0));
};
const eq=(a,b)=>{
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
};
const rand=n=>crypto.getRandomValues(new Uint8Array(n));
async function hmacKey(env){
  const key=unb64(env.IA_OWNER_SESSION_KEY);
  if(key.length!==32)throw Error('LOGIN_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
}
const sign=async (key,text)=>new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(text)));
export const ownerConfigured=env=>{
  try{
    if(!env||env.IA_OWNER_LOGIN_ENABLED!=='true'||typeof env.IA_OWNER_EMAIL!=='string'||
       !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.IA_OWNER_EMAIL)||
       typeof env.IA_OWNER_PASSWORD_VERIFIER!=='string'||
       !/^pbkdf2-sha256\$([1-9]\d*)\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(env.IA_OWNER_PASSWORD_VERIFIER))return false;
    const [,i,s,h]=env.IA_OWNER_PASSWORD_VERIFIER.split('$');
    const n=Number(i);
    if(n<310000||n>1000000||unb64(s).length<16||unb64(h).length!==32)return false;
    if(unb64(env.IA_OWNER_SESSION_KEY).length!==32)return false;
    return true;
  }catch{return false;}
};
export async function deriveVerifier(password,salt=rand(16),rounds=310000){
  if(typeof password!=='string'||password.length<16||password.length>1024||rounds<310000)throw Error('PASSWORD_POLICY');
  const key=await crypto.subtle.importKey('raw',bytes(password),'PBKDF2',false,['deriveBits']);
  const digest=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:rounds},key,256);
  return `pbkdf2-sha256$${rounds}$${b64(salt)}$${b64(digest)}`;
}
export async function verifyPassword(password,env){
  if(!ownerConfigured(env)||typeof password!=='string'||password.length<16||password.length>1024)return false;
  const [,rounds,salt,hash]=env.IA_OWNER_PASSWORD_VERIFIER.split('$');
  const key=await crypto.subtle.importKey('raw',bytes(password),'PBKDF2',false,['deriveBits']);
  const computed=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:Number(rounds)},key,256));
  return eq(computed,unb64(hash));
}
export function sameOrigin(request){
  const url=new URL(request.url);
  const origin=request.headers.get('Origin');
  return url.protocol==='https:' && url.hostname==='order-ia-portal.pages.dev' && origin===url.origin &&
    request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
function getCookie(request){
  const text=request.headers.get('Cookie')||'';
  const list=text.split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
  if(list.length!==1)return null;
  return list[0].slice(COOKIE.length+1);
}
export const hasSessionCookie=request=>getCookie(request)!==null;
export async function issueSession(env,now=Math.floor(Date.now()/1000)){
  if(!ownerConfigured(env))throw Error('LOGIN_NOT_CONFIGURED');
  const key=await hmacKey(env);
  const sid=b64(rand(24));
  const payload={v:1,sid,iat:now,exp:now+TTL};
  const body=b64(bytes(JSON.stringify(payload)));
  const signature=b64(await sign(key,'ia.session.v1.'+body));
  const token=body+'.'+signature;
  const csrf=b64(await sign(key,'ia.csrf.v1.'+sid));
  return {cookie:`${COOKIE}=${token}; Path=/; Max-Age=${TTL}; Secure; HttpOnly; SameSite=Strict`,csrf,expiresIn:TTL};
}
export async function readSession(request,env,now=Math.floor(Date.now()/1000)){
  if(!ownerConfigured(env))throw Error('LOGIN_NOT_CONFIGURED');
  const value=getCookie(request);
  if(!value||value.length>900||value.split('.').length!==2)throw Error('SESSION_DENIED');
  const [body,sig]=value.split('.');
  const key=await hmacKey(env);
  const expected=await sign(key,'ia.session.v1.'+body);
  if(!eq(expected,unb64(sig)))throw Error('SESSION_DENIED');
  let p;try{p=JSON.parse(new TextDecoder().decode(unb64(body)))}catch{throw Error('SESSION_DENIED')}
  if(p.v!==1||typeof p.sid!=='string'||unb64(p.sid).length!==24||!Number.isSafeInteger(p.iat)||!Number.isSafeInteger(p.exp)||
    p.iat>now+30||p.exp<=now||p.exp-p.iat!==TTL)throw Error('SESSION_DENIED');
  return {id:'owner',role:'OWNER',email:env.IA_OWNER_EMAIL.trim().toLowerCase(),csrf:b64(await sign(key,'ia.csrf.v1.'+p.sid)),expiresAt:p.exp};
}
export async function ownerActor(request,env,now){const {id,email,role}=await readSession(request,env,now);return{id,email,role};}
export const clearSessionCookie=()=>`${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",Vary:'Cookie'};
const result=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const reject=()=>result({error:'LOGIN_DENIED'},401);
const limiter=(request,now=Date.now())=>{
  // Per-isolate protection; owner must apply managed rate limiting for distributed protection.
  const ip=(request.headers.get('CF-Connecting-IP')||'unknown').slice(0,65);
  if(attempts.size>256){for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);if(attempts.size>256)attempts.clear();}
  const record=attempts.get(ip);
  if(record&&record.until>now&&record.count>=5)return false;
  if(!record||record.until<=now)attempts.set(ip,{count:1,until:now+15*60000});
  else record.count++;
  return true;
};
export async function handleOwnerAuthRequest(request,env,now=Math.floor(Date.now()/1000)){
  const pathname=new URL(request.url).pathname;
  if(pathname==='/api/ia/auth/me'){
    if(request.method!=='GET')return result({error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET'});
    try{const actor=await readSession(request,env,now);return result({authenticated:true,role:actor.role,email:actor.email,csrf:actor.csrf,expiresAt:actor.expiresAt})}
    catch{return reject()}
  }
  if(pathname==='/api/ia/auth/login'){
    if(request.method!=='POST')return result({error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
    if(!sameOrigin(request))return result({error:'ORIGIN_DENIED'},403);
    if(!ownerConfigured(env))return result({error:'LOGIN_NOT_CONFIGURED'},503);
    if(!limiter(request,now*1000))return result({error:'RATE_LIMITED'},429,{'Retry-After':'900'});
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return reject();
    let body;try{
      if(Number(request.headers.get('Content-Length')||0)>MAX_BODY)return reject();
      const raw=await request.text();if(raw.length>MAX_BODY)return reject();body=JSON.parse(raw);
    }catch{return reject()}
    const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
    if(email!==env.IA_OWNER_EMAIL.trim().toLowerCase()||!await verifyPassword(body?.password,env))return reject();
    const session=await issueSession(env,now);
    return result({authenticated:true,expiresIn:session.expiresIn},200,{'Set-Cookie':session.cookie});
  }
  if(pathname==='/api/ia/auth/logout'){
    if(request.method!=='POST')return result({error:'METHOD_NOT_ALLOWED'},405,{Allow:'POST'});
    if(!sameOrigin(request))return result({error:'ORIGIN_DENIED'},403);
    try{
      const actor=await readSession(request,env,now);
      if(request.headers.get('X-IA-CSRF')!==actor.csrf)return result({error:'CSRF_DENIED'},403);
      return result({authenticated:false},200,{'Set-Cookie':clearSessionCookie()});
    }catch{return reject()}
  }
  return result({error:'NOT_FOUND'},404);
}
