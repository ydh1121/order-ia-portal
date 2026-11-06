/** OWNER-only Pages UI. Original v0.3 layout is server-private and current data comes from the Google dashboard API. */
import {requireActor} from '../../src/server/auth.mjs';
import {v03OwnerHtml} from '../../src/server/v03-owner-template.mjs';
import {qaPage} from '../../src/server/qa-page.mjs';
import {QA_MENUS} from '../../src/server/qa-registry.mjs';
const base={
 'Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer',
 'Vary':'Cookie, Cf-Access-Jwt-Assertion',
 'X-Frame-Options':'DENY',
 'Cross-Origin-Resource-Policy':'same-origin',
 'X-Robots-Tag':'noindex, nofollow'
};
export async function onRequest({request,env}){
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers:{...base,Allow:'GET, HEAD'}});
 let actor;try{actor=await requireActor(request,env)}catch{return new Response(null,{status:302,headers:{...base,Location:'/login'}})}
 if(actor.role!=='OWNER')return new Response(null,{status:403,headers:base});
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(18)),x=>x.toString(16).padStart(2,'0')).join('');
 const headers={...base,'Content-Type':'text/html; charset=utf-8',
  'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`};
 const view=new URL(request.url).searchParams.get('view');
 const html=Object.hasOwn(QA_MENUS,view)?qaPage(nonce,view):v03OwnerHtml(nonce);
 return new Response(request.method==='HEAD'?null:html,{status:200,headers});
}
