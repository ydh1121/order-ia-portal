/** OWNER-only Pages UI. Original v0.3 layout is server-private and current data comes from the Google dashboard API. */
import {businessActor,isBusinessSurface} from '../../src/server/r3-business-session.mjs';
import {requireActor} from '../../src/server/auth.mjs';
import {v03OwnerHtml} from '../../src/server/v03-owner-template.mjs';
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
 const url=new URL(request.url),view=url.searchParams.get('view');
 const productAsset=url.pathname.startsWith('/ia/r3-product/');
 const r3View=['qa-lab','pricing-r3','roles-r3','workflow-r3','simple-r3','detailed-r3'].includes(view) ? view : null;
 let actor;try{actor=await (isBusinessSurface(url)?businessActor:requireActor)(request,env)}catch{
   if(productAsset)return new Response(null,{status:403,headers:base});
   const next=new URLSearchParams();
   if(r3View)next.set('returnView',r3View);
   if(r3View==='qa-lab'){
     const screen=url.searchParams.get('screen'),width=url.searchParams.get('width');
     if(screen && /^[\w./:-]{1,200}$/.test(screen))next.set('screen',screen);
     if(['320','360','375','390','430','768','1024','1280','1440','1920'].includes(width))next.set('width',width);
   }
   return new Response(null,{status:302,headers:{...base,Location:next.size?'/login?'+next:'/login'}});
 }
 if(actor.role!=='OWNER' && !(actor.role==='BUSINESS' && isBusinessSurface(url)))return new Response(null,{status:403,headers:base});
 if(productAsset){
   const {r3ProductAsset}=await import('../../src/server/r3-product-page.mjs');
   const response=await r3ProductAsset(url.pathname);
   const headers=new Headers(response.headers);
   for(const [k,v] of Object.entries(base))headers.set(k,v);
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
 }
 const nonce=Array.from(crypto.getRandomValues(new Uint8Array(18)),x=>x.toString(16).padStart(2,'0')).join('');
 const headers={...base,'Content-Type':'text/html; charset=utf-8',
  'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`};
 let html;
 if(r3View==='qa-lab'){
   headers['Content-Security-Policy']+="; frame-src 'self'; object-src 'none'";
   const {renderR3Qa}=await import('../../src/server/r3-qa-page.mjs');html=renderR3Qa(nonce);
 }else if(r3View==='simple-r3'||r3View==='detailed-r3'){
   headers['Content-Security-Policy']=headers['Content-Security-Policy']
     .replace("script-src 'nonce-"+nonce+"'","script-src 'nonce-"+nonce+"' 'strict-dynamic'")
     .replace("style-src 'unsafe-inline'","style-src 'unsafe-inline' 'self'");
   const {renderR3ProductPage}=await import('../../src/server/r3-product-page.mjs');
   html=await renderR3ProductPage(nonce,r3View==='simple-r3'?'simple':'detailed',actor.id);
 }else if(r3View==='pricing-r3'){
   const {renderR3PricePage}=await import('../../src/server/r3-price-page.mjs');html=renderR3PricePage(nonce);
 }else if(r3View){
   // Only the document review desk imports the vendored PDF renderer and uses its local worker.
   headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("script-src 'nonce-"+nonce+"'", "script-src 'nonce-"+nonce+"' 'strict-dynamic'")+"; worker-src 'self'; object-src 'none'";
   const {renderR3RolePage}=await import('../../src/server/r3-role-page.mjs');html=renderR3RolePage(nonce);
 }else html=v03OwnerHtml(nonce);
 return new Response(request.method==='HEAD'?null:html,{status:200,headers});
}
