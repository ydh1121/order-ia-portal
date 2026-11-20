import {requireActor,verifyAccessIdentity} from './auth.mjs';
import {hasSessionCookie} from './owner-session.mjs';

const views=new Set(['pricing-r3','roles-r3','workflow-r3','simple-r3','detailed-r3','businesses-r3','product-r3']);
export function isBusinessSurface(url) {
  return /^\/api\/ia\/(r3-(role|price)|product)(\/|$)/.test(url.pathname)
    || (/^\/ia\/?$/.test(url.pathname) && views.has(url.searchParams.get('view')))
    || url.pathname.startsWith('/ia/r3-product/');
}
// Business subjects authenticate against an explicitly configured Access application.
// Commercial surfaces require active D1 membership; personal input grants no IA or QA access.
export async function businessActor(request,env,fetcher=fetch,now=Math.floor(Date.now()/1000)) {
  if(hasSessionCookie(request) || !env.IA_BUSINESS_ACCESS_AUD || !request.headers.get('Cf-Access-Jwt-Assertion'))
    return requireActor(request,env,fetcher,now);
  const identity=await verifyAccessIdentity(request,env.IA_ACCESS_TEAM_DOMAIN,env.IA_BUSINESS_ACCESS_AUD,fetcher,now);
  if(typeof identity.id!=='string' || !identity.id || identity.id==='owner' || identity.id.length>255)throw Error('BUSINESS_ID_DENIED');
  const grant=await env.ORDER_QA_DB?.prepare('SELECT 1 ok FROM r3_membership WHERE actor_id=? AND active=1 LIMIT 1').bind(identity.id).first();
  // A verified member may save personal business input and prepare a quote before
  // organization approval. Commercial reads/writes still require their own grants.
  const url=new URL(request.url);
  const personalInput=(/^\/ia\/?$/.test(url.pathname)&&['pricing-r3','businesses-r3','simple-r3','detailed-r3','product-r3'].includes(url.searchParams.get('view')))
    || url.pathname.startsWith('/ia/r3-product/')
    || /^\/api\/ia\/r3-role\/(session|businesses)$/.test(url.pathname)
    || /^\/api\/ia\/product\/(session|account|notifications|features|drafts\/(simple|detailed))$/.test(url.pathname)
    || /^\/api\/ia\/r3-price\/(registration|personal-draft|session|desk|version|sites|simulate|workspace)$/.test(url.pathname);
  if(!grant&&!personalInput)throw Error('BUSINESS_MEMBERSHIP_REQUIRED');
  // Token-bound synchronizer value is returned only by the same-origin authenticated session endpoint.
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('order.business.csrf.v1.'+request.headers.get('Cf-Access-Jwt-Assertion')));
  return {id:identity.id,email:identity.email,role:'BUSINESS',expiresAt:identity.expiresAt,csrf:Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('')};
}
