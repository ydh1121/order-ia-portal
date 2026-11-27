import {handleOwnerAuthRequest,readSession,sameOrigin} from './owner-session.mjs';
import {businessActor,isBusinessSurface} from './r3-business-session.mjs';
import {requireActor,permit} from './auth.mjs';
import {fetchTab,fetchDashboardTabs} from './google.mjs';
import {project,privateAssetsContract} from './projection.mjs';
import {buildIaReference} from './ia-reference.mjs';
import {scheduleNotificationWork} from './notification-push.mjs';
const privateHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie, Cf-Access-Jwt-Assertion','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
function json(body,status=200) {return new Response(JSON.stringify(body),{status,headers:privateHeaders})}
export async function handleIaRequest(request,env,dependencies={}) {
  const pathname=new URL(request.url).pathname;
  if(pathname.startsWith('/api/ia/auth/'))return handleOwnerAuthRequest(request,env,dependencies.now);
  const publicPolicy=pathname.match(/^\/api\/ia\/product\/policies\/(required|privacy|optional)$/);
  if(publicPolicy&&request.method==='GET'){try{const {readPublishedPolicy}=await import('./product-experience-operations.mjs');return json(await readPublishedPolicy(env.ORDER_PRODUCT_DB||env.ORDER_QA_DB,publicPolicy[1]));}catch(error){return json({error:error.status?error.message:'POLICY_SERVICE_UNAVAILABLE'},error.status||503);}}
  if(pathname==='/api/ia/r3-price/workspace/chart'&&request.method==='GET'){
    const {handleR3Price}=await import('./r3-price.mjs');
    return handleR3Price({request,env,path:'/workspace/chart'});
  }
  // IMPORTANT: Neither a missing config nor a fabricated header bypasses the server gate.
  let actor;
  try {actor=await (isBusinessSurface(new URL(request.url))?businessActor:requireActor)(request,env,dependencies.fetcher||fetch,dependencies.now)}
  catch(error) {return error?.message==='SESSION_STORE_UNAVAILABLE'?json({error:'SESSION_STORE_UNAVAILABLE'},503):json({error:'IA_ACCESS_DENIED'},403)}
  const url=new URL(request.url);
  if(url.pathname==='/api/ia/research-address'){
    const {handleResearchAddress}=await import('./research-app/research-address-api.mjs');
    return handleResearchAddress({request,env,actor},dependencies);
  }
  const productRoute=url.pathname.match(/^\/api\/ia\/(lab|product)(\/.*)?$/);
  if(productRoute){
    if(productRoute[1]==='lab'&&actor.role!=='OWNER')return json({error:'IA_PERMISSION_DENIED'},403);
    if(!['GET','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
    let session;
    try{session=actor.role==='BUSINESS'?actor:await readSession(request,env,dependencies.now);}catch{return json({error:'SESSION_DENIED'},403);}
    if(request.method==='POST'&&(!sameOrigin(request,env)||session.id!==actor.id||request.headers.get('X-IA-CSRF')!==session.csrf))return json({error:'CSRF_DENIED'},403);
    const ctx={request,env,actor:{...actor,csrf:session.csrf,expiresAt:session.expiresAt},path:productRoute[2]||'/',csrf:session.csrf};
    if(productRoute[1]==='lab'){const {handleProductLab}=await import('./product-lab.mjs');return handleProductLab(ctx);}
    if(ctx.path==='/session'&&request.method==='GET')return json({csrf:session.csrf,expiresAt:session.expiresAt});
    const {handleProductOperations}=await import('./product-operations.mjs');
    const response=await handleProductOperations(ctx);
    if(response.ok&&ctx.path!=='/notification-push/drain')scheduleNotificationWork(env,dependencies.waitUntil);
    return response;
  }
  const r3=url.pathname.match(/^\/api\/ia\/r3-(qa|price|role)(\/.*)?$/);
  if(r3) {
    if(actor.role!=='OWNER' && !(actor.role==='BUSINESS' && r3[1]!=='qa' && !r3[2]?.startsWith('/practice/')))return json({error:'IA_PERMISSION_DENIED'},403);
    if(!['GET','HEAD','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
    if(request.method==='POST') {
      if(!sameOrigin(request,env))return json({error:'ORIGIN_DENIED'},403);
      let session;
      try {session=actor.role==='BUSINESS'?actor:await readSession(request,env,dependencies.now);}catch(error){return error?.message==='SESSION_STORE_UNAVAILABLE'?json({error:'SESSION_STORE_UNAVAILABLE'},503):json({error:'CSRF_DENIED'},403);}
      if(session.id!==actor.id || request.headers.get('X-IA-CSRF')!==session.csrf)return json({error:'CSRF_DENIED'},403);
      actor={...actor,csrf:session.csrf};
    }
    if((r3[1]==='role'||r3[1]==='price') && r3[2]==='/session' && request.method==='GET'){
      try{const session=actor.role==='BUSINESS'?actor:await readSession(request,env,dependencies.now);return json({csrf:session.csrf,expiresAt:session.expiresAt,absoluteExpiresAt:session.absoluteExpiresAt,serverNow:session.serverNow,practiceAllowed:actor.role==='OWNER'});}
      catch(error){return error?.message==='SESSION_STORE_UNAVAILABLE'?json({error:'SESSION_STORE_UNAVAILABLE'},503):json({error:'SESSION_DENIED'},403);}
    }
    const ctx={request,env,actor,path:r3[2]||'/'};
    try {
      if(r3[1]==='role' && ctx.path==='/businesses'){
        const {handleSavedBusinesses}=await import('./r3-business-directory.mjs');return await handleSavedBusinesses(ctx);
      }
      if(r3[1]==='qa' && ctx.path==='/navigation'){
        const {handleQaNavigation}=await import('./r3-qa-navigation.mjs');return await handleQaNavigation(ctx);
      }
      if(r3[1]==='qa' && ctx.path==='/artifact' && request.method==='GET'){
        const {serveDeliveredQaArtifact}=await import('./r3-qa-delivery.mjs');return await serveDeliveredQaArtifact(request,env);
      }
      if(r3[1]==='qa'){
        const {handleR3Review}=await import('./r3-review-store.mjs');
        if(request.method==='POST'){
          const {isDeliveredReviewTarget}=await import('./r3-qa-delivery.mjs');
          ctx.checkTarget=(target,revision)=>isDeliveredReviewTarget(target,revision,env,url.origin);
        }else if(request.method==='GET'&&['/records','/legacy'].includes(ctx.path)&&(url.searchParams.get('scope')!=='all'||url.searchParams.get('unresolved')==='1')){
          const {serveDeliveredQaArtifact}=await import('./r3-qa-delivery.mjs'),catalogs=new Map();
          const {isRetiredResearchRow}=await import('./research-app/page.mjs');
          ctx.includeActiveTarget=(target,revision)=>revision!=='MSG0585-R3'||!isRetiredResearchRow(target);
          ctx.currentArtifactHash=async(target,revision)=>{
            if(revision!=='MSG0585-R3')return null;
            const mode=target.mode??'simple';
            if(!catalogs.has(mode))catalogs.set(mode,(async()=>{
              const response=await serveDeliveredQaArtifact(new Request(url.origin+'/api/ia/r3-qa/artifact?mode='+mode),env);
              if(!response.ok)throw Error('QA_CATALOG_UNAVAILABLE');
              const catalog=await response.json();return new Map(catalog.items.map(row=>[row.id,row.hashes]));
            })());
            return (await catalogs.get(mode)).get([target.screen,target.state,target.variant].join('/'))?.[target.viewport]??null;
          };
        }
        return await handleR3Review(ctx);
      }
      if(r3[1]==='role'){
        const {handleR3Role}=await import('./r3-role.mjs');return await handleR3Role(ctx);
      }
      const {handleR3Price}=await import('./r3-price.mjs');
      const response=await handleR3Price(ctx);
      if(response.ok&&!ctx.path.startsWith('/practice/'))scheduleNotificationWork(env,dependencies.waitUntil);
      return response;
    }catch{return json({error:'SERVICE_UNAVAILABLE'},503);}
  }
  const resource=url.pathname.match(/^\/api\/ia\/(screens|decisions|roadmap|guide|notes|assets|dashboard)$/)?.[1];
  if(!resource) return json({error:'NOT_FOUND'},404);
  if(request.method!=='GET') return json({error:'WRITE_DISABLED_PENDING_ACCESS_CONCURRENCY_AUDIT'},405);
  const id=url.searchParams.get('screenId')||undefined;
  if(resource!=='dashboard' && !permit(actor,resource,'READ',id)) return json({error:'IA_PERMISSION_DENIED'},403);
  if(resource==='dashboard') {
    // Dashboard includes private review-notes. Explicit OWNER only, before any Google call.
    if(actor.role!=='OWNER')return json({error:'IA_PERMISSION_DENIED'},403);
    try {
      const tables=await (dependencies.fetchDashboardTabs||fetchDashboardTabs)(env,dependencies.fetcher||fetch);
      const screens=project('screens',tables.screens);
      const decisions=project('decisions',tables.decisions);
      const roadmap=project('roadmap',tables.roadmap);
      const guide=project('guide',tables.guide);
      const notes=project('notes',tables.notes);
      // Reject the entire response if any critical source is incomplete or contradictory.
      const iaMap=buildIaReference(screens,decisions);
      return json({source:'GOOGLE_SHEETS_AUTHENTICATED_READ',readOnly:true,screenCount:screens.total,decisionCount:decisions.total,roadmapCount:roadmap.total,screens,decisions,roadmap,guide,notes,iaMap});
    }catch(error){
      // Explicit allowlist of nonsecret status codes, only after authenticated OWNER gate.
      const safe=new Set(['GOOGLE_READ_DISABLED','GOOGLE_ACCOUNT_NOT_CONFIGURED','GOOGLE_SHEET_NOT_CONFIGURED','GOOGLE_TOKEN_DENIED','GOOGLE_SHEET_NOT_SHARED','GOOGLE_READ_FAILED','GOOGLE_RESPONSE_INVALID','SCREEN_PARITY_FAILED','DECISION_PARITY_FAILED','ROADMAP_PARITY_FAILED','REFERENCE_SCREEN_PARITY_FAILED']);
      return json({error:'IA_DATA_UNAVAILABLE',reason:safe.has(error?.message)?error.message:'IA_DATA_UNAVAILABLE'},503);
    }
  }
  if(resource==='assets') {
    if(!id)return json({error:'SCREEN_ID_REQUIRED'},400);
    return json({item:privateAssetsContract(id),source:'NOT_LINKED_OR_VERIFIED'});
  }
  try {
    const values=await (dependencies.fetchTab||fetchTab)(env,resource,dependencies.fetcher||fetch);
    const data=project(resource,values);
    if(resource==='screens') data.items=data.items.filter(x=>permit(actor,resource,'READ',x.screenId) && (!id || x.screenId===id));
    if(id && resource==='notes') data.items=data.items.filter(x=>x.screenOrDecisionId===id);
    return json(data);
  } catch {return json({error:'IA_DATA_UNAVAILABLE'},503)}
}
