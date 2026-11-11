import {requireActor} from './auth.mjs';
import {catalogue,recordView,resolveRecord,resolveArtifactTuple,previewDecision,QaError} from './qa-registry.mjs';
import {verifyBundle} from './qa-integrity.mjs';
import {createDriveSourceReader} from './qa-drive-source.mjs';
import {r3DocumentResponse} from './qa-document.mjs';
import {issueResearchPermit} from './qa-research-permit.mjs';
import {r3Profile} from './qa-r3-runtime.mjs';
import {r3RuntimeReadiness} from './qa-r3-runtime.mjs';
export const QA_HEADERS=Object.freeze({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Cf-Access-Jwt-Assertion','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
const response=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...QA_HEADERS,...extra}});
const accepted=new Set(['menu','artifact_id','version','baseline']);
export async function handleQaRequest(request,env,dependencies={}){
 let actor;try{actor=await requireActor(request,env,dependencies.authFetcher||fetch,dependencies.now)}catch{return response({error:'DENIED'},403)}
 if(actor.role!=='OWNER')return response({error:'DENIED'},403);
 if(request.method!=='GET')return response({error:'WRITE_DISABLED'},405);
 try{
  const url=new URL(request.url),operation=url.pathname.split('/').at(-1),q=url.searchParams;
  if([...q.keys()].some(k=>!accepted.has(k)||q.getAll(k).length!==1)||url.search.length>1200)throw new QaError('INVALID_REQUEST',400);
  const menu=q.get('menu');
  if(operation==='catalogue'){
   if(q.has('artifact_id')||q.has('version')||q.has('baseline'))throw new QaError('INVALID_REQUEST',400);
   return response({schema:'order.ia.qa-list/1',readOnly:true,menu,items:catalogue(menu),permanent_note_write:false});
  }
  if(!['detail','verify','preview','readiness','document','research-permit'].includes(operation))throw new QaError('NOT_FOUND',404);
  if(!q.get('artifact_id')||!q.get('version'))throw new QaError('INVALID_REQUEST',400);
  if(['verify','document','research-permit'].includes(operation)&&(q.size!==2||q.has('menu')||q.has('baseline')))throw new QaError('INVALID_REQUEST',400);
  const r=['verify','document','research-permit'].includes(operation)?resolveArtifactTuple(q.get('artifact_id'),q.get('version')):resolveRecord(menu,q.get('artifact_id'),q.get('version'),q.get('baseline'));
  if(operation==='research-permit'){r3Profile(r);const grant=await issueResearchPermit(request,env,r,dependencies.now);return response({permit:grant.receipt,readOnly:true},200,{'Set-Cookie':grant.cookie})}
  if(operation==='document'){r3Profile(r);return await r3DocumentResponse(request,env,r,dependencies.readPrivateArtifact,dependencies.now)}
  if(operation==='detail')return response({item:recordView(r),readOnly:true});
  // Status-only: never fetches raw bytes, creates grants, or promotes an execution URL.
  if(operation==='readiness')return response({readiness:r3RuntimeReadiness(r,env),readOnly:true});
  if(operation==='preview'){
   const decision=previewDecision(r);
   // No contents or provider call for an inactive/rework version. No client-supplied activation.
   if(!decision.allowed)return response({error:decision.code,state:decision.state,preview_allowed:false},409);
   throw new QaError('UNSUPPORTED_PREVIEW',409);
  }
  const readPrivateArtifact=dependencies.readPrivateArtifact||createDriveSourceReader(env);
  if(typeof readPrivateArtifact!=='function')throw new QaError('PRIVATE_SOURCE_UNAVAILABLE',503);
  // Provider is server-injected only; no arbitrary Drive URL, scope expansion, or user data forwarding.
  const bundle=await readPrivateArtifact({artifact_id:r.artifact_id,version:r.version});
  return response({verification:await verifyBundle(r,bundle),readOnly:true});
 }catch(error){
  const safe=new Set(['SOURCE_PRINCIPAL_UNAVAILABLE','SOURCE_PRINCIPAL_MISMATCH','SOURCE_CREDENTIAL_INVALID','SOURCE_TOKEN_DENIED','SOURCE_API_NOT_ENABLED','SOURCE_SCOPE_DENIED','SOURCE_RESPONSE_INVALID','SOURCE_REDIRECT_DENIED','SOURCE_UPSTREAM_ERROR','SOURCE_TIMEOUT','SOURCE_METADATA_MISMATCH','SOURCE_DOWNLOAD_DENIED','SOURCE_TUPLE_NOT_ALLOWED','ZIP_RUNTIME_UNSUPPORTED','RESEARCH_PERMIT_DISABLED','RESEARCH_PERMIT_DENIED','RESEARCH_POLICY_INVALID','INVALID_MENU','INVALID_REQUEST','NOT_FOUND','MISSING_FILE','HASH_MISMATCH','BASELINE_MISMATCH','RESOURCE_INVALID','PRIVATE_SOURCE_UNAVAILABLE','DENIED','NETWORK_ERROR','UNSUPPORTED_PREVIEW']);
  return response({error:safe.has(error?.code)?error.code:'NETWORK_ERROR'},safe.has(error?.code)?error.status:502);
 }
}
