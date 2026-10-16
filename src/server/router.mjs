import {handleOwnerAuthRequest} from './owner-session.mjs';
import {requireActor,permit} from './auth.mjs';
import {fetchTab} from './google.mjs';
import {project,privateAssetsContract} from './projection.mjs';
const privateHeaders={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie, Cf-Access-Jwt-Assertion','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
function json(body,status=200) {return new Response(JSON.stringify(body),{status,headers:privateHeaders})}
export async function handleIaRequest(request,env,dependencies={}) {
  if(new URL(request.url).pathname.startsWith('/api/ia/auth/'))return handleOwnerAuthRequest(request,env,dependencies.now);
  // Server cryptographic authorization always required.
  let actor;
  try {actor=await requireActor(request,env,dependencies.fetcher||fetch,dependencies.now)}
  catch {return json({error:'IA_ACCESS_DENIED'},403)}
  const url=new URL(request.url);
  const resource=url.pathname.match(/^\/api\/ia\/(screens|decisions|roadmap|guide|notes|assets)$/)?.[1];
  if(!resource) return json({error:'NOT_FOUND'},404);
  if(request.method!=='GET') return json({error:'WRITE_DISABLED_PENDING_ACCESS_CONCURRENCY_AUDIT'},405);
  const id=url.searchParams.get('screenId')||undefined;
  if(!permit(actor,resource,'READ',id)) return json({error:'IA_PERMISSION_DENIED'},403);
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
