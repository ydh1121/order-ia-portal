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
 if(url.pathname.startsWith('/ia/research-releases/'))return new Response(null,{status:404,headers:base});
 const productAsset=url.pathname.startsWith('/ia/r3-product/'),researchAsset=url.pathname.startsWith('/ia/research-assets/');
 const r3View=['qa-lab','research-r3','pricing-r3','roles-r3','workflow-r3','simple-r3','detailed-r3','businesses-r3','product-r3'].includes(view) ? view : null;
 let actor;try{actor=await (isBusinessSurface(url)?businessActor:requireActor)(request,env)}catch(error){
   if(error?.message==='SESSION_STORE_UNAVAILABLE')return new Response(null,{status:503,headers:base});
   if(productAsset||researchAsset)return new Response(null,{status:403,headers:base});
   const next=new URLSearchParams();
   if(r3View)next.set('returnView',r3View);
   if(url.searchParams.has('labRun')){
     const run=url.searchParams.get('labRun'),persona=url.searchParams.get('persona');
     if(/^[a-f0-9]{32}$/.test(run)&&['buyer','supplier','operator','guest'].includes(persona)){next.set('labRun',run);next.set('persona',persona);const documentId=url.searchParams.get('qaDocument');if(documentId&&/^[a-f0-9-]{36}$/.test(documentId))next.set('qaDocument',documentId);}
     else next.set('returnView','qa-lab');
   }
   if(['product-r3','research-r3'].includes(r3View))for(const name of ['screen','state','componentVariant','mode']){const value=url.searchParams.get(name);if(value&&/^[-\w]{1,100}$/.test(value))next.set(name,value);}
   if(r3View==='research-r3'){
     const build=url.searchParams.get('build'),variant=url.searchParams.get('variant');
     if(build&&/^[a-f0-9]{64}$/.test(build))next.set('build',build);
     if(variant&&/^[-\w]{1,100}$/.test(variant))next.set('variant',variant);
   }
   if(r3View==='qa-lab'){
     const screen=url.searchParams.get('screen'),width=url.searchParams.get('width');
     if(url.searchParams.get('mode')==='detailed')next.set('mode','detailed');
     const preview=url.searchParams.get('preview')||url.searchParams.get('mode');if(['board','dual'].includes(preview))next.set('preview',preview);
     if(screen && /^[\w./:-]{1,200}$/.test(screen))next.set('screen',screen);
     if(['320','360','375','390','430','768','1024','1280','1440','1920'].includes(width))next.set('width',width);
     if(url.searchParams.get('archive')==='1')next.set('archive','1');
     if(['current','previous','prior-r3','recorded'].includes(url.searchParams.get('version')))next.set('version',url.searchParams.get('version'));
     const artifactHash=url.searchParams.get('artifactHash');if(artifactHash&&/^[a-f0-9]{64}$/.test(artifactHash))next.set('artifactHash',artifactHash);
     for(const key of ['state','variant','componentVariant']){const value=url.searchParams.get(key);if(value&&/^[-\w]{1,100}$/.test(value))next.set(key,value);}
      const run=url.searchParams.get('run'),page=url.searchParams.get('page'),persona=url.searchParams.get('persona');if(run&&/^[a-f0-9]{32}$/.test(run))next.set('run',run);if(page&&/^[-\w]{1,100}$/.test(page))next.set('page',page);if(['buyer','supplier','operator','guest'].includes(persona))next.set('persona',persona);
   }
   if(r3View==='pricing-r3'){
     if(url.searchParams.get('mode')==='contract')next.set('mode','contract');
     if(url.searchParams.get('practice')==='1')next.set('practice','1');
     for(const key of ['priceVersion','quote']){
       const value=url.searchParams.get(key);
       if(value&&/^[A-Za-z0-9_.:-]{1,160}$/.test(value))next.set(key,value);
     }
   }
   if(r3View==='roles-r3'&&url.searchParams.get('menu')==='consult')next.set('menu','consult');
   return new Response(null,{status:302,headers:{...base,Location:next.size?'/login?'+next:'/login'}});
 }
 if(actor.role!=='OWNER' && !(actor.role==='BUSINESS' && isBusinessSurface(url)))return new Response(null,{status:403,headers:base});
 if(researchAsset){
   const {deliveryBuild,deliverResearchAsset}=await import('../../src/server/research-release-delivery.mjs');
   const prefix='/ia/research-assets/'+deliveryBuild+'/';
   const response=url.pathname.startsWith(prefix)
     ?await deliverResearchAsset(url.pathname.slice(prefix.length),env,url.origin)
     :await (await import('../../src/server/research-app/page.mjs')).serveResearchAsset(url.pathname,env,url.origin);
   const headers=new Headers(response.headers);
   for(const [key,value]of Object.entries(base))headers.set(key,value);
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
 }
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
 let productContext={mode:'product',actor:{id:actor.id,authenticated:true},endpoints:{product:'/api/ia/product',role:'/api/ia/r3-role',price:'/api/ia/r3-price'}};
 // The QA host selects and validates runs through the control-plane API. Its
 // preserved history must remain readable even when a linked run was archived.
 if(r3View!=='qa-lab'&&url.searchParams.has('labRun')){
   if(actor.role!=='OWNER')return new Response(null,{status:403,headers:base});
   try{
     const {labContext}=await import('../../src/server/product-lab.mjs');
     const context=await labContext(env,actor,url.searchParams.get('labRun'),url.searchParams.get('persona')||'buyer');
     productContext=context.context;
     const documentId=url.searchParams.get('qaDocument');productContext.documentId=documentId&&/^[a-f0-9-]{36}$/.test(documentId)?documentId:crypto.randomUUID();
     const {productBuild}=await import('../../src/server/product-build.gen.mjs');productContext.buildDigest=productBuild.digest;
     headers['X-Frame-Options']='SAMEORIGIN';headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("frame-ancestors 'none'","frame-ancestors 'self'");
   }catch(error){return new Response('테스트 실행을 열 수 없습니다. '+(error.status?error.message:'LAB_UNAVAILABLE'),{status:error.status||503,headers:{...base,'Content-Type':'text/plain; charset=utf-8'}});}
 }
 if(r3View==='qa-lab'){
   headers['Content-Security-Policy']+="; frame-src 'self'; object-src 'none'";
   // Keep the approved review tool as the default. Existing isolated runs remain
   // reachable through explicit run links; recorded artifacts take precedence.
   const {isArchivedQaRequest,renderProductLab}=await import('../../src/server/product-lab-page.mjs');
   const savedRun=['run','labRun'].some(key=>/^[a-f0-9]{32}$/.test(url.searchParams.get(key)||''));
   if(isArchivedQaRequest(url.searchParams)||!savedRun){const {renderR3Qa}=await import('../../src/server/r3-qa-page.mjs');html=renderR3Qa(nonce);}
   else html=renderProductLab(nonce,url.searchParams);
 }else if(r3View==='research-r3'){
   headers['X-Frame-Options']='SAMEORIGIN';
   headers['Content-Security-Policy']=`default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://dns.google https://cloudflare-dns.com; img-src 'self' data:; font-src 'self' data:; form-action 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'`;
   const {renderDeliveryApplication}=await import('../../src/server/research-release-delivery.mjs');
   try{html=await renderDeliveryApplication(nonce,url.searchParams,env,url.origin,productContext.mode==='lab'?productContext:null);}catch(error){return new Response('이 연구 빌드를 열 수 없습니다.',{status:error.status||503,headers:{...base,'Content-Type':'text/plain; charset=utf-8'}});}
 }else if(r3View==='product-r3'){
   const screen=url.searchParams.get('screen')||'store-purchase',state=url.searchParams.get('state')||'default',componentVariant=url.searchParams.get('componentVariant')||null;
   if(screen==='component-library'){
    const {renderProductLibraryApplication}=await import('../../src/server/r3-qa-product-page.mjs');
    html=await renderProductLibraryApplication(nonce,productContext,screen,state,'email',componentVariant);
   }else{
    const {renderProductApplication}=await import('../../src/server/product-app-page.mjs');
    html=await renderProductApplication(nonce,productContext,screen,state,'email',componentVariant);
   }
   if(!html)return new Response('이 화면은 아직 제품 기능에 연결되지 않았습니다. QA랩의 기존 기록에서 설계를 확인해 주세요.',{status:404,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 }else if(r3View==='simple-r3'||r3View==='detailed-r3'){
   headers['Content-Security-Policy']=headers['Content-Security-Policy']
     .replace("script-src 'nonce-"+nonce+"'","script-src 'nonce-"+nonce+"' 'strict-dynamic'")
     .replace("style-src 'unsafe-inline'","style-src 'unsafe-inline' 'self'");
   const {renderR3ProductPage}=await import('../../src/server/r3-product-page.mjs');
   html=await renderR3ProductPage(nonce,r3View==='simple-r3'?'simple':'detailed',productContext.mode==='lab'?productContext.runId+':'+productContext.actor.id:actor.id);
 }else if(r3View==='businesses-r3'){
   headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("script-src 'nonce-"+nonce+"'","script-src 'nonce-"+nonce+"' 'strict-dynamic'");
   const {renderBusinessDirectory}=await import('../../src/server/r3-business-directory-page.mjs');html=renderBusinessDirectory(nonce);
 }else if(r3View==='pricing-r3'){
   headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("script-src 'nonce-"+nonce+"'","script-src 'nonce-"+nonce+"' 'strict-dynamic'");
   if(url.searchParams.get('practice')==='1'||url.searchParams.has('priceVersion')||url.searchParams.has('quote')||url.searchParams.get('mode')==='contract'){
     const {renderR3PricePage}=await import('../../src/server/r3-price-page.mjs');html=renderR3PricePage(nonce);
   }else{const {renderPriceWorkspace}=await import('../../src/server/r3-price-workspace-page.mjs');html=renderPriceWorkspace(nonce);}
 }else if(r3View){
   // Only the document review desk imports the vendored PDF renderer and uses its local worker.
   headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("script-src 'nonce-"+nonce+"'", "script-src 'nonce-"+nonce+"' 'strict-dynamic'")+"; worker-src 'self'; object-src 'none'";
   const {renderR3RolePage}=await import('../../src/server/r3-role-page.mjs');html=renderR3RolePage(nonce);
 }else html=v03OwnerHtml(nonce);
 if(r3View&&!['qa-lab','product-r3','research-r3'].includes(r3View)){
   const {injectProductContext}=await import('../../src/server/product-app-page.mjs');
   const {getProductPanelBootstrap}=await import('../../src/server/product-account-panels.mjs');
   html=injectProductContext(html,nonce,productContext,await getProductPanelBootstrap());
 }
 if(r3View&&!['qa-lab','research-r3'].includes(r3View)){
   const {attachProductAccountContext}=await import('../../src/server/product-app-context-adapter.mjs');
   html=attachProductAccountContext(html);
 }
 if(productContext.mode==='lab'&&r3View!=='qa-lab'){
   const {installLiveInspection}=await import('../../src/server/product-live-inspection.mjs');
   const {browserFunction}=await import('../../src/server/browser-source.mjs');
   html=html.replace('</body>','<script nonce="'+nonce+'">('+browserFunction(installLiveInspection)+')('+JSON.stringify(productContext).replaceAll('<','\\u003c')+');</script></body>');
 }
 return new Response(request.method==='HEAD'?null:html,{status:200,headers});
}
