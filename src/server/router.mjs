import {handleOwnerAuthRequest,readSession,sameOrigin} from './owner-session.mjs';
import {requireActor,permit} from './auth.mjs';
import {fetchTab,fetchDashboardTabs} from './google.mjs';
import {project,privateAssetsContract} from './projection.mjs';
import {buildIaReference} from './ia-reference.mjs';
const privateHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie, Cf-Access-Jwt-Assertion','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
function json(body,status=200) {return new Response(JSON.stringify(body),{status,headers:privateHeaders})}
export async function handleIaRequest(request,env,dependencies={}) {
  const pathname=new URL(request.url).pathname;
  if(pathname.startsWith('/api/ia/auth/'))return handleOwnerAuthRequest(request,env,dependencies.now);
  // IMPORTANT: Neither a missing config nor a fabricated header bypasses the server gate.
  let actor;
  try {actor=await requireActor(request,env,dependencies.fetcher||fetch,dependencies.now)}
  catch {return json({error:'IA_ACCESS_DENIED'},403)}
  const url=new URL(request.url);
  const r3=url.pathname.match(/^\/api\/ia\/r3-(qa|price|role)(\/.*)?$/);
  if(r3) {
    if(actor.role!=='OWNER')return json({error:'IA_PERMISSION_DENIED'},403);
    if(!['GET','HEAD','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
    if(request.method==='POST') {
      if(!sameOrigin(request))return json({error:'ORIGIN_DENIED'},403);
      let session;
      try {session=await readSession(request,env,dependencies.now);}catch{return json({error:'CSRF_DENIED'},403);}
      if(session.id!==actor.id || request.headers.get('X-IA-CSRF')!==session.csrf)return json({error:'CSRF_DENIED'},403);
      actor={...actor,csrf:session.csrf};
    }
    const ctx={request,env,actor,path:r3[2]||'/'};
    try {
      if(r3[1]==='qa' && ctx.path==='/artifact' && request.method==='GET'){
        const {serveR3Artifact}=await import('./r3-qa-page.mjs');return await serveR3Artifact(request,env);
      }
      if(r3[1]==='qa'){
        const {handleR3Review}=await import('./r3-review-store.mjs');
        if(request.method==='POST'){
          const {isR3ReviewTarget}=await import('./r3-qa-page.mjs');
          ctx.checkTarget=isR3ReviewTarget;
        }
        return await handleR3Review(ctx);
      }
      if(r3[1]==='role'){
        const {handleR3Role}=await import('./r3-role.mjs');return await handleR3Role(ctx);
      }
      const {handleR3Price}=await import('./r3-price.mjs');return await handleR3Price(ctx);
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
