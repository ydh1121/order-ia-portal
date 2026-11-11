/** Server-only adapter contract. No Drive/OAuth scope, secret or runtime binding is provisioned here. */
import {QaError,resolveRecord} from './qa-registry.mjs';
const MAX_PACKAGE=32*1024*1024,MAX_ENTRY=8*1024*1024;
export const PRIVATE_SOURCE_BINDING='IA_QA_PRIVATE_SOURCE';
export function privateSourceState(env){
 return {configured:env?.IA_QA_PRIVATE_SOURCE_ENABLED==='true'&&typeof env?.[PRIVATE_SOURCE_BINDING]?.fetch==='function',binding:PRIVATE_SOURCE_BINDING,principal_verified:false};
}
async function boundedBytes(response,expected,maximum){
 const value=response.headers.get('Content-Length');
 if(value!==null&&(!/^\d+$/.test(value)||Number(value)!==expected))throw new QaError('HASH_MISMATCH',409);
 if(!Number.isSafeInteger(expected)||expected<1||expected>maximum||!response.body)throw new QaError('RESOURCE_INVALID');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;if(!(value instanceof Uint8Array)||(size+=value.byteLength)>expected)throw new QaError('RESOURCE_INVALID');parts.push(value)}
 }catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
 if(size!==expected)throw new QaError('HASH_MISMATCH',409);
 const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}return result;
}
export function createPrivateSourceReader(env){
 if(!privateSourceState(env).configured)return null;
 const binding=env[PRIVATE_SOURCE_BINDING];
 return async input=>{
  if(!input||Object.keys(input).sort().join(',')!=='artifact_id,drive_file_id,entrypoint,version')throw new QaError('INVALID_REQUEST',400);
  let record;
  for(const menu of ['design-tokens','qa-lab']){try{record=resolveRecord(menu,input.artifact_id,input.version);break}catch(e){if(e.code!=='MISSING_FILE')throw e}}
  if(!record||input.drive_file_id!==record.source_drive_file_id||input.entrypoint!==record.entrypoint)throw new QaError('MISSING_FILE',404);
  // Service binding only. This reserved origin is an internal contract address, never a global fetch.
  async function readPart(part){
   const expected=part==='package'?(record.size_bytes??record.package_bytes):(record.entrypoint_bytes??record.size_bytes);
   const q=new URLSearchParams({...input,part});let response;
   try{response=await binding.fetch(new Request('https://private-qa-source.invalid/v1/artifact?'+q,{method:'GET',redirect:'error',headers:{Accept:'application/octet-stream','Cache-Control':'no-store'}}))}catch{throw new QaError('NETWORK_ERROR',502)}
   if(!(response instanceof Response)||response.redirected)throw new QaError('NETWORK_ERROR',502);
   if(response.status===401||response.status===403)throw new QaError('DENIED',403);
   if(response.status===404)throw new QaError('MISSING_FILE',404);
   if(!response.ok)throw new QaError('NETWORK_ERROR',502);
   // The provider must return the fixed identity, not an arbitrary URL or a latest-version fallback.
   const identity={'X-QA-Artifact':record.artifact_id,'X-QA-Version':record.version,'X-QA-Baseline':record.baseline_commit,'X-QA-Entrypoint':record.entrypoint};
   if(Object.entries(identity).some(([key,value])=>response.headers.get(key)!==value))throw new QaError('BASELINE_MISMATCH',409);
   if(!/^application\/octet-stream(?:;|$)/i.test(response.headers.get('Content-Type')||''))throw new QaError('RESOURCE_INVALID');
   return boundedBytes(response,expected,part==='package'?MAX_PACKAGE:MAX_ENTRY);
  }
  const packageBytes=await readPart('package');
  const entryBytes=record.source_format==='single_html'?packageBytes:await readPart('entry');
  return {packageBytes,entryBytes,baseline:record.baseline_commit};
 };
}
