import {hasSessionCookie,ownerActor} from './owner-session.mjs';
/** Server-only Cloudflare Access assertion verification and deny-by-default role lookup. */
const jwtParts = (value) => {
  if (typeof value !== 'string' || value.length > 12000 || value.split('.').length !== 3) throw new Error('INVALID_JWT');
  const [h,p,s] = value.split('.');
  const decode = (x) => {
    if (!/^[A-Za-z0-9_-]+$/.test(x)) throw new Error('INVALID_JWT');
    return Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4 - x.length % 4) % 4)), c => c.charCodeAt(0));
  };
  return {header:JSON.parse(new TextDecoder().decode(decode(h))),payload:JSON.parse(new TextDecoder().decode(decode(p))),signed:new TextEncoder().encode(h+'.'+p),signature:decode(s)};
};
const VALID_ROLES = new Set(['OWNER','IA_PLANNER','REVIEWER','UIUX','ENGINEER']);
export async function requireActor(request, env, fetcher=fetch, now=Math.floor(Date.now()/1000)) {
  // When owner login is enabled, legacy Access assertions cannot bypass the cookie.
  if(env?.IA_OWNER_LOGIN_ENABLED==='true' || hasSessionCookie(request))return ownerActor(request,env,now);
  const domain=env.IA_ACCESS_TEAM_DOMAIN, audience=env.IA_ACCESS_AUD;
  if(typeof domain!=='string'||!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.cloudflareaccess\.com$/i.test(domain) || !/^[A-Za-z0-9_-]{10,128}$/.test(audience||'')) throw new Error('ACCESS_NOT_CONFIGURED');
  const token=request.headers.get('Cf-Access-Jwt-Assertion');
  const {header,payload,signed,signature}=jwtParts(token);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>256) throw new Error('INVALID_JWT');
  if(payload.iss!==domain || !Array.isArray(payload.aud)||!payload.aud.includes(audience) || !Number.isSafeInteger(payload.exp) || payload.exp<=now || !Number.isSafeInteger(payload.iat) || payload.iat>now+60 || (payload.nbf!==undefined && (typeof payload.nbf!=='number'||payload.nbf>now+60))) throw new Error('INVALID_JWT');
  if(!payload.sub || typeof payload.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('INVALID_JWT');
  const certs=await fetcher(domain+'/cdn-cgi/access/certs',{headers:{accept:'application/json'}});
  if(!certs.ok) throw new Error('AUTH_KEY_UNAVAILABLE');
  const jwks=await certs.json();
  const candidate=(jwks.keys||[]).find(x=>x.kid===header.kid && x.kty==='RSA' && (!x.alg || x.alg==='RS256') && x.use!=='enc');
  if(!candidate) throw new Error('UNKNOWN_AUTH_KEY');
  const verifyKey=await crypto.subtle.importKey('jwk',candidate,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',verifyKey,signature,signed)) throw new Error('INVALID_JWT');
  let bindings;
  try {bindings=JSON.parse(env.IA_ROLE_BINDINGS_JSON||'{}')} catch {throw new Error('ROLES_NOT_CONFIGURED')}
  if(!bindings||Array.isArray(bindings)||typeof bindings!=='object') throw new Error('ROLES_NOT_CONFIGURED');
  const email=payload.email.trim().toLowerCase(), role=bindings[email];
  if(!VALID_ROLES.has(role)) throw new Error('FORBIDDEN_ROLE');
  return {id:payload.sub,email,role};
}
const MATRIX={
  screens: new Set(['OWNER','IA_PLANNER','REVIEWER','UIUX','ENGINEER']),
  decisions: new Set(['OWNER','IA_PLANNER','REVIEWER']),
  roadmap: new Set(['OWNER','IA_PLANNER','REVIEWER','UIUX','ENGINEER']),
  guide: new Set(['OWNER','IA_PLANNER','REVIEWER','UIUX','ENGINEER']),
  notes: new Set(['OWNER','IA_PLANNER']),
  assets: new Set(['OWNER','IA_PLANNER','REVIEWER','UIUX','ENGINEER'])
};
export function permit(actor,resource,action,screenId) {
  if(!actor || action!=='READ' || !MATRIX[resource]?.has(actor.role)) return false;
  if(screenId!==undefined) {
    const parts=/^(F|U|P|C|A)(\d{2})$/.exec(screenId);
    const limits={F:17,U:9,P:8,C:4,A:33};
    if(!parts || Number(parts[2])>limits[parts[1]]) return false;
  }
  if((resource==='screens'||resource==='assets') && screenId?.startsWith('A') && ['UIUX','REVIEWER'].includes(actor.role)) return false;
  return true;
}
