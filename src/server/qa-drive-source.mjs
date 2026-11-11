/** Existing Pages in-process Drive reader. No service binding, shared cache, new key or logging. */
import {QaError,resolveArtifactTuple} from './qa-registry.mjs';
import {R3_DOCUMENT_PROFILES} from './qa-r3-document-profile.mjs';
import {verifyBundle} from './qa-integrity.mjs';
import {verifyZipContents} from './qa-zip-content.mjs';
export const QA_DRIVE_PRINCIPAL='ia-portal@order-511904.iam.gserviceaccount.com';
export const QA_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token',API='https://www.googleapis.com/drive/v3/files/';
const encoder=new TextEncoder(),b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function accountFrom(env){
 let a;try{a=JSON.parse(env?.IA_GOOGLE_SERVICE_ACCOUNT_JSON||'')}catch{throw new QaError('SOURCE_PRINCIPAL_UNAVAILABLE',503)}
 if(a?.client_email!==QA_DRIVE_PRINCIPAL)throw new QaError('SOURCE_PRINCIPAL_MISMATCH',503);
 if(a.type!=='service_account'||a.token_uri!==TOKEN_URL||typeof a.private_key!=='string'||a.private_key.length>20000)throw new QaError('SOURCE_CREDENTIAL_INVALID',503);
 return a;
}
export function driveSourceState(env={}){
 let principalMatch=null,credentials=false,reason='SOURCE_PRINCIPAL_UNAVAILABLE';
 try{accountFrom(env);principalMatch=true;credentials=true;reason=null}catch(e){reason=e.code;if(reason==='SOURCE_PRINCIPAL_MISMATCH')principalMatch=false}
 return {mode:'PAGES_IN_PROCESS_DRIVE',credential_binding:'IA_GOOGLE_SERVICE_ACCOUNT_JSON',principal:QA_DRIVE_PRINCIPAL,principal_match:principalMatch,configured:env.IA_QA_DRIVE_READ_ENABLED==='true'&&credentials,read_enabled:env.IA_QA_DRIVE_READ_ENABLED==='true',reason,permission_verified:false,bytes_verified_this_request:false,token_scope:QA_DRIVE_SCOPE,token_cache:'NONE_REQUEST_LOCAL_ONLY'};
}
export function fixedR3Source(input){
 if(!input||Object.keys(input).length!==2||!Object.hasOwn(input,'artifact_id')||!Object.hasOwn(input,'version'))throw new QaError('INVALID_REQUEST',400);
 const p=R3_DOCUMENT_PROFILES.find(p=>p.artifact_id===input.artifact_id&&p.version===input.version);
 if(!p)throw new QaError('SOURCE_TUPLE_NOT_ALLOWED',409);
 return p;
}
async function bounded(response,max){
 const declared=response.headers.get('Content-Length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>max))throw new QaError('RESOURCE_INVALID',409);
 if(!response.body)throw new QaError('RESOURCE_INVALID',409);
 const reader=response.body.getReader(),parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;if((length+=value.length)>max)throw new QaError('RESOURCE_INVALID',409);parts.push(value)}}
 catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
 if(declared!==null&&Number(declared)!==length)throw new QaError('RESOURCE_INVALID',409);
 const result=new Uint8Array(length);let at=0;for(const part of parts){result.set(part,at);at+=part.length}return result;
}
async function json(response,max){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(response,max)))}catch(e){throw e instanceof QaError?e:new QaError('SOURCE_RESPONSE_INVALID',502)}}
async function checked(fetcher,url,options,limit,jsonMode=false){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetcher(url,{...options,redirect:'manual',credentials:'omit',cache:'no-store',signal:controller.signal});
  if(r.redirected||(r.url&&r.url!==url)||(r.status>=300&&r.status<400))throw new QaError('SOURCE_REDIRECT_DENIED',502);
  if(r.status===401)throw new QaError('SOURCE_TOKEN_DENIED',503);
  if(r.status===404)throw new QaError('MISSING_FILE',404); // Drive may also hide unshared files as 404.
  if(r.status===403){let reason='';try{const body=await json(r,4096);reason=body?.error?.errors?.[0]?.reason||body?.error?.status||''}catch{}
   if(['accessNotConfigured','SERVICE_DISABLED'].includes(reason))throw new QaError('SOURCE_API_NOT_ENABLED',503);
   if(reason==='insufficientPermissions')throw new QaError('SOURCE_SCOPE_DENIED',503);
   throw new QaError('DENIED',403);
  }
  if(r.status!==200)throw new QaError(url===TOKEN_URL?'SOURCE_TOKEN_DENIED':'SOURCE_UPSTREAM_ERROR',502);
  return jsonMode?await json(r,limit):{bytes:await bounded(r,limit),type:r.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()};
 }catch(e){if(e instanceof QaError)throw e;throw new QaError(controller.signal.aborted?'SOURCE_TIMEOUT':'NETWORK_ERROR',502)}finally{clearTimeout(timer)}
}
async function driveToken(a,fetcher,now){
 const head=b64(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'}))),body=b64(encoder.encode(JSON.stringify({iss:QA_DRIVE_PRINCIPAL,scope:QA_DRIVE_SCOPE,aud:TOKEN_URL,iat:now,exp:now+900})));
 let signature;
 try{
  const pem=a.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const bytes=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  signature=b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(head+'.'+body))));
 }catch{throw new QaError('SOURCE_CREDENTIAL_INVALID',503)}
 const data=await checked(fetcher,TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+body+'.'+signature}).toString()},16384,true);
 if(data.token_type!=='Bearer'||typeof data.access_token!=='string'||data.access_token.length<1||data.access_token.length>8192||/[\s\x00-\x1f\x7f]/.test(data.access_token)||!Number.isFinite(data.expires_in)||data.expires_in<1||data.expires_in>3600||data.scope!==undefined&&data.scope!==QA_DRIVE_SCOPE)throw new QaError('SOURCE_TOKEN_DENIED',503);
 return data.access_token; // Request-local only, never returned to the caller or cached.
}
export function createDriveSourceReader(env,{fetcher=fetch,now=()=>Math.floor(Date.now()/1000)}={}){
 if(env?.IA_QA_DRIVE_READ_ENABLED!=='true')return null;
 return async input=>{
  const p=fixedR3Source(input),record=resolveArtifactTuple(p.artifact_id,p.version),a=accountFrom(env),token=await driveToken(a,fetcher,now());
  const read=async(id,size,mime,limit)=>{
   const url=API+id,headers={Authorization:'Bearer '+token,Accept:'application/json'};
   const metadata=await checked(fetcher,url+'?fields=id,mimeType,size,trashed,capabilities(canDownload)',{method:'GET',headers},16384,true);
   if(metadata.id!==id||metadata.trashed!==false||metadata.mimeType!==mime||metadata.size!==String(size))throw new QaError('SOURCE_METADATA_MISMATCH',409);
   if(metadata.capabilities?.canDownload!==true)throw new QaError('SOURCE_DOWNLOAD_DENIED',403);
   const media=await checked(fetcher,url+'?alt=media',{method:'GET',headers:{Authorization:'Bearer '+token,Accept:mime}},limit);
   if(![mime,'application/octet-stream'].includes(media.type))throw new QaError('SOURCE_RESPONSE_INVALID',502);
   if(media.bytes.length!==size)throw new QaError('HASH_MISMATCH',409);
   return media.bytes;
  };
  const packageBytes=await read(p.source_drive_file_id,p.package_bytes,'application/zip',32*1024*1024);
  const entryBytes=await read(p.standalone_html_drive_id,p.entrypoint_bytes,'text/html',8*1024*1024);
  const bundle={packageBytes,entryBytes,baseline:p.baseline_commit};
  await verifyBundle(record,bundle);
  const zip=await verifyZipContents(packageBytes,p.entrypoint,entryBytes);
  return {...bundle,source_evidence:{principal:QA_DRIVE_PRINCIPAL,scope:QA_DRIVE_SCOPE,metadata_can_download:true,original_bytes_verified:true,zip}};
 };
}
